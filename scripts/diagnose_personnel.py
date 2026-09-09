"""Read the saved personnel diagnostics; never fetch or change simulation results."""
import argparse,json
from pathlib import Path
from personnel.model import matchup
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--away',default='BUF');p.add_argument('--home',default='HOU');a=p.parse_args()
d=json.loads((ROOT/'public/drive-lab/personnel.json').read_text())
if a.away not in d['units'] or a.home not in d['units']:p.error('Use canonical NFL team abbreviations')
print(json.dumps({k:d[k] for k in ['coverage','personnel_at','roster_at','depth_at','source_status']},indent=2))
for tm,opp in [(a.away,a.home),(a.home,a.away)]:
 print(tm,'vs',opp,json.dumps(matchup(d['units'],tm,opp),indent=2))
 for name,u in d['units'][tm].items():
  print(name,u['rating'],u['confidence'],'complete:',u['complete'])
  for x in u['players']:print(' ',x['role'],x['name'],x['rating'],x['mapping_status'],json.dumps(x['attributes']))
  for issue in u['missing']:print(' MISSING:',issue)
