#!/usr/bin/env python3
"""Explicit, authenticated refresh using the existing SportsGameOdds allowance.

Does not purchase data or change secrets. Never run as part of the public-only
refresh job without separate authorization to consume the provider allowance.
"""
import argparse
from pathlib import Path
import getpass
import json
import os
import ssl
import sys
import urllib.request
import urllib.error


def main():
    import certifi
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--configure-token',action='store_true',help='Save the existing ingest token locally with owner-only permissions')
    args=parser.parse_args()
    token_path=Path(__file__).resolve().parents[1]/'.props-ingest-token'
    if args.configure_token:
        if not sys.stdin.isatty():
            print('Run token setup in an interactive Terminal.');return 1
        token=getpass.getpass('Existing Worker INGEST_TOKEN (hidden; not the sportsbook key): ').strip()
        if not token:print('No token saved.');return 1
        descriptor=os.open(token_path,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
        with os.fdopen(descriptor,'w') as stream:stream.write(token)
        os.chmod(token_path,0o600)
        print('Token saved locally with owner-only permissions. No provider request was made.')
        return 0
    token = os.environ.get('PLAYERPROP_INGEST_TOKEN') or (token_path.read_text().strip() if token_path.exists() else None)
    if not token and sys.stdin.isatty():
        token = getpass.getpass('Existing Worker INGEST_TOKEN (hidden): ')
    if not token:
        print('Set PLAYERPROP_INGEST_TOKEN locally or run this command interactively. Do not paste secrets into chat.')
        return 1
    request = urllib.request.Request('https://api.drlocksmd.com/api/admin/refresh-sports-game-odds', method='POST', data=b'', headers={'Authorization':'Bearer '+token,'Accept':'application/json','User-Agent':'DrLocks-PropsRefresh/1.0'})
    try:
        with urllib.request.urlopen(request,context=ssl.create_default_context(cafile=certifi.where()),timeout=90) as response:
            result=json.load(response)
        print(json.dumps({k:result.get(k) for k in ['provider','eventsFound','propsStored','capturedAt']}))
        if not result.get('propsStored') and result.get('skipped') != 'fresh_capture':
            print('No new quotes imported. Check provider plan coverage and event availability.')
            return 1
        from refresh_prop_snapshot import refresh
        return refresh('public')
    except urllib.error.HTTPError as error:
        print(f'Protected refresh returned HTTP {error.code}. '+('Check the existing ingest token.' if error.code==401 else 'Check Worker/provider health; previous quotes retained.'))
        return 1
    except Exception as error:
        print('Refresh did not complete: '+type(error).__name__+'. Verify API state before retrying.')
        return 1

if __name__=='__main__':
    raise SystemExit(main())
