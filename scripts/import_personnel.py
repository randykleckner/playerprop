import json,time
from pathlib import Path
from personnel.provider import Madden27RatingsProvider,download,atomic
ROOT=Path(__file__).resolve().parents[1]
if __name__=='__main__':
 start=time.perf_counter();state=ROOT/'.personnel';state.mkdir(exist_ok=True)
 config=json.loads((ROOT/'config/personnel.json').read_text());season=config['season']
 ratings=Madden27RatingsProvider(state/'ea',min_refresh_days=config['madden_min_refresh_days']).fetch();atomic(state/'ratings.json',ratings)
 for kind,url in [('roster',f'https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_{season}.csv'),('depth',f'https://github.com/nflverse/nflverse-data/releases/download/depth_charts/depth_charts_{season}.csv.gz')]:atomic(state/(kind+'.json'),download(url,state/'nflverse',86400))
 print(json.dumps({'players':ratings['player_count'],'snapshot_id':ratings['snapshot_id'],'seconds':time.perf_counter()-start,'refresh_error':ratings.get('refresh_error')}))
