"""All unofficial DraftKings JSON parsing lives here; no account endpoints."""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone, time
import re
from zoneinfo import ZoneInfo

from .adapters import team, POSITIONS
from .providers import ProviderError, SalarySnapshot, encoded, iso

LOBBY_URL = "https://www.draftkings.com/lobby/getcontests?sport=NFL"
DRAFTABLES_URL = "https://api.draftkings.com/draftgroups/v1/draftgroups/{}/draftables"


def identifier(value):
    return str(value) if type(value) is int and value >= 0 or isinstance(value, str) and value.isdigit() else None


def timestamp(value):
    if not isinstance(value, str):
        return None
    match = re.fullmatch(r"/Date\((\d+)(?:[+-]\d{4})?\)/", value)
    try:
        dt = datetime.fromtimestamp(int(match[1])/1000, timezone.utc) if match else iso(value)
        return dt.isoformat(timespec="milliseconds").replace("+00:00", "Z")
    except (ValueError, OverflowError, OSError):
        return None


def array(payload, key, required=False):
    value = payload.get(key)
    if value is None and not required:
        return []
    if not isinstance(value, list) or any(not isinstance(x, dict) for x in value):
        raise ProviderError(f"DraftKings schema: {key} must be an array of objects")
    return value


def parse_lobby(payload: dict) -> list[dict]:
    if not isinstance(payload, dict) or not ({"DraftGroups", "Contests"} & payload.keys()):
        raise ProviderError("DraftKings lobby schema: missing DraftGroups/Contests")
    types = {identifier(x.get("GameTypeId")): x for x in array(payload, "GameTypes")}
    game_sets = {x.get("GameSetKey"): x for x in array(payload, "GameSets")}
    contests = defaultdict(list)
    for row in array(payload, "Contests"):
        key = identifier(row.get("dg", row.get("draftGroupId")))
        if key:
            contests[key].append(row)
    grouped = defaultdict(list)
    for row in array(payload, "DraftGroups"):
        key = identifier(row.get("DraftGroupId"))
        if key:
            grouped[key].append(row)
    result = []
    for key in sorted(grouped.keys() | contests.keys(), key=int):
        groups, cs = grouped[key], contests[key]
        def unique(values):
            return {x for x in values if x is not None and x != ""}
        sports = unique([g.get("Sport") for g in groups] + [c.get("sport") for c in cs])
        if not sports:
            sports = unique([payload.get("SelectedSport")])
        type_ids = unique([identifier(g.get("GameTypeId")) for g in groups] +
                          [identifier(c.get("gameTypeId")) for c in cs])
        names = unique([g.get("GameType") for g in groups if isinstance(g.get("GameType"), str)] +
                       [c.get("gameType") for c in cs] + [types.get(t, {}).get("Name") for t in type_ids])
        starts = unique([timestamp(g.get("StartDate")) for g in groups] + [timestamp(c.get("sd")) for c in cs])
        counts = unique([g.get("GameCount") for g in groups if type(g.get("GameCount")) is int])
        competitions = []
        for group in groups:
            competitions.extend(array(game_sets.get(group.get("GameSetKey"), {}), "Competitions"))
        competitions = list({encoded(g):g for g in competitions}.values())
        if not counts and competitions:
            counts = {len({g.get("GameId") for g in competitions if g.get("GameId") is not None})}
        flags = []
        if any(len(values) > 1 for values in (sports, type_ids, names, starts, counts)):
            flags.append("conflicting_slate_metadata")
        name = next(iter(names)) if len(names) == 1 else "Unknown"
        fmt = "Classic" if name == "Classic" else "Showdown" if name == "Showdown Captain Mode" else "Other"
        # Madden, Snake Showdown, Best Ball and unknown variants never pass Classic selection.
        result.append({"draft_group_id": key, "sport": next(iter(sports)) if len(sports)==1 else None,
            "format": fmt, "start_time": next(iter(starts)) if len(starts)==1 else None,
            "game_count": next(iter(counts)) if len(counts)==1 else None,
            "game_type": name, "game_type_ids": sorted(type_ids),
            "contest_type_ids": sorted(unique([identifier(g.get("ContestTypeId")) for g in groups])),
            "contest_count": len(cs), "competitions": competitions, "quality_flags": flags})
    return result


def selection_reason(group: dict, config: dict, now: str, slate_date: str | None = None) -> str | None:
    if group.get("sport") != "NFL" or group.get("format") != "Classic":
        return "not NFL Classic"
    if group.get("quality_flags"):
        return "conflicting metadata"
    if not group.get("start_time"):
        return "missing start time"
    start = iso(group["start_time"])
    if start <= iso(now):
        return "locked"
    count = group.get("game_count")
    if type(count) is not int or count < max(2, config["min_games"]):
        return "unknown or insufficient game count"
    local = start.astimezone(ZoneInfo(config["timezone"]))
    if slate_date and local.date().isoformat() != slate_date:
        return "different slate date"
    if local.weekday() != config["preferred_weekday"]:
        return "outside preferred weekday"
    if not time.fromisoformat(config["window_start"]) <= local.time() < time.fromisoformat(config["window_end"]):
        return "outside preferred start window"
    return None


def select_main_slate(groups: list[dict], config: dict, now: str, slate_date: str | None = None) -> dict:
    candidates = [g for g in groups if selection_reason(g, config, now, slate_date) is None]
    if not candidates:
        raise ProviderError("No unlocked NFL Classic multi-game slate matches the configured main-slate window")
    # Nearest eligible date, then largest slate; equal date/game-count is ambiguous.
    zone = ZoneInfo(config["timezone"])
    rank = lambda g: (iso(g["start_time"]).astimezone(zone).date(), -g["game_count"])
    candidates.sort(key=rank)
    if len(candidates)>1 and rank(candidates[0])==rank(candidates[1]):
        raise ProviderError("Ambiguous Main Slate; select an explicit draft group ID")
    return candidates[0]


def parse_draftables(payload: dict, slate: dict) -> tuple[list[dict], list[str]]:
    if slate.get("sport") != "NFL" or slate.get("format") != "Classic" or slate.get("quality_flags"):
        raise ProviderError("Only unambiguous NFL Classic draft groups are supported")
    if not isinstance(payload, dict) or payload.get("errorStatus", 0) not in (0, None, {}):
        raise ProviderError("DraftKings returned an error or invalid draftables envelope")
    raw_rows = array(payload, "draftables", required=True)
    if not raw_rows:
        raise ProviderError("DraftKings draft group has no draftables")
    if not any(any(k in row for k in ("draftableId","playerId","displayName")) for row in raw_rows):
        raise ProviderError("Unrecognized draftable fields; refusing a fabricated empty player pool")
    games = {identifier(g.get("competitionId")): g for g in array(payload, "competitions")}
    if games and slate.get("game_count") and len(games) != slate["game_count"]:
        raise ProviderError("Draftables competition count differs from selected slate")
    starts = [timestamp(g.get("startTime")) for g in games.values()]
    if starts and all(starts) and slate.get("start_time") and min(starts)!=timestamp(slate["start_time"]):
        raise ProviderError("Draftables start time differs from selected slate lock")
    seen_draftables, players = {}, {}
    warnings = []
    for index, raw in enumerate(raw_rows):
        if raw.get("position") is not None and raw.get("position") not in POSITIONS:
            raise ProviderError("Unexpected player position/contest format; use CSV fallback")
        position = raw.get("position")
        did, pid, dkid = (identifier(raw.get(k)) for k in ("draftableId", "playerId", "playerDkId"))
        flags = []
        if did in seen_draftables and did is not None:
            flags.append("duplicate_draftable")
        seen_draftables[did] = index
        own = raw.get("competition") if isinstance(raw.get("competition"), dict) else {}
        game = {**games.get(identifier(own.get("competitionId")), {}), **own}
        if game.get("sport") not in (None, "NFL"):
            raise ProviderError("Non-NFL competition in NFL draft group")
        team_code = raw.get("teamAbbreviation")
        if not isinstance(team_code, str):
            team_code = (raw.get("team") or {}).get("abbreviation") if isinstance(raw.get("team"), dict) else None
        team_code = team(team_code) if team_code else None
        home = game.get("homeTeam") if isinstance(game.get("homeTeam"),dict) else {}
        away = game.get("awayTeam") if isinstance(game.get("awayTeam"),dict) else {}
        home_code, away_code = home.get("abbreviation"), away.get("abbreviation")
        matchup = re.fullmatch(r"\s*([A-Z]{2,3})\s*@\s*([A-Z]{2,3})\s*", game.get("name") or "")
        if matchup and not (home_code and away_code):
            away_code, home_code = matchup.groups()
        home_code = team(home_code) if home_code else None
        away_code = team(away_code) if away_code else None
        opponent, home_away = None, None
        if home_code and away_code and home_code != away_code and team_code in (home_code, away_code):
            home_away = "home" if team_code == home_code else "away"
            opponent = away_code if home_away == "home" else home_code
        start = timestamp(game.get("startTime"))
        salary = raw.get("salary")
        salary = salary if type(salary) is int and 0 < salary <= 50000 else None
        name = raw.get("displayName") or " ".join(str(raw.get(k) or "") for k in ("firstName", "lastName")).strip() or None
        disabled = raw.get("isDisabled")
        if disabled not in (True, False, None) or isinstance(disabled, (str, int)) and type(disabled) is not bool:
            flags.append("invalid_disabled_status")
            disabled = None
        for flag, condition in [("disabled_player", disabled is True), ("missing_opponent", not opponent),
                ("missing_start_time", not start), ("missing_salary", salary is None),
                ("missing_team", not team_code), ("missing_player_name", not name),
                ("missing_position", not position), ("missing_external_id", not (pid or dkid or did))]:
            if condition:
                flags.append(flag)
        row = {"draftable_id": did, "draftable_ids": [did] if did else [],
            "provider_player_id": did, "external_ids": {k:v for k,v in
                (("draftkings_player_id",pid),("draftkings_player_dk_id",dkid)) if v},
            "player_id": None, "player_name": name, "first_name": raw.get("firstName"),
            "last_name": raw.get("lastName"), "team": team_code, "position": position,
            "salary": salary, "status": raw.get("status"), "is_disabled": disabled,
            "competition_id": identifier(game.get("competitionId")), "game_id": None,
            "game_start_time": start, "opponent": opponent, "home_away": home_away,
            "eligible_positions": [position] + (["FLEX"] if position in {"RB","WR","TE"} else []),
            "quality_flags": flags, "identity_status": "unresolved"}
        # Classic supplies separate position and FLEX draftables for the same player.
        # They are merged only when the salary/context agrees, never counted twice.
        key = ("team",team_code) if position=="DST" and team_code else ("player",pid) if pid else ("dk",dkid) if dkid else ("draftable",did) if did else ("row",index)
        if key in players:
            previous = players[key]
            if "duplicate_draftable" in flags:
                previous["quality_flags"].append("duplicate_draftable")
            comparison = ("player_name","team","position","salary","status","is_disabled","competition_id","game_start_time","opponent","external_ids")
            if any(previous.get(k)!=row.get(k) for k in comparison):
                raise ProviderError(f"Conflicting duplicate salary/player {pid or did}; refusing partial snapshot")
            previous["draftable_ids"] = sorted(set(previous["draftable_ids"]+row["draftable_ids"]))
            previous["quality_flags"] = sorted(set(previous["quality_flags"]+flags))
        else:
            if "duplicate_draftable" in flags:
                raise ProviderError("Draftable ID is reused for different players")
            players[key] = row
    if len(raw_rows) != len(players):
        warnings.append(f"Collapsed {len(raw_rows)-len(players)} repeated/position-FLEX rows from {len(raw_rows)} draftables")
    return sorted(players.values(), key=lambda r: (-(r["salary"] or 0),r["player_name"] or "",r["draftable_id"] or "")), warnings


class DraftKingsWebProvider:
    def __init__(self, client, lobby_observation: dict | None = None):
        self.client, self.lobby_observation = client, lobby_observation

    def discover(self):
        self.lobby_observation = self.client.get(LOBBY_URL, "lobby")
        return parse_lobby(self.lobby_observation["payload"])

    def fetch(self, slate: dict) -> SalarySnapshot:
        key = identifier(slate.get("draft_group_id"))
        if not key:
            raise ProviderError("Invalid draft group ID")
        observation = self.client.get(DRAFTABLES_URL.format(key), "salary", lock=slate.get("start_time"))
        try:
            records, warnings = parse_draftables(observation["payload"], slate)
        except (TypeError, KeyError, AttributeError) as error:
            raise ProviderError("DraftKings draftables structure changed; use CSV fallback") from error
        raw = {"draftables": observation, "lobby": self.lobby_observation}
        return SalarySnapshot("draftkings-web", observation["fetched_at"], slate, records, raw, warnings)
