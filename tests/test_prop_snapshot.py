import unittest
import tempfile
import json
from pathlib import Path
from datetime import datetime, timezone
from scripts.refresh_prop_snapshot import upcoming, refresh

class PropSnapshotTests(unittest.TestCase):
    now = datetime(2026, 9, 11, 15, tzinfo=timezone.utc)
    def payload(self):
        return {'capturedAt':'2026-09-10T15:00:00Z','signals':[{'commenceAt':v} for v in ['2026-09-10T19:20:00-05:00',None,'bad','2026-09-13T12:00:00-05:00','2026-09-11T10:00:00-05:00']]}
    def test_upcoming_only(self):
        result=upcoming(self.payload(),self.now)
        self.assertEqual(len(result['signals']),1)
        self.assertEqual(result['capturedAt'],self.payload()['capturedAt'])
    def test_failure_prunes_but_preserves_future_and_capture(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/'fallback-signals.json';path.write_text(json.dumps(self.payload()))
            def fail(): raise OSError('offline')
            self.assertEqual(refresh(root,fail,self.now),1)
            self.assertEqual(json.loads(path.read_text()),upcoming(self.payload(),self.now))
    def test_successful_empty_feed_replaces_old_snapshot(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/'fallback-signals.json';path.write_text(json.dumps(self.payload()))
            self.assertEqual(refresh(root,lambda:{'signals':[]},self.now),1)
            self.assertEqual(json.loads(path.read_text())['signals'],[])

    def test_empty_feed_is_reported_as_unhealthy(self):
        with tempfile.TemporaryDirectory() as root:
            self.assertEqual(refresh(root,lambda:{'capturedAt':'2026-09-03T00:00:00Z','signals':[]},self.now),1)
            health=json.loads((Path(root)/'props-status.json').read_text())
            self.assertEqual(health['status'],'no_upcoming_quotes')
            self.assertGreater(health['age_hours'],24)
    def test_stale_quotes_are_not_reported_as_success(self):
        with tempfile.TemporaryDirectory() as root:
            payload=self.payload();payload['capturedAt']='2026-09-03T00:00:00Z'
            self.assertEqual(refresh(root,lambda:payload,self.now),1)
            self.assertEqual(json.loads((Path(root)/'props-status.json').read_text())['status'],'stale')
