#!/usr/bin/env python3
"""Submit an audited final-week manifest after the existing player-stat import.

This is a transport adapter, not a new statistics or identity provider.
Credentials use the same environment variables as ingest_nflverse.py.
"""
import argparse
import json
import os
import urllib.request
from urllib.parse import urlparse


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', help='Audited JSON manifest documented in docs/leaderboard.md')
    parser.add_argument('--generate', action='store_true', help='Publish immediately rather than waiting for Tuesday')
    args = parser.parse_args()
    origin = os.environ.get('PLAYERPROP_API_URL', '').rstrip('/')
    token = os.environ.get('PLAYERPROP_INGEST_TOKEN')
    parsed = urlparse(origin)
    if parsed.scheme != 'https' or not parsed.netloc or parsed.path or not token:
        parser.error('An HTTPS PLAYERPROP_API_URL origin and PLAYERPROP_INGEST_TOKEN are required')
    with open(args.manifest, encoding='utf-8') as handle:
        manifest = json.load(handle)

    def post(action, body):
        request = urllib.request.Request(origin + '/api/admin/leaderboard/' + action,
            data=json.dumps(body).encode(), headers={'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token}, method='POST')
        with urllib.request.urlopen(request, timeout=60) as response:
            result = json.load(response)
        print(json.dumps({key: result.get(key) for key in ('season', 'week', 'status')}))

    post('finalize', manifest)
    if args.generate:
        post('generate', {key: manifest[key] for key in ('season', 'week')})


if __name__ == '__main__':
    main()
