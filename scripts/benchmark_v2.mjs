import {readFileSync,writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {simulateGameV2} from '../src/simulation/v2/engine.ts';
import {summarize} from '../public/simulation/statistics.js';
const game=JSON.parse(readFileSync(new URL('../tests/fixtures/v2/matchup.json',import.meta.url)));
const output={modelVersion:'V2.0-A',game,benchmarks:[]};
for(const count of [100,1000,10000]){
 const home=[],away=[],totals=[],diffs=[];const sum={plays:0,possessions:0,passAttempts:0,rushAttempts:0,netYards:0,turnovers:0,touchdowns:0,driveSeconds:0};let peakHeap=process.memoryUsage().heapUsed,aborted=0;
 const start=performance.now();
 for(let i=0;i<count;i++){
  const r=simulateGameV2(game,{seed:`v2-benchmark:${i}`});if(!r.completed)aborted++;
  home.push(r.finalState.scoreHome);away.push(r.finalState.scoreAway);totals.push(r.totalPoints);diffs.push(r.homeScoreDifferential);
  for(const t of Object.values(r.teams)){sum.plays+=t.offensivePlays;sum.possessions+=t.possessions;sum.passAttempts+=t.passAttempts;sum.rushAttempts+=t.rushingAttempts;sum.netYards+=t.passingYards+t.rushingYards-t.sackYards;sum.turnovers+=t.turnovers;sum.touchdowns+=t.touchdowns;}
  sum.driveSeconds+=r.pace.averageDriveSeconds;if(i%100===0)peakHeap=Math.max(peakHeap,process.memoryUsage().heapUsed);
 }
 const runtimeMs=performance.now()-start,mean=values=>values.reduce((a,b)=>a+b,0)/values.length;
 const metrics={meanHomeScore:mean(home),meanAwayScore:mean(away),meanTotal:mean(totals),medianTotal:summarize(totals).median,totalStddev:summarize(totals).stddev,homeStddev:summarize(home).stddev,awayStddev:summarize(away).stddev,meanHomeDifferential:mean(diffs),playsPerTeam:sum.plays/count/2,possessionsPerTeam:sum.possessions/count/2,passAttemptsPerTeam:sum.passAttempts/count/2,rushAttemptsPerTeam:sum.rushAttempts/count/2,netYardsPerTeam:sum.netYards/count/2,yardsPerPlay:sum.netYards/sum.plays,turnoversPerGame:sum.turnovers/count,touchdownsPerGame:sum.touchdowns/count,averageDriveSeconds:sum.driveSeconds/count};
 const flags=[];for(const [key,min,max]of [['playsPerTeam',45,80],['possessionsPerTeam',8,15],['meanTotal',25,65],['turnoversPerGame',.5,5],['yardsPerPlay',3.5,7],['passAttemptsPerTeam',20,48],['rushAttemptsPerTeam',15,40]])if(metrics[key]<min||metrics[key]>max)flags.push(`${key} outside exploratory ${min}–${max} range`);
 output.benchmarks.push({count,runtimeMs,simulationsPerSecond:count*1000/runtimeMs,sampledPeakHeapMiB:peakHeap/1048576,processPeakRssMiB:process.resourceUsage().maxRSS/1024,aborted,metrics,flags,marketComparison:{total:game.market.total,totalDifference:metrics.meanTotal-game.market.total,homeSpread:game.market.home_spread,expectedHomeDifferential:-game.market.home_spread,differentialDifference:metrics.meanHomeDifferential+game.market.home_spread}});
}
writeFileSync(new URL('../docs/simulation-v2-benchmark.json',import.meta.url),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output.benchmarks,null,2));
