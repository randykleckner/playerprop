#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {dirname} from 'node:path';
import {preparePool} from './dfs-js/pool.mjs';
import {validateInput} from '../public/simulation/engine.js';
export function buildInput(salary,projection,schedule,{allowProvisional=false,markets=[]}={}){
 const asOf=[salary.fetched_at,projection.fetched_at].sort().at(-1);
 const {pool,rejected}=preparePool(salary,projection,schedule,{allowProvisional,now:asOf});
 const projections=new Map(projection.records.map(p=>[p.position==='DST'?`team:${p.team}`:p.player_id,p]));
 const games=[...new Set(pool.map(p=>[p.team,p.opponent].sort().join('-')))].map(id=>{const p=pool.find(p=>[p.team,p.opponent].sort().join('-')===id);const home=p.home_away==='home'?p.team:p.opponent;const market=markets.find(m=>m.game_id===id);return {game_id:id,home,away:home===p.team?p.opponent:p.team,start_time:p.game_start_time,...market};});
 const players=pool.map(p=>{const projection=projections.get(p.id),s=projection.projected_stats||{},n=k=>Number(s[k]||0),ratio=(a,b,fallback)=>n(b)>0?n(a)/n(b):fallback;return {player_id:p.id,player_name:p.player_name,draftable_id:p.draftable_id,team:p.team,opponent:p.opponent,position:p.position,salary:p.salary,game_id:[p.team,p.opponent].sort().join('-'),active:true,identity_status:p.provisional?'provisional_name_team_position':'stable_external_id',projected_snap_share:null,projected_opportunities:{pass_attempts:n('0'),targets:n('58'),carries:n('23')},market_projection:null,statistical_projection:projection.projected_points,final_projection:projection.projected_points,floor:null,median:null,ceiling:null,stddev:null,quality_flags:[...p.quality_flags,...(p.position==='DST'?['dst_placeholder']:[]),'snap_share_unavailable'],inputs:{routes:null,touchdown_probability:null,pass_attempts:n('0'),completion_probability:Math.min(1,ratio('1','0',.65)),passing_efficiency:ratio('3','0',7),targets:n('58'),carries:n('23'),catch_probability:Math.min(1,ratio('53','58',.65)),receiving_efficiency:ratio('42','53',11),rushing_efficiency:ratio('24','23',4.2),passing_touchdowns:n('4'),receiving_td_weight:ratio('43','53',.06),rushing_td_weight:ratio('25','23',.03),interceptions:n('20'),fumble_rate:n('72')/Math.max(1,n('0')+n('23')+n('53'))}};});
 return validateInput({slate_id:String(salary.slate.draft_group_id),season:projection.season,week:projection.week,data_as_of:asOf,expires_at:new Date(Math.min(Date.parse(salary.fetched_at)+86400000,Date.parse(projection.fetched_at)+86400000,Date.parse(salary.slate.start_time))).toISOString(),games,players,coverage:{eligible:players.length,provisional:players.filter(p=>p.identity_status.startsWith('provisional')).length,rejected},sources:{salary:{source:salary.source,snapshot_id:salary.snapshot_id,fetched_at:salary.fetched_at},projections:{source:projection.source,fetched_at:projection.fetched_at},markets:markets.length?'supplied market archive':'unavailable'},assumptions:['Single-source ESPN projections; no fitted ensemble yet.','Provisional identity matches require explicit research opt-in; unavailable players excluded.','Missing sportsbook totals/spreads use 44/0 defaults, not observed betting lines.','Null floor/median/ceiling/stddev inputs are estimated by simulation; snap shares unavailable.','Saved inputs are research archives; check expiry before interpreting as upcoming.']});
}
if(process.argv[1]?.endsWith('build_simulation_input.mjs')){try{
 const {values:v}=parseArgs({options:{salary:{type:'string'},projections:{type:'string'},schedule:{type:'string'},markets:{type:'string'},'allow-provisional':{type:'boolean'},output:{type:'string'}}});
 const read=p=>JSON.parse(p.endsWith('.gz')?gunzipSync(readFileSync(p)):readFileSync(p,'utf8'));
 const input=buildInput(read(v.salary),read(v.projections),read(v.schedule),{allowProvisional:v['allow-provisional'],markets:v.markets?read(v.markets):[]});
 input.sources.archives=Object.fromEntries(['salary','projections','schedule'].map(k=>[k,createHash('sha256').update(readFileSync(v[k])).digest('hex')]));
 const path=v.output||`public/simulation/slates/${input.slate_id}.json`;mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(input));console.log(JSON.stringify({path,coverage:input.coverage,games:input.games.length}));
}catch(e){console.error(e.message);process.exitCode=1;}}
