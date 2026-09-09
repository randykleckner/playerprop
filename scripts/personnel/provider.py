"""Replaceable official personnel source; public JSON only after build discovery."""
import hashlib,json,re,time,ssl,urllib.request,gzip,io
from pathlib import Path
from typing import Protocol
from datetime import datetime,timezone
from dfs.http import NoRedirect
class PersonnelRatingsProvider(Protocol):
 def fetch(self)->dict:...
def now():return datetime.now(timezone.utc).isoformat()
def atomic(path,data):
 path=Path(path);path.parent.mkdir(parents=True,exist_ok=True);tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(data));tmp.replace(path)
def download(url,cache,ttl=86400):
 cache=Path(cache);cache.mkdir(parents=True,exist_ok=True);key=hashlib.sha256(url.encode()).hexdigest();pointer=cache/(key+'.json')
 if pointer.exists():
  old=json.loads(pointer.read_text())
  if time.time()-datetime.fromisoformat(old['captured_at']).timestamp()<ttl:return old
 import certifi
 opener=urllib.request.build_opener(NoRedirect(),urllib.request.HTTPSHandler(context=ssl.create_default_context(cafile=certifi.where())))
 # GitHub release redirects are public asset delivery; urllib's standard redirect handler is needed there.
 if url.startswith('https://github.com/nflverse/'):opener=urllib.request.build_opener(urllib.request.HTTPSHandler(context=ssl.create_default_context(cafile=certifi.where())))
 with opener.open(urllib.request.Request(url,headers={'User-Agent':'DrLocks-PersonnelResearch/1.0 (+https://drlocksmd.com/drive-lab/; read-only)','Accept':'application/json,text/csv,text/html'}),timeout=40) as r:raw=r.read(32*1024*1024+1)
 if len(raw)>32*1024*1024:raise ValueError('Source too large')
 sha=hashlib.sha256(raw).hexdigest();archive=cache/(sha+'.source')
 if not archive.exists():archive.write_bytes(raw)
 decoded=gzip.GzipFile(fileobj=io.BytesIO(raw)).read(128*1024*1024+1) if url.endswith('.gz') else raw
 if len(decoded)>128*1024*1024:raise ValueError('Expanded source too large')
 result={'url':url,'captured_at':now(),'sha256':sha,'body':decoded.decode('utf-8-sig')};atomic(pointer,result);return result

def parse_items(page):
 p=page.get('pageProps',page.get('props',{}).get('pageProps',{}));r=p.get('ratingDetails')
 if p.get('gameDetails',{}).get('slug')!='madden-nfl-27':raise ValueError('EA game version changed')
 if not isinstance(r,dict) or not isinstance(r.get('items'),list) or not isinstance(r.get('totalItems'),int):raise ValueError('EA ratings structure changed')
 players=[]
 for raw in r['items']:
  if not all(k in raw for k in ['id','firstName','lastName','team','position','overallRating','stats']):raise ValueError('EA required player fields missing')
  if raw.get('avatarUrl') and 'madden-nfl-27/' not in raw['avatarUrl']:raise ValueError('Not Madden NFL 27 ratings')
  attrs={k:v['value'] for k,v in raw['stats'].items() if isinstance(v,dict) and isinstance(v.get('value'),(int,float))}
  if not attrs or any(not 0<=v<=99 for v in attrs.values()) or not 0<=raw['overallRating']<=99:raise ValueError('Invalid rating bounds')
  players.append({'external_player_id':str(raw['id']),'name':raw['firstName']+' '+raw['lastName'],'team_name':raw['team']['label'],'position':raw['position']['id'],'overall':raw['overallRating'],'attributes':attrs,'source_version':raw.get('iteration',{}).get('label'),'birth_date':raw.get('birthdate')})
 return players,r['totalItems']
class Madden27RatingsProvider:
 def __init__(self,cache,request=download,min_refresh_days=7):
  if min_refresh_days<7:raise ValueError("Madden refresh must be weekly or less frequent")
  self.cache=Path(cache);self.request=request;self.ttl=min_refresh_days*86400
 def fetch(self):
  prior=self.cache/'latest-ratings.json'
  if prior.exists():
   old=json.loads(prior.read_text())
   if time.time()-datetime.fromisoformat(old.get('last_checked_at',old['captured_at'])).timestamp()<self.ttl:return old|{'unchanged':True}
  try:
   landing=self.request('https://www.ea.com/games/madden-nfl/ratings',self.cache,self.ttl)
   match=re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>',landing['body'])
   if not match:raise ValueError('EA build discovery changed')
   data=json.loads(match[1]);build=data['buildId'];players,total=parse_items(data);sources=[{k:v for k,v in landing.items() if k!='body'}];seen={p['external_player_id'] for p in players}
   if not 0<total<=10000 or len(seen)!=len(players):raise ValueError('Invalid EA page totals or duplicates')
   for page in range(2,(total+99)//100+1):
    time.sleep(.5)
    response=self.request(f'https://www.ea.com/_next/data/{build}/games/madden-nfl/ratings.json?franchiseSlug=madden-nfl&page={page}',self.cache,self.ttl)
    rows,count=parse_items(json.loads(response['body']))
    if count!=total or any(p['external_player_id'] in seen for p in rows) or len({p['external_player_id'] for p in rows})!=len(rows):raise ValueError('EA pagination changed or duplicated')
    seen.update(p['external_player_id'] for p in rows);players.extend(rows);sources.append({k:v for k,v in response.items() if k!='body'})
   if len(players)!=total:raise ValueError('Incomplete ratings snapshot')
   digest=hashlib.sha256(json.dumps(players,sort_keys=True).encode()).hexdigest();result={'snapshot_id':'madden27-'+digest[:24],'provider':'EA Madden NFL 27','game_title':'Madden NFL 27','captured_at':now(),'source_version':build,'player_count':len(players),'players':players,'sources':sources}
   archive=self.cache/(result['snapshot_id']+'.json')
   if archive.exists():result=json.loads(archive.read_text())
   else:atomic(archive,result)
   result=result|{'last_checked_at':now()};atomic(prior,result);return result
  except Exception as e:
   if prior.exists():return json.loads(prior.read_text())|{'refresh_error':type(e).__name__}
   raise
