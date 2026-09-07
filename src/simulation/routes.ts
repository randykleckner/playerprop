import {runSlateSimulation} from '../../public/simulation/engine.js';
import {persistSimulation} from '../../public/simulation/persistence.js';
interface SimulationEnv { ASSETS: Fetcher; PLAYERPROP_DB: D1Database; INGEST_TOKEN?: string }
const json=(value:unknown,status=200)=>Response.json(value,{status});
export async function simulationRoute(request:Request,env:SimulationEnv):Promise<Response|null>{
 const path=new URL(request.url).pathname;
 if(!path.startsWith('/api/dfs/simulations')&&!path.startsWith('/api/dfs/stacks/'))return null;
 if(request.method==='GET'){
  if(path==='/api/dfs/simulations/slates')return env.ASSETS.fetch(new Request(new URL('/simulation/slates.json',request.url)));
  const match=path.match(/^\/api\/dfs\/(simulations|stacks)\/([\w-]+)$/);
  if(!match)return json({error:'Not found'},404);
  try{
   const row=await env.PLAYERPROP_DB.prepare(match[1]==='stacks'?'SELECT summary_json FROM dfs_simulation_runs WHERE slate_id=? ORDER BY created_at DESC LIMIT 1':'SELECT summary_json FROM dfs_simulation_runs WHERE run_id=?').bind(match[2]).first<{summary_json:string}>();
   if(!row)return json({error:'No saved simulation'},404);const result=JSON.parse(row.summary_json);return json(match[1]==='stacks'?{run_id:result.run_id,slate_id:result.slate_id,stacks:result.stacks}:result);
  }catch{return json({error:'Simulation persistence unavailable; migration 0008 must be applied before using saved runs. Browser simulation remains available.'},503);}
 }
 if(request.method!=='POST'||!['/api/dfs/simulations/slate','/api/dfs/simulations/lineup'].includes(path))return json({error:'Not found'},404);
 if(!env.INGEST_TOKEN||request.headers.get('Authorization')!==`Bearer ${env.INGEST_TOKEN}`)return json({error:'Authorized research token required'},401);
 const reader=request.body?.getReader();let text='',bytes=0;const decoder=new TextDecoder();
 if(reader){try{while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>20000){await reader.cancel();return json({error:'Request too large'},413);}text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();}catch{return json({error:'Unable to read request'},400);}finally{reader.releaseLock();}}

 try{
  const body=JSON.parse(text);
  if(!/^\d{1,12}$/.test(String(body.slate_id)))throw Error('Invalid slate ID');
  // This endpoint is intentionally a small diagnostic. Production Worker CPU
  // budget is not sufficient for browser/CLI modes or candidate optimization.
  const modes:Record<string,number>={quick:1000,standard:10000,deep:50000};
  if(body.mode!=null&&!Object.hasOwn(modes,body.mode))throw Error('Invalid mode');
  const count=body.simulation_count??(body.mode?modes[body.mode]:10);
  if(!Number.isInteger(count)||count<1||count>100)return json({error:'Worker diagnostic limit is 100 draws. Run Quick/Standard/Deep in Simulation Lab or local CLI.'},422);
  const asset=await env.ASSETS.fetch(new Request(new URL(`/simulation/slates/${body.slate_id}.json`,request.url)));
  if(!asset.ok||!asset.headers.get('content-type')?.includes('json'))return json({error:'Unknown slate'},404);
  const input=await asset.json();
  body.player_ids??=body.lineup;
  if(path.endsWith('/lineup')&&!Array.isArray(body.player_ids))throw Error('player_ids required');
  const startedAt=new Date().toISOString();
  const result=runSlateSimulation(input,count,body.seed??'drlocks-v1',{overrides:body.overrides??[],lineups:body.player_ids?[body.player_ids]:[],includeStacks:true,generateCandidates:false});
  if(body.persist===true){try{await persistSimulation(env.PLAYERPROP_DB,result,{startedAt,completedAt:new Date().toISOString()});}catch{return json({error:'Run computed but not persisted. Check migration 0008 or duplicate immutable run ID.',result},409);}}
  return json(result);
 }catch(error){return json({error:error instanceof Error?error.message:'Invalid simulation request'},400);}
}
