import {build} from 'esbuild';import {readFileSync,writeFileSync} from 'node:fs';
await build({entryPoints:['src/simulation/v2/browser-worker.ts'],outfile:'public/drive-lab/worker.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true});
const manifest=JSON.parse(readFileSync('public/research/latest.json'));const input=JSON.parse(readFileSync('public'+manifest.snapshot.simulation_path));const profile=JSON.parse(readFileSync('public/drive-lab/live-empirical.json'));
writeFileSync('public/drive-lab/examples.json',JSON.stringify({capturedAt:input.data_as_of,source:manifest.snapshot.simulation_path,teamInputSeasons:profile.trainingSeasons,liveAsOf:profile.as_of,games:input.games.filter(g=>profile.teamInputs[g.home]&&profile.teamInputs[g.away]).map(g=>({gameId:g.game_id,homeTeam:g.home,awayTeam:g.away,homeTeamInputs:profile.teamInputs[g.home],awayTeamInputs:profile.teamInputs[g.away],inputsTimestamp:input.data_as_of,market:g}))})+'\n');
writeFileSync('public/drive-lab/evaluation.json',readFileSync('docs/simulation-v2-b-evaluation.json'));

writeFileSync('public/drive-lab/personnel-config.json',readFileSync('config/v2-personnel.json'));
