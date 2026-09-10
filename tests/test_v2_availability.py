import unittest,sys,json,tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from build_v2_availability import official_rows,latest_depth,snap_history
class AvailabilitySourceTests(unittest.TestCase):
 def setUp(self):self.people={'id':{'player_id':'id','name':'Test Player','aliases':['Test Player'],'team':'DET','position':'OL','espn_id':'123'}}
 def html(self,practice='Limited Participation in Practice',status='',week=1):
  return f'<title>Week {week} of the 2026 Season</title><div class="d3-o-section-sub-title">Lions</div><table class="d3-o-reports--detailed"><thead><tr>'+''.join(f'<th>{x}</th>' for x in ['Player','Position','Injuries','Practice Status','Game Status'])+'</tr></thead><tbody><tr>'+''.join(f'<td>{x}</td>' for x in ['Test Player','T','Ankle',practice,status])+'</tr></tbody></table>'
 def test_official_full_practice_clears_old_limited_designation(self):
  first,_,_=official_rows(self.html(),self.people,2026,1);second,_,_=official_rows(self.html('Full Participation in Practice'),self.people,2026,1)
  self.assertEqual(first['id']['state'],'LIMITED');self.assertEqual(second['id']['state'],'ACTIVE')
 def test_official_out_dominates_practice(self):
  rows,_,_=official_rows(self.html('Full Participation in Practice','Out'),self.people,2026,1);self.assertEqual(rows['id']['state'],'OUT')
 def test_wrong_week_and_changed_status_fail_closed(self):
  for html in [self.html(week=2),self.html(status='New designation')]:
   with self.assertRaises(ValueError):official_rows(html,self.people,2026,1)
 def test_unmatched_injury_not_assigned(self):
  people=dict(self.people);people['id']=people['id']|{'team':'NO'};rows,issues,_=official_rows(self.html(),people,2026,1);self.assertFalse(rows);self.assertEqual(len(issues),1)
 def test_depth_crosswalk_repairs_wrong_id_only_with_exact_espn_name_team(self):
  csv='dt,team,player_name,espn_id,gsis_id,pos_grp,pos_abb,pos_slot,pos_rank\n2026-09-10T00:00:00Z,DET,Test Player,123,wrong,3WR 1TE,LT,1,1\n'
  rows,issues,_=latest_depth(csv,self.people,'2026-09-10T01:00:00Z');self.assertEqual(rows[0]['player_id'],'id');self.assertTrue(rows[0]['correction']);self.assertFalse(issues)
  rows,issues,_=latest_depth(csv.replace(',123,',',456,'),self.people,'2026-09-10T01:00:00Z');self.assertTrue(rows[0]['player_id'].startswith('missing:'));self.assertTrue(issues)
 def test_depth_preserves_backup_ranks(self):
  csv='dt,team,player_name,espn_id,gsis_id,pos_grp,pos_abb,pos_slot,pos_rank\n2026-09-10T00:00:00Z,DET,Test Player,123,id,3WR 1TE,LT,1,2\n';rows,_,_=latest_depth(csv,self.people,'2026-09-10T01:00:00Z');self.assertEqual(rows[0]['rank'],2)
 def test_snap_history_excludes_zero_snaps_and_future_weeks(self):
  with tempfile.TemporaryDirectory() as tmp:
   path=Path(tmp)/'snaps.csv';path.write_text('pfr_player_id,season,week,game_type,team,offense_snaps,offense_pct,defense_snaps,defense_pct\nP,2025,18,REG,DET,50,0.8,0,0\nP,2026,1,REG,DET,50,0.1,0,0\nP,2025,17,REG,DET,0,0,0,0\n')
   rows,_=snap_history(path,[{'player_id':'id','pfr_id':'P'}],self.people,2026,1);self.assertEqual(rows['id']['share'],.8);self.assertEqual(rows['id']['active_games'],1)
if __name__=='__main__':unittest.main()
