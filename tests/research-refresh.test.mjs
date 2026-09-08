import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,mkdtempSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {refreshResearch,recordFailure} from '../scripts/refresh_dfs_research.mjs';
import {snapshotState,readinessHtml} from '../public/research/readiness.js';
const fixture=JSON.parse(readFileSync('tests/fixtures/lineup-inputs.json'));const now='2026-09-06T20:00:00Z';
// Add synthetic quarterbacks and affordable alternatives to the recorded small pool.
for(const [i,team] of ['DET','CIN'].entries()){
 const source=fixture.salary.records.find(p=>p.team===team);const qb=fixture.salary.records.find(p=>p.position==='QB');
 const id=`test-qb-${i}`;fixture.salary.records.push({...qb,...source,position:'QB',salary:4500,player_name:id,player_id:id,draftable_id:id});
 fixture.projection.records.push({...fixture.projection.records.find(p=>p.position==='QB'),player_id:id,team,projected_points:20-i});
}
for(const team of ['DET','CIN']){const src=fixture.salary.records.find(p=>p.team===team);const id=`test-wr-${team}`;fixture.salary.records.push({...src,team:src.opponent,opponent:team,home_away:src.home_away==='home'?'away':'home',position:'WR',player_id:id,draftable_id:id,player_name:id});fixture.projection.records.push({...fixture.projection.records.find(p=>p.position==='WR'),player_id:id,team:src.opponent,projected_points:12});}
const src=fixture.salary.records.find(p=>p.team==='HOU');fixture.salary.records.push({...src,team:'BUF',opponent:'HOU',home_away:'away',player_id:'test-buf',draftable_id:'test-buf'});fixture.projection.records.push({...fixture.projection.records.find(p=>p.position==='WR'),player_id:'test-buf',team:'BUF'});
for(const r of fixture.salary.records)r.salary=Math.min(r.salary,4500);
test('freshness distinguishes current, aging, stale, failed and lock without resetting source age',()=>{
 const s={generated_at:now,data_as_of:now,expires_at:'2026-09-07T20:00:00Z',lock_time:'2026-09-13T17:00:00Z'};
 assert.equal(snapshotState(s,{},Date.parse(now)).state,'CURRENT');assert.equal(snapshotState(s,{},Date.parse('2026-09-07T09:00Z')).state,'AGING');assert.equal(snapshotState(s,{},Date.parse(s.expires_at)).state,'STALE');
 const failed=snapshotState(s,{error:'HTTP failure'},Date.parse(s.expires_at));assert.equal(failed.state,'FAILED');assert.equal(failed.freshness,'STALE');assert.equal(snapshotState(s,{},Date.parse(s.lock_time)).locked,true);
});
test('shared refresh publishes both artifacts, skips unchanged builds and preserves last good on failure',()=>{const root=mkdtempSync(join(tmpdir(),'refresh-'));try{
 const f=structuredClone(fixture);const first=refreshResearch(f.salary,f.projection,f.schedule,{root,now});
 const sim=JSON.parse(readFileSync(join(root,first.snapshot.simulation_path.slice(1))));const daily=JSON.parse(readFileSync(join(root,first.snapshot.lineups_path.slice(1))));
 assert.equal(sim.slate_id,String(daily.slate.draft_group_id));assert.equal(daily.lineups.length,6);assert.equal(sim.players[0].statistical_projection,null);assert.equal(sim.players[0].espn_projection,sim.players[0].final_projection);
 assert.equal(refreshResearch(f.salary,f.projection,f.schedule,{root,now:'2026-09-06T21:00:00Z'}).unchanged,true);
 recordFailure(root,'test failure',now);const saved=JSON.parse(readFileSync(join(root,'research/latest.json')));assert.equal(saved.snapshot.bundle,first.snapshot.bundle);assert.equal(saved.attempt.error,'test failure');
 assert.throws(()=>refreshResearch(f.salary,f.projection,f.schedule,{root,now:'2026-09-09T00:00:00Z'}),/stale/);
 assert.equal(JSON.parse(readFileSync(join(root,'research/latest.json'))).snapshot.bundle,first.snapshot.bundle);
 }finally{rmSync(root,{recursive:true,force:true});}});
test('wrong slate format and future market captures fail before publication',()=>{const root=mkdtempSync(join(tmpdir(),'refresh-'));try{const f=structuredClone(fixture);assert.throws(()=>refreshResearch(f.salary,f.projection,f.schedule,{root,now,markets:[{game_id:['HOU','BUF'].sort().join('-'),total:44,home_spread:0}],marketFetchedAt:'2026-09-07T00:00:00Z'}),/stale or invalid/);f.salary.slate.format='Showdown';assert.throws(()=>refreshResearch(f.salary,f.projection,f.schedule,{root,now}),/Classic/);}finally{rmSync(root,{recursive:true,force:true});}});
test('readiness output escapes failure text',()=>{assert.ok(!readinessHtml({snapshot:{readiness:[]},attempt:{error:'<script>bad</script>'}}).includes('<script>'));});
