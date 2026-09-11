import type {PlayerSnapshot,PersonnelSnapshot,PlayerInput,Unit,InfluenceConfig} from './player-types.ts';
import {fingerprint} from '../../../public/simulation/random.js';
export type Status='ACTIVE'|'LIMITED'|'QUESTIONABLE'|'DOUBTFUL'|'OUT'|'IR/PUP'|'SUSPENDED'|'INACTIVE'|'UNKNOWN';
export interface AvailabilityConfig {version:string;freshnessHours:number;fullCoverage:number;minimumCoverage:number;statusPriors:Record<Status,[number,number]>;rotation:{line:number[];front:number[];secondary:number[]};roleWeights?:Record<string,Record<string,number>>;redistribution:Record<'carry'|'target',Record<string,number>>;}
export interface State {state:Status;practice_status:string|null;game_status:string|null;source:string;updated_at:string;confidence:string;}
export interface Depth {player_id:string;name:string;team:string;role:string;slot:string;rank:number;formation:string;depth_at:string;confidence:string;}
export interface Person {player_id:string;name:string;team:string;position:string;status:string;availability:State;attributes:Record<string,number>|null;mapping_status:string;depth_roles:Depth[];snap_history?:{share:number;weighted_games:number;side:string;source:string;source_hash:string}|null;}
export interface AvailabilitySnapshot {snapshot_id:string;as_of:string;injury_at:string;roster_at:string;roster_snapshot:string;madden_snapshot:string;personnel_snapshot:string;player_snapshot:string;players:Record<string,Person>;depth:Depth[];unit_weights:Record<string,{attributes:Record<string,number>;positions?:Record<string,number>}>;}
export type Scenarios=Record<string,{state:'ACTIVE'|'LIMITED'|'OUT';workload?:number;playProbability?:number}>;
export interface Participation extends State {official_state:Status;active_probability:number;workload_multiplier:number;participation:number;scenario:boolean;basis:string;}
export interface Contribution {player_id:string;name:string;role:string;weight:number;rating:number|null;attributes:Record<string,number>|null;missing:string[];replacement:boolean;availability?:Participation;confidence:string;snap_history?:Person['snap_history'];}
export interface WeightedUnit extends Unit {coverage:number;scale:number;expected_weight:number;players:Contribution[];missing:string[];}
export function validateAvailability(c:AvailabilityConfig){
 if(!c.version||!Number.isFinite(c.freshnessHours)||c.freshnessHours<=0||!(c.minimumCoverage>0&&c.minimumCoverage<c.fullCoverage&&c.fullCoverage<=1))throw Error('Invalid availability coverage/freshness configuration');
 for(const status of ['ACTIVE','LIMITED','QUESTIONABLE','DOUBTFUL','OUT','IR/PUP','SUSPENDED','INACTIVE','UNKNOWN'] as Status[]){const pair=c.statusPriors[status];if(!pair||pair.length!==2||pair.some(n=>!Number.isFinite(n)||n<0||n>1)||['OUT','IR/PUP','SUSPENDED','INACTIVE'].includes(status)&&pair.some(n=>n!==0))throw Error('Invalid availability prior');}
 for(const weights of Object.values(c.rotation))if(!weights.length||weights.some(n=>!Number.isFinite(n)||n<0)||Math.abs(weights.reduce((a,b)=>a+b,0)-1)>1e-8)throw Error('Rotation weights must sum to one');
 for(const weights of [...Object.values(c.redistribution),...Object.values(c.roleWeights??{})])if(Object.values(weights).some(n=>!Number.isFinite(n)||n<0))throw Error('Invalid redistribution weights');
}
export function participation(p:Person,c:AvailabilityConfig,override?:Scenarios[string]):Participation{
 const state=override?.state??p.availability.state;const pair=c.statusPriors[state];if(!pair)throw Error('Unknown availability status');let [prob,work]=pair;
 if(override){if(!['ACTIVE','LIMITED','OUT'].includes(override.state))throw Error('Invalid scenario');prob=override.playProbability??(state==='OUT'?0:1);work=state==='LIMITED'?(override.workload??.7):state==='OUT'?0:1;}
 if(!Number.isFinite(prob)||prob<0||prob>1||!Number.isFinite(work)||work<0||work>1)throw Error('Workload must be 0–100%');
 return {...p.availability,state,official_state:p.availability.state,active_probability:prob,workload_multiplier:work,participation:prob*work,scenario:!!override,basis:override?'User scenario; official evidence unchanged':p.availability.game_status?'Official game designation; numeric participation probability is an unfitted scenario prior':p.availability.practice_status?'Official practice participation; workload reduction is a model assumption, not a confirmed gameday restriction':p.status==='ACT'?'Active roster only; no matched game designation. Baseline workload retained with low confidence':'Roster designation excludes expected gameday participation'};
}
export function weightedUnit(players:Contribution[],expected:number,c:AvailabilityConfig):WeightedUnit {
 const observed=players.filter(p=>p.rating!==null&&!p.missing.length).reduce((s,p)=>s+p.weight,0),coverage=expected?observed/expected:0;
 const scale=coverage+1e-8>=c.fullCoverage?1:coverage+1e-8>=c.minimumCoverage?coverage:0;
 return {rating:observed?players.reduce((s,p)=>s+(p.rating??0)*p.weight,0)/observed:null,complete:scale===1,confidence:scale===1?'full_weighted_evidence':scale?'scaled_weighted_evidence':'insufficient',coverage,scale,expected_weight:expected,players,missing:players.flatMap(p=>p.missing.map(m=>`${p.role} ${p.name} (${p.player_id}): ${m}; weight ${p.weight.toFixed(3)}`))};
}
function contribution(row:Depth|undefined,weight:number,role:string,a:AvailabilitySnapshot,states:Record<string,Participation>,attributes:Record<string,number>,replacement=false):Contribution{
 const p=row?a.players[row.player_id]:undefined;const missing:string[]=[];let rating:number|null=null;
 if(!row)missing.push('missing depth evidence');else if(!p||p.team!==row.team)missing.push('missing canonical roster evidence');else if(!p.attributes||!['verified','strongly_corroborated'].includes(p.mapping_status))missing.push('missing corroborated Madden mapping');
 else {for(const key of Object.keys(attributes))if(!Number.isFinite(p.attributes[key])||p.attributes[key]<0||p.attributes[key]>99)missing.push(`missing attribute ${key}`);if(!missing.length)rating=Object.entries(attributes).reduce((n,[k,w])=>n+p.attributes![k]*w,0)/Object.values(attributes).reduce((a,b)=>a+b,0);}
 return {player_id:row?.player_id??`missing:${role}`,name:row?.name??'Unresolved role',role,weight,rating,attributes:p?.attributes?Object.fromEntries(Object.keys(attributes).filter(k=>p.attributes![k]!==undefined).map(k=>[k,p.attributes![k]])):null,missing,replacement,availability:row?states[row.player_id]:undefined,confidence:row?.confidence??'unresolved',snap_history:p?.snap_history};
}
export function activeUnit(tm:string,key:string,a:AvailabilitySnapshot,states:Record<string,Participation>,c:AvailabilityConfig):WeightedUnit{
 const weights=a.unit_weights[key];const line=key==='pass_protection'||key==='run_block',secondary=key.startsWith('secondary');
 let rows=a.depth.filter(r=>r.team===tm&&(line?r.formation==='3WR 1TE'&&['LT','LG','C','RG','RT'].includes(r.role):r.formation.startsWith('Base ')));
 if(!line)rows=rows.filter(r=>secondary?['LCB','RCB','FS','SS','NB'].includes(r.role):['LDE','RDE','LDT','RDT','NT',...(key==='run_front'?['WLB','SLB','MLB','LILB','RILB']:r.formation==='Base 3-4 D'?['WLB','SLB']:[])].includes(r.role));
 const groups=new Map<string,Depth[]>();for(const r of rows){const g=line?r.role:r.role+':'+r.slot;if(!groups.has(g))groups.set(g,[]);groups.get(g)!.push(r);}
 if(line)for(const role of ['LT','LG','C','RG','RT'])if(!groups.has(role))groups.set(role,[]);
 const minimum=line?5:secondary?4:key==='run_front'?7:4;while(groups.size<minimum)groups.set(`missing slot ${groups.size+1}`,[]);
 const rotation=line?c.rotation.line:secondary?c.rotation.secondary:c.rotation.front;const result:Contribution[]=[];const used=new Map<string,number>();let expected=0;
 for(const [slot,candidates] of groups){candidates.sort((x,y)=>x.rank-y.rank||x.player_id.localeCompare(y.player_id));const role=candidates[0]?.role??slot;const roleWeight=weights.positions?.[role]??c.roleWeights?.[secondary?'secondary':key]?.[role]??1;expected+=roleWeight;
  const local=new Map<string,number>();let vacancy=0;
  let slotRotation=rotation;
  if(!line&&candidates.length){const raw=candidates.map((row,i)=>{const h=a.players[row.player_id]?.snap_history;const shrink=h&&h.side==='defense'?h.weighted_games/(h.weighted_games+5):0;return (rotation[i]??0)*(1-shrink)+(h?.share??0)*shrink;});const sum=raw.reduce((x,y)=>x+y,0);if(sum)slotRotation=raw.map(x=>x/sum);}
  for(let i=0;i<slotRotation.length;i++){const row=candidates[i];const factor=row?states[row.player_id]?.participation??1:0;const capacity=row?Math.max(0,1-(used.get(row.player_id)??0)):0;const w=Math.min(slotRotation[i]*factor,capacity);if(row&&w>0){local.set(row.player_id,(local.get(row.player_id)??0)+w);used.set(row.player_id,(used.get(row.player_id)??0)+w);}vacancy+=slotRotation[i]-w;}
  // Only fully participating backups absorb vacancies; a LIMITED player never regains its own removed workload.
  for(const row of candidates){if(vacancy<1e-9)break;if(states[row.player_id]?.participation!==1)continue;const w=Math.min(vacancy,Math.max(0,1-(used.get(row.player_id)??0)));if(w){local.set(row.player_id,(local.get(row.player_id)??0)+w);used.set(row.player_id,(used.get(row.player_id)??0)+w);vacancy-=w;}}
  for(const [pid,w] of local){const row=candidates.find(r=>r.player_id===pid)!;result.push(contribution(row,w*roleWeight,role,a,states,weights.attributes,row.rank>1&&(states[candidates[0]?.player_id]?.participation??1)<1));}
  if(vacancy>1e-9){const missing=contribution(undefined,vacancy*roleWeight,role,a,states,weights.attributes);missing.missing=[`No available depth replacement; listed: ${candidates.map(r=>`${r.name} (${r.player_id}) ${states[r.player_id]?.state??'unresolved'}`).join(', ')||'none'}`];result.push(missing);}
 }
 return weightedUnit(result,expected,c);
}
export function redistribute(players:PlayerInput[],states:Record<string,Participation>,c:AvailabilityConfig){
 const changes:Record<string,{baseline:Record<string,number>;adjusted:Record<string,number>;donors:Record<string,number>;transfers:Record<string,Record<string,number>>}>={};for(const p of players)changes[p.player_id]={baseline:{...p.shares},adjusted:{},donors:{},transfers:{}};
 for(const context of ['normal','redzone','goal'])for(const kind of ['carry','target'] as const){const key=context+'_'+kind;let lost=0;const removedBy:Record<string,number>={};
  for(const p of players){const baseline=p.shares[key];p.shares[key]=baseline*states[p.player_id].participation;const removed=baseline-p.shares[key];if(removed>0){lost+=removed;removedBy[p.player_id]=removed;}}
  const recipients=players.filter(p=>states[p.player_id].participation===1&&(c.redistribution[kind][p.position]??0)>0);
  const w=recipients.map(p=>Math.max(changes[p.player_id].baseline[key],.001)*(c.redistribution[kind][p.position]??0)*(p.starter?1:.8));const sum=w.reduce((a,b)=>a+b,0);
  if(lost>1e-10&&!sum)throw Error(`No fully available recipients for ${key}; choose an ACTIVE teammate in this scenario`);
  recipients.forEach((p,i)=>{const share=sum?w[i]/sum:0;p.shares[key]+=lost*share;for(const [id,removed]of Object.entries(removedBy))if(share>0){changes[p.player_id].donors[id]=(changes[p.player_id].donors[id]??0)+removed*share;(changes[p.player_id].transfers[key]??={})[id]=removed*share;}});
  for(const p of players)changes[p.player_id].adjusted[key]=p.shares[key];
  if(Math.abs(players.reduce((n,p)=>n+p.shares[key],0)-1)>1e-6)throw Error('Workload conservation failed');
 }
 return changes;
}
export function prepareAvailability(players:PlayerSnapshot,personnel:PersonnelSnapshot,a:AvailabilitySnapshot,c:AvailabilityConfig,influence:InfluenceConfig,teams:string[],scenario:Scenarios={},asOf=a.as_of){
 validateAvailability(c);if(!Number.isFinite(Date.parse(asOf)))throw Error('Invalid availability evaluation timestamp');if(a.player_snapshot!==players.snapshot_id||a.personnel_snapshot!==personnel.snapshot_id||a.madden_snapshot!==players.madden_snapshot)throw Error('Availability sources differ; rebuild availability snapshot');
 for(const id of Object.keys(scenario))if(!a.players[id]||!teams.includes(a.players[id].team))throw Error('Scenario player is outside selected matchup');
 const output=structuredClone(players),units=structuredClone(personnel);const states:Record<string,Participation>={};for(const p of Object.values(a.players))if(teams.includes(p.team))states[p.player_id]=participation(p,c,scenario[p.player_id]);
 const workload:Record<string,ReturnType<typeof redistribute>>={};const qbShares:Record<string,Record<string,number>>={};
 for(const tm of teams){const team=output.teams[tm];if(!team)throw Error(`${tm}: no offensive opportunity inputs`);
  for(const p of Object.values(a.players).filter(p=>p.team===tm&&p.status==='ACT'&&['RB','WR','TE'].includes(p.position)&&p.depth_roles.length&&!team.players.some(q=>q.player_id===p.player_id))){team.players.push({player_id:p.player_id,name:p.name,team:tm,position:p.position as PlayerInput['position'],active:true,starter:false,detailed:false,salary:null,salary_as_of:null,shares:Object.fromEntries(['normal','redzone','goal'].flatMap(context=>['carry','target'].map(kind=>[context+'_'+kind,0]))),scramble_share:0,madden_attributes:p.attributes,madden_identity:p.mapping_status,flags:['New depth reserve: no baseline usage snapshot; zero baseline opportunity, eligible for small role-prior redistribution']});}
  const qbDepth=a.depth.filter(r=>r.team===tm&&r.role==='QB').sort((a,b)=>a.rank-b.rank);let remaining=1;qbShares[tm]={};
  for(const row of qbDepth){const p=a.players[row.player_id];if(!p||p.position!=='QB')continue;const share=remaining*(states[p.player_id]?.participation??0);if(share>0){qbShares[tm][p.player_id]=share;remaining-=share;if(!team.players.some(x=>x.player_id===p.player_id)){const base=team.players.find(x=>x.position==='QB')!;team.players.push({...structuredClone(base),player_id:p.player_id,name:p.name,starter:false,salary:null,salary_as_of:null,shares:Object.fromEntries(Object.keys(base.shares).map(k=>[k,0])),madden_attributes:p.attributes,madden_identity:p.mapping_status,flags:['Backup QB: inherited team pressure/scramble prior; individual history unavailable']});}}if(remaining<1e-8)break;}
  if(remaining>1e-8)throw Error(`${tm}: no fully available QB depth replacement`);team.qb_id=Object.keys(qbShares[tm])[0];team.qb_shares=qbShares[tm];
  for(const p of team.players){const canon=a.players[p.player_id];if(!canon||canon.team!==tm)throw Error(`Missing current roster evidence: ${p.name}`);p.madden_attributes=canon.attributes;p.madden_identity=canon.mapping_status;}
  workload[tm]=redistribute(team.players,states,c);
  team.players=team.players.filter(p=>states[p.player_id].participation>0).map(p=>({...p,active:true,availability:states[p.player_id],workload:workload[tm][p.player_id],snap_history:a.players[p.player_id].snap_history}));
  units.units[tm]={};for(const key of Object.keys(a.unit_weights))units.units[tm][key]=activeUnit(tm,key,a,states,c);
  const receiving=team.players.filter(p=>p.shares.normal_target>0).map(p=>contribution({player_id:p.player_id,name:p.name,team:tm,role:p.position,slot:p.player_id,rank:p.starter?1:2,formation:'receiving',depth_at:a.roster_at,confidence:'recency_usage_and_role_prior'},p.shares.normal_target,p.position,a,states,influence.receivingAttributes));units.units[tm].receiving=weightedUnit(receiving,1,c);
 }
 const metadata={injury_snapshot:a.snapshot_id,injury_at:a.injury_at,active_roster_snapshot:a.roster_snapshot,roster_at:a.roster_at,projection_at:players.as_of,availability_configuration:c,availability_scenario:structuredClone(scenario),availability_scenario_id:fingerprint(scenario),availability_as_of:asOf,availability_stale:[a.injury_at,a.roster_at].some(t=>!Number.isFinite(Date.parse(t))||Date.parse(asOf)-Date.parse(t)>c.freshnessHours*3600000),availability_mode:'deterministic expected participation; active probability × conditional workload'};
 return {players:output,personnel:units,states,workload,qbShares,metadata};
}
