#!/usr/bin/env python3
"""Build a static NFL team visual map from the public NFLverse team dataset."""

from __future__ import annotations

import csv
import io
import json
import ssl
import urllib.request
from pathlib import Path

import certifi

SOURCE = "https://github.com/nflverse/nflverse-data/releases/download/teams/teams_colors_logos.csv"
OUTPUT = Path(__file__).resolve().parents[1] / "public" / "team-media.json"


def main() -> int:
    context = ssl.create_default_context(cafile=certifi.where())
    with urllib.request.urlopen(SOURCE, context=context, timeout=60) as response:
        rows = csv.DictReader(io.TextIOWrapper(response, encoding="utf-8"))
        media = {
            row["team_abbr"]: {"logo": row["team_logo_espn"], "color": row["team_color"], "name": row["team_name"]}
            for row in rows
            if row.get("team_abbr") and row.get("team_logo_espn")
        }
    OUTPUT.write_text(json.dumps(media, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(media)} team media records to {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
