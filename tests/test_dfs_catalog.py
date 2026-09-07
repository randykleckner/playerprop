import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from dfs.catalog import parse_catalog, load_catalog
from dfs.providers import ProviderError, utc_now

CSV="gsis_id,display_name,position,latest_team,espn_id\n00-001,Example Player,WR,LAR,42\n"


class CatalogTests(unittest.TestCase):
    def test_schema_ids_aliases_and_duplicate_rejection(self):
        rows=parse_catalog(CSV)
        self.assertEqual(rows[0]['player_id'],'00-001')
        self.assertEqual(rows[0]['current_team_id'],'LA')
        self.assertEqual(rows[0]['espn_id'],'42')
        for content in ['name\nSomeone\n',CSV+CSV.splitlines()[1]+'\n',CSV.splitlines()[0]+'\n']:
            with self.assertRaises(ProviderError):parse_catalog(content)

    def test_fresh_cache_is_offline(self):
        with tempfile.TemporaryDirectory() as tmp,patch('urllib.request.urlopen') as request:
            p=Path(tmp)
            p.joinpath('catalog.json').write_text(json.dumps({'fetched_at':utc_now(),'source':'fixture','players':parse_catalog(CSV)}))
            rows,metadata=load_catalog(p)
            self.assertEqual(len(rows),1)
            request.assert_not_called()

    def test_public_fetch_archived_and_failed_refresh_keeps_catalog(self):
        with tempfile.TemporaryDirectory() as tmp,patch('urllib.request.urlopen') as request:
            p=Path(tmp)
            request.return_value.__enter__.return_value.read.return_value=CSV.encode()
            rows,metadata=load_catalog(p)
            self.assertFalse(metadata['production_membership_verified'])
            self.assertEqual(len(list(p.glob('*.csv.gz'))),1)
            data=json.loads(p.joinpath('catalog.json').read_text());data['fetched_at']='2020-01-01T00:00:00Z'
            p.joinpath('catalog.json').write_text(json.dumps(data))
            request.side_effect=OSError('offline')
            kept,metadata=load_catalog(p)
            self.assertEqual(kept,rows)
            self.assertTrue(metadata['stale'])
