#!/usr/bin/env python3
"""Refresh actionable public news independently of salaries/odds; no account actions."""
import argparse
import hashlib
import json
import ssl
import urllib.request
from pathlib import Path
from datetime import datetime, timezone
from dfs.catalog import load_catalog
from dfs.http import NoRedirect
from newsroom.feed import ESPN_URL, NFL_URL, rss, injuries, stamp
ROOT=Path(__file__).resolve().parents[1]

def atomic(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_suffix('.tmp');temp.write_text(json.dumps(data,ensure_ascii=False));temp.replace(path)

def fetch(url,state,now):
    import certifi
    key=hashlib.sha256(url.encode()).hexdigest();cache=state/(key+'.json')
    if cache.exists():
        prior=json.loads(cache.read_text())
        if (stamp(now)-stamp(prior['fetched_at'])).total_seconds()<3600:return prior
    opener=urllib.request.build_opener(NoRedirect(),urllib.request.HTTPSHandler(context=ssl.create_default_context(cafile=certifi.where())))
    request=urllib.request.Request(url,headers={'User-Agent':'DrLocks-Newsroom/1.0 (+https://drlocksmd.com/newsroom/; public read-only)','Accept':'application/json,text/html'})
    with opener.open(request,timeout=30) as response:raw=response.read(8*1024*1024+1)
    if len(raw)>8*1024*1024:raise ValueError('News source exceeds size limit')
    digest=hashlib.sha256(raw).hexdigest();archive=state/(digest+'.source')
    if not archive.exists():archive.write_bytes(raw)
    data={'fetched_at':now,'sha256':digest,'body':raw.decode('utf-8'),'url':url}
    atomic(cache,data);return data

def refresh(root=ROOT/'public',state=ROOT/'.newsroom',request=fetch):
    now=datetime.now(timezone.utc).isoformat();state.mkdir(parents=True,exist_ok=True)
    target=root/'newsroom/latest.json'
    previous=json.loads(target.read_text()) if target.exists() else {'stories':[]}
    players,metadata=load_catalog(ROOT/'.dfs-salaries/catalog')
    if metadata.get('stale'):raise ValueError('Canonical identity catalog is stale')
    manifest_path=root/'research/latest.json'
    cohort=json.loads(manifest_path.read_text()).get('snapshot',{}) if manifest_path.exists() else {}
    all_stories=[];sources=[];covered=set()
    for name,url,parser in [('ESPN',ESPN_URL,rss),('NFL official injury report',NFL_URL,injuries)]:
        try:
            raw=request(url,state,now)
            stories,counts=parser(raw['body'],players,raw['fetched_at'])
            if name!='ESPN' and cohort and (counts['season'],counts['week'])!=(cohort.get('season'),cohort.get('week')):raise ValueError('Injury report does not match current research week')
            if name!='ESPN':covered.update(counts.get('covered_player_ids',[]))
            else:
                keys={s['key'] for s in stories}
                stories.extend(s for s in previous['stories'] if s['source']==name and s['key'] not in keys and stamp(s['expires_at'])>stamp(now))
            sources.append({'name':name,'url':url,'status':'ok','fetched_at':raw['fetched_at'],'sha256':raw['sha256'],'counts':counts})
            all_stories.extend(stories)
        except Exception as error:
            # Preserve source-specific last valid records with their ORIGINAL expiry.
            all_stories.extend(s for s in previous['stories'] if s['source']==name)
            sources.append({'name':name,'url':url,'status':'failed','error':type(error).__name__,'detail':'Source unavailable; retained last valid briefs with original timestamps.'})
    # A current official report replaces an older availability brief, but never a role/transaction report.
    official=covered|{s['player_id'] for s in all_stories if s['source']!='ESPN' and stamp(s['expires_at'])>stamp(now)}
    all_stories=[s for s in all_stories if not(s['source']=='ESPN' and s['topic']=='Availability' and s['player_id'] in official)]
    all_stories=sorted({s['key']:s for s in all_stories}.values(),key=lambda s:s['published_at'] or s['observed_at'],reverse=True)
    seen=set();deduped=[]
    for story in all_stories:
        key=(story['player_id'],story['topic'])
        if key not in seen:deduped.append(story);seen.add(key)
    all_stories=deduped
    data={'version':1,'generated_at':now,'sources':sources,'stories':all_stories,'policy':'Actionable facts only; performance implications are interpretations. News does not automatically change projections.','canonical_source':metadata.get('sha256'),'refresh_schedule':'10 a.m. and 5 p.m. America/Chicago'}
    digest=hashlib.sha256(json.dumps(data,sort_keys=True).encode()).hexdigest()
    archive=state/(digest+'.snapshot.json')
    if not archive.exists():atomic(archive,data)
    atomic(target,data)
    print(json.dumps({'newsroom_stories':len(all_stories),'sources':sources}))
    return 0 if all(s['status']=='ok' for s in sources) else 1

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--root',type=Path,default=ROOT/'public');args=parser.parse_args()
    try:raise SystemExit(refresh(args.root))
    except Exception as error:
        print('Newsroom refresh failed; last valid snapshot retained: '+type(error).__name__);raise SystemExit(1)
