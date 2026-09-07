#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {parseArgs} from 'node:util';
import {performance} from 'node:perf_hooks';
import {runSlateSimulation} from '../public/simulation/engine.js';
import {DEFAULTS} from '../public/simulation/config.js';
import {persistSimulation} from '../public/simulation/persistence.js';
try{
 const {values:v}=parseArgs({options:{input:{type:'string',default:'public/simulation/slates/151307.json'},count:{type:'string'},mode:{type:'string',default:'quick'},seed:{type:'string',default:'drlocks-v1'},overrides:{type:'string'},lineups:{type:'string'},output:{type:'string',default:'.dfs-simulations/latest.json'},'persist-local':{type:'string'},configuration:{type:'string'}}});
 const read=p=>JSON.parse(readFileSync(p,'utf8')),input=read(v.input),count=v.count?Number(v.count):DEFAULTS.modes[v.mode];
 const startedAt=new Date().toISOString(),start=performance.now();const result=runSlateSimulation(input,count,v.seed,{overrides:v.overrides?read(v.overrides):[],lineups:v.lineups?read(v.lineups):[],configuration:v.configuration?read(v.configuration):{}});
 const benchmark={count,players:input.players.length,games:input.games.length,seconds:(performance.now()-start)/1000,peak_rss_mb:process.resourceUsage().maxRSS/1024,heap_mb:process.memoryUsage().heapUsed/1048576,array_buffers_mb:process.memoryUsage().arrayBuffers/1048576,node:process.version,platform:process.platform,arch:process.arch};
 mkdirSync(dirname(v.output),{recursive:true});writeFileSync(v.output,JSON.stringify(result));
 if(v['persist-local']){const {DatabaseSync}=await import('node:sqlite');const sql=new DatabaseSync(v['persist-local']);sql.exec(readFileSync('migrations/0008_dfs_simulations.sql','utf8'));await persistSimulation({prepare:q=>({bind:(...a)=>({run:()=>sql.prepare(q).run(...a)})})},result,{startedAt,completedAt:new Date().toISOString()});sql.close();}
 console.log(JSON.stringify({output:v.output,run_id:result.run_id,benchmark,lineups:result.lineups.map(l=>({strategy:l.strategy,salary:l.salary,mean:l.mean,p90:l.p90}))},null,2));
}catch(e){console.error(e.stack);process.exitCode=1;}
