"""Immutable local archive and SQL shared by SQLite tests and local D1 diagnostics."""
from __future__ import annotations

import base64
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

from .providers import SalarySnapshot, ProviderError, encoded, iso

ROOT = Path(__file__).resolve().parents[2]


def latest_snapshot_sql(draft_group_id: str, as_of: str) -> str:
    as_of = iso(as_of).isoformat(timespec="milliseconds").replace("+00:00","Z")
    return ("SELECT * FROM dfs_provider_snapshots WHERE complete=1 AND draft_group_id=" + literal(draft_group_id) +
            " AND fetched_at<=" + literal(as_of) +
            " AND fetched_at<=json_extract(slate_metadata_json,'$.start_time') ORDER BY fetched_at DESC,snapshot_id LIMIT 1;")


def literal(value):
    return "NULL" if value is None else "'" + str(value).replace("'", "''") + "'"


def snapshot_sql(snapshot: SalarySnapshot) -> str:
    if not snapshot.records:
        raise ProviderError("Cannot persist an empty salary snapshot")
    if snapshot.fetched_at != iso(snapshot.fetched_at).isoformat(timespec="milliseconds").replace("+00:00","Z"):
        raise ProviderError("Snapshot fetched_at must be normalized UTC with milliseconds")
    raw = encoded(snapshot.raw).encode()
    archive = base64.b64encode(gzip.compress(raw, mtime=0)).decode()
    chunks = [archive[i:i+24000] for i in range(0,len(archive),24000)]
    sid = literal(snapshot.snapshot_id)
    header = [snapshot.snapshot_id,snapshot.source,snapshot.fetched_at,snapshot.slate.get("draft_group_id"),
              encoded(snapshot.slate),len(snapshot.records),len(chunks),hashlib.sha256(raw).hexdigest()]
    statements = ["INSERT OR IGNORE INTO dfs_provider_snapshots "
        "(snapshot_id,source,fetched_at,draft_group_id,slate_metadata_json,record_count,raw_chunk_count,raw_sha256) VALUES ("+
        ",".join(map(literal,header))+");"]
    for index, row in enumerate(snapshot.records):
        statements.append(f"INSERT OR IGNORE INTO dfs_provider_salary_records VALUES ({sid},{index},{literal(encoded(row))});")
    for index, chunk in enumerate(chunks):
        statements.append(f"INSERT OR IGNORE INTO dfs_provider_raw_chunks VALUES ({sid},{index},{literal(chunk)});")
    statements.append(f"UPDATE dfs_provider_snapshots SET complete=1 WHERE snapshot_id={sid} AND complete=0;")
    return "\n".join(statements)


def archive_snapshot(snapshot: SalarySnapshot, directory: Path) -> Path:
    directory.mkdir(parents=True,exist_ok=True)
    path = directory / (snapshot.snapshot_id + ".json.gz")
    document = encoded({"snapshot_id":snapshot.snapshot_id,"source":snapshot.source,
        "fetched_at":snapshot.fetched_at,"slate":snapshot.slate,"records":snapshot.records,
        "raw":snapshot.raw,"warnings":snapshot.warnings}).encode()
    # Exclusive creation: retries cannot overwrite history.
    try:
        with path.open("xb") as handle:
            handle.write(gzip.compress(document,mtime=0))
    except FileExistsError:
        if gzip.decompress(path.read_bytes()) != document:
            raise ProviderError("Archive content differs for existing snapshot ID")
    return path


class LocalD1:
    """Hard-coded --local and an isolated diagnostic state directory; no remote switch."""
    def __init__(self, directory: Path):
        self.directory = directory.resolve()
        self.directory.mkdir(parents=True,exist_ok=True)
        self.config = self.directory / "wrangler.json"
        if not self.config.exists():
            self.config.write_text(encoded({"name":"playerprop-salary-diagnostic",
                "compatibility_date":"2026-09-03", "d1_databases":[{"binding":"PLAYERPROP_DB",
                "database_name":"playerprop-salary-diagnostic", "database_id":"local-salary-diagnostic"}]}))

    def execute(self, sql: str):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".sql") as file:
            file.write(sql);file.flush()
            result = subprocess.run([str(ROOT/"node_modules/.bin/wrangler"),"d1","execute",
                "playerprop-salary-diagnostic","--local","--config",str(self.config),
                "--persist-to",str(self.directory/"state"),"--file",file.name,"--json"],
                cwd=ROOT,capture_output=True,text=True)
        if result.returncode:
            raise ProviderError("Local D1 command failed: " + (result.stderr or result.stdout)[-2000:])
        try:
            return json.loads(result.stdout)
        except ValueError as error:
            raise ProviderError("Unexpected Wrangler JSON output") from error

    def initialize(self):
        tables = self.execute("SELECT name FROM sqlite_master WHERE type='table';")[0]["results"]
        names = {r["name"] for r in tables}
        if "dfs_provider_snapshots" in names:
            return
        if "players" in names:
            raise ProviderError("Partial diagnostic schema; choose a fresh local directory")
        # Only minimal dependencies for the observation store, from the verified live schema.
        sql = (ROOT/"docs/d1-observed-legacy-schema.sql").read_text()
        sql += (ROOT/"migrations/0007_dfs_provider_snapshots.sql").read_text()
        self.execute(sql)

    def catalog(self):
        players = self.execute("SELECT player_id,display_name,position,current_team_id,gsis_id,pfr_id,espn_id,nfl_id FROM players;")[0]["results"]
        mappings = self.execute("SELECT namespace,external_id,player_id,verified,evidence FROM dfs_player_id_mappings;")[0]["results"]
        return players,mappings

    def persist(self, snapshot: SalarySnapshot):
        existing = self.execute(f"SELECT complete FROM dfs_provider_snapshots WHERE snapshot_id={literal(snapshot.snapshot_id)};")[0]["results"]
        if existing and existing[0]["complete"]:
            return
        self.execute(snapshot_sql(snapshot))
        observed = self.execute(f"SELECT complete,record_count FROM dfs_provider_snapshots WHERE snapshot_id={literal(snapshot.snapshot_id)};")[0]["results"]
        if not observed or observed[0]["complete"] != 1 or observed[0]["record_count"] != len(snapshot.records):
            raise ProviderError("Local D1 snapshot completion could not be verified")

    def latest(self, draft_group_id: str, as_of: str):
        """Provider-neutral downstream read. Debug post-lock and partial imports are excluded."""
        rows = self.execute(latest_snapshot_sql(draft_group_id,as_of))[0]["results"]
        if not rows:
            return None
        header = rows[0]
        records = self.execute("SELECT record_json FROM dfs_provider_salary_records WHERE snapshot_id="+
            literal(header["snapshot_id"])+" ORDER BY ordinal;")[0]["results"]
        return {"source":header["source"],"fetched_at":header["fetched_at"],
                "slate":json.loads(header["slate_metadata_json"]),
                "records":[json.loads(r["record_json"]) for r in records]}
