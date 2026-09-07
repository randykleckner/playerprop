"""Salary source adapters return provider-neutral records, never guessed NFL IDs."""
from __future__ import annotations

import csv
import io
import json
import re

TEAM_ALIASES = {"JAC": "JAX", "LAR": "LA", "WSH": "WAS", "OAK": "LV", "SD": "LAC", "STL": "LA"}
POSITIONS = {"QB", "RB", "WR", "TE", "DST"}


def team(value: str) -> str:
    value = value.strip().upper()
    return TEAM_ALIASES.get(value, value)


def draftkings_csv(content: str) -> list[dict]:
    reader = csv.DictReader(io.StringIO(content.lstrip("\ufeff")))
    required = {"Position", "Name", "Salary", "TeamAbbrev", "Game Info"}
    if not reader.fieldnames or not required.issubset(reader.fieldnames):
        raise ValueError("Salary CSV needs Position, Name, Salary, TeamAbbrev and Game Info columns.")
    if len(set(reader.fieldnames)) != len(reader.fieldnames):
        raise ValueError("Duplicate CSV column names.")
    records = []
    for line, row in enumerate(reader, start=2):
        if None in row or any(value is None for value in row.values()):
            raise ValueError(f"CSV row {line}: incorrect column count.")
        position = row["Position"].strip().upper()
        if position not in POSITIONS:
            raise ValueError(f"CSV row {line}: unsupported Classic position {position!r}.")
        game = re.match(r"^\s*([A-Za-z]{2,3})@([A-Za-z]{2,3})(?:\s|$)", row["Game Info"])
        if not game:
            raise ValueError(f"CSV row {line}: Game Info needs AWAY@HOME; opponent cannot be guessed.")
        away, home = map(team, game.groups())
        player_team = team(row["TeamAbbrev"])
        if away == home or player_team not in (away, home):
            raise ValueError(f"CSV row {line}: team does not match Game Info.")
        salary_text = row["Salary"].strip()
        if not re.fullmatch(r"\d+", salary_text) or not 0 < int(salary_text) <= 50000:
            raise ValueError(f"CSV row {line}: salary must be an integer from 1 to 50000.")
        eligible = row.get("Roster Position", "").strip()
        allowed = [position] + (["FLEX"] if position in {"RB", "WR", "TE"} else [])
        eligibility = eligible.upper().split("/") if eligible else allowed
        if sorted(eligibility) != sorted(allowed):
            raise ValueError(f"CSV row {line}: invalid Classic/FLEX eligibility.")
        name = row["Name"].strip()
        if not name:
            raise ValueError(f"CSV row {line}: missing player name.")
        records.append({
            "provider_player_id": row.get("ID", "").strip() or None,
            "player_id": None, "player_name": name,
            "team": player_team, "opponent": away if player_team == home else home,
            "position": position, "salary": int(salary_text), "game_id": None,
            "home_away": "home" if player_team == home else "away",
            "eligible_positions": allowed, "status": row.get("Status", "").strip() or None,
            "raw_row": row,
        })
    return records


def normalized_json(content: str) -> list[dict]:
    records = json.loads(content)
    if not isinstance(records, list) or any(not isinstance(row, dict) for row in records):
        raise ValueError("Normalized JSON must contain an array of salary records.")
    return records


ADAPTERS = {"draftkings-csv": draftkings_csv, "json": normalized_json}


def validate_records(records: list[dict]) -> None:
    if not 1 <= len(records) <= 1000:
        raise ValueError("Provide a complete snapshot of 1–1000 salaries.")
    keys, identities, canonical_ids = set(), set(), set()
    for row in records:
        for key in ("player_name", "team", "opponent", "position"):
            if not isinstance(row.get(key), str) or not row[key].strip():
                raise ValueError(f"Missing {key}.")
        position = row["position"].strip().upper()
        if position not in POSITIONS:
            raise ValueError("Unsupported Classic position.")
        row["position"] = position
        row["team"], row["opponent"] = team(row["team"]), team(row["opponent"])
        if row["team"] == row["opponent"]:
            raise ValueError("Team and opponent must differ.")
        if type(row.get("salary")) is not int or not 0 < row["salary"] <= 50000:
            raise ValueError("Salary must be an integer from 1 to 50000.")
        if row.get("home_away") not in (None, "home", "away"):
            raise ValueError("home_away must be home, away or null.")
        allowed = [position] + (["FLEX"] if position in {"RB", "WR", "TE"} else [])
        if not isinstance(row.get("eligible_positions", allowed), list) or sorted(row.get("eligible_positions", allowed)) != sorted(allowed):
            raise ValueError("Invalid Classic/FLEX eligibility.")
        player_id, provider_id = row.get("player_id"), row.get("provider_player_id")
        if any(value is not None and (not isinstance(value, str) or not value.strip()) for value in (player_id, provider_id)):
            raise ValueError("Player IDs must be nonempty strings or null.")
        if position == "DST" and player_id:
            raise ValueError("DST uses team identity; player_id must be null.")
        identity = (row["team"], "DST") if position == "DST" else (row["player_name"].strip().lower(), row["team"], position)
        key = ("dk", provider_id) if provider_id else identity
        if key in keys or identity in identities or (player_id and player_id in canonical_ids):
            raise ValueError(f"Duplicate salary/player: {row['player_name']}.")
        keys.add(key)
        identities.add(identity)
        if player_id:
            canonical_ids.add(player_id)
