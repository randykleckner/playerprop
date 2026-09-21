import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from newsroom.lifecycle import retain_and_update
from refresh_game_outlook import normalize
class LifecycleTests(unittest.TestCase):
 def setUp(self):
  self.old={'player_id':'p','topic':'Availability','evidence':{'game_status':'Out'},'observed_at':'2026-09-10'}
  self.person={'player_id':'p','display_name':'Example','current_team_id':'NE','position':'WR'}
 def test_omission_retains_original_observation(self):
  rows=retain_and_update([], [self.old], [self.person],[]);self.assertTrue(rows[0]['retained']);self.assertEqual(rows[0]['observed_at'],'2026-09-10')
 def test_full_practice_is_news_not_silent_removal(self):
  source={'name':'NFL official injury report','url':'https://www.nfl.com/injuries/','status':'ok','fetched_at':'2026-09-20T12:00:00Z','counts':{'practice_updates':[{'player_id':'p','season':2026,'week':2}]}}
  row=retain_and_update([],[self.old],[self.person],[source])[0];self.assertEqual(row['evidence']['game_status'],'Full practice');self.assertIn('does not confirm',row['impact']);self.assertEqual(row['previous_status'],'Out')
 def test_new_status_supersedes_old(self):
  fresh=dict(self.old,evidence={'game_status':'Active'});self.assertEqual(retain_and_update([fresh],[self.old],[self.person],[]),[fresh])
 def test_return_news_remains_when_missing_from_next_feed(self):
  returned=dict(self.old,return_update=True,evidence={'game_status':'Active'})
  self.assertTrue(retain_and_update([],[returned],[self.person],[])[0]['retained'])
 def test_missing_schedule_cannot_replace_good(self):
  with self.assertRaises(ValueError):normalize({'events':[]},'2026-09-20T12:00:00+00:00')
