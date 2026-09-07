#!/usr/bin/env python3
"""Load NFLverse availability, snap-role, and head-coach facts into Dr. Locks."""
from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from collections.abc import Iterable
from urllib.parse import urlparse

import certifi

BASE = "https://github.com/nflverse/nflverse-data/releases/download"
STATS_URL = BASE + "/stats_player/stats_player_week_{season}.csv"
ROSTER_URL = BASE + "/weekly_rosters/roster_weekly_{season}.csv"
INJURY_URL = BASE + "/injuries/injuries_{season}.csv"
SNAP_URL = BASE + "/snap_counts/snap_counts_{season}.csv"
PBP_URL = BASE + "/pbp/play_by_play_{season}.csv.gz"
BATCH_SIZE = 100
SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
TEAM_ALIASES = {"JAC": "JAX", "OAK": "LV", "STL": "LA", "SD": "LAC"}


def normalized_team(team: str) -> str:
    return TEAM_ALIASES.get(team, team)


def rows(url: str) -> Iterable[dict[str, str]]:
    request = urllib.request.Request(url, headers={"User-Agent": "DrLocksNFLPropsIngest/0.1 (+https://drlocksmd.com)"})
    with urllib.request.urlopen(request, timeout=120, context=SSL_CONTEXT) as response:
        yield from csv.DictReader(io.TextIOWrapper(response, encoding="utf-8"))


def pbp_rows(url: str) -> Iterable[dict[str, str]]:
    request = urllib.request.Request(url, headers={"User-Agent": "DrLocksNFLPropsIngest/0.1 (+https://drlocksmd.com)"})
    with urllib.request.urlopen(request, timeout=180, context=SSL_CONTEXT) as response:
        with gzip.GzipFile(fileobj=response) as compressed:
            yield from csv.DictReader(io.TextIOWrapper(compressed, encoding="utf-8"))


def player_and_game_maps(season: int) -> tuple[set[str], dict[tuple[str, int], str]]:
    players: set[str] = set()
    game_by_team_week: dict[tuple[str, int], str] = {}
    for row in rows(STATS_URL.format(season=season)):
        if row.get("season_type") != "REG":
            continue
        player_id, team, week, game_id = row.get("player_id", ""), normalized_team(row.get("team", "") or row.get("recent_team", "")), row.get("week", ""), row.get("game_id", "")
        if player_id:
            players.add(player_id)
        if team and week and game_id:
            game_by_team_week[(team, int(float(week)))] = game_id
    return players, game_by_team_week


def availability_status(report_status: str, practice_status: str) -> str:
    report = report_status.lower()
    practice = practice_status.lower()
    if "out" in report or "suspend" in report:
        return "out"
    if "doubtful" in report or "questionable" in report:
        return "questionable"
    if "limited" in practice or "did not participate" in practice:
        return "limited"
    return "active"


def availability_records(season: int, known_players: set[str], game_by_team_week: dict[tuple[str, int], str]) -> Iterable[dict[str, object]]:
    for row in rows(INJURY_URL.format(season=season)):
        if row.get("season_type") != "REG":
            continue
        player_id, team, week = row.get("gsis_id", ""), normalized_team(row.get("team", "")), row.get("week", "")
        game_id = game_by_team_week.get((team, int(float(week)))) if week else None
        if not game_id or player_id not in known_players:
            continue
        primary = row.get("report_primary_injury", "")
        secondary = row.get("report_secondary_injury", "")
        injury = "; ".join(part for part in (primary, secondary) if part) or None
        yield {
            "player_id": player_id, "game_id": game_id, "team_id": team,
            "availability_status": availability_status(row.get("report_status", ""), row.get("practice_status", "")),
            "injury_description": injury, "practice_status": row.get("practice_status") or None,
            "source": "nflverse_injuries", "notes": row.get("report_status") or None,
        }


def pfr_to_gsis(season: int) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for row in rows(ROSTER_URL.format(season=season)):
        pfr_id, gsis_id = row.get("pfr_id", ""), row.get("gsis_id", "")
        if pfr_id and gsis_id:
            mapping[pfr_id.lower()] = gsis_id
    return mapping


def float_or_none(value: str | None) -> float | None:
    try:
        return float(value) if value not in (None, "") else None
    except ValueError:
        return None


def role_records(season: int, known_players: set[str], game_by_team_week: dict[tuple[str, int], str]) -> Iterable[dict[str, object]]:
    player_ids = pfr_to_gsis(season)
    for row in rows(SNAP_URL.format(season=season)):
        if row.get("game_type") != "REG":
            continue
        player_id = player_ids.get((row.get("pfr_player_id", "") or "").lower())
        team, week = normalized_team(row.get("team", "")), row.get("week", "")
        game_id = game_by_team_week.get((team, int(float(week)))) if week else None
        if not game_id or not player_id or player_id not in known_players:
            continue
        yield {
            "player_id": player_id, "game_id": game_id,
            "offensive_snaps": float_or_none(row.get("offense_snaps")),
            "snap_share": float_or_none(row.get("offense_pct")),
            "source": "nflverse_snap_counts",
        }


def coach_records(season: int) -> Iterable[dict[str, object]]:
    seen_games: set[str] = set()
    for row in pbp_rows(PBP_URL.format(season=season)):
        if row.get("season_type") != "REG":
            continue
        game_id = row.get("game_id", "")
        if not game_id or game_id in seen_games:
            continue
        seen_games.add(game_id)
        home_team, away_team = normalized_team(row.get("home_team", "")), normalized_team(row.get("away_team", ""))
        if home_team and row.get("home_coach"):
            yield {"team_id": home_team, "game_id": game_id, "head_coach": row["home_coach"], "source": "nflverse_pbp"}
        if away_team and row.get("away_coach"):
            yield {"team_id": away_team, "game_id": game_id, "head_coach": row["away_coach"], "source": "nflverse_pbp"}


def post(url: str, token: str, path: str, key: str, batch: list[dict[str, object]]) -> None:
    request = urllib.request.Request(
        f"{url.rstrip('/')}{path}", data=json.dumps({key: batch}).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "User-Agent": "DrLocksNFLPropsIngest/0.1 (+https://drlocksmd.com)"}, method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60, context=SSL_CONTEXT) as response:
            if response.status != 200:
                raise RuntimeError(f"Worker returned {response.status}: {response.read().decode()}")
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"Worker request to {path} failed with HTTP {error.code}: {error.read().decode(errors='replace')}") from error


def send_records(url: str | None, token: str | None, path: str, key: str, records: Iterable[dict[str, object]], dry_run: bool) -> int:
    batch: list[dict[str, object]] = []
    count = 0
    for record in records:
        batch.append(record)
        if len(batch) == BATCH_SIZE:
            if not dry_run:
                post(url or "", token or "", path, key, batch)
            count += len(batch)
            print(f"processed {count} {key}", file=sys.stderr)
            batch = []
    if batch:
        if not dry_run:
            post(url or "", token or "", path, key, batch)
        count += len(batch)
    return count


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", type=int, required=True)
    parser.add_argument("--availability", action="store_true", help="Import weekly injury-report facts.")
    parser.add_argument("--roles", action="store_true", help="Import offensive snap counts and snap share.")
    parser.add_argument("--coaches", action="store_true", help="Import historical head coaches from play-by-play.")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    run_all = not (args.availability or args.roles or args.coaches)
    url, token = os.getenv("PLAYERPROP_API_URL"), os.getenv("PLAYERPROP_INGEST_TOKEN")
    if not args.dry_run and (not url or not token):
        parser.error("PLAYERPROP_API_URL and PLAYERPROP_INGEST_TOKEN are required unless --dry-run is set.")
    if url:
        parsed_url = urlparse(url)
        if parsed_url.scheme != "https" or not parsed_url.netloc or parsed_url.path not in ("", "/"):
            parser.error("PLAYERPROP_API_URL must be an HTTPS API origin only.")
    known_players, game_by_team_week = player_and_game_maps(args.season)
    completed: list[str] = []
    if args.availability or run_all:
        count = send_records(url, token, "/api/ingest/player-availability", "availability", availability_records(args.season, known_players, game_by_team_week), args.dry_run)
        completed.append(f"{count} availability records")
    if args.roles or run_all:
        count = send_records(url, token, "/api/ingest/player-roles", "roles", role_records(args.season, known_players, game_by_team_week), args.dry_run)
        completed.append(f"{count} role records")
    if args.coaches or run_all:
        count = send_records(url, token, "/api/ingest/team-context", "context", coach_records(args.season), args.dry_run)
        completed.append(f"{count} team context records")
    print(f"completed: {', '.join(completed)} for {args.season}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
