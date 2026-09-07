import test from 'node:test';
import assert from 'node:assert/strict';
import {doctorBrief,reviewedNote,chartKey} from '../public/doctor-chart.js';
const s={eventId:'e',playerId:'p',marketKey:'passing_yards',playerName:'Sample QB',position:'QB',opponentTeam:'KC',direction:'under',line:275.5,sportsbook:'draftkings',oddsCapturedAt:'2026-09-06T12:00Z',commenceAt:'2026-09-13T17:00Z',recentAverage:240,recentGames:5,recentUnderCount:3,recentPushCount:1,marketLabel:'passing yards',historySeason:2025,defenseRecentGames:5,defenseRecentAverageAllowed:210,defenseAverageAllowed:230,leagueDefenseAverageAllowed:240};
const now=Date.parse('2026-09-07T12:00Z');
const note={reviewed:true,line:s.line,direction:s.direction,sportsbook:s.sportsbook,oddsCapturedAt:s.oddsCapturedAt,reviewedAt:'2026-09-06T13:00Z',expiresAt:'2026-09-10T12:00Z',sources:[{title:'Recorded source',url:'https://example.com/source'}],playCallers:'Reviewed situational evidence.'};
const notebook={entries:{[chartKey(s)]:note}};
test('brief describes actual side counts, pushes and correct defense windows without filler',()=>{
 const brief=doctorBrief(s,{},now);assert.match(brief.sections[0].text,/3 of 5 games finished below/);assert.match(brief.sections[0].text,/1 landed on it/);
 assert.match(brief.sections[1].text,/last 5 games in the 2025/);assert.match(brief.sections[1].text,/season average was 230/);
 assert.doesNotMatch(JSON.stringify(brief),/model leans|rationale|blitz/);assert.ok(!brief.sections.some(r=>r.label==='Play callers'));
});
test('manual notes are gated to the reviewed quote, source, time and slate',()=>{
 assert.equal(reviewedNote(s,notebook,now),note);
 for(const changed of [{line:270},{sportsbook:'fanduel'},{direction:'over'},{oddsCapturedAt:'2026-09-07T00:00Z'},{eventId:'other'}])assert.equal(reviewedNote({...s,...changed},notebook,now),null);
 assert.equal(reviewedNote(s,notebook,Date.parse('2026-09-14T00:00Z')),null);
 assert.equal(reviewedNote(s,{entries:{[chartKey(s)]:{...note,sources:[]}}},now),null);
 assert.ok(doctorBrief(s,notebook,now).sections.some(r=>r.label==='Play callers'));
});
