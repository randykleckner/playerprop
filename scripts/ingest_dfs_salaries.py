#!/usr/bin/env python3
"""Validate a complete salary file locally, then optionally post to the existing Worker."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import ssl
import sys
import urllib.error
import urllib.request
from urllib.parse import urlsplit
import re

from dfs.adapters import ADAPTERS, validate_records


def api_origin(value: str) -> str:
    url = urlsplit(value)
    local = url.scheme == "http" and url.hostname in {"localhost", "127.0.0.1", "::1"}
    if not url.hostname or not (url.scheme == "https" or local) or url.username or url.password or url.path not in ("", "/") or url.query or url.fragment:
        raise ValueError("PLAYERPROP_API_URL must be an HTTPS origin (HTTP is allowed only for localhost).")
    return value.rstrip("/")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", type=Path)
    parser.add_argument("--format", choices=ADAPTERS, default="draftkings-csv")
    parser.add_argument("--slate-id", required=True)
    parser.add_argument("--season", type=int, required=True)
    parser.add_argument("--week", type=int, required=True)
    parser.add_argument("--slate-name", default="NFL Classic Main Slate")
    parser.add_argument("--slate-date", required=True, help="Contest's calendar date: YYYY-MM-DD.")
    parser.add_argument("--lock-time", required=True, help="Verified ISO timestamp with seconds and timezone.")
    parser.add_argument("--player-map", type=Path, help="Optional JSON object: DraftKings ID -> verified NFLverse player ID.")
    parser.add_argument("--output", type=Path, help="Write normalized JSON for review or another ingestion client.")
    parser.add_argument("--dry-run", action="store_true", help="Validate without network access or credentials.")
    args = parser.parse_args()
    try:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", args.slate_id) or not 2000 <= args.season <= 2100 or not 1 <= args.week <= 18:
            raise ValueError("Invalid slate ID, season or regular-season week.")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})", args.lock_time):
            raise ValueError("lock-time needs seconds and an explicit timezone.")
        lock = datetime.fromisoformat(args.lock_time)
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", args.slate_date):
            raise ValueError("slate-date must be YYYY-MM-DD.")
        datetime.strptime(args.slate_date, "%Y-%m-%d")
        if args.file.stat().st_size > 1024 * 1024:
            raise ValueError("Input file exceeds 1 MiB.")
        records = ADAPTERS[args.format](args.file.read_text(encoding="utf-8-sig"))
        if args.player_map:
            mapping = json.loads(args.player_map.read_text())
            if not isinstance(mapping, dict) or any(not isinstance(v, str) or not v.strip() for v in mapping.values()):
                raise ValueError("Player map must be a JSON object of provider ID -> NFLverse ID strings.")
            for row in records:
                if row.get("position") != "DST" and row.get("provider_player_id") in mapping:
                    row["player_id"] = mapping[row["provider_player_id"]]
        validate_records(records)
        payload = {
            "slate": {"id": args.slate_id, "provider": "DraftKings", "season": args.season, "week": args.week,
                      "slate_name": args.slate_name, "slate_date": args.slate_date,
                      "lock_time": lock.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")},
            "source": args.format, "salaries": records,
        }
        encoded = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode()
        if len(encoded) > 1024 * 1024:
            raise ValueError("Normalized payload exceeds 1 MiB.")
        if args.output:
            if args.output.resolve() == args.file.resolve() or (args.player_map and args.output.resolve() == args.player_map.resolve()):
                raise ValueError("Output must not overwrite an input file.")
            args.output.write_bytes(encoded + b"\n")
        if args.dry_run:
            unmapped = sum(row["position"] != "DST" and not row.get("player_id") for row in records)
            print(json.dumps({"validated": len(records), "unmapped_players": unmapped, "dry_run": True}))
            return 0
        origin, token = os.getenv("PLAYERPROP_API_URL", ""), os.getenv("PLAYERPROP_INGEST_TOKEN", "")
        if not origin or not token:
            raise ValueError("PLAYERPROP_API_URL and PLAYERPROP_INGEST_TOKEN are required unless --dry-run is set.")
        origin = api_origin(origin)
        # Match existing ingestion's certifi trust store. No paid provider requests.
        import certifi
        context = ssl.create_default_context(cafile=certifi.where())
        request = urllib.request.Request(origin + "/api/ingest/dfs-salaries", data=encoded,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, method="POST")
        # Do not forward an ingest credential if an origin attempts to redirect.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                return None
        opener = urllib.request.build_opener(NoRedirect(), urllib.request.HTTPSHandler(context=context))
        with opener.open(request, timeout=60) as response:
            print(response.read().decode())
        return 0
    except (ValueError, OSError, urllib.error.URLError) as error:
        if isinstance(error, urllib.error.HTTPError):
            print(f"Salary import failed: HTTP {error.code} {error.read(4096).decode(errors='replace')}", file=sys.stderr)
        else:
            print(f"Salary import failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
