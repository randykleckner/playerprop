"""Provider-neutral salary snapshots. Public web and CSV share this contract."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Protocol
import hashlib
import json

from .adapters import draftkings_csv, validate_records


class ProviderError(ValueError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def iso(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ProviderError("Timestamp must include a timezone")
    return parsed.astimezone(timezone.utc)


def encoded(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


@dataclass
class SalarySnapshot:
    source: str
    fetched_at: str
    slate: dict
    records: list[dict]
    raw: dict
    warnings: list[str] = field(default_factory=list)

    @property
    def snapshot_id(self) -> str:
        # Replaying the same observation is idempotent; later equal-valued fetches are distinct.
        content = [self.source, self.fetched_at, self.slate, self.records, self.raw]
        return "salary-" + hashlib.sha256(encoded(content).encode()).hexdigest()


class DfsSalaryProvider(Protocol):
    def fetch(self, slate: dict) -> SalarySnapshot: ...


class CsvSalaryProvider:
    def __init__(self, content: str, fetched_at: str | None = None):
        self.content, self.fetched_at = content, fetched_at

    def fetch(self, slate: dict) -> SalarySnapshot:
        if slate.get("sport") != "NFL" or slate.get("format") != "Classic":
            raise ProviderError("CSV fallback requires explicit NFL Classic slate metadata")
        rows = draftkings_csv(self.content)
        validate_records(rows)
        for row in rows:
            # The CSV ID is a draftable ID, not playerId/playerDkId.
            row.update(draftable_id=row.get("provider_player_id"), external_ids={},
                       is_disabled=False, game_start_time=None,
                       quality_flags=["missing_start_time"], identity_status="unresolved")
        return SalarySnapshot("draftkings-csv", self.fetched_at or utc_now(), slate, rows,
                              {"csv": self.content})


def fetch_with_fallback(primary: DfsSalaryProvider, slate: dict,
                        fallback: DfsSalaryProvider | None = None) -> SalarySnapshot:
    try:
        return primary.fetch(slate)
    except ProviderError as error:
        if fallback is None:
            raise
        result = fallback.fetch(slate)
        result.warnings.append(f"Web provider failed; CSV fallback used: {error}")
        return result


def quality_report(snapshot: SalarySnapshot, now: str, stale_seconds: int = 10800) -> dict:
    # Stop aging at lock: a valid final pre-lock observation remains historical evidence.
    cutoff = min(iso(now), iso(snapshot.slate["start_time"]))
    stale = (cutoff - iso(snapshot.fetched_at)).total_seconds() > stale_seconds
    unresolved = [r for r in snapshot.records if r.get("position") != "DST" and not r.get("player_id")]
    candidates = [r for r in snapshot.records if r.get("position") != "DST"]
    flags = {}
    for row in snapshot.records:
        for flag in row.get("quality_flags", []):
            flags[flag] = flags.get(flag, 0) + 1
    return {"stale_salary_snapshot": stale, "players": len(snapshot.records),
            "mapped_players": len(candidates) - len(unresolved), "mapping_denominator": len(candidates),
            "mapping_success_rate": (len(candidates)-len(unresolved))/len(candidates) if candidates else None,
            "flags": flags, "unresolved": [{k:r.get(k) for k in
                ("player_name", "team", "position", "external_ids", "identity_status", "mapping_candidates")}
                for r in unresolved]}
