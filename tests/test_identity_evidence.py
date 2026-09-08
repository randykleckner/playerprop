import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from research.identity_evidence import build_evidence

class IdentityEvidenceTests(unittest.TestCase):
 def setUp(self):
  self.p={'draftable_id':'dk-draft','player_id':None,'player_name':'Player','position':'RB','team':'LV','mapping_candidates':['g'],'external_ids':{'draftkings_player_id':'42'}}
  self.c={'player_id':'g','display_name':'Player','position':'RB','espn_id':'24'}
  self.r={'gsis_id':'g','name':'Player','position':'RB','team':'LVR','espn_id':'24'}
 def test_provider_team_alias_does_not_verify(self):
  r=build_evidence([self.p],[self.c],[self.r],{'reviews':[]})['rows'][0]
  self.assertEqual(r['priority'],'bridge_needed');self.assertFalse(r['audit']['verified_draftkings_id']);self.assertEqual(r['canonical_evidence']['espn_id'],'24')
 def test_real_team_change_and_position_conflict_still_flagged(self):
  self.r.update(team='TBB',position='TE')
  r=build_evidence([self.p],[self.c],[self.r],{'reviews':[]})['rows'][0]
  self.assertIn('crosswalk_team_mismatch',r['reasons']);self.assertIn('crosswalk_identity_conflict',r['reasons'])
 def test_conflicting_external_id_still_flagged(self):
  self.r['espn_id']='42'
  self.assertIn('espn_id_conflict',build_evidence([self.p],[self.c],[self.r],{'reviews':[]})['rows'][0]['reasons'])
 def test_ambiguous_candidates_not_selected(self):
  self.p['mapping_candidates']=['g','other']
  r=build_evidence([self.p],[self.c],[self.r],{'reviews':[]})['rows'][0]
  self.assertIsNone(r['candidate_player_id']);self.assertEqual(r['priority'],'unresolved')
 def test_context_cannot_approve_mapping(self):
  with self.assertRaisesRegex(ValueError,'cannot approve'):
   build_evidence([self.p],[self.c],[self.r],{'reviews':[{'verified_draftkings_id':True}]})
