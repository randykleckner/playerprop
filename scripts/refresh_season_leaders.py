"""Publish actual regular-season NFLverse leaders; retain the last good snapshot on failure."""
import csv,io,json,ssl,urllib.request,math
from pathlib import Path
from datetime import datetime,timezone
import certifi
ROOT=Path(__file__).resolve().parents[1]
METRICS=['passing_yards','passing_tds','rushing_yards','rushing_tds','receiving_yards','receptions']
WEEKLY_METRICS = ['attempts','completions','passing_yards','passing_tds','passing_interceptions',
    'carries','rushing_yards','rushing_tds','targets','receptions','receiving_yards','receiving_tds',
    'passing_air_yards','receiving_air_yards','target_share','air_yards_share','racr',
    'rushing_fumbles_lost','receiving_fumbles_lost','sack_fumbles_lost']
def weekly_records(rows,season,before_week):
    result=[];seen=set()
    for r in rows:
        week=int(r['week'])
        if r.get('season_type')!='REG' or int(r['season'])!=season or not 0<week<before_week:continue
        key=(r['player_id'],week)
        if key in seen:raise ValueError('Duplicate player/week in weekly statistics')
        seen.add(key)
        record={k:r.get(k) for k in ['player_id','player_display_name','team','position','opponent_team']}
        record.update(season=season,week=week,game_id=r.get('game_id'))
        for k in WEEKLY_METRICS:
            raw=r.get(k)
            value=float(raw) if raw not in (None,'') else None
            record[k]=value if value is not None and math.isfinite(value) else None
        result.append(record)
    return result

def aggregate(rows,season,before_week):
    people={};seen=set();weeks=set()
    for r in rows:
        if r.get('season_type')!='REG' or int(r['season'])!=season or int(r['week'])>=before_week:continue
        key=(r['player_id'],r.get('game_id') or r['week'])
        if key in seen:continue
        seen.add(key);weeks.add(int(r['week']))
        p=people.setdefault(r['player_id'],{'player_id':r['player_id'],'player_name':r['player_display_name'],'team':r['team'],'position':r['position'],'games':0,**{k:0 for k in METRICS}})
        p['games']+=1;p['team']=r['team']
        for k in METRICS:p[k]+=float(r.get(k) or 0)
    if not people:raise ValueError('No prior completed-week regular-season stats')
    return {'through_week':max(weeks),'players':list(people.values())}
def refresh():
    manifest=json.loads((ROOT/'public/research/latest.json').read_text())['snapshot'];season=manifest['season']
    url=f'https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_{season}.csv'
    request=urllib.request.Request(url,headers={'User-Agent':'DrLocks-SeasonLeaders/1.0 (public read-only)'})
    with urllib.request.urlopen(request,context=ssl.create_default_context(cafile=certifi.where()),timeout=30) as r:raw=r.read(20_000_001)
    if len(raw)>20_000_000:raise ValueError('Stats source too large')
    rows=list(csv.DictReader(io.StringIO(raw.decode())))
    result=aggregate(rows,season,manifest['week'])
    result['weekly_records']=weekly_records(rows,season,manifest['week'])
    result.update(version=1,season=season,source='NFLverse weekly actuals',source_url=url,fetched_at=datetime.now(timezone.utc).isoformat())
    path=ROOT/'public/lineups/season-leaders.json';tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(result));tmp.replace(path)
    print(f'Published {len(result["players"])} actual season records through week {result["through_week"]}')
if __name__=='__main__':refresh()
