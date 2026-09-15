import {test} from 'node:test';
import assert from 'node:assert/strict';
import {leaders,matchups} from '../public/research/highlights.js';
const player=(id,points,extra={})=>({player_id:id,player_name:id,active:true,position:'RB',final_projection:points,salary:5000,...extra});
test('leaders rank the whole eligible pool, deduplicate and filter position',()=>{
 const pool=[player('a',10),player('b',20),player('b',20),player('c',40,{active:false}),player('d',50,{identity_confidence:'unresolved'}),player('q',30,{position:'QB'})];
 assert.deepEqual(leaders(pool,'points','RB').map(p=>p.player_id),['b','a']);
 assert.equal(leaders(pool)[0].player_id,'q');
 assert.equal(leaders(pool,'value','RB')[0].value,4);
});
test('missing projections and salaries never rank as zero or infinite',()=>{
 const pool=[player('a',null),player('b',20,{salary:0}),player('c',20,{salary:null})];
 assert.deepEqual(leaders(pool,'value'),[]);assert.deepEqual(leaders(pool,'targets'),[]);
 assert.equal(leaders([player('d',1,{projected_opportunities:{targets:8}})],'targets')[0].value,8);
});
const now=Date.parse('2026-09-15T00:00Z');
const game=(id,total,spread,extra={})=>({game_id:id,home:'A',away:'B',total,home_spread:spread,start_time:'2026-09-20T17:00Z',home_implied_total:28,away_implied_total:20,...extra});
test('matchup modes exclude locked, missing and duplicated games',()=>{
 const games=[game('high',55,10),game('close',50,-3),game('close',50,-3),game('old',60,1,{start_time:'2026-09-14T17:00Z'}),game('missing',null,1)];
 assert.deepEqual(matchups(games,'total',now).map(g=>g.game_id),['high','close']);
 assert.deepEqual(matchups(games,'close',now).map(g=>g.game_id),['close']);
 assert.equal(matchups(games,'team',now)[0].value,28);
 assert.equal(matchups([game('x',40,0,{home_implied_total:null,away_implied_total:null})],'team',now).length,0);
});
