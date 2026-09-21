// Shared canonical Research selectors. No view-specific calculations or name joins.
import {snapshotState} from './readiness.js';
const finite = Number.isFinite;
export const EXPECTATION_MIN_PLAYERS=10;
export const ACTUAL_FIELDS=['attempts','completions','passing_yards','passing_tds','passing_interceptions','carries','rushing_yards','rushing_tds','targets','receptions','receiving_yards','receiving_tds','passing_air_yards','receiving_air_yards'];
export function selectWeeks(through,window='season',from=1,to=through){
 if(!Number.isInteger(through)||through<1)return [];
 const n=Number(window),start=window==='custom'?Math.max(1,Number(from)):n>0?Math.max(1,through-n+1):1;
 const end=window==='custom'?Math.min(through,Number(to)):through;
 return Array.from({length:Math.max(0,end-start+1)},(_,i)=>start+i);
}
export function actualDkPoints(r){
 if(r.position&&!['QB','RB','WR','TE'].includes(r.position))return null;
 const fields=['passing_yards','passing_tds','passing_interceptions','rushing_yards','rushing_tds','receiving_yards','receiving_tds','receptions','rushing_fumbles_lost','receiving_fumbles_lost','sack_fumbles_lost'];
 if(!fields.every(k=>finite(r[k])))return null;
 // Offensive DK scoring; return/defensive touchdowns are not covered by these fields.
 return .04*r.passing_yards+4*r.passing_tds-r.passing_interceptions+.1*r.rushing_yards+6*r.rushing_tds+.1*r.receiving_yards+6*r.receiving_tds+r.receptions-r.rushing_fumbles_lost-r.receiving_fumbles_lost-r.sack_fumbles_lost+(r.passing_yards>=300?3:0)+(r.rushing_yards>=100?3:0)+(r.receiving_yards>=100?3:0);
}
export function offensiveChannels(r){
 const channel=(keys,calculate)=>keys.every(k=>finite(r[k]))?calculate():null;
 return {passing:channel(['passing_yards','passing_tds','passing_interceptions','sack_fumbles_lost'],()=>.04*r.passing_yards+4*r.passing_tds-r.passing_interceptions-r.sack_fumbles_lost+(r.passing_yards>=300?3:0)),rushing:channel(['rushing_yards','rushing_tds','rushing_fumbles_lost'],()=>.1*r.rushing_yards+6*r.rushing_tds-r.rushing_fumbles_lost+(r.rushing_yards>=100?3:0)),receiving:channel(['receiving_yards','receiving_tds','receptions','receiving_fumbles_lost'],()=>.1*r.receiving_yards+6*r.receiving_tds+r.receptions-r.receiving_fumbles_lost+(r.receiving_yards>=100?3:0))};
}
export function aggregateActuals(stats,window='season',from=1,to=stats?.through_week){
 if(!stats)return [];
 // Legacy aggregate remains usable but must never pretend to be a weekly window.
 if(!Array.isArray(stats.weekly_records))return window==='season'?(stats.players||[]).map(p=>({...p,sample_games:p.games,stats_season:stats.season})):[];
 const weeks=new Set(selectWeeks(stats.through_week,window,from,to)),groups=new Map(),cohorts=new Map();
 for(const r of stats.weekly_records){if(r.season!==stats.season||!weeks.has(r.week)||!r.player_id)continue;const list=groups.get(r.player_id)||[];list.push(r);groups.set(r.player_id,list);}
 // Descriptive usage expectation using observed per-opportunity output in this window.
 // Not a pregame forecast, not out-of-sample calibration; exclude unavailable channels.
 for(const records of groups.values())for(const r of records){
  if(!['QB','RB','WR','TE'].includes(r.position))continue;
  const c=cohorts.get(r.position)||{players:new Set(),passing:[],rushing:[],receiving:[]};c.players.add(r.player_id);
  const channels=offensiveChannels(r);for(const [key,attempts]of [['passing',r.attempts],['rushing',r.carries],['receiving',r.targets]])if(finite(attempts)&&finite(channels[key]))c[key].push([attempts,channels[key]]);cohorts.set(r.position,c);
 }
 return [...groups].map(([id,records])=>{
  records.sort((a,b)=>a.week-b.week);const last=records.at(-1),row={player_id:id,player_name:last.player_display_name,team:last.team,position:last.position,stats_season:stats.season,sample_games:records.length,weeks:records.map(r=>r.week)};
  for(const k of ACTUAL_FIELDS)row[k]=records.every(r=>finite(r[k]))?records.reduce((s,r)=>s+r[k],0):null;
  const points=records.map(actualDkPoints);row.actual_fp=points.every(finite)?points.reduce((s,p)=>s+p,0):null;
  const cohort=cohorts.get(last.position);row.expected_fp=null;
  if(cohort?.players.size>=EXPECTATION_MIN_PLAYERS){
   const rates=Object.fromEntries(['passing','rushing','receiving'].map(key=>{const attempts=cohort[key].reduce((s,r)=>s+r[0],0),points=cohort[key].reduce((s,r)=>s+r[1],0);return [key,attempts>0?points/attempts:null];}));
   const expected=[['passing',row.attempts],['rushing',row.carries],['receiving',row.targets]].map(([key,n])=>n===0?0:finite(n)&&finite(rates[key])?n*rates[key]:null);
   row.expected_fp=expected.every(finite)?expected.reduce((s,x)=>s+x,0):null;
   row.expectation_basis={method:'same-window position cohort per-opportunity rates',rates,players:cohort.players.size,season:stats.season,weeks:[...weeks]};
  }
  row.production_gap=finite(row.actual_fp)&&finite(row.expected_fp)?row.actual_fp-row.expected_fp:null;
  row.touches=finite(row.carries)&&finite(row.receptions)?row.carries+row.receptions:null;
  row.adot=finite(row.receiving_air_yards)&&row.targets>0?row.receiving_air_yards/row.targets:null;
  return row;
 });
}
export function researchPlayerFeatures({input,stats},filters={}){
 const current=filters.window==='current'||!filters.window;
 const compatibleStats=!input||!stats||input.season===stats.season;
 const actuals=aggregateActuals(current&&!compatibleStats?null:stats,current?'season':filters.window,filters.from,filters.to);
 const actualMap=new Map(actuals.map(p=>[p.player_id,p]));
 const pool=new Map((input?.players||[]).map(p=>[p.player_id,p]));
 const games=new Map((input?.games||[]).map(g=>[g.game_id,g]));
 const ids=current?[...pool.keys()]:[...actualMap.keys()];
 return ids.map(id=>{
  const p=compatibleStats||current?pool.get(id):null,a=actualMap.get(id),g=p?games.get(p.game_id):null;
  const validGame=g&&[g.home,g.away].includes(p.team)&&p.opponent===(p.team===g.home?g.away:g.home);
  const row={...a,...p,player_id:id,player_name:p?.player_name||a?.player_name,team:p?.team||a?.team,position:p?.position||a?.position,opponent:validGame?p.opponent:null,
   season:input?.season??stats?.season,week:input?.week??null,
   research_key:[id,input?.season||stats?.season,input?.week||'history',validGame?g.game_id:'no-game'].join('|'),
   salary:p?.salary??null,projection:p?.final_projection??null,game:validGame?g:null,active:p?.active,
   points_per_1k:p?.salary>0&&finite(p.final_projection)?p.final_projection/(p.salary/1000):null,
   stats_team:a?.team,stats_season:a?.stats_season,sample_games:a?.sample_games??null};
  // Keep forecast workload and completed-game totals in distinct namespaces.
  row.projected_targets=p?.projected_opportunities?.targets??null;row.projected_carries=p?.projected_opportunities?.carries??null;row.projected_attempts=p?.projected_opportunities?.pass_attempts??null;
  row.actual_fp=a?.actual_fp??null;
  return row;
 });
}
export function filterResearch(rows,f={}){
 const text=(f.search||'').trim().toLowerCase();
 return rows.filter(p=>(!text||`${p.player_name} ${p.team} ${p.opponent||''}`.toLowerCase().includes(text))&&(!f.position||p.position===f.position)&&(!f.team||p.team===f.team)&&(!f.opponent||p.opponent===f.opponent)&&(!f.slateOnly||finite(p.salary))&&(!f.activeOnly||p.active===true)&&(['minSalary','maxSalary','minProjection'].every(k=>{if(f[k]===''||f[k]==null)return true;const value=k==='minProjection'?p.projection:p.salary;return finite(value)&&(k==='maxSalary'?value<=Number(f[k]):value>=Number(f[k]));})));
}
export async function loadWorkspace(fetcher=fetch){
 const json=async url=>{const r=await fetcher(url,{cache:'no-store'});if(!r.ok)throw Error(`Unavailable: ${url}`);return r.json();};
 const results=await Promise.allSettled([json('/research/latest.json'),json('/lineups/season-leaders.json'),json('/data-health/latest.json'),json('/drive-lab/live-empirical.json'),json('/drive-lab/upcoming.json'),json('/newsroom/latest.json')]);
 const [manifest,stats,health,profile,outlook,news]=results.map(r=>r.status==='fulfilled'?r.value:null);let input=null;
 const errors=results.flatMap(r=>r.status==='rejected'?[r.reason.message]:[]);
 if(manifest?.snapshot?.simulation_path)try{input=await json(manifest.snapshot.simulation_path);if(String(input.slate_id)!==String(manifest.snapshot.slate_id)||input.season!==manifest.snapshot.season||input.week!==manifest.snapshot.week||!Array.isArray(input.players)||!Array.isArray(input.games))throw Error('Research bundle mismatch');}catch(e){input=null;errors.push(e.message);}
 let history=[];
 if(input)try{const archive=await json('/lineups/archive.json');const perWeek=new Map();for(const e of archive.entries||[])if(e.season===input.season&&e.week<input.week&&(!perWeek.has(e.week)||e.generated_at>perWeek.get(e.week).generated_at))perWeek.set(e.week,e);
 const previous=await Promise.allSettled([...perWeek.values()].sort((a,b)=>b.week-a.week).slice(0,5).map(e=>json(`/research/bundles/${encodeURIComponent(e.bundle)}/simulation.json`)));history=previous.filter(r=>r.status==='fulfilled').map(r=>r.value);
 }catch{errors.push('Salary history unavailable');}
 return {input,stats,health,profile,outlook,news,history,manifest,errors,state:snapshotState(manifest?.snapshot,manifest?.attempt)};
}
