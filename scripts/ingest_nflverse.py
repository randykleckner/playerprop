#!/usr/bin/env python3
"""Load NFLverse seasonal player statistics into the Dr. Locks Worker API."""
from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import ssl
import sys
import urllib.request
from urllib.parse import urlparse

import certifi

NFLVERSE_WEEKLY_URL = "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_{season}.csv"
NFLVERSE_RELEASE_URL = "https://api.github.com/repos/nflverse/nflverse-data/releases/tags/stats_player"
BATCH_SIZE = 100
SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())


def value(row: dict[str, str], name: str) -> float:
    try:
        return float(row.get(name, "") or 0)
    except ValueError:
        return 0.0


def records(season: int):
    source_url = NFLVERSE_WEEKLY_URL.format(season=season)
    with urllib.request.urlopen(source_url, timeout=60, context=SSL_CONTEXT) as response:
        reader = csv.DictReader(io.TextIOWrapper(response, encoding="utf-8"))
        for row in reader:
            if row.get("season") != str(season) or row.get("season_type") != "REG":
                continue
            player_id = row.get("player_id", "")
            # player_display_name is populated more consistently in historical rows.
            player_name = row.get("player_display_name", "") or row.get("player_name", "")
            team = row.get("team", "") or row.get("recent_team", "")
            opponent, week = row.get("opponent_team", ""), row.get("week", "")
            if not all((player_id, player_name, team, opponent, week)):
                continue
            yield {"player_id": player_id, "player_name": player_name, "position": row.get("position", "UNK"), "team": team, "opponent": opponent,
                   "game_id": row.get("game_id", f"{season}_{week}_{team}_{opponent}"), "season": season, "week": int(float(week)),
                   "passing_yards": value(row, "passing_yards"), "passing_touchdowns": value(row, "passing_tds"), "rushing_yards": value(row, "rushing_yards"),
                   "rushing_touchdowns": value(row, "rushing_tds"), "receptions": value(row, "receptions"), "receiving_yards": value(row, "receiving_yards"),
                   "receiving_touchdowns": value(row, "receiving_tds"), "targets": value(row, "targets"), "carries": value(row, "carries"),
                   "tackles_solo": value(row, "def_tackles_solo"), "tackle_assists": value(row, "def_tackle_assists"),
                   "tackles_for_loss": value(row, "def_tackles_for_loss"), "sacks": value(row, "def_sacks"),
                   "qb_hits": value(row, "def_qb_hits"), "interceptions": value(row, "def_interceptions"), "passes_defended": value(row, "def_pass_defended")}


def available_seasons() -> list[int]:
    """Return weekly player-stat years published in NFLverse's current release."""
    with urllib.request.urlopen(NFLVERSE_RELEASE_URL, timeout=60, context=SSL_CONTEXT) as response:
        release = json.load(response)
    years = {
        int(match.group(1))
        for asset in release.get("assets", [])
        if (match := re.fullmatch(r"stats_player_week_(\d{4})\.csv", asset.get("name", "")))
    }
    return sorted(years)


def post(url: str, token: str, batch: list[dict[str, object]]) -> None:
    endpoint = f"{url.rstrip('/')}/api/ingest/player-stats"
    request = urllib.request.Request(
        endpoint,
        data=json.dumps({"stats": batch}).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "DrLocksNFLPropsIngest/0.1 (+https://drlocksmd.com)",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60, context=SSL_CONTEXT) as response:
            if response.status != 200:
                raise RuntimeError(f"Worker returned {response.status}: {response.read().decode()}")
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors="replace")
        raise RuntimeError(f"Worker request to {endpoint} failed with HTTP {error.code}: {detail}") from error


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", type=int, required=True)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--available-seasons", action="store_true", help="Print regular-season years currently published by NFLverse, then exit.")
    args = parser.parse_args()
    if args.available_seasons:
        print("Available NFLverse regular-season years:", ", ".join(map(str, available_seasons())))
        return 0
    url, token = os.getenv("PLAYERPROP_API_URL"), os.getenv("PLAYERPROP_INGEST_TOKEN")
    if not args.dry_run and (not url or not token):
        parser.error("PLAYERPROP_API_URL and PLAYERPROP_INGEST_TOKEN are required unless --dry-run is set.")
    if url:
        parsed_url = urlparse(url)
        if parsed_url.scheme != "https" or not parsed_url.netloc or parsed_url.path not in ("", "/"):
            parser.error("PLAYERPROP_API_URL must be the API origin only, for example https://api.drlocksmd.com (do not include /health or /api paths).")
    batch: list[dict[str, object]] = []
    processed = 0
    for record in records(args.season):
        batch.append(record)
        if len(batch) == BATCH_SIZE:
            if not args.dry_run:
                post(url, token, batch)  # type: ignore[arg-type]
            processed += len(batch)
            print(f"processed {processed} player-game rows", file=sys.stderr)
            batch = []
    if batch:
        if not args.dry_run:
            post(url, token, batch)  # type: ignore[arg-type]
        processed += len(batch)
    if processed == 0:
        print(f"No regular-season player-stat rows were found for {args.season}. Run with --available-seasons to see the current source coverage.", file=sys.stderr)
        return 1
    print(f"completed: {processed} player-game rows for {args.season}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
