"""Read-only official injury evidence + full canonical depth/ratings snapshot for V2-D."""
import csv,io,json,hashlib,re,itertools
from pathlib import Path
from collections import Counter,defaultdict
from datetime import datetime,timezone
from personnel.model import roster_context,map_players,family,instant
from personnel.provider import atomic
from dfs.catalog import load_catalog
from dfs.identity import normalized_name
from research.prepare import team
from newsroom.feed import NFL_URL
from availability.provider import official_rows,NflAvailabilityProvider
from refresh_newsroom import fetch
ROOT=Path(__file__).resolve().parents[1]
def latest_depth(body,people,at):
 rows=list(csv.DictReader(io.StringIO(body)));dates={}
 for r in rows:
  tm=team(r['team'])
  if instant(r['dt'])<=instant(at) and (tm not in dates or instant(r['dt'])>instant(dates[tm])):dates[tm]=r['dt']
 result=[];issues=[]
 for r in rows:
  tm=team(r['team'])
  if r['dt']!=dates.get(tm) or r['pos_grp']=='Special Teams':continue
  pid=r['gsis_id'];person=people.get(pid);candidates=[p for p in people.values() if p['team']==tm and p.get('espn_id') and p['espn_id']==r['espn_id'] and normalized_name(r['player_name']) in {normalized_name(n) for n in p['aliases']}]
  correction=None
  if len(candidates)==1 and (not person or person['team']!=tm or normalized_name(r['player_name']) not in {normalized_name(n) for n in person['aliases']}):
   correction={'original_id':pid,'reason':'Exact ESPN ID + canonical roster name/team crosswalk'};pid=candidates[0]['player_id'];person=candidates[0]
  if not person or person['team']!=tm or normalized_name(r['player_name']) not in {normalized_name(n) for n in person['aliases']}:
   issues.append({'team':tm,'name':r['player_name'],'player_id':pid,'role':r['pos_abb'],'reason':'Depth identity not corroborated by current canonical roster'});pid='missing:'+tm+':'+r['pos_slot']+':'+r['pos_rank']
  result.append({'player_id':pid,'name':r['player_name'],'team':tm,'role':r['pos_abb'],'slot':r['pos_slot'],'rank':int(r['pos_rank']),'formation':r['pos_grp'],'depth_at':r['dt'],'correction':correction,'confidence':'corroborated_depth' if not pid.startswith('missing:') else 'unresolved'})
 return result,issues,dates

def snap_history(path,catalog,people,season,week):
 files=sorted(path.glob('snaps-*.csv')) if path.is_dir() else [path] if path.exists() else []
 if not files:return {},None
 bypfr=defaultdict(set)
 for p in catalog:
  if p.get('pfr_id'):bypfr[p['pfr_id']].add(p['player_id'])
 records=defaultdict(list);bodies=[p.read_bytes() for p in files];digest=hashlib.sha256(b'\n'.join(bodies)).hexdigest()
 for r in itertools.chain.from_iterable(csv.DictReader(io.StringIO(body.decode())) for body in bodies):
  ids=bypfr.get(r['pfr_player_id'],set())
  if len(ids)!=1:continue
  pid=next(iter(ids));yr=int(r['season']);wk=int(r['week'])
  if pid not in people or yr>season or yr==season and wk>=week or r['game_type']!='REG':continue
  side='offense' if family(people[pid]['position']) in ['QB','RB','WR','TE','OL'] else 'defense'
  if float(r[side+'_snaps'] or 0)<=0:continue
  elapsed=(season-yr)*18+week-wk;weight=2**(-elapsed/8)*(1 if team(r['team'])==people[pid]['team'] else .35)
  records[pid].append((weight,float(r[side+'_pct']),yr,wk,side))
 result={}
 for pid,rows in records.items():
  mass=sum(r[0] for r in rows);result[pid]={'share':sum(w*share for w,share,*_ in rows)/mass,'weighted_games':mass,'active_games':len(rows),'side':rows[0][4],'latest_season_week':max((r[2],r[3]) for r in rows),'source_hash':digest,'source':'NFLverse archived snap counts; positive-snap games only'}
 return result,digest

def build(request=fetch):
 at=datetime.now(timezone.utc).isoformat();personnel=json.loads((ROOT/'public/drive-lab/personnel.json').read_text());sourceplayers=json.loads((ROOT/'public/drive-lab/players.json').read_text());roster=json.loads((ROOT/'.personnel/roster.json').read_text());depth=json.loads((ROOT/'.personnel/depth.json').read_text());catalog,_=load_catalog(ROOT/'.dfs-salaries/catalog')
 people,_,_=roster_context(roster['body'],depth['body'],catalog,at,roster['captured_at']);roles,depthissues,dates=latest_depth(depth['body'],people,at)
 # Provider team aliases are identity normalization, not manual player verification.
 ratings=json.loads((ROOT/'.personnel/ratings.json').read_text());teamnames={v['name']:team(k) for k,v in json.loads((ROOT/'public/team-media.json').read_text()).items()};teamnames.update({'NY Jets':'NYJ','NY Giants':'NYG','LA Rams':'LA','LA Chargers':'LAC'})
 for p in ratings['players']:p['team']=teamnames.get(p['team_name'],'FA')
 coverage=map_players(ratings['players'],people,json.loads((ROOT/'config/personnel-overrides.json').read_text())['overrides'],at);mapped=defaultdict(list)
 for p in ratings['players']:
  if p['mapping_status'] in ['verified','strongly_corroborated']:mapped[p['canonical_player_id']].append(p)
 manifest=json.loads((ROOT/'public/research/latest.json').read_text());sim=json.loads((ROOT/('public'+manifest['snapshot']['simulation_path'])).read_text())
 season=int(sim['season']);week=int(sim['week']);news=request(NFL_URL,ROOT/'.newsroom',at);report=NflAvailabilityProvider().parse(news['body'],people,season,week,news['fetched_at']);injuries,injuryissues,tables=report['players'],report['issues'],report['tables']
 snaps,snap_hash=snap_history(ROOT/'.dfs-research',catalog,people,season,week)
 rawroster={r['gsis_id']:r for r in csv.DictReader(io.StringIO(roster['body']))}
 for pid,p in people.items():
  status=p['status'];abbr=rawroster.get(pid,{}).get('status_description_abbr','');state='UNKNOWN' if status=='ACT' else 'IR/PUP' if status=='RES' and abbr in ['R01','R04','R48'] else 'SUSPENDED' if abbr in ['R30','R33','R40'] else 'INACTIVE'
  p['availability']={'state':state,'practice_status':None,'game_status':None,'source':roster['url'],'updated_at':roster['captured_at'],'confidence':'roster_only','roster_designation':abbr}
  # Injury practice evidence cannot activate a player absent from the active roster.
  if pid in injuries and status=='ACT':p['availability']=injuries[pid]|{'updated_at':news['fetched_at']}
  elif pid in injuries:p['availability']['official_report']=injuries[pid]
  ms=mapped.get(pid,[]);p['attributes']=ms[0]['attributes'] if len(ms)==1 else None;p['mapping_status']=ms[0]['mapping_status'] if len(ms)==1 else 'unresolved'
  p['snap_history']=snaps.get(pid);p['rating_source']=ratings['snapshot_id'];p['depth_roles']=[r for r in roles if r['player_id']==pid]
 record={'version':'V2.0-D','as_of':at,'injury_at':news['fetched_at'],'injury_hash':news['sha256'],'roster_at':roster['captured_at'],'roster_snapshot':roster['sha256'],'depth_at':dates,'madden_snapshot':ratings['snapshot_id'],'personnel_snapshot':personnel['snapshot_id'],'player_snapshot':sourceplayers['snapshot_id'],'season':season,'week':week,'players':people,'depth':roles,'issues':depthissues+injuryissues,'snap_source_hash':snap_hash,'coverage':{'snap_history_players':len(snaps),'players':len(people),'official_injury_players':len(injuries),'official_tables':tables,'statuses':dict(Counter(p['availability']['state'] for p in people.values())),'madden':coverage},'unit_weights':json.loads((ROOT/'config/personnel.json').read_text())['unit_weights']}
 record['snapshot_id']='availability-'+hashlib.sha256(json.dumps(record,sort_keys=True).encode()).hexdigest()[:20];archive=ROOT/'.personnel'/f"{record['snapshot_id']}.json";atomic(archive,record);atomic(ROOT/'public/drive-lab/availability.json',record);atomic(ROOT/'public/drive-lab/availability-status.json',{'status':'ok','fetched_at':news['fetched_at'],'attempted_at':at,'snapshot_id':record['snapshot_id']})
 print(json.dumps({k:record[k] for k in ['snapshot_id','injury_at','roster_at','coverage']}));return record
if __name__=='__main__':
 try:build()
 except Exception:
  atomic(ROOT/'public/drive-lab/availability-status.json',{'status':'failed','attempted_at':datetime.now(timezone.utc).isoformat(),'detail':'Latest official refresh failed; last valid availability snapshot retained'})
  raise

