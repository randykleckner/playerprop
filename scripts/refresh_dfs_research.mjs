#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync,renameSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import {buildInput} from './build_simulation_input.mjs';
import {preparePool} from './dfs-js/pool.mjs';
import {buildLineups} from './dfs-js/optimizer.mjs';
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function atomicJson(path,data){mkdirSync(dirname(path),{recursive:true});const tmp=path+'.tmp';writeFileSync(tmp,JSON.stringify(data,null,2)+'\n');renameSync(tmp,path);}
export function recordFailure(root,error,now=new Date().toISOString()){
 const path=join(root,'research/latest.json');const previous=existsSync(path)?JSON.parse(readFileSync(path)): {version:1,snapshot:null};
 atomicJson(path,{...previous,attempt:{attempted_at:now,error:String(error).slice(0,300)}});
}
export function refreshResearch(salary,projection,schedule,{root='public',now=new Date().toISOString(),markets=[],marketFetchedAt=null}={}){
 // Use wall-clock age here; buildInput also validates at source time for offline audits.
 const {pool,rejected}=preparePool(salary,projection,schedule,{allowProvisional:true,now});
 markets=markets.filter(m=>pool.some(p=>[p.team,p.opponent].sort().join('-')===m.game_id));
 const input=buildInput(salary,projection,schedule,{allowProvisional:true,markets});
 if(markets.length&&(!marketFetchedAt||!Number.isFinite(Date.parse(marketFetchedAt))||Date.parse(marketFetchedAt)>Date.parse(now)||Date.parse(now)-Date.parse(marketFetchedAt)>86400000))throw Error('Game market capture is stale or invalid');
 if(!pool.length)throw Error('No eligible research pool');
 const sourceKey=sha({salary,projection,schedule,markets,marketFetchedAt});
 const pointer=join(root,'research/latest.json'),previous=existsSync(pointer)?JSON.parse(readFileSync(pointer)):null;
 if(previous?.snapshot?.source_key===sourceKey){const result={...previous,attempt:{attempted_at:now,error:null}};atomicJson(pointer,result);return {...result,unchanged:true};}
 const contextPath=previous?.snapshot?.simulation_path?join(root,previous.snapshot.simulation_path.slice(1)):join(root,`simulation/slates/${input.slate_id}.json`);
 if(existsSync(contextPath)){
  const context=JSON.parse(readFileSync(contextPath));
  for(const p of input.players){const prior=context.players?.find(x=>x.player_id===p.player_id&&x.draftable_id===p.draftable_id&&x.team===p.team&&x.position===p.position);if(prior){p.historical_usage=prior.historical_usage;p.identity_review=prior.identity_review;if(prior.identity_review?.status==='review_required')p.quality_flags.push('identity_evidence_review_required');}}
  input.sources.historical_context=context.sources?.historical_context||context.sources?.research_archives||null;
 }
 input.generated_at=now;
 input.sources.markets={source:'ESPN scoreboard sportsbook quotes',fetched_at:marketFetchedAt,game_count:markets.length};
 // ESPN is a projection source, not an independently trained NFLverse estimate.
 for(const p of input.players){p.espn_projection=p.final_projection;p.statistical_projection=null;p.projection_sources={espn:p.final_projection,market:null,nflverse:null};}
 input.assumptions=input.assumptions.filter(x=>!x.startsWith('Missing sportsbook totals'));
 input.assumptions.push('Uncovered game markets use documented 44/0 defaults. Independent NFLverse and player-prop projections are unavailable.');
 const lineups=buildLineups(pool);if(lineups.length!==6)throw Error('Six legal research builds required; keeping previous snapshot');
 const identities=salary.records.filter(r=>r.position!=='DST').map(r=>({draftable_id:r.draftable_id,external_ids:r.external_ids,player_name:r.player_name,team:r.team,position:r.position,status:r.identity_status,confidence:r.player_id?'verified':r.identity_status==='name_team_position_candidate'?'provisional':r.identity_status?.includes('ambiguous')?'ambiguous':'unresolved',canonical_player_id:r.player_id,candidates:r.mapping_candidates||[],review_required:!r.player_id,evidence_required:!r.player_id?'Verify exact provider ID against canonical identity; name match alone is insufficient.':null}));
 const verified=pool.filter(p=>p.position!=='DST'&&!p.provisional).length,provisional=pool.filter(p=>p.provisional).length;
 const counts=Object.fromEntries(['verified','provisional','ambiguous','unresolved'].map(k=>[k,identities.filter(r=>r.confidence===k).length]));
 const readiness=[
  {label:'DK salaries',detail:`${salary.records.length} normalized entities in Classic draft group ${salary.slate.draft_group_id}; ${pool.length} eligible research entries`,fetched_at:salary.fetched_at},
  {label:'Player mapping',detail:`Eligible offense: ${verified} verified, ${provisional} provisional; ${pool.filter(p=>p.position==='DST').length} team defenses. Full offensive pool: ${counts.unresolved} unresolved, ${counts.ambiguous} ambiguous`},
  {label:'NFLverse stats',detail:`${input.players.filter(p=>p.historical_usage).length} prior-season snap contexts retained; independent current-season statistical forecast not connected`},
  {label:'Sportsbook game lines',detail:`${markets.length}/${input.games.length} games`,fetched_at:marketFetchedAt},
  {label:'Sportsbook player props',detail:'Not connected to this snapshot; existing prop board is separate'},
  {label:'Injury data',detail:'DK salary status only; current injury/practice feed not connected',fetched_at:salary.fetched_at},
  {label:'Projections',detail:`ESPN ${pool.length}/${pool.length}; market player forecast 0; independent NFLverse forecast 0`,fetched_at:projection.fetched_at},
  {label:'Simulation snapshot',detail:`${input.players.length} players, ${input.games.length} games; simulations run on demand`,fetched_at:now}
 ];
 const daily={version:1,model:'research-lineups-v1',generated_at:now,expires_at:input.expires_at,season:projection.season,week:projection.week,slate:salary.slate,source:'espn',scoring_basis:projection.scoring_basis,source_count:1,sources:{salary:{id:salary.snapshot_id,fetched_at:salary.fetched_at},projections:{fetched_at:projection.fetched_at},schedule:{source:'ESPN scoreboard',sha256:sha(schedule)}},coverage:{salary_players:salary.records.length,eligible_players:pool.length,provisional_players:provisional,rejected},research_only:true,provisional_enabled:true,lineups};
 const bundle=sha({input,daily,identities}).slice(0,24),base=`/research/bundles/${bundle}`;
 const files={'simulation.json':input,'lineups.json':daily,'identities.json':{slate_id:input.slate_id,generated_at:now,counts,eligible:{verified,provisional,dst:pool.filter(p=>p.position==='DST').length},exclusions:rejected,rows:identities}};
 for(const [file,data] of Object.entries(files)){const path=join(root,base.slice(1),file);mkdirSync(dirname(path),{recursive:true});if(!existsSync(path))writeFileSync(path,JSON.stringify(data)+'\n',{flag:'wx'});else if(readFileSync(path,'utf8')!==JSON.stringify(data)+'\n')throw Error('Immutable bundle conflict');}
 const snapshot={bundle,source_key:sourceKey,slate_id:input.slate_id,season:projection.season,week:projection.week,lock_time:salary.slate.start_time,generated_at:now,data_as_of:[salary.fetched_at,projection.fetched_at].sort()[0],expires_at:input.expires_at,simulation_path:base+'/simulation.json',lineups_path:base+'/lineups.json',identities_path:base+'/identities.json',readiness};
 const result={version:1,snapshot,attempt:{attempted_at:now,error:null}};
 // Both clients resolve the same pointer; it is published only after every artifact validates.
 atomicJson(pointer,result);return result;
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
 let root='public';try{const {values:v}=parseArgs({options:{salary:{type:'string'},projections:{type:'string'},schedule:{type:'string'},markets:{type:'string'},'market-fetched-at':{type:'string'},root:{type:'string',default:'public'},failure:{type:'string'}}});root=v.root;if(v.failure){recordFailure(root,v.failure);process.exitCode=1;}else{const read=p=>JSON.parse(p.endsWith('.gz')?gunzipSync(readFileSync(p)):readFileSync(p));console.log(JSON.stringify(refreshResearch(read(v.salary),read(v.projections),read(v.schedule),{root,markets:v.markets?read(v.markets):[],marketFetchedAt:v['market-fetched-at']}),null,2));}}catch(e){recordFailure(root,e.message);console.error(e.message);process.exitCode=1;}
}
