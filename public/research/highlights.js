// Rankings use only the selected immutable snapshot. Missing data is never zero-filled.
export const metrics = {
  points: {label:'Projected DK points', value:p=>p.final_projection},
  value: {label:'Projected PTS / $1K', value:p=>valid(p.salary)&&p.salary>0&&valid(p.final_projection)?p.final_projection/p.salary*1000:null},
  targets: {label:'Projected targets', value:p=>p.projected_opportunities?.targets},
  carries: {label:'Projected carries', value:p=>p.projected_opportunities?.carries},
  attempts: {label:'Projected pass attempts', value:p=>p.projected_opportunities?.pass_attempts},
};
const valid = n=>typeof n==='number'&&Number.isFinite(n);
export function leaders(players,metric='points',position='ALL',limit=10){
 const seen=new Set();
 return (players??[]).filter(p=>{
  if(!p.player_id||seen.has(p.player_id)||p.active!==true||p.identity_confidence==='unresolved')return false;
  seen.add(p.player_id);return position==='ALL'||p.position===position;
 }).map(p=>({...p,value:metrics[metric]?.value(p)})).filter(p=>valid(p.value)&&p.value>0)
 .sort((a,b)=>b.value-a.value||String(a.player_name).localeCompare(String(b.player_name))).slice(0,limit);
}
export function matchups(games,mode='total',now=Date.now()){
 const seen=new Set();
 return (games??[]).filter(g=>{
  if(!g.game_id||seen.has(g.game_id)||!g.home||!g.away||!valid(g.total)||!valid(g.home_spread)||!Number.isFinite(Date.parse(g.start_time))||Date.parse(g.start_time)<=now)return false;
  seen.add(g.game_id);return true;
 }).flatMap(g=>mode==='team'?[{...g,team:g.home,opponent:g.away,value:g.home_implied_total},{...g,team:g.away,opponent:g.home,value:g.away_implied_total}]:[{...g,value:g.total}])
 .filter(g=>valid(g.value)&&(mode!=='close'||Math.abs(g.home_spread)<=4))
 .sort((a,b)=>b.value-a.value||Math.abs(a.home_spread)-Math.abs(b.home_spread)||a.game_id.localeCompare(b.game_id)).slice(0,5);
}
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const stamp=v=>Number.isFinite(Date.parse(v))?new Date(v).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/Chicago',timeZoneName:'short'}):'time unavailable';
