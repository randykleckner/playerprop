import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {simulateFantasyGame,creditPlay,validatePlayers} from '../src/simulation/v2/player-engine.ts';
import {simulateGameV2,openingState,applyOutcome,DEFAULT_TEAM,DEFAULT_RULES} from '../src/simulation/v2/engine.ts';
import {adjustments,validateInfluence,resolvePersonnel,shapeWeight,reshape} from '../src/simulation/v2/personnel-influence.ts';
import {runFantasyBulk,compareFantasyRuns,playerOutcome} from '../src/simulation/v2/player-bulk.ts';
import {emptyPlayerStats} from '../src/simulation/v2/player-types.ts';
import {random} from '../public/simulation/random.js';import {dkScore} from '../public/simulation/engine.js';
import {renderFantasy} from '../public/drive-lab/player-views.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/v2-c/input.json',import.meta.url))),config=JSON.parse(readFileSync(new URL('../config/v2-personnel.json',import.meta.url))),game=fixture.game;
const opts=(extra={})=>({seed:'control',engine:'base',influence:0,empirical:fixture.empirical,players:fixture.players,personnel:fixture.personnel,config,...extra});
const totals=(rows,k)=>rows.reduce((n,p)=>n+p.stats[k],0);
test('zero-personnel control preserves previous empirical play results over 50 seeds',()=>{
 for(let i=0;i<50;i++){const o=opts({seed:`equivalence:${i}`}),a=simulateGameV2(game,{seed:o.seed,empirical:o.empirical}),b=simulateFantasyGame(game,o);for(const k of ['teams','finalState','totalPoints','drives','pace'])assert.deepEqual(b[k],a[k]);}
});
test('deterministic player boxes, metadata and traces',()=>{const o=opts({engine:'personnel',influence:.5,debugTrace:true});assert.deepEqual(simulateFantasyGame(game,o),simulateFantasyGame(game,o));const r=simulateFantasyGame(game,o);assert.equal(r.metadata.madden_snapshot,fixture.players.madden_snapshot);assert.ok(r.trace.some(t=>t.outcome.targetId));});
test('team opportunities, yards, turnovers and TD ownership reconcile across both engines',()=>{
 for(const influence of [0,.5,1.5])for(let i=0;i<60;i++){
  const r=simulateFantasyGame(game,opts({seed:`reconcile:${i}`,engine:influence?'personnel':'base',influence}));
  for(const [tm,t]of Object.entries(r.teams)){const p=Object.values(r.players).filter(p=>p.player.team===tm);
   assert.equal(totals(p,'carries'),t.rushingAttempts);assert.equal(totals(p,'rushing_yards'),t.rushingYards);assert.equal(totals(p,'passing_yards'),t.passingYards);assert.equal(totals(p,'receiving_yards'),t.passingYards);assert.equal(totals(p,'receptions'),t.completions);assert.equal(totals(p,'pass_attempts'),t.passAttempts);assert.equal(totals(p,'targets')+r.diagnostics[tm].throwaways,t.passAttempts);assert.equal(totals(p,'sacks_taken'),t.sacks);assert.equal(totals(p,'passing_tds'),totals(p,'receiving_tds'));assert.equal(totals(p,'rushing_tds')+totals(p,'receiving_tds'),t.touchdowns);assert.equal(totals(p,'fumbles_lost')+totals(p,'interceptions'),t.turnovers);assert.equal(t.passAttempts+t.sacks,t.passPlays);assert.equal(t.rushingAttempts+t.passPlays,t.offensivePlays);
  }
 }
});
function boxes(){return Object.fromEntries(['qb','rb','wr','te'].map(id=>[id,{player:{position:id.toUpperCase()},stats:emptyPlayerStats(),dk_points:0}]));}
function step(o,field=95){return applyOutcome({...openingState(game),field,distance:100-field},o);}
test('passing touchdown credits QB and actual receiver once',()=>{const b=boxes(),o={playType:'PASS',resultType:'COMPLETE',yards:10,duration:6,qbId:'qb',targetId:'wr'};creditPlay(b,o,step(o));assert.equal(b.qb.stats.passing_tds,1);assert.equal(b.wr.stats.receiving_tds,1);assert.equal(b.wr.stats.receiving_yards,5);assert.equal(b.rb.stats.rushing_tds,0);});
test('QB designed run and scramble TD cannot also credit a back',()=>{for(const scramble of [false,true]){const b=boxes(),o={playType:'RUN',resultType:'RUN',yards:6,duration:6,qbId:'qb',runnerId:'qb',scramble};creditPlay(b,o,step(o));assert.equal(b.qb.stats.rushing_tds,1);assert.equal(b.qb.stats[scramble?'scrambles':'designed_runs'],1);assert.equal(b.rb.stats.rushing_tds,0);}});
test('RB/TE reception, carry and fumble attribution',()=>{const b=boxes();for(const id of ['rb','te']){const o={playType:'PASS',resultType:'COMPLETE',yards:5,duration:6,qbId:'qb',targetId:id};creditPlay(b,o,step(o));assert.equal(b[id].stats.targets,1);assert.equal(b[id].stats.receptions,1);assert.equal(b[id].stats.receiving_tds,1);}const o={playType:'RUN',resultType:'FUMBLE',yards:2,duration:6,qbId:'qb',runnerId:'rb'};creditPlay(b,o,step(o,50));assert.equal(b.rb.stats.fumbles_lost,1);assert.equal(b.rb.stats.carries,1);assert.equal(b.rb.stats.rushing_yards,2);});
test('sacks are not QB attempts or receiver targets; throwaways are untargeted attempts',()=>{const b=boxes();let o={playType:'PASS',resultType:'SACK',yards:-5,duration:6,qbId:'qb'};creditPlay(b,o,step(o,50));assert.equal(b.qb.stats.sacks_taken,1);assert.equal(b.qb.stats.pass_attempts,0);o={playType:'PASS',resultType:'INCOMPLETE',yards:0,duration:5,qbId:'qb',throwaway:true};creditPlay(b,o,step(o,50));assert.equal(b.qb.stats.pass_attempts,1);assert.equal(b.wr.stats.targets,0);});
test('shared DK scoring awards actual yardage bonuses, PPR and TD types',()=>{
 const zero=emptyPlayerStats();assert.equal(dkScore({...zero,passing_yards:300,passing_tds:2,interceptions:1},'QB'),22);assert.equal(dkScore({...zero,rushing_yards:100,rushing_tds:1},'RB'),19);assert.equal(dkScore({...zero,receiving_yards:100,receiving_tds:1,receptions:7},'WR'),26);assert.equal(dkScore({...zero,passing_yards:299},'QB'),11.96);assert.equal(dkScore({...zero,rushing_yards:99},'RB'),9.9);assert.equal(dkScore({...zero,receiving_yards:99},'TE'),9.9);
});
test('personnel adjustments have directions, zero control and hard caps',()=>{
 const u=structuredClone(fixture.personnel);for(const [tm,value]of [['BUF',99],['HOU',0]])for(const unit of Object.values(u.units[tm])){unit.complete=true;unit.rating=value;}
 const team=structuredClone(fixture.players.teams.BUF);for(const p of team.players){p.madden_attributes=Object.fromEntries(Object.keys(config.receivingAttributes).map(k=>[k,99]));p.madden_identity='strongly_corroborated';}
 const a=adjustments('BUF','HOU',team,u,config,1.5);assert.equal(a.pressureDelta,-config.maxPressureDelta);assert.equal(a.runTilt,config.maxShapeTilt);assert.equal(a.completionDelta,config.maxCompletionDelta);assert.equal(a.completionTilt,config.maxShapeTilt);
 const z=adjustments('BUF','HOU',team,u,config,0);assert.equal(Math.abs(z.pressureDelta),0);assert.equal(z.runTilt,0);assert.equal(z.completionDelta,0);
 u.units.BUF.pass_protection.complete=false;assert.equal(Math.abs(adjustments('BUF','HOU',team,u,config,1).pressureDelta),0);
 assert.throws(()=>validateInfluence({...config,maxPressureDelta:.99},1));assert.throws(()=>validateInfluence(config,10));
});
test('run shape changes category mass, not a fixed yardage addition',()=>{const s=openingState(game);assert.ok(shapeWeight(-1,'run',s,.2,config)<1);assert.ok(shapeWeight(20,'run',s,.2,config)>1);assert.equal(shapeWeight(4,'run',s,0,config),1);});
test('pressure probability intervention moves bounded proxy frequencies',()=>{
 const t={...DEFAULT_TEAM,passRate:.6},state=openingState(game),team=fixture.players.teams.BUF;let base=0,raised=0,scrambles=0;const z={pressureDelta:0,completionDelta:0,runTilt:0,completionTilt:0};
 for(let i=0;i<6000;i++){const a=resolvePersonnel('PASS',state,t,random('p'+i),random('a'+i),DEFAULT_RULES,fixture.empirical,team,z,config);const b=resolvePersonnel('PASS',state,t,random('p'+i),random('a'+i),DEFAULT_RULES,fixture.empirical,team,{...z,pressureDelta:.06},config);base+=!!a.pressure;raised+=!!b.pressure;scrambles+=!!b.scramble;}assert.ok((raised-base)/6000>.045&&(raised-base)/6000<.075);assert.ok(scrambles>0);
});
test('reject unavailable QB, invalid shares and mismatched snapshots',()=>{let p=structuredClone(fixture.players.teams.BUF);p.players[0].shares.normal_carry=2;assert.throws(()=>validatePlayers(p,'BUF'));p=structuredClone(fixture.players.teams.BUF);p.qb_id='missing';assert.throws(()=>validatePlayers(p,'BUF'));assert.throws(()=>simulateFantasyGame(game,opts({players:{...fixture.players,personnel_snapshot:'wrong'}})));});
test('bulk outputs quantiles, exact threshold probabilities and player lookup',()=>{
 const r=runFantasyBulk(game,opts({debugTrace:true}),100),p=r.players.find(p=>p.player.position==='QB');assert.ok(p.dk.p95>=p.dk.p90);assert.ok(p.dk.p90>=p.dk.median);assert.equal(playerOutcome(r,p.player.player_id).runId,r.runId);assert.throws(()=>playerOutcome(r,'absent'));for(const v of Object.values(p.probabilities))assert.ok(v===null||v>=0&&v<=100);assert.equal(r.example.trace.length,r.example.finalState.playNumber);
 const html=renderFantasy(r);assert.match(html,/Fantasy Player Outcomes/);assert.match(html,/player box score/);assert.match(html,/Roster/);
});
test('comparison uses same seed, matchup and snapshots; zero personnel has zero statistical deltas',()=>{
 const a=runFantasyBulk(game,opts(),50),b=runFantasyBulk(game,opts({engine:'personnel'}),50),c=compareFantasyRuns(a,b);assert.equal(c.total_delta,0);assert.ok(c.players.every(p=>p.dk_mean_delta===0));assert.throws(()=>compareFantasyRuns(a,{...b,seed:'different'}));assert.match(renderFantasy({...b,base:a,comparison:c}),/V2 Base vs V2 Personnel/);
});

test('reshaping empirical draws preserves support and produces the requested modest tilt',()=>{const s=openingState(game),p={yards:{run:[[-1,1],[20,1]]}},rng=random('shape');let explosive=0;for(let i=0;i<12000;i++){const y=reshape(rng.uniform()<.5?-1:20,'run',s,.2,config,p,rng);assert.ok(y===-1||y===20);explosive+=y===20;}assert.ok(explosive/12000>.58&&explosive/12000<.62);});
