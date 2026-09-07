#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
const runs=[];mkdirSync('.dfs-simulations',{recursive:true});
for(const count of [1000,10000,50000]){
 const child=spawnSync(process.execPath,['scripts/simulate_dfs.mjs','--count',String(count),'--output',`.dfs-simulations/benchmark-summary-${count}.json`],{encoding:'utf8'});
 if(child.status!==0)throw Error(child.stderr);const run=JSON.parse(child.stdout);runs.push(run);console.log(JSON.stringify(run.benchmark));
}
writeFileSync('docs/simulation-benchmarks.json',JSON.stringify({measured_at:new Date().toISOString(),method:'One cold Node process per count, full 329-player/12-game slate, 120 stacks and five candidates; elapsed simulation and aggregation excludes disk writes. RSS is process-wide peak, not Worker isolate memory.',runs},null,2));
