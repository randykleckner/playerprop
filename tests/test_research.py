import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from research.prepare import markets,audit_identities,usage_context
class ResearchTests(unittest.TestCase):
 def setUp(self):
  self.game={'game_id':'A-B','home':'A','away':'B','start_time':'2026-09-13T17:00:00Z'}
  self.scoreboard={'season':{'year':2026},'week':{'number':1},'events':[{'id':'1','date':self.game['start_time'],'status':{'type':{'state':'pre'}},'competitions':[{'competitors':[{'homeAway':'home','team':{'abbreviation':'A'}},{'homeAway':'away','team':{'abbreviation':'B'}}],'odds':[{'provider':{'name':'DraftKings'},'overUnder':50,'pointSpread':{'home':{'close':{'line':'+4'}}}}]}]}]}
 def test_home_underdog_implied_totals(self):
  rows,issues=markets(self.scoreboard,[self.game],'2026-09-07T12:00:00Z',2026,1);self.assertEqual(issues,[]);self.assertEqual(rows[0]['home_implied_total'],23);self.assertEqual(rows[0]['away_implied_total'],27)
 def test_postlock_missing_and_mismatched_markets(self):
  self.assertFalse(markets(self.scoreboard,[self.game],'2026-09-14T00:00:00Z',2026,1)[0])
  del self.scoreboard['events'][0]['competitions'][0]['odds'][0]['pointSpread']
  self.assertFalse(markets(self.scoreboard,[self.game],'2026-09-07T00:00:00Z',2026,1)[0])
  with self.assertRaises(ValueError):markets(self.scoreboard,[self.game],'2026-09-07T00:00:00Z',2025,1)
 def test_duplicate_game_fails_closed(self):
  self.scoreboard['events']*=2;self.assertEqual(markets(self.scoreboard,[self.game],'2026-09-07T00:00:00Z',2026,1)[1][0]['reason'],'missing_or_ambiguous_game')
 def test_identity_corroboration_does_not_verify_dk(self):
  p={'player_id':'gsis','player_name':'Player Jr.','position':'RB','team':'A'};c={'player_id':'gsis','display_name':'Player','position':'RB','espn_id':'42','pfr_id':'P1'};r={'gsis_id':'gsis','name':'Player','position':'RB','team':'A','espn_id':'42'}
  report=audit_identities([p],[r],[c])[0];self.assertEqual(report['status'],'corroborated_provisional');self.assertFalse(report['verified_draftkings_id'])
  r['espn_id']='43';self.assertIn('espn_id_conflict',audit_identities([p],[r],[c])[0]['reasons'])
 def test_usage_prior_season_only_and_team_changes(self):
  p={'player_id':'g','team':'B'};c={'player_id':'g','pfr_id':'P'};r={'pfr_player_id':'P','game_id':'2025_18_A_B','season':'2025','week':'18','team':'A','offense_pct':'.7','game_type':'REG'}
  result=usage_context([p],[r],[c],2026)['g'];self.assertFalse(result['same_team']);self.assertEqual(result['mean_snap_share'],.7)
  self.assertFalse(usage_context([p],[dict(r,season='2026')],[c],2026))
  with self.assertRaises(ValueError):usage_context([p],[r,r],[c],2026)
