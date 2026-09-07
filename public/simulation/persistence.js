// A single statement writes the immutable run; a trigger expands player summaries
// atomically. Iteration arrays never cross this boundary.
export async function persistSimulation(db,result,{startedAt=new Date().toISOString(),completedAt=new Date().toISOString()}={}){
 const json=JSON.stringify(result);
 if(json.length>1500000)throw Error('Summary exceeds persistence size limit');
 await db.prepare('INSERT INTO dfs_simulation_runs (run_id,slate_id,model_version,simulation_count,seed,input_fingerprint,summary_json,started_at,completed_at,data_as_of,configuration_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(result.run_id,result.slate_id,result.model_version,result.simulation_count,result.seed,result.input_fingerprint,json,startedAt,completedAt,result.data_as_of||null,JSON.stringify(result.configuration)).run();
 return result.run_id;
}
