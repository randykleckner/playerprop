#!/usr/bin/env python3
"""One conservative public-data collection/build cycle; no account actions or D1 writes."""
import argparse
from dataclasses import asdict
import fcntl
import gzip
import hashlib
import json
from pathlib import Path
import ssl
import subprocess
import urllib.request
from dfs.catalog import load_catalog
from dfs.draftkings import DraftKingsWebProvider, select_main_slate
from dfs.espn import EspnProjectionProvider
from dfs.http import PublicSalaryClient, NoRedirect
from dfs.identity import map_identities
from dfs.providers import utc_now, iso
from dfs.storage import archive_snapshot, ROOT
from research.prepare import markets
from research.identity_evidence import recorded_evidence


def scoreboard(date, state):
    cache=state/('scoreboard-'+date+'.json')
    if cache.exists():
        previous=json.loads(cache.read_text())
        if (iso(utc_now())-iso(previous['fetched_at'])).total_seconds()<7200:return previous
    import certifi
    url='https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates='+date
    opener=urllib.request.build_opener(NoRedirect(),urllib.request.HTTPSHandler(context=ssl.create_default_context(cafile=certifi.where())))
    with opener.open(urllib.request.Request(url,headers={'Accept':'application/json','User-Agent':'DrLocks-research-refresh/1.0 (public read-only)'}),timeout=30) as response:raw=response.read(12*1024*1024+1)
    if len(raw)>12*1024*1024:raise ValueError('Scoreboard exceeds limit')
    payload=json.loads(raw)
    if not payload.get('events'):raise ValueError('No scheduled games available')
    result={'fetched_at':utc_now(),'url':url,'payload':payload}
    digest=hashlib.sha256(raw).hexdigest();archive=state/(digest+'.json')
    if not archive.exists():archive.write_bytes(raw)
    temp=cache.with_suffix('.tmp');temp.write_text(json.dumps(result));temp.replace(cache)
    return result


def normalize_schedule(payload):
    """Require one regular-season event cohort; do not trust absent root metadata."""
    schedule=dict(payload)
    event_seasons={(e.get('season',{}).get('year'),e.get('season',{}).get('type')) for e in schedule['events']}
    event_weeks={e.get('week',{}).get('number') for e in schedule['events']}
    if len(event_seasons)!=1 or len(event_weeks)!=1:raise ValueError('Ambiguous schedule season/week')
    season,season_type=next(iter(event_seasons));week=next(iter(event_weeks))
    schedule['season']={'year':season,'type':season_type};schedule['week']={'number':week}
    if schedule.get('season',{}).get('type')!=2 or not isinstance(week,int):raise ValueError('Current regular-season schedule/week is unavailable')
    if not isinstance(season,int):raise ValueError("Schedule season unavailable")
    return schedule,season,week


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root',default='public')
    args=parser.parse_args()
    state=ROOT/'.dfs-research/refresh';state.mkdir(parents=True,exist_ok=True)
    with (state/'refresh.lock').open('a') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:print('Refresh already running');return 0
        try:
            config=json.loads((ROOT/'config/dfs-salaries.json').read_text())
            provider=DraftKingsWebProvider(PublicSalaryClient(ROOT/'.dfs-salaries/http',config))
            groups=provider.discover();slate=select_main_slate(groups,config,utc_now())
            # Derive season/week from current scheduled events, never a hard-coded week.
            observed=scoreboard(iso(slate['start_time']).strftime('%Y%m%d'),state);schedule=observed['payload']
            schedule,season,week=normalize_schedule(schedule)
            canonical,metadata=load_catalog(ROOT/'.dfs-salaries/catalog')
            salary=provider.fetch(slate);map_identities(salary.records,canonical,[]);salary.raw['identity_catalog']=metadata
            salary_path=archive_snapshot(salary,ROOT/'.dfs-salaries/snapshots')
            projection=asdict(EspnProjectionProvider(ROOT/'.dfs-projections/http',canonical).fetch(season,week))
            digest=hashlib.sha256(json.dumps(projection,sort_keys=True).encode()).hexdigest();projection_path=ROOT/'.dfs-projections'/f'{digest}.json.gz'
            if not projection_path.exists():
                with projection_path.open('xb') as file:file.write(gzip.compress(json.dumps(projection).encode(),mtime=0))
            # Authoritative event teams/time define market keys. Draftables are still checked against schedule by preparePool.
            games=[]
            for event in schedule['events']:
                for competition in event.get('competitions',[]):
                    teams={c['homeAway']:c['team']['abbreviation'] for c in competition['competitors']}
                    from research.prepare import team
                    home,away=team(teams['home']),team(teams['away'])
                    games.append({'game_id':'-'.join(sorted([home,away])),'home':home,'away':away,'start_time':event['date']})
            quotes,issues=markets(schedule,games,observed['fetched_at'],season,week)
            evidence=recorded_evidence(salary.records,canonical,ROOT)
            evidence['sources']['canonical_catalog']=metadata
            evidence_path=state/'identity-evidence.json';evidence_path.write_text(json.dumps(evidence))
            schedule_path=state/'schedule.json';schedule_path.write_text(json.dumps(schedule))
            market_path=state/'markets.json';market_path.write_text(json.dumps(quotes))
            subprocess.run(['node','scripts/refresh_dfs_research.mjs','--salary',str(salary_path),'--projections',str(projection_path),'--schedule',str(schedule_path),'--markets',str(market_path),'--market-fetched-at',observed['fetched_at'],'--root',args.root,'--identity-evidence',str(evidence_path)],cwd=ROOT,check=True)
            return 0
        except Exception as error:
            # Do not leak upstream response bodies/credentials in public failure status.
            message=f'Public research refresh failed ({type(error).__name__}); last valid snapshot retained'
            subprocess.run(['node','scripts/refresh_dfs_research.mjs','--root',args.root,'--failure',message],cwd=ROOT,check=False)
            print(str(error));return 1


if __name__=='__main__':raise SystemExit(main())
