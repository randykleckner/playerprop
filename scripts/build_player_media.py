#!/usr/bin/env python3
"""Build a small static player-ID to NFL headshot map from NFLverse public data."""

from __future__ import annotations

import csv
import io
import json
import ssl
import urllib.request
from pathlib import Path

import certifi

SOURCE = "https://github.com/nflverse/nflverse-data/releases/download/players/players.csv"
OUTPUT = Path(__file__).resolve().parents[1] / "public" / "player-media.json"


def main() -> int:
    context = ssl.create_default_context(cafile=certifi.where())
    with urllib.request.urlopen(SOURCE, context=context, timeout=60) as response:
        rows = csv.DictReader(io.TextIOWrapper(response, encoding="utf-8"))
        media = {
            row["gsis_id"]: {"headshot": row["headshot"], "team": row["latest_team"]}
            for row in rows
            if row.get("gsis_id") and row.get("headshot")
        }
    OUTPUT.write_text(json.dumps(media, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(media)} player media records to {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
