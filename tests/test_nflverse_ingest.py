import csv
import io
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import ingest_nflverse as ingest

class WeeklyImportTests(unittest.TestCase):
    def test_week_filter_and_turnovers(self):
        row = dict(player_id='canonical', player_display_name='Test QB', team='CHI', opponent_team='GB', season='2026', season_type='REG', week='1', position='QB', game_id='2026_01_GB_CHI', passing_interceptions='2', fumbles_lost_total='1')
        content = io.StringIO()
        writer = csv.DictWriter(content, fieldnames=row.keys())
        writer.writeheader()
        writer.writerows([row, {**row, 'week':'2'}])
        with patch.object(ingest.urllib.request, 'urlopen', return_value=io.BytesIO(content.getvalue().encode())):
            records = list(ingest.records(2026, 1))
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]['player_id'], 'canonical')
        self.assertEqual(records[0]['passing_interceptions'], 2)
        self.assertEqual(records[0]['fumbles_lost'], 1)

    def test_missing_turnovers_remain_unknown(self):
        self.assertIsNone(ingest.optional_value({}, 'passing_interceptions'))
        self.assertIsNone(ingest.optional_value({'fumbles_lost_total':''}, 'fumbles_lost_total'))
        self.assertEqual(ingest.optional_value({'passing_interceptions':'0'}, 'passing_interceptions'), 0)
