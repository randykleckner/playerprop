"""Build local persistent personnel evidence and compact static Drive Lab diagnostics."""
import json,hashlib,time
from pathlib import Path
from personnel.provider import atomic,now
from personnel.model import roster_context,map_players,build_units,matchup
from personnel.storage import persist
from dfs.catalog import load_catalog
ROOT=Path(__file__).resolve().parents[1]
def main():
 start=time.perf_counter();state=ROOT/'.personnel';raw=json.loads((state/'ratings.json').read_text());roster=json.loads((state/'roster.json').read_text());depth=json.loads((state/'depth.json').read_text());config=json.loads((ROOT/'config/personnel.json').read_text());overrides=json.loads((ROOT/'config/personnel-overrides.json').read_text())['overrides'];canonical,meta=load_catalog(ROOT/'.dfs-salaries/catalog');at=now()
 rosters,roles,dates=roster_context(roster['body'],depth['body'],canonical,at,roster['captured_at'],config['season'])
 teams={v['name']:k for k,v in json.loads((ROOT/'public/team-media.json').read_text()).items()}
 for p in raw['players']:p['team']=teams.get(p['team_name'],'FA')
 coverage=map_players(raw['players'],rosters,overrides,at);units=build_units(rosters,roles,raw['players'],config)
 context=hashlib.sha256(json.dumps([raw['snapshot_id'],roster['sha256'],depth['sha256'],overrides,config,meta.get('sha256')],sort_keys=True).encode()).hexdigest()[:20]
 snapshot=raw|{'snapshot_id':raw['snapshot_id']+'-'+context,'ratings_snapshot_id':raw['snapshot_id'],'roster_at':roster['captured_at'],'depth_at':max(dates.values(),default=None),'sources':{'ratings':raw['sources'],'roster':{k:v for k,v in roster.items() if k!='body'},'depth':{k:v for k,v in depth.items() if k!='body'},'canonical':meta}}
 persist(state/'personnel.sqlite',snapshot,ROOT/'migrations/0009_personnel_ratings.sql');archive=state/(snapshot['snapshot_id']+'.json')
 if not archive.exists():atomic(archive,snapshot)
 diagnostics={'version':1,'diagnostic_only':True,'built_at':at,'snapshot_id':snapshot['snapshot_id'],'ratings_snapshot_id':raw['snapshot_id'],'provider':raw['provider'],'source_version':raw['source_version'],'personnel_at':raw['captured_at'],'roster_at':roster['captured_at'],'depth_at':max(dates.values(),default=None),'depth_by_team':dates,'coverage':coverage,'units':units,'source_status':raw.get('refresh_error') or 'ok','roster_count':len(rosters),'ratings_url':'https://www.ea.com/games/madden-nfl/ratings','matchups':{}}
 examples=json.loads((ROOT/'public/drive-lab/examples.json').read_text())
 for g in examples['games']:diagnostics['matchups'][g['gameId']]={'away':matchup(units,g['awayTeam'],g['homeTeam']),'home':matchup(units,g['homeTeam'],g['awayTeam'])}
 atomic(ROOT/'public/drive-lab/personnel.json',diagnostics);atomic(state/'mapping-report.json',{'coverage':coverage,'issues':[p for p in raw['players'] if p['mapping_status'] in ['unresolved','provisional']]})
 print(json.dumps({'coverage':coverage,'seconds':time.perf_counter()-start,'sqlite_bytes':(state/'personnel.sqlite').stat().st_size,'public_bytes':(ROOT/'public/drive-lab/personnel.json').stat().st_size,'teams':len(units)}))
if __name__=='__main__':main()
