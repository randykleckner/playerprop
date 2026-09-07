"""Source-independent weekly projection snapshots and transparent consensus."""
from dataclasses import dataclass
import math
from statistics import median, pstdev
from typing import Protocol

from .providers import ProviderError, iso


@dataclass
class ProjectionSnapshot:
    source: str
    season: int
    week: int
    fetched_at: str
    scoring_basis: str
    records: list[dict]
    raw: dict


class DfsProjectionProvider(Protocol):
    def fetch(self, season: int, week: int) -> ProjectionSnapshot: ...


def consensus(snapshots: list[ProjectionSnapshot], season: int, week: int, as_of: str,
              scoring_basis: str, weights: dict[str,float] | None = None) -> list[dict]:
    """Latest eligible snapshot per provider; no treating missing sources as zero."""
    latest = {}
    for snapshot in snapshots:
        if snapshot.season!=season or snapshot.week!=week or snapshot.scoring_basis!=scoring_basis or iso(snapshot.fetched_at)>iso(as_of):
            continue
        if snapshot.source not in latest or iso(snapshot.fetched_at)>iso(latest[snapshot.source].fetched_at):
            latest[snapshot.source]=snapshot
    values = {}
    for source,snapshot in latest.items():
        seen=set()
        for row in snapshot.records:
            key = 'team:'+row['team'] if row['position']=='DST' and row.get('team') else row.get('player_id')
            points=row.get('projected_points')
            if not key or type(points) not in (float,int) or not math.isfinite(points):
                continue
            if key in seen:
                raise ProviderError('Duplicate projection identity within a source snapshot')
            seen.add(key)
            weight=weights.get(source,0) if weights is not None else 1
            if type(weight) not in (float,int) or not math.isfinite(weight) or weight<0:
                raise ProviderError('Projection weights must be finite and nonnegative')
            if weight:
                values.setdefault(key,[]).append({'source':source,'points':points,'weight':weight,
                    'fetched_at':snapshot.fetched_at,'quality_flags':row.get('quality_flags',[])})
    return [{'identity':key,'season':season,'week':week,'scoring_basis':scoring_basis,
        'projected_points':sum(v['points']*v['weight'] for v in rows)/sum(v['weight'] for v in rows),
        'median':median(v['points'] for v in rows),'source_count':len(rows),
        'source_disagreement':pstdev(v['points'] for v in rows),'sources':rows}
        for key,rows in sorted(values.items())]
