import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {runFantasyBulk,compareFantasyRuns} from '../src/simulation/v2/player-bulk.ts';
const load=p=>JSON.parse(readFileSync(p));const examples=load('public/drive-lab/examples.json');const game=examples.games.find(g=>g.awayTeam==='BUF'&&g.homeTeam==='HOU')||examples.games[0];
const common={seed:'v2-c-review',empirical:load('public/drive-lab/live-empirical.json'),players:load('public/drive-lab/players.json'),personnel:load('public/drive-lab/personnel.json'),config:load('config/v2-personnel.json')};
const report={game,measurements:[],runs:{},comparison:null};
for(const count of [1000,10000])for(const engine of ['base','personnel']){
 const before=process.memoryUsage();const run=runFantasyBulk(game,{...common,engine,influence:engine==='base'?0:common.config.levels.low,debugTrace:false},count);const memory=process.memoryUsage();
 report.measurements.push({engine,count,runtimeMs:run.runtimeMs,simulationsPerSecond:count*1000/run.runtimeMs,trackedPlayers:run.trackedPlayers,drawStorageBytes:run.drawStorageBytes,rssBytes:memory.rss,heapUsedBytes:memory.heapUsed,heapDeltaBytes:memory.heapUsed-before.heapUsed});
 if(count===10000)report.runs[engine]=run;console.log(JSON.stringify(report.measurements.at(-1)));
}
report.comparison=compareFantasyRuns(report.runs.base,report.runs.personnel);mkdirSync('.dfs-calibration/v2-c',{recursive:true});writeFileSync('.dfs-calibration/v2-c/benchmark.json',JSON.stringify(report));
writeFileSync('docs/simulation-v2-c-benchmark.json',JSON.stringify({game,measurements:report.measurements,metadata:report.runs.personnel.metadata,comparison:report.comparison,sample:report.runs.personnel.example,players:report.runs.personnel.players.filter(p=>p.player.detailed),basePlayers:report.runs.base.players.filter(p=>p.player.detailed),teams:{base:report.runs.base.teams,personnel:report.runs.personnel.teams},scores:{base:{home:report.runs.base.home.mean,away:report.runs.base.away.mean},personnel:{home:report.runs.personnel.home.mean,away:report.runs.personnel.away.mean}}},null,2));
