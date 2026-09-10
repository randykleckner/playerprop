import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {renderPersonnel} from '../public/drive-lab/personnel.js';
import {simulateGameV2} from '../src/simulation/v2/engine.ts';
const game=JSON.parse(readFileSync(new URL('./fixtures/v2/matchup.json',import.meta.url)));
test('personnel output has vintage, partial evidence and safely escaped names',()=>{
 const unit={rating:80,complete:false,confidence:'low',scale:'0–99',missing:['No starter'],players:[{role:'LT',name:'<script>',rating:80,mapping_status:'strongly_corroborated',starter_confidence:'depth',roster_status:'ACT',attributes:{passBlock:80},depth_at:'2026-09-09',roster_at:'2026-09-08'}]};
 const data={coverage:{total:1,tiers:{verified:0}},units:{BUF:{pass_protection:unit},HOU:{}},personnel_at:'2026-09-09',roster_at:'2026-09-08',depth_at:'2026-09-09',source_status:'ok',ratings_url:'https://www.ea.com/games/madden-nfl/ratings'};
 const html=renderPersonnel(data,{awayTeam:'BUF',homeTeam:'HOU'});assert.match(html,/Comparison incomplete/);assert.match(html,/2026-09-08/);assert.match(html,/&lt;script&gt;/);assert.match(html,/partial/);assert.match(renderPersonnel(null,game),/simulations remain available/);
});
test('Madden diagnostics cannot alter the seeded engine',()=>{
 const options={seed:'personnel-isolation'};const before=simulateGameV2(game,options);const after=simulateGameV2({...game,personnel:{pass_rush:99,pass_protection:0}},options);const {runId:a,...outcomeA}=before,{runId:b,...outcomeB}=after;assert.deepEqual(outcomeB,outcomeA);
 const source=readFileSync(new URL('../public/drive-lab/lab.js',import.meta.url),'utf8');const request=source.split('worker.postMessage(')[1].split(');')[0];assert.match(request,/isFantasy/); // V2.0-C explicitly gates personnel to the new variants.
});
test('live weighted profile is accepted and repeatable',()=>{
 const profile=JSON.parse(readFileSync(new URL('../public/drive-lab/live-empirical.json',import.meta.url)));const options={seed:'live-profile',empirical:profile};const result=simulateGameV2(game,options);assert.equal(result.modelVersion,'V2.0-B-live-recency');assert.deepEqual(result,simulateGameV2(game,options));
});
