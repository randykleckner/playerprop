import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from refresh_season_leaders import aggregate
from newsroom.injury_wire import parse
class SeasonNews(unittest.TestCase):
 def test_actuals_exclude_future_and_postseason_deduplicate(self):
  row={'player_id':'p','player_display_name':'Player','position':'RB','team':'LV','season':'2026','season_type':'REG','week':'1','game_id':'g','rushing_yards':'100'}
  result=aggregate([row,row,{**row,'week':'2','game_id':'next'},{**row,'season_type':'POST','game_id':'post'}],2026,2)
  self.assertEqual(result['players'][0]['rushing_yards'],100);self.assertEqual(result['players'][0]['games'],1)
 def test_injury_id_team_and_estimated_return(self):
  player={'player_id':'p','display_name':'Example','current_team_id':'LV','position':'TE','espn_id':'123'}
  record={'athlete':{'links':[{'href':'https://www.espn.com/nfl/player/_/id/123/example'}],'team':{'abbreviation':'LV'}},'status':'Questionable','date':'2026-09-14T19:55Z','details':{'type':'Knee','returnDate':'2026-09-20'}}
  payload={'season':{'year':2026},'injuries':[{'injuries':[record]}]}
  rows,counts=parse(payload,[player],'2026-09-15T23:00:00Z',2026)
  self.assertIn('Not confirmed',rows[0]['return_summary']);self.assertEqual(rows[0]['player_id'],'p')
  self.assertEqual(rows[0]['evidence']['game_status'],'Questionable')
  with self.assertRaises(ValueError):parse(payload,[{**player,'current_team_id':'NE'}],'2026-09-15T23:00:00Z',2026)
  with self.assertRaises(ValueError):parse(payload,[player],'2026-09-15T23:00:00Z',2025)
if __name__=='__main__':unittest.main()
