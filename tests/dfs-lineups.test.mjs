import {avatar,avatarGroup,icon,stackPreview,positionBadge} from '../public/ui/components.js';
import {newsIcon} from '../public/newsroom/shared.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { optimize, buildLineups } from '../scripts/dfs-js/optimizer.mjs';
import { preparePool } from '../scripts/dfs-js/pool.mjs';
const positions = ['QB','QB','RB','RB','RB','RB','WR','WR','WR','WR','WR','TE','TE','DST','DST'];
const pool = positions.map((position,i) => ({ id:String(i), position, team:i%2?'A':'B', opponent:i%2?'B':'A', player_name:`Player ${i}`, salary:3000+(i%5)*1000, points:9+(i*7)%15, td_points:2+(i%4), receptions:i%6, status:'None' }));
function legal(rows, cap=50000) {
  const count = p => rows.filter(r=>r.position===p).length;
  return rows.length===9 && new Set(rows.map(p=>p.id)).size===9 && new Set(rows.map(p=>p.team)).size>=2 && rows.reduce((s,p)=>s+p.salary,0)<=cap && count('QB')===1 && count('DST')===1 && count('RB')>=2 && count('WR')>=3 && count('TE')>=1;
}
function brute(players, options={}) {
  let best=-Infinity;
  for(let bits=0;bits<2**players.length;bits++) {
    const rows=players.filter((_,i)=>bits&(1<<i));
    if(legal(rows,options.cap) && (options.required||[]).every(id=>rows.some(p=>p.id===id)) && !(options.excluded||[]).some(id=>rows.some(p=>p.id===id))) best=Math.max(best,rows.reduce((s,p)=>s+(options.score|| (p=>p.points))(p),0));
  }
  return best;
}
test('exact optimizer agrees with exhaustive enumeration, including cap and FLEX',()=>{
  for(const options of [{},{cap:41000},{required:['0','6'],excluded:['2'],score:p=>p.points-.5*p.td_points}]) {
    const result=optimize(pool,options); assert.ok(legal(result.players,options.cap)); assert.equal(result.objective,brute(pool,options));
    assert.deepEqual(result.players.map(p=>p.slot),['QB','RB','RB','WR','WR','WR','TE','FLEX','DST']);
  }
});
test('infeasible, duplicate and invalid forced players are handled',()=>{
  assert.equal(optimize(pool,{cap:1}),null); assert.equal(optimize(pool.filter(p=>p.position!=='TE')),null);
  assert.throws(()=>optimize([...pool,pool[0]]),/Duplicate/);assert.throws(()=>optimize(pool,{required:['missing']}),/required/);
});
test('two-team restriction remains exact when the unconstrained optimum is one team',()=>{
  const altered=pool.map((p,i)=>({...p,team:i===14?'B':'A',points:i===14?-20:p.points}));
  const result=optimize(altered);assert.equal(result.objective,brute(altered));assert.ok(result.players.some(p=>p.id==='14'));
});
test('six distinct strategies have valid budgets, clean floor status and fixed stacks',()=>{
  const strategyPool=[...pool,{...pool[0],id:"qb3",team:"C",opponent:"B"},{...pool[6],id:"wrC",team:"C",opponent:"B"},{...pool[14],id:"dstD",team:"D",opponent:"E"}];
  strategyPool[2]={...strategyPool[2],status:"Q"};
  const results=buildLineups(strategyPool);assert.equal(results.length,6);assert.equal(new Set(results.map(l=>l.players.map(p=>p.id).sort().join('|'))).size,6);
  for(const l of results){if(l.tier==="floor")assert.ok(l.players.every(p=>p.status!=="Q"));assert.ok(legal(l.players));assert.ok(l.points<=results[0].points);for(const id of l.required)assert.ok(l.players.some(p=>p.id===id));}
});
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/lineup-inputs.json',import.meta.url)));
const options={allowProvisional:true,now:'2026-09-06T15:00:00Z'};
test('recorded joins default to verified only and explicitly allow provisional research',()=>{
  const {salary,projection,schedule}=structuredClone(fixtures);
  assert.equal(preparePool(salary,projection,schedule,{...options,allowProvisional:false}).pool.filter(p=>p.provisional).length,0);
  assert.ok(preparePool(salary,projection,schedule,options).pool.some(p=>p.provisional));
});
test('week, stale, future and locked inputs fail closed',()=>{
  const {salary,projection,schedule}=structuredClone(fixtures);
  assert.throws(()=>preparePool(salary,{...projection,week:2},schedule,options),/week mismatch/);
  for(const now of ['2026-09-08T15:00:00Z','2026-09-06T12:00:00Z','2026-09-13T17:00:00Z'])assert.throws(()=>preparePool(salary,projection,schedule,{...options,now}));
});
test('unavailable, conflicting and wrong-schedule players are excluded',()=>{
  const {salary,projection,schedule}=structuredClone(fixtures);
  salary.records[0].is_disabled=true;salary.records[1].opponent='XXX';salary.records[2].mapping_candidates=['a','b'];
  const {pool:eligible,rejected}=preparePool(salary,projection,schedule,options);
  for(const s of salary.records.slice(0,3))assert.ok(!eligible.some(p=>p.draftable_id===s.draftable_id));
  assert.ok(rejected.disabled_or_unavailable);assert.ok(rejected.schedule_mismatch);
});
async function render(data,now,failed=false){
  const elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,{hidden:false,innerHTML:'',textContent:'',setAttribute(){}});return elements.get(id)};
  class Clock extends Date{static now(){return Date.parse(now)}}
  const context=vm.createContext({document:{getElementById:get,body:{dataset:{}}},localStorage:{getItem(){return null}},Date:Clock,Intl,console,newsIcon,avatar,avatarGroup,icon,stackPreview,positionBadge,loadResearch:async()=>{throw Error('Legacy fallback test')},setInterval(){},fetch:async()=>({ok:!failed,json:async()=>data})});
  vm.runInContext(readFileSync(new URL('../public/lineups/lineups.js',import.meta.url),'utf8').replace(/^import .*\n/gm,''),context);
  await new Promise(resolve=>setImmediate(resolve));return get;
}
const saved=JSON.parse(readFileSync(new URL('../public/lineups/latest.json',import.meta.url)));
test('frontend renders 1/2/3 cards and escapes source-provided names',async()=>{
  const data=structuredClone(saved);data.lineups[0].players[0].player_name='<img onerror=alert(1)>';
  const get=await render(data,'2026-09-06T15:00:00Z');
  for(const [tier,count]of [['projection',1],['floor',2],['ceiling',3]])assert.equal((get(tier+'-lineups').innerHTML.match(/<article/g)||[]).length,count);
  assert.match(get('projection-lineups').innerHTML,/&lt;img/);assert.equal(get('lineup-content').hidden,false);
});
test('frontend clearly flags stale builds and hides locked or failed data',async()=>{
  const stale=await render(saved,'2026-09-08T15:00:00Z');assert.match(stale('lineup-status').innerHTML,/STALE SNAPSHOT/);
  const locked=await render(saved,'2026-09-13T17:00:00Z');assert.equal(locked('lineup-content').hidden,true);assert.match(locked('lineup-status').textContent,/locked/);
  const failed=await render(saved,'2026-09-06T15:00:00Z',true);assert.equal(failed('lineup-empty').hidden,false);assert.equal(failed('lineup-content').hidden,true);
});
