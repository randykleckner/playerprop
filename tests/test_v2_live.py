import sys,json,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from build_v2_live import allowed_seasons,eligible_rows,blend
class RecencyTests(unittest.TestCase):
 def setUp(self):self.config=json.loads((ROOT/'config/v2-live.json').read_text());self.at='2026-09-09T12:00:00Z'
 def profile(self,n,rate):return {'trainingPlays':n,'baselinePassRate':rate,'calls':{'cell':{'count':n,'probability':rate}},'yards':{'run':[[4,n]]},'pace':{'normal':{'count':n,'seconds':25}},'teamInputs':{'BUF':{'passRate':rate}},'teamSampleSizes':{'BUF':n}}
 def test_rolling_excludes_evaluation(self):
  for year in [2024,2025,2026]:self.assertTrue(all(y<year for y in allowed_seasons(self.config,self.at,year)))
  self.assertEqual(allowed_seasons(self.config,self.at,2025),[2024])
 def test_no_future_or_same_day_rows(self):
  rows=[{'season':'2026','game_date':d} for d in ['2026-09-08','2026-09-09','2026-09-10']];self.assertEqual(len(list(eligible_rows(rows,2026,self.at))),1)
 def test_weights_and_shrinkage(self):
  p=blend({2024:self.profile(100,.4),2025:self.profile(100,.6),2026:self.profile(1,1)},self.config,self.at)
  self.assertLess(p['shrinkage']['BUF']['current_share'],.003);self.assertAlmostEqual(p['teamInputs']['BUF']['passRate'],.534497,places=5)
  self.assertEqual(p['season_counts'][2026],1)
 def test_missing_current_and_invalid_config(self):
  p=blend({2025:self.profile(100,.6)},self.config,self.at);self.assertEqual(p['trainingSeasons'],[2025]);self.assertEqual(p['shrinkage']['BUF']['current_share'],0)
  self.config['current_team_prior_plays']=-1
  with self.assertRaises(ValueError):allowed_seasons(self.config,self.at)
