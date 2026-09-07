import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync,mkdtempSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {fingerprint} from '../../public/simulation/random.js';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const date=value=>{const d=Date.parse(value);if(!Number.isFinite(d))throw Error('Invalid capture timestamp');return d;};
export function freezeResearch(input,result,{directory='.dfs-research/frozen',now=new Date().toISOString(),rawFiles=[]}={}){
 const lock=Math.min(...input.games.map(g=>date(g.start_time)));
 if(date(now)>=lock)throw Error('Cannot freeze a pregame prediction after slate lock');
 if(!input.expires_at||date(now)>date(input.expires_at))throw Error('Refresh expired inputs before freezing predictions');
 if(result.input_fingerprint!==fingerprint(input)||result.slate_id!==input.slate_id||result.overrides.length)throw Error('Freeze an unmodified baseline generated from this exact input');
 function checkTimes(object){for(const [key,value] of Object.entries(object||{})){if(['fetched_at','captured_at','received_at'].includes(key)&&typeof value==='string'&&date(value)>date(now))throw Error('Source timestamp is after freeze time');if(value&&typeof value==='object')checkTimes(value);}}
 checkTimes(input.sources);if(date(input.data_as_of)>date(now))throw Error('Input is from the future');
 const files={'input.json':JSON.stringify(input),'prediction.json':JSON.stringify(result)};
 rawFiles.forEach((path,i)=>files[`source-${i}.bin`]=readFileSync(path));
 const hashes=Object.fromEntries(Object.entries(files).map(([name,bytes])=>[name,sha(bytes)]));
 const id='pregame-'+sha(JSON.stringify({hashes,now})).slice(0,32);mkdirSync(directory,{recursive:true});const path=join(directory,id);
 if(existsSync(path))return {archive_id:id,path,reused:true};
 const staging=mkdtempSync(join(directory,'.staging-'));
 try{for(const [name,bytes] of Object.entries(files))writeFileSync(join(staging,name),bytes,{flag:'wx'});
 const manifest={version:1,archive_id:id,frozen_at:now,lock_time:new Date(lock).toISOString(),slate_id:input.slate_id,run_id:result.run_id,model_version:result.model_version,files:hashes,source_files:rawFiles.map((path,i)=>({archive_name:`source-${i}.bin`,original_path:path}))};writeFileSync(join(staging,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});renameSync(staging,path);return {archive_id:id,path,manifest};}catch(e){rmSync(staging,{recursive:true,force:true});throw e;}
}
export function readFrozen(path){const manifest=JSON.parse(readFileSync(join(path,'manifest.json'),'utf8'));for(const [name,digest] of Object.entries(manifest.files)){if(!/^(input|prediction)\.json$|^source-\d+\.bin$/.test(name))throw Error('Invalid archive filename');if(sha(readFileSync(join(path,name)))!==digest)throw Error('Archive integrity failure');}const input=JSON.parse(readFileSync(join(path,'input.json'))),result=JSON.parse(readFileSync(join(path,'prediction.json')));if(fingerprint(input)!==result.input_fingerprint||result.run_id!==manifest.run_id)throw Error('Archive input/prediction mismatch');return {manifest,input,result};}
export function heldoutCases(archive,actuals){
 const {input,result,manifest}=archive,seen=new Set(),cases=[],excluded=[];
 for(const row of actuals){const key=row.player_id+'|'+row.game_id;if(seen.has(key))throw Error('Duplicate actual observation');seen.add(key);const p=input.players.find(p=>p.player_id===row.player_id),g=input.games.find(g=>g.game_id===row.game_id);if(!p||!g||p.game_id!==g.game_id)throw Error('Actual identity/game not in frozen input');
 if(row.status!=='final'||!Number.isFinite(row.actual_points)||date(row.completed_at)<=date(g.start_time))throw Error('Only complete final actuals are eligible');
 if(p.identity_status?.startsWith('provisional')||p.identity_review?.status==='review_required'){excluded.push({player_id:p.player_id,reason:'identity_not_verified'});continue;}
 if(p.position==='DST'){excluded.push({player_id:p.player_id,reason:'dst_placeholder'});continue;}
 const prediction=result.players.find(x=>x.player_id===p.player_id);cases.push({player_id:p.player_id,game_id:g.game_id,position:p.position,game_date:g.start_time,pregame_as_of:manifest.frozen_at,mean:prediction.mean,p10:prediction.p10,p90:prediction.p90,stddev:prediction.stddev,actual:row.actual_points});
 }return {cases,excluded};
}
