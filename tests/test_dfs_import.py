import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from dfs.adapters import draftkings_csv, normalized_json, validate_records
from ingest_dfs_salaries import api_origin

FIXTURE = Path(__file__).parent / "fixtures" / "draftkings-salaries.csv"


class SalaryImportTests(unittest.TestCase):
    def test_csv_bom_quotes_identity_and_dst(self):
        rows = draftkings_csv("\ufeff" + FIXTURE.read_text())
        validate_records(rows)
        self.assertEqual(rows[1]["player_name"], "Sample Receiver, Jr.")
        self.assertEqual(rows[1]["eligible_positions"], ["WR", "FLEX"])
        self.assertEqual(rows[2]["home_away"], "home")
        self.assertIsNone(rows[2]["player_id"])
        self.assertTrue(all(row["game_id"] is None for row in rows))

    def test_csv_missing_header_game_salary_and_flex(self):
        content = FIXTURE.read_text()
        for wrong in [content.replace("Salary", "Price"), content.replace("CHI@GB", "unknown"),
                      content.replace("6500", "6500.5"), content.replace("WR/FLEX", "WR/CPT"),
                      content.replace("CHI@GB", "NYG@GB"), content + "WR,broken\n"]:
            with self.subTest(wrong=wrong), self.assertRaises(ValueError):
                draftkings_csv(wrong)

    def test_normalized_adapter_and_duplicate_rejection(self):
        rows = normalized_json(json.dumps(draftkings_csv(FIXTURE.read_text())))
        validate_records(rows)
        for bad in [rows + [rows[0]], []]:
            with self.assertRaises(ValueError):
                validate_records(bad)
        for value in [False, -1, 50001, 1.1, "1000"]:
            bad = copy.deepcopy(rows)
            bad[0]["salary"] = value
            with self.assertRaises(ValueError):
                validate_records(bad)
        with self.assertRaises(ValueError):
            normalized_json('{}')

    def test_secure_origins(self):
        self.assertEqual(api_origin("https://api.example.com/"), "https://api.example.com")
        self.assertEqual(api_origin("http://localhost:8787"), "http://localhost:8787")
        for origin in ["http://example.com", "https://example.com/api", "https://x:y@example.com", "https://example.com?key=x", "file:///tmp/x"]:
            with self.assertRaises(ValueError):
                api_origin(origin)

    def test_dry_run_with_verified_mapping_needs_no_credentials(self):
        with tempfile.TemporaryDirectory() as tmp:
            mapping, output = Path(tmp) / "map.json", Path(tmp) / "payload.json"
            mapping.write_text('{"1001":"verified-gsis"}')
            result = subprocess.run([sys.executable, "scripts/ingest_dfs_salaries.py", str(FIXTURE),
                "--slate-id", "dk-test", "--season", "2026", "--week", "1", "--slate-date", "2026-09-13",
                "--lock-time", "2026-09-13T12:00:00-05:00", "--dry-run", "--player-map", str(mapping), "--output", str(output)],
                capture_output=True, text=True, check=True)
            self.assertEqual(json.loads(result.stdout)["validated"], 3)
            payload = json.loads(output.read_text())
            self.assertEqual(payload["salaries"][0]["player_id"], "verified-gsis")
            self.assertEqual(payload["slate"]["lock_time"], "2026-09-13T17:00:00.000Z")


if __name__ == "__main__":
    unittest.main()
