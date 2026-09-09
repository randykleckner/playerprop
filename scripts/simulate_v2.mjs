import {readFileSync} from 'node:fs';
import {simulateGameV2} from '../src/simulation/v2/engine.ts';
const game=JSON.parse(readFileSync(new URL('../tests/fixtures/v2/matchup.json',import.meta.url)));
console.log(JSON.stringify(simulateGameV2(game,{seed:process.argv.find(a=>a.startsWith('--seed='))?.slice(7)||'v2-example',debugTrace:process.argv.includes('--trace')}),null,2));
