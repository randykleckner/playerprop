import {prepareAvailability} from './availability.ts';
import {simulateFantasyGame,type FantasyGame,type FantasyOptions} from './player-engine.ts';
import type {GameInputV2} from './engine.ts';
import {emptyPlayerStats,type PlayerInput} from './player-types.ts';
import {fingerprint} from '../../../public/simulation/random.js';
// @ts-expect-error Existing shared summarizer has no declaration.
import {summarize} from '../../../public/simulation/statistics.js';
const brief=(values:Float64Array)=>{const s=summarize(values);return Object.fromEntries(['mean','median','p10','p25','p75','p90','p95'].map(k=>[k,s[k]])) as Record<string,number>;};
export function runFantasyBulk(game:GameInputV2,o:FantasyOptions,count:number,onProgress?:(done:number)=>void,onDraw?:(result:FantasyGame)=>void){
 if(!Number.isInteger(count)||count<1||count>10000)throw Error('Choose 1–10,000 games');
 const start=performance.now();if(o.availability){if(!o.availabilityConfig)throw Error('Availability configuration missing');const prepared=prepareAvailability(o.players,o.personnel,o.availability,o.availabilityConfig,o.config,[game.homeTeam,game.awayTeam],o.scenario,o.asOf);o={...o,players:prepared.players,personnel:prepared.personnel,preparedAvailability:prepared};}
 const fields=Object.keys(emptyPlayerStats()),stats:Record<string,Record<string,Float64Array>>={},players:Record<string,PlayerInput>={};
 for(const tm of [game.homeTeam,game.awayTeam]){if(!o.players.teams[tm])throw Error(`${tm}: current QB/player evidence unavailable; use the legacy V2 engine`);for(const p of o.players.teams[tm].players){players[p.player_id]=p;stats[p.player_id]=Object.fromEntries([...fields,'dk_points'].map(k=>[k,new Float64Array(count)]));}}
 const home=new Float64Array(count),away=new Float64Array(count),total=new Float64Array(count),margin=new Float64Array(count);let example:FantasyGame|undefined;const teamSums:Record<string,Record<string,number>>={},diagnosticSums:Record<string,Record<string,number>>={};
 for(let i=0;i<count;i++){
  const r=simulateFantasyGame(game,{...o,seed:`${o.seed}:${i}`,debugTrace:o.debugTrace&&i===0});if(!r.completed)throw Error('Incomplete game discarded');if(!example)example=r;onDraw?.(r);
  home[i]=r.finalState.scoreHome;away[i]=r.finalState.scoreAway;total[i]=r.totalPoints;margin[i]=r.homeScoreDifferential;
  for(const [tm,t]of Object.entries(r.teams)){teamSums[tm]??={};teamSums[tm].points=(teamSums[tm].points||0)+(tm===game.homeTeam?r.finalState.scoreHome:r.finalState.scoreAway);for(const [k,v]of Object.entries(t))teamSums[tm][k]=(teamSums[tm][k]||0)+v;diagnosticSums[tm]??={};for(const [k,v]of Object.entries(r.diagnostics[tm]))diagnosticSums[tm][k]=(diagnosticSums[tm][k]||0)+v;}
  for(const [id,b]of Object.entries(r.players)){for(const k of fields)stats[id][k][i]=b.stats[k as keyof typeof b.stats];stats[id].dk_points[i]=b.dk_points;}
  if((i+1)%100===0)onProgress?.(i+1);
 }
 const output=Object.entries(stats).map(([id,draws])=>{
  const p=players[id],prob=(condition:(i:number)=>boolean)=>{let n=0;for(let i=0;i<count;i++)if(condition(i))n++;return 100*n/count;};
  const dks=summarize(draws.dk_points);return {player:p,stats:Object.fromEntries(fields.map(k=>[k,brief(draws[k])])),dk:dks,probabilities:{one_plus_td:prob(i=>draws.rushing_tds[i]+draws.receiving_tds[i]>=1),two_plus_td:prob(i=>draws.rushing_tds[i]+draws.receiving_tds[i]>=2),one_plus_passing_td:prob(i=>draws.passing_tds[i]>=1),two_plus_passing_td:prob(i=>draws.passing_tds[i]>=2),rush_100:prob(i=>draws.rushing_yards[i]>=100),receiving_100:prob(i=>draws.receiving_yards[i]>=100),passing_300:prob(i=>draws.passing_yards[i]>=300),salary_2x:p.salary?prob(i=>draws.dk_points[i]>=2*p.salary!/1000):null,salary_3x:p.salary?prob(i=>draws.dk_points[i]>=3*p.salary!/1000):null,salary_4x:p.salary?prob(i=>draws.dk_points[i]>=4*p.salary!/1000):null}};
 });
 const teams=Object.fromEntries(Object.entries(teamSums).map(([tm,t])=>[tm,Object.fromEntries(Object.entries(t).map(([k,v])=>[k,v/count]))]));
 const avg=(k:string)=>Object.values(teams).reduce((n,t)=>n+t[k],0)/2;
 const metadata={...example!.metadata,seed:o.seed,count};
 return {availability:o.preparedAvailability?{states:o.preparedAvailability.states,workload:o.preparedAvailability.workload,units:o.preparedAvailability.personnel.units,qbShares:o.preparedAvailability.qbShares}:undefined,runId:fingerprint({game,metadata}),metadata,game,count,seed:o.seed,home:summarize(home),away:summarize(away),total:summarize(total),margin:summarize(margin),teams,players:output,adjustments:example!.adjustments,diagnostics:Object.fromEntries(Object.entries(diagnosticSums).map(([tm,t])=>[tm,Object.fromEntries(Object.entries(t).map(([k,v])=>[k,v/count]))])),plays:avg('offensivePlays'),possessions:avg('possessions'),yards:avg('passingYards')+avg('rushingYards')-avg('sackYards'),turnovers:avg('turnovers')*2,passes:avg('passAttempts'),rushes:avg('rushingAttempts'),runtimeMs:performance.now()-start,example,trackedPlayers:output.length,drawStorageBytes:count*(output.length*(fields.length+1)+4)*8};
}
export type FantasyRun=ReturnType<typeof runFantasyBulk>;
/** Pure data interface for future run + player lookup. No bulk play persistence. */
export function playerOutcome(run:FantasyRun,id:string){const p=run.players.find(p=>p.player.player_id===id);if(!p)throw Error('Player not in run');return {runId:run.runId,metadata:run.metadata,matchup:run.game,personnel:run.adjustments[p.player.team],...p};}
export function compareFantasyRuns(base:FantasyRun,personnel:FantasyRun){
 if(base.metadata.engine!=='base'||personnel.metadata.engine!=='personnel'||base.seed!==personnel.seed||base.count!==personnel.count||fingerprint(base.game)!==fingerprint(personnel.game)||['player_snapshot','empirical_profile','madden_snapshot','roster_snapshot','injury_snapshot','availability_scenario_id'].some(k=>base.metadata[k as keyof typeof base.metadata]!==personnel.metadata[k as keyof typeof personnel.metadata]))throw Error('Comparison requires identical matchup, count, seed and source snapshots');
 return {base_run:base.runId,personnel_run:personnel.runId,total_delta:personnel.total.mean-base.total.mean,teams:Object.fromEntries(Object.entries(base.teams).map(([tm,t])=>[tm,Object.fromEntries(Object.keys(t).map(k=>[k,personnel.teams[tm][k]-t[k]]))])),players:personnel.players.map(p=>{const b=base.players.find(b=>b.player.player_id===p.player.player_id)!;return {player_id:p.player.player_id,name:p.player.name,targets_delta:p.stats.targets.mean-b.stats.targets.mean,carries_delta:p.stats.carries.mean-b.stats.carries.mean,passing_yards_delta:p.stats.passing_yards.mean-b.stats.passing_yards.mean,rushing_yards_delta:p.stats.rushing_yards.mean-b.stats.rushing_yards.mean,receiving_yards_delta:p.stats.receiving_yards.mean-b.stats.receiving_yards.mean,td_probability_delta:p.probabilities.one_plus_td-b.probabilities.one_plus_td,passing_td_probability_delta:p.probabilities.one_plus_passing_td-b.probabilities.one_plus_passing_td,dk_mean_delta:p.dk.mean-b.dk.mean,dk_p90_delta:p.dk.p90-b.dk.p90};})};
}
