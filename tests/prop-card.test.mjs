import test from 'node:test';
import assert from 'node:assert/strict';
import { propCard, defenseGrade, flipCard } from '../public/prop-card.js';
const signal={playerName:'Bo Nix',playerId:'nix',eventId:'game',marketKey:'passing_tds',position:'QB',playerTeam:'DEN',opponentTeam:'KC',direction:'under',line:1.5,marketLabel:'passing touchdowns',confidence:69,recentGames:5,recentAverage:1.2,defenseRankFewestAllowed:4,defenseAverageAllowed:1.1,leagueDefenseAverageAllowed:1.5};
test('sports card shows both sides, derived grade and evidence without navigation',()=>{
 const html=propCard(signal,{},3);assert.match(html,/UNDER 1.5/);assert.match(html,/69%/);assert.match(html,/DOCTOR CHART/);assert.match(html,/card-evidence-3/);assert.match(html,/aria-hidden="true" inert/);assert.match(html,/Defense:/);assert.doesNotMatch(html,/doctor-badge/);assert.doesNotMatch(html.split('</button>')[0],/<a |href=/);assert.match(html,/<\/button><a class="player-news"/);
});
test('defense grades have explicit boundaries and missing data stays missing',()=>{
 assert.deepEqual([1,4,5,8,9,16,17,24,25,32,null,0,33].map(defenseGrade),['A+','A+','A','A','B','B','C','C','D','D','—','—','—']);
 const html=propCard({...signal,recentAverage:null,confidence:null});assert.match(html,/—/);assert.doesNotMatch(html,/null%/);
});
test('card escapes source text and keeps the >80 lock threshold',()=>{
 assert.match(propCard({...signal,playerName:'<script>"&',confidence:81}),/&lt;script&gt;&quot;&amp;/);
 assert.match(propCard({...signal,confidence:81}),/dr-locks-badge.png/);
 assert.match(propCard({...signal,confidence:80}),/dr-locks-badge.png/);
 assert.doesNotMatch(propCard({...signal,confidence:79}),/dr-locks-badge.png/);
});
test('flip state updates accessible name and hides inactive face; Escape can reset',()=>{
 const attrs={'aria-expanded':'false'};const faces={'.card-front':{},'.card-back':{}};
 for(const face of Object.values(faces))face.setAttribute=function(k,v){this[k]=v};
 const button={dataset:{cardLabel:'Bo Nix'},getAttribute:k=>attrs[k],setAttribute:(k,v)=>attrs[k]=v,querySelector:k=>faces[k]};
 flipCard(button);assert.equal(attrs['aria-expanded'],'true');assert.equal(faces['.card-front'].inert,true);assert.equal(faces['.card-back'].inert,false);assert.match(attrs['aria-label'],/Evidence shown/);
 flipCard(button,false);assert.equal(attrs['aria-expanded'],'false');assert.equal(faces['.card-back']['aria-hidden'],'true');
});
