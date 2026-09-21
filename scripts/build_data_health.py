"""Read-only health aggregation; source capture times never become generation times."""
import json
from datetime import datetime,timezone
from pathlib import Path
from personnel.provider import atomic
ROOT=Path(__file__).resolve().parents[1]

def health(source,attempt,success,count,error=None,ttl=24,expected=True,now=None):
    now=now or datetime.now(timezone.utc)
    try:age=(now-datetime.fromisoformat(success.replace('Z','+00:00'))).total_seconds()/3600
    except (ValueError,TypeError,AttributeError):age=None
    freshness='CURRENT' if age is not None and 0<=age<=ttl else 'STALE'
    status='NO DATA EXPECTED' if not expected else 'ERROR' if error or not count or age is None else freshness
    return dict(source=source,last_attempt=attempt,last_success=success,record_count=count,status=status,
                error=error or ('No valid records or capture timestamp' if status=='ERROR' else None),
                freshness=freshness if expected else None,age_hours=age,max_age_hours=ttl)

def build(root=ROOT):
    def read(path):
        try:return json.loads((root/path).read_text())
        except (OSError,ValueError):return {}
    m=read('public/research/latest.json');snapshot=m.get('snapshot',{});attempt=m.get('attempt',{})
    sim=read('public'+snapshot.get('simulation_path','/missing.json'));ready={v['label']:v for v in snapshot.get('readiness',[])}
    availability=read('public/drive-lab/availability.json');status=read('public/drive-lab/availability-status.json')
    odds=read('public/props-status.json');stats=read('public/lineups/season-leaders.json');ratings=read('.personnel/ratings.json')
    rows=[]
    for source,label in [('salaries','DK salaries'),('projections','Projections')]:
        rows.append(health(source,attempt.get('attempted_at'),ready.get(label,{}).get('fetched_at'),len(sim.get('players',[])),attempt.get('error')))
    rows.append(health('injuries',status.get('attempted_at'),availability.get('injury_at'),availability.get('coverage',{}).get('official_injury_players',0),status.get('error') or (status.get('detail') if status.get('status')=='failed' else None)))
    rows.append(health('rosters',availability.get('as_of'),availability.get('roster_at'),len(availability.get('players',{}))))
    rows.append(health('stats',stats.get('fetched_at'),stats.get('fetched_at'),len(stats.get('players',[])),ttl=192))
    rows.append(health('odds',odds.get('checked_at'),odds.get('captured_at'),odds.get('upcoming_props',0),odds.get('error') or (odds.get('message') if odds.get('status') not in ['ok','current'] else None)))
    rows.append(health('Madden',ratings.get('last_checked_at'),ratings.get('captured_at'),ratings.get('player_count',0),ratings.get('refresh_error'),ttl=192))
    outlook=read('public/drive-lab/upcoming.json');outlook_status=read('public/drive-lab/upcoming-status.json')
    rows.append(health('schedule',outlook_status.get('last_attempt'),outlook.get('data_as_of'),len(outlook.get('games',[])),outlook_status.get('error')))
    forecasts=[g for g in outlook.get('games',[]) if isinstance(g.get('weather'),dict)]
    rows.append(health('weather',outlook_status.get('last_attempt'),outlook.get('data_as_of'),len(forecasts),outlook_status.get('error'),ttl=6))
    rows.append(health('ownership',None,None,0,expected=False))
    result={'version':1,'generated_at':datetime.now(timezone.utc).isoformat(),'sources':rows,
            'limitations':['Weather covers basic ESPN forecasts only; wind, precipitation intensity and model effects are unavailable. Ownership is not connected.', 'Legacy sources may not record every failed attempt; unknown attempt times stay null.']}
    atomic(root/'public/data-health/latest.json',result)
    return result
if __name__=='__main__':print(json.dumps(build()))
