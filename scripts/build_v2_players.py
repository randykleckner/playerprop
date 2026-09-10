"""Offline, current-roster player opportunity foundation; no Madden-driven usage."""
import csv,gzip,json,math,hashlib
from collections import defaultdict,Counter
from pathlib import Path
from datetime import datetime,timezone
from personnel.model import roster_context
from personnel.provider import atomic
from dfs.catalog import load_catalog
from fit_v2_pbp import eligible,num
from build_v2_live import allowed_seasons,eligible_rows
ROOT=Path(__file__).resolve().parents[1]

def observe(rows):
 games=defaultdict(lambda:{'teams':defaultdict(Counter),'players':defaultdict(Counter),'player_teams':{},'week':0})
 for r in rows:
  if not eligible(r):continue
  g=games[r['game_id']];g['week']=int(r['week']);tm=r['posteam'];t=g['teams'][tm];run=r['play_type']=='run';scramble=num(r,'qb_scramble')==1;drop=r['play_type']=='pass' or scramble
  rush=r.get('rusher_player_id');receiver=r.get('receiver_player_id');qb=r.get('passer_player_id') or (rush if scramble else '')
  contexts=['normal']+(['redzone'] if num(r,'yardline_100') is not None and num(r,'yardline_100')<=20 else [])+(['goal'] if num(r,'yardline_100') is not None and num(r,'yardline_100')<=5 else [])
  for pid in [rush,receiver,qb]:
   if pid:g['player_teams'][pid]=tm
  if drop:
   pressure=num(r,'sack')==1 or num(r,'qb_hit')==1 or scramble
   t['dropbacks']+=1;t['pressure']+=pressure;t['pressure_sacks']+=num(r,'sack')==1;t['pressure_scrambles']+=scramble
   t['pressure_incomplete']+=pressure and not scramble and num(r,'sack')!=1 and num(r,'complete_pass')!=1 and num(r,'interception')!=1
  for ctx in contexts:
   if run:
    t[ctx+'_carry']+=1
    if rush:g['players'][rush][ctx+'_carry']+=1;g['players'][rush]['scrambles']+=int(scramble and ctx=='normal')
   elif num(r,'sack')!=1:
    t[ctx+'_target']+=1
    if receiver:g['players'][receiver][ctx+'_target']+=1
  if qb:g['players'][qb]['dropbacks']+=int(drop)
 return games

def opportunities(games,roster,source_players,roles,config,live,at):
 starters={r['player_id'] for r in roles if r['formation']=='3WR 1TE'};source={p['player_id']:p for p in source_players};by_team=defaultdict(list)
 for pid,r in roster.items():
  pos='RB' if r['position']=='FB' else r['position']
  if not r['active'] or r.get('ambiguous_team') or pos not in ['QB','RB','WR','TE']:continue
  if pid in source and not source[pid].get('active',False):continue
  if pos=='QB' and pid not in starters:continue
  by_team[r['team']].append(r|{'position':pos,'starter':pid in starters})
 result={}
 maxweek=defaultdict(int)
 for (season,gid),g in games.items():maxweek[season]=max(maxweek[season],g['week'])
 for tm,roster_players in by_team.items():
  qbs=[p for p in roster_players if p['position']=='QB']
  if len(qbs)!=1:continue # Keep the legacy engine available instead of inventing a starting QB.
  players=[]
  for r in sorted(roster_players,key=lambda p:p['player_id']):
   pid=r['player_id'];s=source.get(pid,{});history=Counter();share=Counter();context_counts=Counter();recent=Counter();recent_den=Counter();changed=False
   for (season,gid),g in games.items():
    if pid not in g['players']:continue
    old_team=g['player_teams'][pid];w=live['season_weights'][str(season)]*2**(-(maxweek[season]-g['week'])/config['recentHalfLifeWeeks'])
    if old_team!=tm:w*=config['tradedHistoryWeight'];changed=True
    p=g['players'][pid];t=g['teams'][old_team];history['games']+=w;history['carries']+=w*p['normal_carry'];history['scrambles']+=w*p['scrambles']
    for ctx in ['normal','redzone','goal']:
     for kind in ['carry','target']:
      key=ctx+'_'+kind
      if t[key]:share[key]+=w*p[key]/t[key];context_counts[key]+=w
      if g['week']>=maxweek[season]-4 and season==max(y for y,_ in games):recent[key]+=w*p[key];recent_den[key]+=w*t[key]
   p={'player_id':pid,'name':r['name'],'team':tm,'position':r['position'],'active':True,'starter':r['starter'],'roster_status':r['status'],'roster_at':r['roster_at'],'salary':s.get('salary'),'salary_as_of':at if s.get('salary') else None,'identity_status':'canonical_roster','shares':{},'recent_shares':{k:recent[k]/v if v else None for k,v in recent_den.items()},'weighted_usage_games':round(history['games'],3),'scramble_share':history['scrambles']/history['carries'] if history['carries'] else 0,'snap_share':s.get('projected_snap_share'),'routes':s.get('inputs',{}).get('routes'),'flags':[]}
   if changed:p['flags'].append('Prior-team history downweighted')
   if not history['games']:p['flags'].append('No historical opportunities; projection/depth prior')
   if p['snap_share'] is None:p['flags'].append('Snap share unavailable')
   if p['routes'] is None:p['flags'].append('Routes unavailable')
   p['residual']=not p['starter'] and history['games']<config['minimumUsageGames'] and max((s.get('projected_opportunities',{}).get(k) or 0) for k in ['carries','targets'])<.5
   if p['residual']:p['flags'].append('Sparse reserve role; capped residual opportunity pool')
   p['_history']=dict(share);p['_counts']=dict(context_counts);p['_projection']=s.get('projected_opportunities',{});players.append(p)
  for kind in ['carry','target']:
   allowed=[p for p in players if kind=='carry' or p['position']!='QB'];projected_key='carries' if kind=='carry' else 'targets';proj_total=sum(p['_projection'].get(projected_key,0) or 0 for p in allowed)
   priors=config['positionCarryPriors' if kind=='carry' else 'positionTargetPriors']
   role_mass={p['player_id']:(config['starterPriorWeight'] if p['starter'] else config['reservePriorWeight']) for p in allowed};pos_totals=Counter()
   for p in allowed:pos_totals[p['position']]+=role_mass[p['player_id']]
   for p in allowed:
    role=priors.get(p['position'],0)*role_mass[p['player_id']]/pos_totals[p['position']]
    projection=p['_projection'].get(projected_key)
    prior=projection/proj_total if projection is not None and proj_total else role
    n=p['weighted_usage_games'];h=p['_history'].get('normal_'+kind,0)/p['_counts'].get('normal_'+kind,1)
    alpha=n/(n+config['historicalPriorGames']);base=alpha*h+(1-alpha)*prior
    p['shares']['normal_'+kind]=base
    for ctx in ['redzone','goal']:
     key=ctx+'_'+kind;cn=p['_counts'].get(key,0);ch=p['_history'].get(key,0)/cn if cn else base;ca=cn/(cn+config['contextPriorGames']);p['shares'][key]=ca*ch+(1-ca)*base
   for ctx in ['normal','redzone','goal']:
    key=ctx+'_'+kind;total=sum(p['shares'][key] for p in allowed)
    if not total:raise ValueError('No recipient mass')
    for p in players:p['shares'][key]=p['shares'].get(key,0)/total
    residual=[p for p in players if p['residual']];main=[p for p in players if not p['residual']];mass=sum(p['shares'][key] for p in residual);cap=config['residualCarryShare' if kind=='carry' else 'residualTargetShare']
    if mass>cap and mass<1:
     for p in residual:p['shares'][key]*=cap/mass
     for p in main:p['shares'][key]*=(1-cap)/(1-mass)
  for p in players:
   p['detailed']=not p['residual'] and (p['position']=='QB' or p['starter'] or p['shares']['normal_carry']>=config['minimumDetailedCarryShare'] or p['shares']['normal_target']>=config['minimumDetailedTargetShare'])
   del p['_history'];del p['_counts'];del p['_projection']
  result[tm]={'qb_id':qbs[0]['player_id'],'players':players}
 return result

def main():
 config=json.loads((ROOT/'config/v2-opportunity.json').read_text());live=json.loads((ROOT/'config/v2-live.json').read_text());at=datetime.now(timezone.utc).isoformat();state=ROOT/'.personnel'
 roster=json.loads((state/'roster.json').read_text());depth=json.loads((state/'depth.json').read_text());canonical,meta=load_catalog(ROOT/'.dfs-salaries/catalog');rosters,roles,dates=roster_context(roster['body'],depth['body'],canonical,at,roster['captured_at'],live['target_season'])
 games={};sources=[]
 for y in allowed_seasons(live,at):
  path=ROOT/f'.dfs-calibration/pbp-{y}.csv.gz'
  if not path.exists():continue
  with gzip.open(path,'rt') as f:g=observe(eligible_rows(csv.DictReader(f),y,at))
  games.update({(y,k):v for k,v in g.items()});sources.append({'season':y,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
 manifest=json.loads((ROOT/'public/research/latest.json').read_text());source=json.loads((ROOT/('public'+manifest['snapshot']['simulation_path'])).read_text());teams=opportunities(games,rosters,source['players'],roles,config,live,source['data_as_of'])
 pressure=defaultdict(Counter)
 for (season,gid),g in games.items():
  for tm,t in g['teams'].items():
   for k in ['dropbacks','pressure','pressure_sacks','pressure_scrambles','pressure_incomplete']:pressure[tm][k]+=live['season_weights'][str(season)]*t[k]
 league=Counter()
 for t in pressure.values():league.update(t)
 def pressure_rates(t):
  return {'probability':t['pressure']/t['dropbacks'],'sack_given_pressure':t['pressure_sacks']/t['pressure'],'scramble_given_pressure':t['pressure_scrambles']/t['pressure'],'incomplete_given_pressure':t['pressure_incomplete']/t['pressure']}
 lr=pressure_rates(league)
 personnel=json.loads((ROOT/'public/drive-lab/personnel.json').read_text());rating=json.loads((state/(personnel['snapshot_id']+'.json')).read_text())
 if rating['sources']['roster']['sha256']!=roster['sha256'] or rating['sources']['depth']['sha256']!=depth['sha256']:raise ValueError('Rebuild personnel against current roster/depth before player inputs')
 ratings={p['canonical_player_id']:p for p in rating['players'] if p['mapping_status'] in ['verified','strongly_corroborated']}
 for tm,t in teams.items():
  observed=pressure[tm];alpha=observed['dropbacks']/(observed['dropbacks']+config['leaguePressurePriorDropbacks']);pr=pressure_rates(observed) if observed['pressure'] else lr;t['pressure']={k:alpha*pr[k]+(1-alpha)*lr[k] for k in lr};t['pressure']['source']='NFLverse sack / QB hit / scramble proxy; not charted total pressures'
  for p in t['players']:
   m=ratings.get(p['player_id']);p['madden_attributes']=m['attributes'] if m else None;p['madden_identity']=m['mapping_status'] if m else 'unavailable'
 result={'version':config['version'],'as_of':at,'roster_snapshot':roster['sha256'],'roster_at':roster['captured_at'],'depth_snapshot':depth['sha256'],'madden_snapshot':personnel['ratings_snapshot_id'],'personnel_snapshot':personnel['snapshot_id'],'empirical_sources':sources,'salary_snapshot':manifest['snapshot']['bundle'],'salary_as_of':source['data_as_of'],'config':config,'teams':teams,'missing_teams':sorted(set(rosters[p]['team'] for p in rosters)-set(teams))}
 result['snapshot_id']=hashlib.sha256(json.dumps(result,sort_keys=True).encode()).hexdigest();atomic(ROOT/'public/drive-lab/players.json',result);print(json.dumps({'teams':len(teams),'players':sum(len(t['players']) for t in teams.values()),'detailed':sum(p['detailed'] for t in teams.values() for p in t['players']),'missing_teams':result['missing_teams']}))
if __name__=='__main__':main()
