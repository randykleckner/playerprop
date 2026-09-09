"""Manual public PBP refresh. Retain valid archives if a season is unavailable."""
import gzip,json,hashlib,csv,io
from pathlib import Path
from datetime import datetime,timezone
from personnel.provider import download,atomic
from build_v2_live import allowed_seasons,main as build
ROOT=Path(__file__).resolve().parents[1]
def main():
 config=json.loads((ROOT/'config/v2-live.json').read_text());state=ROOT/'.dfs-calibration';state.mkdir(exist_ok=True);status=[]
 for season in allowed_seasons(config,datetime.now(timezone.utc).isoformat()):
  path=state/f'pbp-{season}.csv.gz'
  # Completed historical files remain frozen; only the target season needs routine rechecks.
  if path.exists() and season<config['target_season']:continue
  url=f'https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_{season}.csv.gz'
  try:
   source=download(url,state/'live-source-cache',86400);reader=csv.DictReader(io.StringIO(source['body']))
   if not {'season','game_date','play_type','posteam'}.issubset(reader.fieldnames or []):raise ValueError('PBP schema changed')
   if not any(r.get('season')==str(season) for r in reader):raise ValueError('No matching season rows')
   tmp=path.with_suffix('.tmp');tmp.write_bytes(gzip.compress(source['body'].encode()));tmp.replace(path)
   status.append({'season':season,'status':'ok','captured_at':source['captured_at'],'source_sha256':source['sha256']})
  except Exception as e:status.append({'season':season,'status':'retained prior' if path.exists() else 'unavailable','error':type(e).__name__})
 atomic(state/'live-refresh-status.json',status);build();print(json.dumps(status))
if __name__=='__main__':main()
