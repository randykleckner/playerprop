import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from prepare_historical_calibration import FIELDS,normalize,prepare
class HistoricalCalibrationTests(unittest.TestCase):
 def test_missing_stats_not_zero_and_core_bonus_scoring(self):
  row=dict.fromkeys(FIELDS,'0');row.update(position='QB',season_type='REG',passing_yards='300',passing_tds='2',passing_interceptions='1')
  self.assertEqual(normalize(row)['core_points'],22)
  row['passing_yards']=''
  with self.assertRaises(ValueError):normalize(row)
 def test_current_actual_cannot_change_prior_five_forecast(self):
  stats=[];schedule=[]
  for week in range(1,7):
   gid=f'2025_{week:02d}_A_B';schedule.append(dict(game_id=gid,game_type='REG',season='2025',gameday=f'2025-10-{week:02d}',home_team='A',away_team='B',home_score='20',away_score='10'))
   for team in ['A','B']:
    row=dict.fromkeys(FIELDS,'0');row.update(player_id=team,player_display_name=team,position='QB',season_type='REG',season='2025',week=str(week),game_id=gid,team=team,attempts='30',completions='20',passing_yards='200',passing_tds='1');stats.append(row)
  before=prepare(stats,schedule)
  stats[-1]['passing_yards']='500'
  after=prepare(stats,schedule)
  self.assertEqual(before['games'][0]['input'],after['games'][0]['input']);self.assertNotEqual(before['games'][0]['actuals'],after['games'][0]['actuals'])
