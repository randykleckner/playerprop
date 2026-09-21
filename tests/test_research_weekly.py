import unittest
from scripts.refresh_season_leaders import weekly_records
class WeeklyResearch(unittest.TestCase):
 def row(self,**kw):
  return dict(player_id='a',player_display_name='A',season='2026',season_type='REG',week='1',team='DET',position='RB',carries='10',**kw)
 def test_missing_is_null_not_zero(self):
  rows=weekly_records([self.row()],2026,3)
  self.assertEqual(rows[0]['carries'],10)
  self.assertIsNone(rows[0]['targets'])
 def test_no_current_week_or_other_season(self):
  r=self.row();r['week']='3'
  self.assertEqual(weekly_records([r],2026,3),[])
  r['week']='1';r['season']='2025'
  self.assertEqual(weekly_records([r],2026,3),[])
 def test_duplicate_fails_before_publication(self):
  with self.assertRaises(ValueError):weekly_records([self.row(),self.row()],2026,3)
