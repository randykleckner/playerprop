import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from refresh_current_research import normalize_schedule


class RefreshScheduleTests(unittest.TestCase):
    def setUp(self):
        self.payload = {'events': [{'season': {'year': 2026, 'type': 2}, 'week': {'number': 1}}]}

    def test_missing_root_metadata_uses_events_without_mutating_source(self):
        original = copy.deepcopy(self.payload)
        schedule, season, week = normalize_schedule(self.payload)
        self.assertEqual((season, week), (2026, 1))
        self.assertEqual(schedule['season']['type'], 2)
        self.assertEqual(self.payload, original)

    def test_mixed_weeks_fail(self):
        self.payload['events'].append({'season': {'year': 2026, 'type': 2}, 'week': {'number': 2}})
        with self.assertRaisesRegex(ValueError, 'Ambiguous'):
            normalize_schedule(self.payload)

    def test_missing_season_or_nonregular_events_fail(self):
        for season in [{'year': None, 'type': 2}, {'year': 2026, 'type': 1}]:
            self.payload['events'][0]['season'] = season
            with self.assertRaises(ValueError):
                normalize_schedule(self.payload)
