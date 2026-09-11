import {prepareAvailability,type AvailabilitySnapshot,type AvailabilityConfig,type Scenarios} from './availability.ts';
import {simulateGameV2,resolvePlay,type GameInputV2,type GameState,type Transition,type Options} from './engine.ts';
import type {EmpiricalProfile} from './empirical.ts';
import {random,fingerprint,type Random} from '../../../public/simulation/random.js';
// @ts-expect-error Shared V1 scoring has no declaration; implementation is unchanged.
import {dkScore} from '../../../public/simulation/engine.js';
import {adjustments,resolvePersonnel,type PlayerOutcome} from './personnel-influence.ts';
import {emptyPlayerStats,type PlayerTeam,type PlayerSnapshot,type PersonnelSnapshot,type InfluenceConfig,type PlayerBox,type PlayerInput} from './player-types.ts';
export type EngineName='base'|'personnel';
export interface FantasyOptions {coaching?:Options['coaching'];seed:string;engine:EngineName;influence:number;empirical:EmpiricalProfile;players:PlayerSnapshot;personnel:PersonnelSnapshot;config:InfluenceConfig;debugTrace?:boolean;maxPlays?:number;availability?:AvailabilitySnapshot;availabilityConfig?:AvailabilityConfig;scenario?:Scenarios;asOf?:string;preparedAvailability?:ReturnType<typeof prepareAvailability>;}
export function validatePlayers(team:PlayerTeam,tm:string){
 if(!team||!team.players.length||team.players.length>60||new Set(team.players.map(p=>p.player_id)).size!==team.players.length)throw Error('Invalid player pool');
 if(team.players.filter(p=>p.position==='QB'&&p.player_id===team.qb_id&&p.active).length!==1)throw Error('A current starting QB is required');
 for(const p of team.players){if(p.team!==tm||!p.player_id||!p.active||!['QB','RB','WR','TE'].includes(p.position)||!Number.isFinite(p.scramble_share)||p.scramble_share<0||p.scramble_share>1)throw Error('Invalid player identity/availability');if(p.salary!==null&&(!Number.isInteger(p.salary)||p.salary<=0))throw Error('Invalid salary');}
 for(const context of ['normal','redzone','goal'])for(const kind of ['carry','target']){const key=context+'_'+kind;const values=team.players.map(p=>p.shares[key]);if(values.some(v=>!Number.isFinite(v)||v<0||v>1)||Math.abs(values.reduce((a,b)=>a+b,0)-1)>1e-6)throw Error('Player shares must sum to one');if(kind==='target'&&team.players.some(p=>p.position==='QB'&&p.shares[key]>0))throw Error('QB target shares unsupported');}
 const pr=team.pressure;for(const k of ['probability','sack_given_pressure','scramble_given_pressure','incomplete_given_pressure'] as const)if(!Number.isFinite(pr[k])||pr[k]<0||pr[k]>1)throw Error('Invalid pressure proxy');
 if(pr.sack_given_pressure+pr.scramble_given_pressure+pr.incomplete_given_pressure>1+1e-6)throw Error('Pressure outcomes exceed one');
}
export function selectRecipient(team:PlayerTeam,kind:'carry'|'target',state:GameState,rng:Random):PlayerInput {const context=state.field>=95?'goal':state.field>=80?'redzone':'normal';let u=rng.uniform();for(const p of team.players){u-=p.shares[context+'_'+kind];if(u<0)return p;}const last=team.players.filter(p=>p.shares[context+'_'+kind]>0).at(-1);if(!last)throw Error('No eligible recipient');return last;}
export function creditPlay(boxes:Record<string,PlayerBox>,o:PlayerOutcome,t:Transition){
 if(o.playType!=='RUN'&&o.playType!=='PASS')return;
 const qb=o.qbId?boxes[o.qbId]:undefined;if(!qb)throw Error('QB attribution missing');
 if(o.playType==='RUN'){
  const runner=o.runnerId?boxes[o.runnerId]:undefined;if(!runner)throw Error('Runner attribution missing');const s=runner.stats;s.carries++;s.rushing_yards+=t.yards;if(o.scramble)s.scrambles++;else s.designed_runs++;if(t.touchdown)s.rushing_tds++;if(o.resultType==='FUMBLE')s.fumbles_lost++;
 }else if(o.resultType==='SACK')qb.stats.sacks_taken++;
 else {
  qb.stats.pass_attempts++;if(o.resultType==='INTERCEPTION')qb.stats.interceptions++;
  const receiver=o.targetId?boxes[o.targetId]:undefined;
  if(receiver)receiver.stats.targets++;else if(!o.throwaway)throw Error('Target attribution missing');
  if(o.resultType==='COMPLETE'){
   if(!receiver)throw Error('Completed pass must have a recipient');qb.stats.completions++;qb.stats.passing_yards+=t.yards;receiver.stats.receptions++;receiver.stats.receiving_yards+=t.yards;
   if(t.touchdown){qb.stats.passing_tds++;receiver.stats.receiving_tds++;}
  }
 }
}
export function simulateFantasyGame(game:GameInputV2,o:FantasyOptions){
 if(o.availability&&!o.preparedAvailability){if(!o.availabilityConfig)throw Error('Availability configuration missing');const prepared=prepareAvailability(o.players,o.personnel,o.availability,o.availabilityConfig,o.config,[game.homeTeam,game.awayTeam],o.scenario,o.asOf);o={...o,players:prepared.players,personnel:prepared.personnel,preparedAvailability:prepared};}
 if(!['base','personnel'].includes(o.engine)||o.engine==='base'&&o.influence!==0)throw Error('V2 Base requires zero personnel influence');
 if(o.players.personnel_snapshot!==o.personnel.snapshot_id||o.players.madden_snapshot!==o.personnel.ratings_snapshot_id)throw Error('Player and personnel snapshots differ; rebuild the player snapshot');
 const teamNames=[game.homeTeam,game.awayTeam];const boxes:Record<string,PlayerBox>={};
 for(const tm of teamNames){validatePlayers(o.players.teams[tm],tm);for(const p of o.players.teams[tm].players){if(boxes[p.player_id])throw Error('Player belongs to multiple teams');boxes[p.player_id]={player:p,stats:emptyPlayerStats(),dk_points:0};}}
 const modifiers=Object.fromEntries(teamNames.map((tm,i)=>[tm,adjustments(tm,teamNames[1-i],o.players.teams[tm],o.personnel,o.config,o.influence)]));
 const allocation=random(`V2.0-C-allocation|${o.seed}`),aux=random(`V2.0-C-personnel|${o.seed}`);
 const diagnostics=Object.fromEntries(teamNames.map(tm=>[tm,{pressures:0,pressure_changes:0,scrambles:0,designed_qb_runs:0,throwaways:0,dropbacks:0}]));
 const options:Options={coaching:o.coaching,seed:o.seed,empirical:o.empirical,debugTrace:o.debugTrace,maxPlays:o.maxPlays,
  resolve:(type,state,t,rng,rules,profile)=>{
   const team=o.players.teams[state.possession];let out:PlayerOutcome=resolvePersonnel(type,state,t,rng,aux,rules,profile!,team,modifiers[state.possession],o.config);
   // resolvePersonnel with all zero modifiers draws the exact original play outcomes.
   if(type==='RUN'||type==='PASS'){
    let qbId=team.qb_id;if(team.qb_shares){let u=allocation.uniform();for(const [id,share] of Object.entries(team.qb_shares)){qbId=id;u-=share;if(u<0)break;}}out.qbId=qbId;
    if(out.playType==='RUN'){
     const runner=out.scramble?team.players.find(p=>p.player_id===qbId)!:selectRecipient(team,'carry',state,allocation);out.runnerId=runner.player_id;if(runner.position==='QB')out.qbId=runner.player_id;
     if(runner.position==='QB'&&!out.scramble)out.scramble=allocation.uniform()<runner.scramble_share;
    }else if(out.resultType!=='SACK'&&!out.throwaway)out.targetId=selectRecipient(team,'target',state,allocation).player_id;
   }
   return out;
  },onPlay:(state,outcome,step)=>{const out=outcome as PlayerOutcome;creditPlay(boxes,out,step);const d=diagnostics[state.possession];if(out.pressure)d.pressures++;if(out.pressureChanged)d.pressure_changes++;if(out.scramble)d.scrambles++;if(out.throwaway)d.throwaways++;if(out.playType==='PASS'||out.scramble)d.dropbacks++;if(out.playType==='RUN'&&out.runnerId===out.qbId&&!out.scramble)d.designed_qb_runs++;}
 };
 const r=simulateGameV2(game,options);for(const b of Object.values(boxes))b.dk_points=dkScore(b.stats,b.player.position);
 const metadata={model_version:o.preparedAvailability?'V2.0-D':'V2.0-C',...o.preparedAvailability?.metadata,engine:o.engine,personnel_influence:o.influence,personnel_configuration:o.config,personnel_snapshot:o.personnel.snapshot_id,madden_snapshot:o.players.madden_snapshot,roster_snapshot:o.players.roster_snapshot,player_snapshot:o.players.snapshot_id,empirical_version:o.empirical.version,empirical_profile:o.empirical.profileId,seed:o.seed};
 return {...r,modelVersion:`${metadata.model_version}-${o.engine}`,controlModelVersion:r.modelVersion,runId:fingerprint({game,metadata}),metadata,adjustments:modifiers,diagnostics,players:boxes};
}
export type FantasyGame=ReturnType<typeof simulateFantasyGame>;
