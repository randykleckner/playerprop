import {loadResearch} from '../research/readiness.js';
export async function loadOutlook(fetcher=fetch,now=Date.now()){
 const read=async path=>{const r=await fetcher(path,{cache:'no-store'});if(!r.ok)throw Error('Game context unavailable');return r.json();};
 const [schedule,research]=await Promise.allSettled([read('/drive-lab/upcoming.json'),(async()=>{const m=await loadResearch(fetcher);return read(m.snapshot.simulation_path);})()]);
 const a=schedule.status==='fulfilled'?schedule.value:null,b=research.status==='fulfilled'?research.value:null;
 const scheduled=(a?.games||[]).filter(g=>Date.parse(g.start_time)>now);
 const games=(scheduled.length?scheduled:(b?.games||[]).map(g=>({...g,season:b.season,week:b.week}))).filter(g=>Date.parse(g.start_time)>now).sort((a,b)=>Date.parse(a.start_time)-Date.parse(b.start_time));
 if(!games.length)throw Error('No upcoming schedule published');
 // Never transfer last week's player projections onto next week's same-team game.
 const players=(b?.players||[]).filter(p=>games.some(g=>g.game_id===p.game_id&&g.season===b.season&&g.week===b.week));
 return {games,players,data_as_of:scheduled.length?a.data_as_of:b.data_as_of,season:games[0].season||b?.season,week:games[0].week||b?.week,expires_at:new Date(Date.parse(scheduled.length?a.data_as_of:b.data_as_of)+86400000).toISOString()};
}
