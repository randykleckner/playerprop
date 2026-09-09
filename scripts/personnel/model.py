"""Canonical identity + roster-evidenced unit diagnostics. Never simulation inputs."""
import csv,io,json,math
from datetime import datetime
def instant(value):return datetime.fromisoformat(value.replace("Z","+00:00"))
from collections import Counter,defaultdict
from dfs.identity import normalized_name
from research.prepare import team

def family(p):
 p=p.upper();return 'OL' if p in ['LT','LG','C','RG','RT','OL','G','T'] else 'FRONT' if p in ['LEDG','REDG','EDGE','DE','DT','DL','NT','OLB','ILB','LB','MLB','MIKE','WILL','SAM','LOLB','ROLB','LE','RE'] else 'DB' if p in ['CB','FS','SS','S','DB'] else 'RB' if p in ['HB','RB','FB'] else 'K' if p in ['K','PK'] else p

def roster_context(raw,depth_raw,canonical,at,roster_at=None,season=2026):
 known={p['player_id']:p for p in canonical};rows=list(csv.DictReader(io.StringIO(raw)));roster={}
 for r in rows:
  pid=r.get('gsis_id')
  if r.get('season')!=str(season) or pid not in known:continue
  record={'player_id':pid,'name':r['full_name'],'team':team(r['team']),'position':r['position'],'status':r['status'],'active':r['status']=='ACT','roster_at':roster_at or at,'espn_id':r.get('espn_id'),'aliases':list({r.get('football_name','')+' '+r.get('last_name',''),r['full_name'],known[pid]['display_name']})}
  if pid in roster and roster[pid]['team']!=record['team']:roster[pid]['ambiguous_team']=True
  else:roster[pid]=record
 depth=list(csv.DictReader(io.StringIO(depth_raw)));latest={}
 for r in depth:
  if r.get('dt') and instant(r['dt'])<=instant(at):
   tm=team(r['team'])
   if tm not in latest or instant(r['dt'])>instant(latest[tm]):latest[tm]=r['dt']
 selected=[]
 for r in depth:
  tm=team(r['team'])
  if r['dt']!=latest.get(tm) or r['pos_rank']!='1' or r['pos_grp']=='Special Teams':continue
  selected.append({'player_id':r['gsis_id'],'team':tm,'role':r['pos_abb'],'slot':r['pos_slot'],'formation':r['pos_grp'],'depth_at':r['dt'],'starter_confidence':'depth_chart_listed','source':'NFLverse current ESPN depth chart'})
 return roster,selected,latest

def map_players(players,roster,overrides,at):
 counts=Counter();by_position=defaultdict(Counter)
 for p in players:
  p.update(canonical_player_id=None,mapping_status='unresolved',mapping_confidence=0,mapping_evidence=[])
  name=normalized_name(p['name']);candidates=[r for r in roster.values() if name in {normalized_name(n) for n in r['aliases']}]
  exact=[r for r in candidates if r['team']==p['team'] and family(r['position'])==family(p['position']) and not r.get('ambiguous_team')]
  override=[o for o in overrides if o.get('external_player_id')==p['external_player_id'] and o.get('expected_name')==p['name'] and o.get('expected_team')==p['team'] and o.get('effective_from') and o.get('expires_at') and instant(o['effective_from'])<=instant(at)<instant(o['expires_at'])]
  if len(override)>1:raise ValueError('Ambiguous manual personnel override')
  if override:
   o=override[0];r=roster.get(o.get('canonical_player_id'))
   if not r or r.get('ambiguous_team') or not o.get('sources') or not o.get('reviewer') or r['team']!=p['team'] or family(r['position'])!=family(p['position']):raise ValueError('Unsafe manual personnel override')
   p.update(canonical_player_id=r['player_id'],mapping_status='strongly_corroborated',mapping_confidence=.9,mapping_evidence=['Scoped manual override',*o['sources']])
  elif len(exact)==1:
   p.update(canonical_player_id=exact[0]['player_id'],mapping_status='strongly_corroborated',mapping_confidence=.9,mapping_evidence=['NFLverse canonical/roster alias + current team + position family'])
  elif len(candidates)==1:
   p.update(canonical_player_id=candidates[0]['player_id'],mapping_status='provisional',mapping_confidence=.5,mapping_evidence=['Unique name candidate; team or position not corroborated'])
  else:p['mapping_evidence']=['Ambiguous candidates' if candidates else 'No canonical roster candidate']
  counts[p['mapping_status']]+=1;by_position[p['position']][p['mapping_status']]+=1
 return {'total':len(players),'tiers':{k:counts[k] for k in ['verified','strongly_corroborated','provisional','unresolved']},'by_position':dict(by_position)}

def composite(unit,roles,roster,ratings,weights):
 included=[];missing=[];seen=set();required=weights.get('positions')
 for group in [weights['attributes'],required or {}]:
  if any(not isinstance(v,(int,float)) or not math.isfinite(v) or v<=0 for v in group.values()):raise ValueError('Unit weights must be positive and finite')
 if not weights['attributes']:raise ValueError('Unit attributes required')
 if required:roles=[r for r in roles if r['role'] in required]
 for r in roles:
  pid=r['player_id'];person=roster.get(pid);rating=ratings.get(pid)
  if pid in seen:missing.append(r['role']+': duplicate starter assignment');continue
  seen.add(pid)
  if not person or not person['active'] or person['team']!=r['team'] or person.get('ambiguous_team') or not rating:
   missing.append(r['role']+': no active, corroborated rated starter');continue
  attrs=rating['attributes'];need=weights['attributes']
  if any(k not in attrs or not isinstance(attrs[k],(int,float)) or not math.isfinite(attrs[k]) or not 0<=attrs[k]<=99 for k in need):missing.append(r['role']+': required attributes missing');continue
  value=sum(attrs[k]*v for k,v in need.items())/sum(need.values());pos_weight=required.get(r['role'],1) if required else 1
  included.append(r|{'name':person['name'],'rating':round(value,2),'weight':pos_weight,'attributes':{k:attrs[k] for k in need},'mapping_status':rating['mapping_status'],'roster_status':person['status'],'roster_at':person['roster_at']})
 if required:
  for role in required:
   if sum(r['role']==role for r in roles)!=1:missing.append(role+': starter missing or ambiguous')
 if not roles:missing.append('No depth evidence')
 minimum=7 if unit=='run_front' else 4 if unit in ['pass_rush','secondary','secondary_man','secondary_zone'] else 5
 if len(roles)<minimum:missing.append('Insufficient depth slots for a complete unit')
 score=sum(p['rating']*p['weight'] for p in included)/sum(p['weight'] for p in included) if included else None
 # Partial samples are visible, but never presented as a complete unit matchup.
 return {'unit':unit,'rating':round(score,2) if score is not None else None,'confidence':'moderate' if included and not missing else 'low' if included else 'unavailable','complete':bool(included) and not missing,'players':included,'missing':missing,'scale':'EA attribute points 0–99; uncalibrated diagnostic'}

def build_units(roster,depth,players,config):
 by_id=defaultdict(list)
 for p in players:
  if p['mapping_status'] in ['verified','strongly_corroborated']:by_id[p['canonical_player_id']].append(p)
 ratings={k:v[0] for k,v in by_id.items() if len(v)==1};units={}
 for tm in sorted({r['team'] for r in roster.values()}):
  rows=[r for r in depth if r['team']==tm];off=[r for r in rows if r['formation']=='3WR 1TE'];defense=[r for r in rows if r['formation'].startswith('Base ')]
  front=[r for r in defense if r['role'] in ['LDE','RDE','LDT','RDT','NT','WLB','SLB','MLB','LILB','RILB']]
  rush=[r for r in front if r['role'] in ['LDE','RDE','LDT','RDT','NT'] or r['formation']=='Base 3-4 D' and r['role'] in ['WLB','SLB']]
  secondary=[r for r in defense if r['role'] in ['LCB','RCB','FS','SS','NB']]
  units[tm]={k:composite(k,off if k in ['pass_protection','run_block'] else rush if k=='pass_rush' else front if k=='run_front' else secondary,roster,ratings,w) for k,w in config['unit_weights'].items()}
 return units

def matchup(units,offense,defense):
 result=[]
 for a,b in [('pass_protection','pass_rush'),('run_block','run_front')]:
  x,y=units.get(offense,{}).get(a,{}),units.get(defense,{}).get(b,{})
  valid=x.get('complete') and y.get('complete')
  result.append({'offense_unit':a,'defense_unit':b,'offense_rating':x.get('rating'),'defense_rating':y.get('rating'),'difference':round(x['rating']-y['rating'],2) if valid else None,'confidence':'moderate' if valid else 'incomplete','note':'Attribute-scale difference only; not expected points or a probability'})
 return result
