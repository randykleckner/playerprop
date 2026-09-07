import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeGames,matchGame,weatherText,showLock} from '../public/game-context.js';
const fixture=JSON.parse(readFileSync(new URL('../public/game-context-snapshot.json',import.meta.url)));
const games=normalizeGames(fixture.payload,fixture.fetchedAt);
test('lock strictly above 80, excludes malformed confidence',()=>{
 for(const n of [0,79,80,null,undefined,'85',NaN,Infinity,101])assert.equal(showLock(n),false);
 for(const n of [80.1,81,85,100])assert.equal(showLock(n),true);
});
test('schedule match verifies teams and kickoff, rejects ambiguity',()=>{
 const g=games[0];assert.equal(matchGame({matchup:g.matchup},games),g);
 assert.equal(matchGame({awayTeam:g.away,homeTeam:g.home,commenceAt:g.start},games),g);
 assert.equal(matchGame({awayTeam:g.home,homeTeam:g.away,commenceAt:g.start},games),null);
 assert.equal(matchGame({matchup:g.matchup,commenceAt:'2020-01-01'},games),null);
 assert.equal(matchGame({matchup:g.matchup},[g,g]),null);
});
test('forecast handles missing, stale, started and roofed venues honestly',()=>{
 const g={...games.find(g=>g.weather),fetchedAt:'2026-09-06T15:00Z',start:'2026-09-13T17:00Z'};
 assert.match(weatherText(g,Date.parse('2026-09-06T16:00Z')),/°F/);
 assert.match(weatherText({...g,roofed:true},Date.parse('2026-09-06T16:00Z')),/Outside roofed venue/);
 assert.match(weatherText(g,Date.parse('2026-09-07T15:00Z')),/stale/);
 assert.match(weatherText(g,Date.parse('2026-09-14T15:00Z')),/archived/);
 assert.match(weatherText({...g,weather:null},Date.parse('2026-09-06T16:00Z')),/not available/);
 assert.equal(weatherText(null),'Weather unavailable');
});
test('missing optional weather fields do not break schedule parsing',()=>{
 const p=structuredClone(fixture.payload);delete p.events[0].weather;assert.equal(normalizeGames(p,fixture.fetchedAt)[0].weather,null);
 assert.deepEqual(normalizeGames({events:[{}]},fixture.fetchedAt),[]);
});
