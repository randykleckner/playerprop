#!/usr/bin/env python3
"""Discover public NFL salaries, diagnose identity/quality, optionally archive into local D1."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from dfs.draftkings import DraftKingsWebProvider, parse_lobby, select_main_slate, selection_reason
from dfs.http import PublicSalaryClient
from dfs.identity import map_identities
from dfs.catalog import load_catalog
from dfs.providers import CsvSalaryProvider, ProviderError, fetch_with_fallback, quality_report, utc_now, iso
from dfs.storage import ROOT, LocalD1, archive_snapshot


class RecordedClient:
    def __init__(self, args):
        if not args.recorded_at:
            raise ProviderError("Recorded files require --recorded-at; do not pretend old data was fetched now")
        args.recorded_at = iso(args.recorded_at).isoformat(timespec="milliseconds").replace("+00:00","Z")
        self.args = args

    def get(self, url, kind, lock=None):
        path = self.args.lobby_file if kind=="lobby" else self.args.draftables_file
        if not path:
            raise ProviderError(f"No recorded {kind} fixture supplied")
        return {"url":url,"fetched_at":self.args.recorded_at,"payload":json.loads(path.read_text())}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config",type=Path,default=ROOT/"config/dfs-salaries.json")
    parser.add_argument("--state-dir",type=Path,default=ROOT/".dfs-salaries")
    parser.add_argument("--list-only",action="store_true")
    parser.add_argument("--draft-group-id")
    parser.add_argument("--slate-date",help="Date in the configured main-slate timezone")
    parser.add_argument("--slate-json",type=Path,help="Reviewed normalized metadata when lobby discovery is unavailable")
    parser.add_argument("--csv-fallback",type=Path,help="Complete salary CSV for this same selected slate")
    parser.add_argument("--canonical-json",type=Path,help="Existing player catalog export: array with player_id/display_name/position/current_team_id and external IDs")
    parser.add_argument("--no-catalog-fetch",action="store_true",help="Use only explicit/local catalog data (also implicit for recorded fixtures)")
    parser.add_argument("--mapping-json",type=Path,help="Verified namespaced identity mapping rows")
    parser.add_argument("--persist-local",action="store_true",help="Persist to an isolated local D1; never remote")
    parser.add_argument("--debug-after-lock",action="store_true",help="Explicit debug only; retains normal cache/rate limits")
    parser.add_argument("--lobby-file",type=Path)
    parser.add_argument("--draftables-file",type=Path)
    parser.add_argument("--recorded-at")
    args = parser.parse_args(argv)
    try:
        config = json.loads(args.config.read_text())
        now = utc_now()
        client = RecordedClient(args) if args.lobby_file or args.draftables_file else PublicSalaryClient(args.state_dir/"http",config,args.debug_after_lock)
        provider = DraftKingsWebProvider(client)
        groups = []
        discovery_error = None
        try:
            groups = provider.discover()
        except (ProviderError, TypeError, KeyError, AttributeError) as error:
            discovery_error = str(error)
            if not args.slate_json:
                raise ProviderError(f"Lobby discovery failed: {error}. Existing CSV importer still works; or supply --slate-json with --csv-fallback") from error
        summary = [{k:g.get(k) for k in ("draft_group_id","sport","format","start_time","game_count","game_type","game_type_ids","contest_type_ids")} |
                   {"selection_exclusion":selection_reason(g,config,now,args.slate_date)} for g in groups]
        print(json.dumps({"draft_groups":summary,"discovery_error":discovery_error},indent=2))
        if args.list_only:
            return 0
        if args.slate_json:
            slate = json.loads(args.slate_json.read_text())
        elif args.draft_group_id:
            slate = next((g for g in groups if g["draft_group_id"]==args.draft_group_id),None)
            if slate is None:
                raise ProviderError("Requested draft group was not discovered")
        else:
            slate = select_main_slate(groups,config,now,args.slate_date)
        if slate.get("sport")!="NFL" or slate.get("format")!="Classic" or slate.get("quality_flags"):
            raise ProviderError("Selected slate must be unambiguous NFL Classic")
        if not slate.get("start_time"):
            raise ProviderError("Verified slate start time is required before fetching salaries")
        if iso(slate["start_time"])<=iso(now) and not args.debug_after_lock:
            raise ProviderError("Slate is locked; refreshing is stopped (explicit debug override available)")
        fallback = CsvSalaryProvider(args.csv_fallback.read_text()) if args.csv_fallback else None
        snapshot = fetch_with_fallback(provider,slate,fallback)
        local = LocalD1(args.state_dir/"d1") if args.persist_local else None
        canonical, mappings = [], []
        catalog_metadata = {"source":"local-d1","production_membership_verified":False}
        if local:
            local.initialize()
            canonical,mappings = local.catalog()
        if args.canonical_json:
            canonical = json.loads(args.canonical_json.read_text())
            catalog_metadata = {"source":"supplied-catalog","production_membership_verified":False}
        elif not canonical and not args.no_catalog_fetch and not (args.lobby_file or args.draftables_file):
            try:
                canonical,catalog_metadata=load_catalog(args.state_dir/"catalog")
            except ProviderError as error:
                snapshot.warnings.append(str(error))
        if args.mapping_json:
            mappings = json.loads(args.mapping_json.read_text())
        if not isinstance(canonical,list) or not isinstance(mappings,list):
            raise ProviderError("Canonical and mapping files must be arrays")
        map_identities(snapshot.records,canonical,mappings)
        snapshot.raw["identity_catalog"] = catalog_metadata
        report = quality_report(snapshot,now,config["stale_seconds"])
        report["canonical_catalog_size"] = len(canonical)
        report["catalog"] = catalog_metadata
        candidates=[r for r in snapshot.records if r.get("identity_status")=="name_team_position_candidate"]
        report["unique_name_candidates"] = len(candidates)
        report["identity_status_counts"] = {status:sum(r.get("identity_status")==status for r in snapshot.records)
            for status in sorted({r.get("identity_status","unresolved") for r in snapshot.records})}
        by_id={p["player_id"]:p for p in canonical}
        report["candidate_review"] = [{"player_name":r["player_name"],"team":r["team"],"position":r["position"],
            "external_ids":r["external_ids"],"candidates":[by_id[k] for k in r.get("mapping_candidates",[]) if k in by_id]}
            for r in snapshot.records if not r.get("player_id") and r.get("mapping_candidates")]
        report["mapping_evaluated_against_catalog"] = bool(canonical)
        report["snapshot_id"] = snapshot.snapshot_id
        report["fetched_at"] = snapshot.fetched_at
        report["source"] = snapshot.source
        report["selected_slate"] = snapshot.slate
        report["warnings"] = snapshot.warnings
        report["sample"] = snapshot.records[:10]
        archive = archive_snapshot(snapshot,args.state_dir/"snapshots")
        report["archive"] = str(archive)
        if local:
            local.persist(snapshot)
            report["persisted_local_d1"] = True
        report_path = args.state_dir/(snapshot.snapshot_id+"-report.json")
        report_path.write_text(json.dumps(report,indent=2)+"\n")
        print(json.dumps({k:v for k,v in report.items() if k not in ("unresolved","candidate_review")},indent=2))
        print(f"Full diagnostic and unresolved identity report: {report_path}")
        return 0
    except (ProviderError,ValueError,OSError,KeyError,TypeError) as error:
        print(f"Salary diagnostic failed: {error}",file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
