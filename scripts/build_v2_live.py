"""Recency-weighted current profile, isolated from frozen rolling evaluation."""
import json,csv,gzip,hashlib,math
from collections import defaultdict
from datetime import datetime,timezone
from pathlib import Path
from fit_v2_pbp import fit
ROOT=Path(__file__).resolve().parents[1]
def allowed_seasons(config,as_of,evaluation_year=None):
 for value in [*config['season_weights'].values(),*[config[k] for k in ['current_league_prior_plays','current_team_prior_plays','historical_team_prior_plays']]]:
  if not isinstance(value,(int,float)) or not math.isfinite(value) or value<=0:raise ValueError('Recency weights and priors must be positive finite numbers')
 year=datetime.fromisoformat(as_of.replace('Z','+00:00')).year;target=min(config['target_season'],year)
 return [int(y) for y,w in config['season_weights'].items() if w>0 and int(y)<=target and (evaluation_year is None or int(y)<evaluation_year)]
def eligible_rows(rows,season,as_of):
 for r in rows:
  if r.get('season')==str(season) and r.get('game_date') and r['game_date']<as_of[:10]:yield r

def blend(profiles,config,as_of):
 years=allowed_seasons(config,as_of);profiles={y:p for y,p in profiles.items() if y in years}
 if not profiles:raise ValueError('No historical empirical profiles')
 target=config['target_season'];weights={y:config['season_weights'][str(y)] for y in profiles}
 if target in weights:weights[target]*=profiles[target]['trainingPlays']/(profiles[target]['trainingPlays']+config['current_league_prior_plays'])
 total=sum(weights[y]*p['trainingPlays'] for y,p in profiles.items());base=sum(weights[y]*p['trainingPlays']*p['baselinePassRate'] for y,p in profiles.items())/total
 calls={};hist=defaultdict(lambda:defaultdict(float));pace={}
 for key in set(k for p in profiles.values() for k in p['calls']):
  count=sum(weights[y]*p['calls'].get(key,{}).get('count',0) for y,p in profiles.items())
  calls[key]={'count':count,'probability':sum(weights[y]*p['calls'][key]['count']*p['calls'][key]['probability'] for y,p in profiles.items() if key in p['calls'])/count}
 for y,p in profiles.items():
  for kind,rows in p['yards'].items():
   for yards,n in rows:hist[kind][yards]+=weights[y]*n
 for kind in ['normal','lead','trail']:
  count=sum(weights[y]*p['pace'].get(kind,{}).get('count',0) for y,p in profiles.items())
  if count:pace[kind]={'count':count,'seconds':sum(weights[y]*p['pace'][kind]['count']*p['pace'][kind]['seconds'] for y,p in profiles.items() if kind in p['pace'])/count}
 history={y:p for y,p in profiles.items() if y<target};history=history or profiles
 # League priors are weighted across observed team sample sizes, never invented players.
 attrs=next(iter(next(iter(history.values()))['teamInputs'].values())).keys();league={}
 for k in attrs:
  den=sum(weights[y]*p['teamSampleSizes'][tm] for y,p in history.items() for tm in p['teamInputs'])
  league[k]=sum(weights[y]*p['teamSampleSizes'][tm]*v[k] for y,p in history.items() for tm,v in p['teamInputs'].items())/den
 teams={};shrink={}
 for tm in set(t for p in profiles.values() for t in p['teamInputs']):
  n=sum(weights[y]*p['teamSampleSizes'].get(tm,0) for y,p in history.items());alpha=n/(n+config['historical_team_prior_plays']);values={}
  current=profiles.get(target,{});cn=current.get('teamSampleSizes',{}).get(tm,0);ca=cn/(cn+config['current_team_prior_plays'])
  for k in attrs:
   h=sum(weights[y]*p['teamSampleSizes'][tm]*p['teamInputs'][tm][k] for y,p in history.items() if tm in p['teamInputs'])/n if n else league[k]
   stabilized=alpha*h+(1-alpha)*league[k]
   values[k]=ca*current['teamInputs'][tm][k]+(1-ca)*stabilized if cn else stabilized
  teams[tm]=values;shrink[tm]={'historical_weighted_plays':n,'historical_team_share':alpha,'current_plays':cn,'current_share':ca}
 return {'version':'V2.0-B-live-recency','trainingSeason':max(profiles),'trainingSeasons':sorted(profiles),'targetSeason':target,'baselinePassRate':base,'calls':calls,'yards':{k:sorted(v.items()) for k,v in hist.items()},'pace':pace,'teamInputs':teams,'trainingPlays':sum(p['trainingPlays'] for p in profiles.values()),'shrinkage':shrink,'configured_weights':config['season_weights'],'effective_league_weights':weights,'as_of':as_of,'season_counts':{y:p['trainingPlays'] for y,p in profiles.items()},'current_season_note':'Current completed-game observations included' if target in profiles else 'No eligible current-season PBP available; historical stabilization only'}
def main():
 config=json.loads((ROOT/'config/v2-live.json').read_text());as_of=datetime.now(timezone.utc).isoformat();profiles={};sources=[]
 for y in allowed_seasons(config,as_of):
  path=ROOT/f'.dfs-calibration/pbp-{y}.csv.gz'
  if not path.exists():sources.append({'season':y,'status':'unavailable'});continue
  with gzip.open(path,'rt') as f:
   try:profiles[y]=fit(eligible_rows(csv.DictReader(f),y,as_of))
   except ValueError as e:
    if str(e)!='No eligible plays':raise
  sources.append({'season':y,'status':'included' if y in profiles else 'no eligible completed days','sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'url':f'https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_{y}.csv.gz'})
 result=blend(profiles,config,as_of);result['sources']=sources;result['profileId']=hashlib.sha256(json.dumps(result,sort_keys=True).encode()).hexdigest()
 out=ROOT/'public/drive-lab/live-empirical.json';tmp=out.with_suffix('.tmp');tmp.write_text(json.dumps(result));tmp.replace(out)
 archive=ROOT/'.dfs-calibration'/('live-'+result['profileId']+'.json');archive.write_text(json.dumps(result))
 print(json.dumps({'seasons':result['season_counts'],'current':result['current_season_note'],'as_of':as_of}))
if __name__=='__main__':main()
