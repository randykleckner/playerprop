import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {imageCandidates,selectionUrl,rowMarkup,attachImage} from '../public/leaderboard/view.js';
const temp=mkdtempSync(join(tmpdir(),'leaderboard-test-'));
await build({entryPoints:['src/leaderboard/service.ts','src/leaderboard/routes.ts','src/index.ts'],outdir:temp,outbase:'src',bundle:true,platform:'node',format:'esm'});
const {generateWeek,rankLeaders,resolveHero,normalizeTeam,isGenerationTime,scheduledGeneration}=await import(pathToFileURL(join(temp,'leaderboard/service.js')));
const {finalizeWeek,leaderboardRoute}=await import(pathToFileURL(join(temp,'leaderboard/routes.js')));
after(()=>rmSync(temp,{recursive:true,force:true}));
function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(`PRAGMA foreign_keys=ON;CREATE TABLE teams(team_id TEXT PRIMARY KEY,team_abbreviation TEXT,team_name TEXT);CREATE TABLE players(player_id TEXT PRIMARY KEY,display_name TEXT);INSERT INTO teams VALUES ('CHI','CHI','Chicago Bears'),('LA','LAR','Los Angeles Rams');`);
 sql.exec(readFileSync('migrations/0001_initial.sql','utf8'));
 sql.exec(readFileSync('migrations/0010_weekly_leaderboards.sql','utf8'));
 sql.exec("INSERT INTO games(id,season,week,home_team_id,away_team_id) VALUES ('game-1',2026,1,'CHI','LA'),('game-2',2026,2,'CHI','LA')");
 const players=[];
 for(const [index,pos] of ['QB','RB','WR','TE'].entries())for(const team of ['CHI','LA']){
  const id=`${pos}-${team}`;sql.prepare('INSERT INTO players VALUES (?,?)').run(id,`${team} ${pos}`);
  for(const week of [1,2])sql.prepare(`INSERT INTO player_game_stats(player_id,game_id,team_id,opponent_team_id,position,passing_yards,passing_touchdowns,rushing_yards,receptions,receiving_yards) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id,`game-${week}`,team,team==='CHI'?'LA':'CHI',pos,pos==='QB'?333.9:0,pos==='QB'?3:0,pos==='RB'?125:0,pos==='WR'?8:pos==='TE'?6:0,pos==='WR'?110:pos==='TE'?75:0);
  players.push({playerId:id,gameId:'game-1',passingInterceptions:team==='CHI'?0:1,fumblesLost:0});
 }
 const prepare=(query,params=[])=>({bind:(...values)=>prepare(query,values),first:async()=>sql.prepare(query).get(...params)??null,all:async()=>({results:sql.prepare(query).all(...params)}),run:async()=>sql.prepare(query).run(...params)});
 const db={prepare,batch:async statements=>{sql.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const env={PLAYERPROP_DB:db,INGEST_TOKEN:'test',ASSETS:{fetch:async r=>Response.json(r.url.endsWith('player-media.json')?{'QB-CHI':{headshot:'https://media.test/qb.png'}}:{CHI:{logo:'https://media.test/chi.png'},LA:{logo:'https://media.test/la.png'}})}};
 const manifest={season:2026,week:1,source:'test audited actuals',allGamesFinal:true,finalizedAt:'2026-09-15T10:00:00Z',gameIds:['game-1'],players,defenses:['CHI','LA'].map(teamId=>({gameId:'game-1',teamId,sacks:3,interceptions:2,recoveries:1,defensive_tds:1,points_allowed:teamId==='CHI'?0:14}))};
 return {sql,db,env,manifest};
}
async function ready(){const f=fixture();await finalizeWeek(f.db,f.manifest);return {...f,snapshot:await generateWeek(f.env,2026,1)};}
for(const pos of ['QB','RB','WR','TE','DST'])test(`${pos} weekly leader uses actual scoring`,async()=>{const {snapshot}=await ready();assert.equal(snapshot.leaders.find(r=>r.position===pos).team,'CHI');});
test('overall individual, score precision, DST team entity and normalized media',async()=>{
 const {snapshot}=await ready();assert.equal(snapshot.hero.playerId,'QB-CHI');assert.equal(snapshot.hero.fantasyPoints,28.36);assert.equal(snapshot.hero.image.url,'https://media.test/qb.png');const dst=snapshot.leaders.find(p=>p.position==='DST');assert.equal(dst.fantasyPoints,25);assert.equal(dst.playerId,null);assert.equal(normalizeTeam('LAR'),'LA');
});
test('ties break deterministically by canonical ID at two-decimal precision',()=>{const rows=['z','a'].map(playerId=>({position:'QB',playerId,teamId:'CHI',fantasyPoints:30.004}));assert.equal(rankLeaders(rows).hero.playerId,'a');assert.equal(rankLeaders(rows.reverse()).hero.playerId,'a');});
test('a higher-scoring DST never becomes the individual hero',()=>{const r=rankLeaders([{position:'DST',playerId:null,teamId:'CHI',fantasyPoints:40},{position:'QB',playerId:'qb',fantasyPoints:20}]);assert.equal(r.hero.playerId,'qb');});
test('incomplete week remains pending and incomplete finalization is rejected',async()=>{const {env,db,manifest,sql}=fixture();assert.equal(await generateWeek(env,2026,1),null);await assert.rejects(()=>finalizeWeek(db,{...manifest,defenses:[]}),/both/);assert.equal(sql.prepare('SELECT COUNT(*) n FROM leaderboard_week_readiness').get().n,0);await assert.rejects(()=>finalizeWeek(db,{...manifest,allGamesFinal:false}),/attestation/);});
test('unknown turnover inputs never become zero scores',async()=>{const {env,db,manifest,sql}=fixture();await finalizeWeek(db,manifest);sql.exec("UPDATE player_game_stats SET fumbles_lost=NULL WHERE player_id='QB-CHI'");assert.equal(await generateWeek(env,2026,1),null);});
test('historical snapshots are immutable and generation is idempotent',async()=>{const {env,sql,snapshot}=await ready();sql.exec('UPDATE player_game_stats SET passing_yards=900');assert.deepEqual(await generateWeek(env,2026,1),snapshot);assert.equal(sql.prepare('SELECT COUNT(*) n FROM weekly_leaderboards').get().n,1);});
test('Tuesday cron accounts for Central daylight and standard time',()=>{assert.ok(isGenerationTime(Date.parse('2026-09-15T12:00:00Z')));assert.ok(!isGenerationTime(Date.parse('2026-09-15T13:00:00Z')));assert.ok(isGenerationTime(Date.parse('2026-12-15T13:00:00Z')));assert.ok(!isGenerationTime(Date.parse('2026-12-15T12:00:00Z')));});
test('scheduled generation retrieves finalized weeks and reruns without duplicates',async()=>{const {env,db,manifest,sql}=fixture();await finalizeWeek(db,manifest);await scheduledGeneration(env,Date.parse('2026-09-15T12:00:00Z'));await scheduledGeneration(env,Date.parse('2026-09-15T12:00:00Z'));assert.equal(sql.prepare('SELECT COUNT(*) n FROM weekly_leaderboards').get().n,1);});
test('image provider failure publishes fallback, no player image uses team',async()=>{const {env,db,manifest}=fixture();await finalizeWeek(db,manifest);const s=await generateWeek(env,2026,1,{getHeroImage:async()=>{throw Error('offline');}});assert.equal(s.status,'ready');const image=await resolveHero({...s.hero,playerImage:null},2026,1,{getHeroImage:async()=>null});assert.equal(image.url,'https://media.test/chi.png');});
test('approved weekly action photo takes precedence and retains focal coordinates',async()=>{const {env,db,manifest,sql}=fixture();await finalizeWeek(db,manifest);sql.exec("INSERT INTO leaderboard_hero_media VALUES(2026,1,'QB-CHI','game-1','game-action','https://media.test/action.jpg','approved','https://media.test/source',23,71,'2026-09-15T11:00:00Z')");const s=await generateWeek(env,2026,1);assert.equal(s.hero.image.focalX,23);assert.equal(s.hero.image.focalY,71);assert.equal(s.hero.image.kind,'game-action');});
test('API retrieves exact historical week, validates selectors and shows pending',async()=>{const {env}=await ready();for(const [query,status,week] of [['season=2026&week=1','ready',1],['season=2026&week=2','pending',2],['season=2025&week=1','pending',1]]){const r=await leaderboardRoute(new Request(`https://local/api/leaderboard?${query}`),env);const body=await r.json();assert.equal(body.status,status);assert.equal(body.week,week);assert.equal(body.available.length,1);}assert.equal((await leaderboardRoute(new Request('https://local/api/leaderboard?season=wat&week=1'),env)).status,400);});
test('season and week selectors preserve linkable URL state',()=>{assert.equal(selectionUrl(2025,17),'/leaderboard/?season=2025&week=17');assert.equal(selectionUrl(2026,1),'/leaderboard/?season=2026&week=1');});
test('rows escape identities, retain fixed decimal scores and reject unsafe images',()=>{assert.ok(rowMarkup({position:'QB',name:'<script>',team:'CHI',fantasyPoints:37.2}).includes('&lt;script&gt;'));assert.ok(rowMarkup({position:'QB',name:'Name',fantasyPoints:37.2}).includes('37.20'));assert.deepEqual(imageCandidates(null,'javascript:alert(1)','https://media.test/a','https://media.test/a'),['https://media.test/a']);});
test('image load errors remove broken image and advance to team then branded fallback',()=>{
 const original=globalThis.document;const host={children:[],classList:{add(){}},append(img){this.children.push(img);}};globalThis.document={createElement:()=>({style:{},remove(){host.children=host.children.filter(v=>v!==this);}})};
 try{attachImage(host,['https://bad/player','https://bad/team']);host.children[0].onerror();assert.equal(host.children[0].src,'https://bad/team');host.children[0].onerror();assert.equal(host.children.length,0);}finally{globalThis.document=original;}
});
test('admin media update changes artwork without rebuilding statistics and requires auth',async()=>{const {env,snapshot}=await ready();const payload={season:2026,week:1,playerId:'QB-CHI',gameId:'game-1',kind:'game-action',url:'https://media.test/action',sourceUrl:'https://media.test/license',source:'Licensed test',approved:true,focalX:20,focalY:30};const request=token=>new Request('https://local/api/admin/leaderboard/hero',{method:'POST',headers:{authorization:`Bearer ${token}`},body:JSON.stringify(payload)});assert.equal((await leaderboardRoute(request('wrong'),env)).status,401);const changed=await(await leaderboardRoute(request('test'),env)).json();assert.deepEqual(changed.leaders,snapshot.leaders);assert.equal(changed.generatedAt,snapshot.generatedAt);assert.equal(changed.hero.image.focalX,20);});
test('a stalled photo provider cannot hold up fallback publication',async()=>{const image=await resolveHero({playerId:'p',gameId:'g',playerImage:null,teamLogo:null},2026,1,{getHeroImage:()=>new Promise(()=>{})},5);assert.equal(image.url,null);assert.equal(image.kind,'team');});
test('a new week changes the hero and all historical snapshots remain separately retrievable',async()=>{
 const {db,env,sql,manifest,snapshot}=await ready();
 sql.exec("UPDATE player_game_stats SET rushing_yards=350,rushing_touchdowns=3 WHERE game_id='game-2' AND player_id='RB-LA'");
 await finalizeWeek(db,{...manifest,week:2,gameIds:['game-2'],players:manifest.players.map(p=>({...p,gameId:'game-2'})),defenses:manifest.defenses.map(d=>({...d,gameId:'game-2'}))});
 const second=await generateWeek(env,2026,2);assert.equal(second.hero.playerId,'RB-LA');assert.equal(second.hero.gameId,'game-2');assert.equal(second.hero.team,'LA');assert.equal(second.hero.image.url,'https://media.test/la.png');
 const first=await(await leaderboardRoute(new Request('https://local/api/leaderboard?season=2026&week=1'),env)).json();assert.deepEqual(first.hero,snapshot.hero);assert.equal(first.available.length,2);
});
