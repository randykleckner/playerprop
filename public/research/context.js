import {selectWeeks,actualDkPoints} from './features.js';
const finite=Number.isFinite;
const metrics=['carries','rushing_yards','rushing_tds','targets','receptions','receiving_yards','receiving_tds','attempts','passing_yards','passing_tds'];
// Aggregate offensive production against each defense once per game, not per player.
export function defenseRows(stats,position='',window='season'){
 const weeks=new Set(selectWeeks(stats?.through_week,window)),games=new Map();
 for(const p of stats?.weekly_records||[]){
  if(p.season!==stats.season||!weeks.has(p.week)||!p.opponent_team||!['QB','RB','WR','TE'].includes(p.position)||(position&&position!==p.position))continue;
  const key=[p.opponent_team,p.season,p.week,p.game_id||p.team].join('|'),g=games.get(key)||{team:p.opponent_team,rows:[]};g.rows.push(p);games.set(key,g);
 }
 const teams=new Map();
 for(const g of games.values()){const rows=teams.get(g.team)||[];const record={};for(const k of metrics)record[k]=g.rows.every(p=>finite(p[k]))?g.rows.reduce((s,p)=>s+p[k],0):null;const pts=g.rows.map(actualDkPoints);record.fp=pts.every(finite)?pts.reduce((s,p)=>s+p,0):null;rows.push(record);teams.set(g.team,rows);}
 return [...teams].map(([team,games])=>{const r={team,sample_games:games.length,position:position||'Overall'};for(const k of [...metrics,'fp'])r[k]=games.every(g=>finite(g[k]))?games.reduce((s,g)=>s+g[k],0)/games.length:null;r.yards_per_carry=r.carries>0?r.rushing_yards/r.carries:null;return r;});
}
export function callerRows(profile){return Object.entries(profile?.teamInputs||{}).map(([team,r])=>({team,pass_rate:r.passRate??null,rush_rate:finite(r.passRate)?1-r.passRate:null,completion_rate:r.completionRate??null,sack_rate:r.sackRate??null,run_mean:r.runMean??null,completion_mean:r.completionMean??null,head_coach:null,coordinator:null,play_caller:null}));}
export function playerContext(player,{stats,profile,outlook,news}){
 const defenses=defenseRows(stats,player.position),ranked=defenses.filter(d=>finite(d.fp)).sort((a,b)=>a.fp-b.fp);
 const defense=defenses.find(d=>d.team===player.opponent)||null;
 const weather=(outlook?.games||[]).find(g=>g.season===player.season&&g.week===player.week&&[g.home,g.away].includes(player.team)&&[g.home,g.away].includes(player.opponent));
 return {defense,defense_rank:defense?ranked.findIndex(d=>d.team===defense.team)+1:null,caller:callerRows(profile).find(r=>r.team===player.team)||null,weather:weather?.weather??null,stories:(news?.stories||[]).filter(s=>s.player_id===player.player_id)};
}
