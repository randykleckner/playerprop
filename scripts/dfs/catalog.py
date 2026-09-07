"""Automatic public NFLverse identity catalog; never a claim of live D1 membership."""
import csv
import gzip
import hashlib
import io
import json
from pathlib import Path
import ssl
import urllib.request

from .adapters import team
from .providers import ProviderError, iso, utc_now

SOURCE = "https://github.com/nflverse/nflverse-data/releases/download/players/players.csv"
MAX_BYTES = 32 * 1024 * 1024


def parse_catalog(content: str) -> list[dict]:
    reader = csv.DictReader(io.StringIO(content.lstrip("\ufeff")))
    required = {"gsis_id", "display_name", "position", "latest_team"}
    if not reader.fieldnames or not required.issubset(reader.fieldnames):
        raise ProviderError("NFLverse player catalog schema changed")
    rows, seen = [], set()
    for raw in reader:
        key = raw.get("gsis_id")
        if not key:
            continue
        if key in seen:
            raise ProviderError("Duplicate GSIS ID in NFLverse catalog")
        seen.add(key)
        if not raw.get("display_name") or not raw.get("position"):
            continue
        rows.append({"player_id":key,"gsis_id":key,"display_name":raw["display_name"],
            "position":raw["position"],"current_team_id":team(raw.get("latest_team") or ""),
            "espn_id":raw.get("espn_id") or None,"pfr_id":raw.get("pfr_id") or None,
            "nfl_id":raw.get("nfl_id") or None})
    if not rows:
        raise ProviderError("NFLverse player catalog is empty")
    return rows


def load_catalog(directory: Path) -> tuple[list[dict],dict]:
    directory.mkdir(parents=True,exist_ok=True)
    cache = directory/"catalog.json"
    existing = json.loads(cache.read_text()) if cache.exists() else None
    now = utc_now()
    if existing and (iso(now)-iso(existing["fetched_at"])).total_seconds()<86400:
        return existing["players"], {k:v for k,v in existing.items() if k!="players"}
    import certifi
    try:
        request=urllib.request.Request(SOURCE,headers={"User-Agent":"playerprop-nfl-catalog/1.0 (public identity research)","Accept":"text/csv"})
        with urllib.request.urlopen(request,context=ssl.create_default_context(cafile=certifi.where()),timeout=30) as response:
            raw=response.read(MAX_BYTES+1)
        if len(raw)>MAX_BYTES:
            raise ProviderError("NFLverse catalog exceeds 32 MiB")
        players=parse_catalog(raw.decode("utf-8-sig"))
        digest=hashlib.sha256(raw).hexdigest()
        archive=directory/(digest+".csv.gz")
        if not archive.exists():
            with archive.open("xb") as file:file.write(gzip.compress(raw,mtime=0))
        data={"source":SOURCE,"fetched_at":utc_now(),"sha256":digest,
              "production_membership_verified":False,"players":players}
        temp=cache.with_suffix(".tmp");temp.write_text(json.dumps(data));temp.replace(cache)
        return players,{k:v for k,v in data.items() if k!="players"}
    except (OSError,ValueError) as error:
        if existing:
            return existing["players"],{k:v for k,v in existing.items() if k!="players"} | {"stale":True,"refresh_error":type(error).__name__}
        raise ProviderError(f"NFLverse catalog unavailable: {type(error).__name__}") from error
