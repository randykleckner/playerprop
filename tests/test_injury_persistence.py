import unittest,sys,json,tempfile
from pathlib import Path
from datetime import datetime,timezone
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from availability.persistence import reconcile,failure
from build_data_health import health
from availability.provider import NflAvailabilityProvider
import test_v2_availability as fixtures

class PersistenceTests(unittest.TestCase):
 def setUp(self):
  fixture=fixtures.AvailabilitySourceTests();fixture.setUp();self.people=fixture.people;self.fixture=fixture
  self.report=NflAvailabilityProvider().parse(fixture.html(),self.people,2026,1,'2026-09-10T00:00:00Z')
 def accept(self,r,previous=None):return reconcile(r,previous,self.people,{'DET'})
 def test_success_and_new_injury(self):
  rows=self.accept(self.report);self.assertEqual(rows['id']['state'],'LIMITED');self.assertFalse(rows['id']['retained'])
 def test_empty_malformed_partial_identity_mismatch(self):
  for report in [dict(self.report,players={}),dict(self.report,players=[]),dict(self.report,teams=[]),dict(self.report,issues=[{'reason':'identity'}])]:
   with self.subTest(report=report),self.assertRaises(ValueError):self.accept(report)
  self.report['players']['id']['team']='NO'
  with self.assertRaises(ValueError):self.accept(self.report)
 def test_duplicate_team(self):
  with self.assertRaises(ValueError):self.accept(dict(self.report,teams=['DET','DET']))
 def test_identical_duplicate_player_is_deduplicated(self):
  html=self.fixture.html();row=html[html.index('<tbody>')+7:html.index('</tbody>')]
  report=NflAvailabilityProvider().parse(html.replace('</tbody>',row+'</tbody>'),self.people,2026,1,'2026-09-10T00:00:00Z')
  self.assertEqual(len(self.accept(report)),1)
 def test_explicit_active_and_out_replace_prior(self):
  for practice,game,want in [('Full Participation in Practice','','ACTIVE'),('Full Participation in Practice','Out','OUT')]:
   r=NflAvailabilityProvider().parse(self.fixture.html(practice,game),self.people,2026,1,'2026-09-11T00:00:00Z')
   self.assertEqual(self.accept(r)['id']['state'],want)
 def test_omission_retains_original_week_and_time(self):
  old=self.report['players']['id'];previous={'players':{'id':dict(self.people['id'],availability=old)}}
  self.people['new']=dict(self.people['id'],player_id='new')
  rows=self.accept(dict(self.report,players={'new':dict(old,player_id='new')}),previous)
  self.assertTrue(rows['id']['retained']);self.assertEqual(rows['id']['updated_at'],old['updated_at'])
 def test_old_week_out_is_not_current_week_inactive(self):
  old=dict(self.report['players']['id'],state='OUT');previous={'players':{'id':dict(self.people['id'],availability=old)}}
  self.people['new']=dict(self.people['id'],player_id='new')
  rows=self.accept(dict(self.report,week=2,players={'new':dict(old,player_id='new',week=2)}),previous)
  self.assertEqual(rows['id']['state'],'UNKNOWN');self.assertEqual(rows['id']['last_known']['state'],'OUT')
 def test_timeout_preserves_snapshot_and_success_time(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);p=root/'public/drive-lab/availability.json';p.parent.mkdir(parents=True)
   p.write_text(json.dumps({'as_of':'2026-09-10T01:00:00Z','injury_at':'2026-09-10T00:00:00Z','coverage':{'official_injury_players':1}}));before=p.read_bytes()
   status=failure(root,TimeoutError());self.assertEqual(p.read_bytes(),before);self.assertEqual(status['fetched_at'],'2026-09-10T00:00:00Z');self.assertEqual(status['error'],'TimeoutError')
 def test_stale_and_failed_health_are_separate(self):
  now=datetime(2026,9,12,tzinfo=timezone.utc)
  s=health('injuries',None,'2026-09-10T00:00:00Z',1,now=now);self.assertEqual(s['status'],'STALE')
  s=health('injuries',None,'2026-09-10T00:00:00Z',1,'TimeoutError',now=now);self.assertEqual(s['status'],'ERROR');self.assertEqual(s['freshness'],'STALE')
  self.assertEqual(health('injuries',None,None,0)['status'],'ERROR')
  self.assertEqual(health('ownership',None,None,0,expected=False)['status'],'NO DATA EXPECTED')
