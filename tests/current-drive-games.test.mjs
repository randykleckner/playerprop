import {test} from 'node:test';import assert from 'node:assert/strict';import {currentGames} from '../public/drive-lab/current-games.js';
test('Drive Lab selects upcoming current-bundle games and requires both team profiles',()=>{
 const profile={teamInputs:{A:{passRate:.5},B:{passRate:.6}}};const games=[{game_id:'old',home:'A',away:'B',start_time:'2026-09-10T17:00Z'},{game_id:'next',home:'A',away:'B',start_time:'2026-09-20T17:00Z'},{game_id:'missing',home:'A',away:'C',start_time:'2026-09-20T17:00Z'}];
 assert.deepEqual(currentGames({games},profile,Date.parse('2026-09-15T00:00Z')).map(g=>g.gameId),['next']);
 assert.equal(currentGames({games},profile,Date.parse('2026-09-21T00:00Z')).length,0);
});
