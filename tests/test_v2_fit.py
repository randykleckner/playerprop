import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from fit_v2_pbp import fit,eligible,key
class FitTests(unittest.TestCase):
 def row(self,**extra):return dict(season_type='REG',play_type='run',qtr='1',down='1',ydstogo='10',quarter_seconds_remaining='900',score_differential='0',yards_gained='4',sack='0',interception='0',complete_pass='0',fumble_lost='0',penalty='0',qb_kneel='0',qb_spike='0',posteam='DET',game_id='game',drive='1',out_of_bounds='0',touchdown='0')|extra
 def test_exclusions_and_missing_fields(self):
  self.assertTrue(eligible(self.row()))
  for change in [dict(penalty='1'),dict(qtr='5'),dict(ydstogo=''),dict(qb_kneel='1'),dict(play_type='no_play')]:self.assertFalse(eligible(self.row(**change)))
 def test_fit_uses_explicit_training_rows_only(self):
  rows=[self.row(),self.row(play_type='pass',complete_pass='1',yards_gained='12',quarter_seconds_remaining='866')]
  a=fit(rows);self.assertEqual(a['trainingPlays'],2);self.assertEqual(a['yards']['run'],[(4,1)]);self.assertEqual(a['teamInputs']['DET']['passRate'],.5)
  self.assertEqual(a,fit(rows));self.assertEqual(a['pace']['normal']['seconds'],28)
 def test_late_context_distinguishes_margin(self):
  self.assertTrue(key(self.row(qtr='4',quarter_seconds_remaining='120',score_differential='-7')).endswith('trail'))
