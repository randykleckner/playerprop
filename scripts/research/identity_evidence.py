"""Traceable public-source corroboration. Never emits approved identity mappings."""
from collections import Counter
from hashlib import sha256
import csv
import json
from pathlib import Path
from .prepare import audit_identities


def build_evidence(records, canonical, crosswalk, ledger):
    by_id = {p['player_id']: p for p in canonical}
    if len(by_id) != len(canonical):
        raise ValueError('Duplicate canonical IDs')
    reviews = {}
    for r in ledger['reviews']:
        if r.get('verified_draftkings_id') is not False:
            raise ValueError('Context ledger cannot approve DraftKings identities')
        if not all(r.get(k) for k in ['review_id', 'player_id', 'reviewer', 'reviewed_on', 'finding', 'sources']):
            raise ValueError('Incomplete review evidence')
        if r['player_id'] in reviews:
            raise ValueError('Conflicting context reviews')
        reviews[r['player_id']] = r
    rows = []
    for row in records:
        if row['position'] == 'DST':
            continue
        candidates = row.get('mapping_candidates', [])
        pid = row.get('player_id') or (candidates[0] if len(candidates) == 1 else None)
        audit = audit_identities([dict(row, player_id=pid)], crosswalk, canonical)[0] if pid else None
        reasons = audit['reasons'] if audit else ['no_unique_canonical_candidate']
        candidate = by_id.get(pid)
        cross_rows = [r for r in crosswalk if r.get('gsis_id') == pid] if pid else []
        context = reviews.get(pid)
        rows.append({
            'draftable_id': row['draftable_id'], 'player_name': row['player_name'],
            'external_ids': row.get('external_ids', {}), 'candidate_player_id': pid,
            'audit': audit, 'reasons': reasons, 'context_review': context,
            'priority': 'identity_conflict' if any('conflict' in r or 'ambiguous' in r for r in reasons) else 'unresolved' if not pid else 'context_discrepancy' if reasons else 'bridge_needed',
            'canonical_evidence': candidate,
            'crosswalk_evidence': [{k: r.get(k) for k in ['gsis_id', 'espn_id', 'name', 'position', 'team']} for r in cross_rows],
            'required_evidence': 'An archived source record containing this exact DraftKings ID namespace and GSIS ID, or a documented stable-ID chain through ESPN. Name/team agreement and context reviews are insufficient.'
        })
    return {'version': 1, 'verified_by_this_review': 0, 'priorities': dict(Counter(r['priority'] for r in rows)), 'rows': rows}


def recorded_evidence(records, canonical, root):
    root = Path(root)
    cross_path = root / '.dfs-research/playerids.csv'
    ledger_path = root / 'config/identity-review-ledger.json'
    if not cross_path.exists():
        raise ValueError('Recorded identity crosswalk unavailable')
    report = build_evidence(records, canonical, list(csv.DictReader(cross_path.open())), json.loads(ledger_path.read_text()))
    overrides_path=root / 'config/identity-overrides.json'
    report['manual_overrides']=json.loads(overrides_path.read_text())['overrides']
    report['sources'] = {
        'manual_overrides': {'sha256': sha256(overrides_path.read_bytes()).hexdigest()},
        'crosswalk': {'url': 'https://raw.githubusercontent.com/dynastyprocess/data/master/files/playerids.csv', 'sha256': sha256(cross_path.read_bytes()).hexdigest(), 'capture_time': None, 'note': 'Recorded local file; original download timestamp unavailable. Team fields are context, not current roster proof.'},
        'ledger': {'sha256': sha256(ledger_path.read_bytes()).hexdigest()},
    }
    return report
