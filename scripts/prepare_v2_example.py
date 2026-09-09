"""Freeze one existing matchup and prior-season team aggregates; no network."""
import csv,hashlib,json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'public/research/latest.json').read_text())
snapshot=root/('public'+manifest['snapshot']['simulation_path'])
data=json.loads(snapshot.read_text());game=data['games'][0]
stats=root/'.dfs-calibration/stats-player-2025.csv'
rows=list(csv.DictReader(stats.open()))
fields='attempts completions passing_yards passing_interceptions sacks_suffered sack_yards_lost carries rushing_yards rushing_fumbles_lost'.split()
teams={};observed={}
for team in (game['home'],game['away']):
 rs=[r for r in rows if r['team']==team and r['season_type']=='REG']
 sums={k:sum(float(r[k] or 0) for r in rs) for k in fields};games=len({r['game_id'] for r in rs});a=sums['attempts'];rush=sums['carries'];sack=sums['sacks_suffered']
 teams[team]={'passRate':(a+sack)/(a+sack+rush),'completionRate':sums['completions']/a,'sackRate':sack/(a+sack),'interceptionRate':sums['passing_interceptions']/a,'runMean':sums['rushing_yards']/rush,'completionMean':sums['passing_yards']/sums['completions'],'fumbleRate':sums['rushing_fumbles_lost']/rush}
 observed[team]={'games':games,'plays':(a+sack+rush)/games,'passAttempts':a/games,'rushAttempts':rush/games,'netYards':(sums['passing_yards']+sums['rushing_yards']-sums['sack_yards_lost'])/games}
output={'gameId':game['game_id'],'homeTeam':game['home'],'awayTeam':game['away'],'homeTeamInputs':teams[game['home']],'awayTeamInputs':teams[game['away']],'inputsTimestamp':data['data_as_of'],'market':game,'historicalTeamAverages':observed,'provenance':{'snapshot':str(snapshot.relative_to(root)),'snapshotSha256':hashlib.sha256(snapshot.read_bytes()).hexdigest(),'statsSource':'https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2025.csv','statsSha256':hashlib.sha256(stats.read_bytes()).hexdigest(),'season':2025,'limitations':'Prior-season unconditional team rates; current coaching/roster changes not modeled. SDs, timing and kicks use declared defaults.'}}
(root/'tests/fixtures/v2/matchup.json').write_text(json.dumps(output,indent=2)+'\n')
