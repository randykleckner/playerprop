#!/usr/bin/env node
// Audit existing draws without changing simulation methodology.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runSlateSimulation,validateLineup,dkScore} from '../public/simulation/engine.js';
import {summarize} from '../public/simulation/statistics.js';
const [inputPath,baselinePath]=process.argv.slice(2);
if(!inputPath||!baselinePath)throw Error('Usage: node scripts/audit_dfs_simulation.mjs INPUT BASELINE');
const input=JSON.parse(readFileSync(inputPath)),baseline=JSON.parse(readFileSync(baselinePath));
const samples=new Map(input.players.map(p=>[p.player_id,[]]));let gameDraws=0;
const repeated=runSlateSimulation(input,baseline.simulation_count,baseline.seed,{
 onDraw({teams,players}){
  gameDraws++;
  for(const t of Object.values(teams)){
   assert.equal(t.passAttempts+t.rushAttempts,t.plays);
   assert.equal(t.carries,t.rushAttempts);
   assert.ok(t.targets<=t.passAttempts);
   assert.ok(t.receptions<=t.targets);
   assert.equal(t.passingYards,t.receivingYards);
   assert.equal(t.touchdowns,t.passTds+t.rushTds);
   assert.ok(Number.isInteger(t.touchdowns));
  }
  for(const [id,s] of players){
   const p=input.players.find(p=>p.player_id===id);
   assert.ok(s.receiving_tds<=s.receptions&&s.rushing_tds<=s.carries);
   assert.ok(Number.isInteger(s.receiving_tds)&&Number.isInteger(s.rushing_tds)&&Number.isInteger(s.passing_tds));
   samples.get(id).push(Math.fround(p.active===false?0:dkScore(s,p.position)));
  }
 }
});
assert.deepEqual(repeated,baseline,'Identical input, seed and settings must reproduce the result');
for(const p of repeated.players){
 const draws=samples.get(p.player_id);assert.equal(draws.length,baseline.simulation_count);
 const summary=summarize(draws);
 for(const k of ['mean','median','p25','p75','p90','p95'])assert.equal(p[k],summary[k]);
}
for(const l of repeated.lineups){
 validateLineup(l.player_ids,repeated.players);
 const draws=Array.from({length:baseline.simulation_count},(_,i)=>l.player_ids.reduce((total,id)=>total+samples.get(id)[i],0));
 const summary=summarize(draws);
 // Lineup accumulation uses Float32 storage; independently summed doubles differ slightly.
 for(const k of ['mean','median','p25','p75','p90','p95'])assert.ok(Math.abs(l[k]-summary[k])<1e-4, `Lineup ${k} disagrees with draws`);
}
console.log(JSON.stringify({run_id:repeated.run_id,model:repeated.model_version,seed:repeated.seed,draws_per_game:repeated.simulation_count,game_draws_checked:gameDraws,players:repeated.players.length,stacks:repeated.stacks.length,lineups:repeated.lineups.length,reproducible:true,allocation_invariants:true,player_and_lineup_quantiles_verified:true},null,2));
