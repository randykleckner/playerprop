"""Validate before publishing; archive evidence and retain omitted injuries as unconfirmed.
The availability.json replacement is the single atomic commit consumed by models.
"""
import json
from datetime import datetime, timezone
from personnel.provider import atomic

def reconcile(report, previous, people, expected_teams):
    rows=report.get('players')
    if not isinstance(rows,dict) or not rows:raise ValueError('Empty injury report')
    teams=report.get('teams',[])
    if len(teams)!=len(set(teams)) or not set(expected_teams)<=set(teams):
        raise ValueError('Partial or duplicate team injury tables')
    if report.get('issues'):raise ValueError('Unresolved injury identities; previous snapshot retained')
    for pid,row in rows.items():
        if pid not in people or row.get('team')!=people[pid]['team'] or row.get('player_id')!=pid:
            raise ValueError('Injury identity mismatch')
        datetime.fromisoformat(row['updated_at'].replace('Z','+00:00'))
    result={pid:dict(row,retained=False) for pid,row in rows.items()}
    # Omission is not clearance. Keep evidence dated to its original report/week.
    for pid,p in (previous or {}).get('players',{}).items():
        old=p.get('availability',{})
        if pid not in result and pid in people and p.get('team')==people[pid]['team'] and old.get('injury') and old.get('state') not in ('ACTIVE','UNKNOWN'):
            result[pid]=dict(old,retained=True,retention_reason='Absent from latest report; clearance not confirmed')
            if (old.get('season'),old.get('week'))!=(report.get('season'),report.get('week')):
                result[pid].update(last_known=dict(old),state='UNKNOWN',game_status=None,practice_status=None,
                                   confidence='historical_report_only')
    return result

def failure(root, error, at=None):
    at=at or datetime.now(timezone.utc).isoformat()
    path=root/'public/drive-lab/availability.json'
    previous=json.loads(path.read_text()) if path.exists() else {}
    status={'status':'failed','attempted_at':at,'last_success':previous.get('as_of'),
            'fetched_at':previous.get('injury_at'),'snapshot_id':previous.get('snapshot_id'),
            'record_count':previous.get('coverage',{}).get('official_injury_players',0),
            'error':type(error).__name__,'detail':'Latest official refresh failed; last valid availability snapshot retained'}
    atomic(root/'public/drive-lab/availability-status.json',status)
    atomic(root/'.personnel/availability-failures'/ (at.replace(':','-')+'.json'),status)
    return status
