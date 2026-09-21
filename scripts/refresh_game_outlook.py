"""Independent upcoming schedule/market context; never depends on DK salaries."""
import json,time
from datetime import datetime,timedelta,timezone
from pathlib import Path
from refresh_current_research import scoreboard
from research.prepare import markets,team
from personnel.provider import atomic
ROOT=Path(__file__).resolve().parents[1]
def normalize(payload,at):
    games=[]
    for event in payload.get('events',[]):
        season=event.get('season',{}).get('year');week=event.get('week',{}).get('number')
        if event.get('season',{}).get('type')!=2 or not season or not week:continue
        if event.get('status',{}).get('type',{}).get('state')!='pre':continue
        start=event.get('date')
        if not start or datetime.fromisoformat(start.replace('Z','+00:00'))<=datetime.fromisoformat(at):continue
        for c in event.get('competitions',[]):
            sides={p.get('homeAway'):team(p.get('team',{}).get('abbreviation')) for p in c.get('competitors',[])}
            if not sides.get('home') or not sides.get('away'):continue
            game={'game_id':'-'.join(sorted(sides.values())),'event_id':event['id'],**sides,'start_time':start,'season':season,'week':week,'captured_at':at,'source':'ESPN public scoreboard','venue':c.get('venue',{}).get('fullName'),'roofed':c.get('venue',{}).get('indoor'),'weather':event.get('weather')}
            quotes,_=markets({'events':[event],'season':{'year':season},'week':{'number':week}},[game],at,season,week)
            if quotes:game.update(quotes[0])
            games.append(game)
    if not games:raise ValueError('No validated upcoming games; retain last schedule')
    return sorted({g['event_id']:g for g in games}.values(),key=lambda g:g['start_time'])
def refresh():
    now=datetime.now(timezone.utc);state=ROOT/'.dfs-research/refresh';state.mkdir(parents=True,exist_ok=True)
    observations=[]
    for offset in range(9):
        observations.append(scoreboard((now+timedelta(days=offset)).strftime('%Y%m%d'),state,allow_empty=True))
        if offset<8:time.sleep(.5)
    raw={'fetched_at':min(r['fetched_at'] for r in observations),'payload':{'events':[e for r in observations for e in r['payload']['events']]}}
    games=normalize(raw['payload'],raw['fetched_at'])
    atomic(ROOT/'public/drive-lab/upcoming.json',{'version':1,'data_as_of':raw['fetched_at'],'games':games,'players':[]})
    atomic(ROOT/'public/drive-lab/upcoming-status.json',{'status':'ok','last_attempt':now.isoformat(),'last_success':raw['fetched_at'],'count':len(games)})
    print(json.dumps({'upcoming_games':len(games),'weeks':sorted({g['week'] for g in games})}))
if __name__=='__main__':
    try:refresh()
    except Exception as e:
        atomic(ROOT/'public/drive-lab/upcoming-status.json',{'status':'failed','last_attempt':datetime.now(timezone.utc).isoformat(),'error':type(e).__name__,'detail':'Last valid upcoming schedule retained'})
        raise
