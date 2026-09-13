#!/usr/bin/env python3
"""Refresh the static Props fallback from our read-only API; never fetch paid odds."""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
import ssl
import urllib.request

API = 'https://api.drlocksmd.com/api/signals/live?historySeason=2025&limit=100&view=upcoming-1'


def upcoming(payload, now):
    rows = payload.get('signals')
    if not isinstance(rows, list):
        raise ValueError('Invalid signals response')
    result = []
    for row in rows:
        try:
            kickoff = datetime.fromisoformat(row['commenceAt'].replace('Z', '+00:00'))
            if kickoff.tzinfo is not None and kickoff > now:
                result.append(row)
        except (KeyError, TypeError, ValueError, AttributeError):
            continue
    return {**payload, 'signals': result}


def refresh(root, fetch=None, now=None):
    now = now or datetime.now(timezone.utc)
    path = Path(root) / 'fallback-signals.json'
    try:
        if fetch is None:
            import certifi
            request = urllib.request.Request(API, headers={'Accept':'application/json','User-Agent':'DrLocks-PropsRefresh/1.0 (+https://drlocksmd.com; read-only)'})
            with urllib.request.urlopen(request, context=ssl.create_default_context(cafile=certifi.where()), timeout=30) as response:
                raw = response.read(8 * 1024 * 1024 + 1)
            if len(raw) > 8 * 1024 * 1024:
                raise ValueError('Props response exceeds limit')
            payload = json.loads(raw)
        else:
            payload = fetch()
        result = upcoming(payload, now)
        failed = False
    except Exception:
        # Preserve source timestamps, but never keep expired/undated rows visible.
        result = upcoming(json.loads(path.read_text()) if path.exists() else {'signals':[]}, now)
        failed = True
    text = json.dumps(result, indent=2) + '\n'
    if not path.exists() or path.read_text() != text:
        temp = path.with_suffix('.tmp')
        temp.write_text(text)
        temp.replace(path)
    count = len(result['signals'])
    captured = result.get('capturedAt')
    try:
        age = (now - datetime.fromisoformat(captured.replace('Z', '+00:00'))).total_seconds() / 3600
    except (ValueError, TypeError, AttributeError):
        age = None
    status = 'source_unavailable' if failed else 'no_upcoming_quotes' if not count else 'stale' if age is None or age > 24 else 'current'
    health = {'status':status,'checked_at':now.isoformat(),'captured_at':captured,'age_hours':age,'upcoming_props':count,'message':'Snapshot copying does not refresh the sportsbook provider. An empty or stale feed requires attention.' if status != 'current' else 'Upcoming quotes available'}
    health_path = Path(root) / 'props-status.json'
    temp = health_path.with_suffix('.tmp');temp.write_text(json.dumps(health,indent=2)+'\n');temp.replace(health_path)
    print(json.dumps(health))
    return 0 if status == 'current' else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', default='public')
    raise SystemExit(refresh(parser.parse_args().root))
