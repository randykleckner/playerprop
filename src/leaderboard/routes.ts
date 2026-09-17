import {generateWeek,readSnapshot,approvedMediaProvider,resolveHero,safeImage} from './service';
interface Environment {PLAYERPROP_DB:D1Database;ASSETS:Fetcher;INGEST_TOKEN?:string}
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store'}});
export function selection(url:URL) {
  const seasonValue=url.searchParams.get('season'),weekValue=url.searchParams.get('week');
  if((seasonValue!==null&&!/^\d{4}$/.test(seasonValue))||(weekValue!==null&&!/^\d{1,2}$/.test(weekValue)))throw Error('Invalid season/week');
  const season=seasonValue===null?null:Number(seasonValue),week=weekValue===null?null:Number(weekValue);
  if((season!==null&&(season<1999||season>2100))||(week!==null&&(week<1||week>18)))throw Error('Invalid season/week');
  return {season,week};
}
export async function leaderboardRoute(request:Request,env:Environment):Promise<Response|null> {
  const url=new URL(request.url);
  if(request.method==='GET'&&url.pathname==='/api/leaderboard'){
    let selected;try{selected=selection(url);}catch{return json({error:'Invalid season or week'},400);}
    const available=(await env.PLAYERPROP_DB.prepare("SELECT season,week FROM weekly_leaderboards WHERE status='ready' ORDER BY season DESC,week DESC").all<{season:number;week:number}>()).results;
    const currentYear=new Date().getUTCFullYear()-(new Date().getUTCMonth()<2?1:0);
    const season=selected.season??available[0]?.season??currentYear;
    const week=selected.week??available.find(w=>w.season===season)?.week??1;
    const snapshot=await readSnapshot(env.PLAYERPROP_DB,season,week);
    return json({...snapshot,season,week,status:snapshot?'ready':'pending',available});
  }
  const actions=['/api/admin/leaderboard/finalize','/api/admin/leaderboard/generate','/api/admin/leaderboard/hero'];
  if(!actions.includes(url.pathname))return null;
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  if(!env.INGEST_TOKEN)return json({error:'Ingest authentication is not configured'},503);
  if(request.headers.get('authorization')!==`Bearer ${env.INGEST_TOKEN}`)return json({error:'Unauthorized'},401);
  // Bounded admin payload; the full offense stats remain in the existing ingest path.
  const bodyText=await request.text();if(bodyText.length>250000)return json({error:'Payload too large'},413);
  let body;try{body=JSON.parse(bodyText);}catch{return json({error:'Invalid JSON'},400);}
  const {season,week}=body??{};
  if(!Number.isInteger(season)||season<1999||season>2100||!Number.isInteger(week)||week<1||week>18)return json({error:'Invalid season/week'},400);
  if(url.pathname.endsWith('/generate'))return json(await generateWeek(env,season,week)??{season,week,status:'pending'});
  if(url.pathname.endsWith('/hero')){
    const snapshot=await readSnapshot(env.PLAYERPROP_DB,season,week);
    if(!snapshot)return json({error:'A ready snapshot is required'},409);
    const {hero}=snapshot;
    if(body.playerId!==hero.playerId||body.gameId!==hero.gameId||!['game-action','approved-media'].includes(body.kind)||!safeImage(body.url)||!safeImage(body.sourceUrl)||typeof body.source!=='string'||!body.source.trim()||body.approved!==true||![body.focalX,body.focalY].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100))return json({error:'Approved media, matching hero identity, source and focal coordinates required'},400);
    await env.PLAYERPROP_DB.prepare(`INSERT INTO leaderboard_hero_media (season,week,player_id,game_id,kind,url,source,source_url,hero_focal_x,hero_focal_y,selected_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(season,week,player_id,kind) DO UPDATE SET game_id=excluded.game_id,url=excluded.url,source=excluded.source,source_url=excluded.source_url,hero_focal_x=excluded.hero_focal_x,hero_focal_y=excluded.hero_focal_y,selected_at=excluded.selected_at`)
      .bind(season,week,hero.playerId,hero.gameId,body.kind,body.url,body.source,body.sourceUrl,body.focalX,body.focalY,new Date().toISOString()).run();
    snapshot.hero.image=await resolveHero(hero,season,week,approvedMediaProvider(env.PLAYERPROP_DB));
    await env.PLAYERPROP_DB.prepare('UPDATE weekly_leaderboards SET snapshot_json=? WHERE season=? AND week=?').bind(JSON.stringify(snapshot),season,week).run();
    return json(snapshot);
  }
  try {await finalizeWeek(env.PLAYERPROP_DB,body);return json({season,week,status:'finalized'});}
  catch(error){return json({error:error instanceof Error?error.message:'Invalid final stats'},400);}
}
interface FinalWeek {
  season:number;week:number;source:string;finalizedAt:string;allGamesFinal:boolean;
  gameIds:string[];
  players:{playerId:string;gameId:string;passingInterceptions:number;fumblesLost:number}[];
  defenses:{gameId:string;teamId:string;sacks:number;interceptions:number;recoveries:number;defensive_tds:number;points_allowed:number}[];
}
export async function finalizeWeek(db:D1Database,input:FinalWeek) {
  if(!input||input.allGamesFinal!==true||typeof input.source!=='string'||!input.source.trim()||!Number.isFinite(Date.parse(input.finalizedAt))||Date.parse(input.finalizedAt)>Date.now())throw Error('Final-stat source, past timestamp and complete-game attestation required');
  if(!Array.isArray(input.gameIds)||!input.gameIds.length||input.gameIds.length>16||new Set(input.gameIds).size!==input.gameIds.length||!Array.isArray(input.players)||!Array.isArray(input.defenses)||input.players.length>1500)throw Error('Invalid final-week manifest');
  const games=(await db.prepare("SELECT id,home_team_id,away_team_id FROM games WHERE season=? AND week=? AND season_type='REG'").bind(input.season,input.week).all<{id:string;home_team_id:string;away_team_id:string}>()).results;
  if(input.gameIds.some(id=>!games.some(g=>g.id===id)))throw Error('Unknown game identity; ingest the existing player stats first');
  const actuals=(await db.prepare("SELECT s.player_id,s.game_id,s.team_id FROM player_game_stats s JOIN games g ON g.id=s.game_id WHERE g.season=? AND g.week=? AND g.season_type='REG' AND s.position IN ('QB','RB','WR','TE')").bind(input.season,input.week).all<{player_id:string;game_id:string;team_id:string}>()).results.filter(s=>input.gameIds.includes(s.game_id));
  const keys=new Set<string>();
  const nonnegative=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
  for(const p of input.players){const key=`${p.gameId}/${p.playerId}`;if(keys.has(key)||!actuals.some(s=>s.game_id===p.gameId&&s.player_id===p.playerId)||![p.passingInterceptions,p.fumblesLost].every(nonnegative))throw Error('Unknown, duplicate or incomplete offensive stats');keys.add(key);}
  if(actuals.length!==input.players.length||!actuals.length)throw Error('Missing player final stats');
  const defenseKeys=new Set<string>();
  for(const d of input.defenses){const key=`${d.gameId}/${d.teamId}`,game=games.find(g=>g.id===d.gameId);if(defenseKeys.has(key)||!input.gameIds.includes(d.gameId)||!game||![game.home_team_id,game.away_team_id].includes(d.teamId)||![d.sacks,d.interceptions,d.recoveries,d.defensive_tds,d.points_allowed].every(nonnegative))throw Error('Invalid or duplicate DST stats');defenseKeys.add(key);}
  if(input.defenses.length!==input.gameIds.length*2||input.gameIds.some(id=>{const g=games.find(g=>g.id===id)!;return [g.home_team_id,g.away_team_id].some(team=>!actuals.some(s=>s.game_id===id&&s.team_id===team));}))throw Error('Every game requires both offenses and both defenses');
  const statements=input.players.map(p=>db.prepare('UPDATE player_game_stats SET passing_interceptions=?,fumbles_lost=? WHERE player_id=? AND game_id=?').bind(p.passingInterceptions,p.fumblesLost,p.playerId,p.gameId));
  statements.push(...input.defenses.map(d=>db.prepare(`INSERT INTO team_game_fantasy_stats (game_id,team_id,sacks,interceptions,recoveries,defensive_tds,points_allowed) VALUES (?,?,?,?,?,?,?) ON CONFLICT(game_id,team_id) DO UPDATE SET sacks=excluded.sacks,interceptions=excluded.interceptions,recoveries=excluded.recoveries,defensive_tds=excluded.defensive_tds,points_allowed=excluded.points_allowed`).bind(d.gameId,d.teamId,d.sacks,d.interceptions,d.recoveries,d.defensive_tds,d.points_allowed)));
  // A readiness row is committed only after all missing inputs are present in the same transaction.
  statements.push(db.prepare(`INSERT INTO leaderboard_week_readiness (season,week,game_ids_json,source,finalized_at) VALUES (?,?,?,?,?) ON CONFLICT(season,week) DO UPDATE SET game_ids_json=excluded.game_ids_json,source=excluded.source,finalized_at=excluded.finalized_at`).bind(input.season,input.week,JSON.stringify(input.gameIds),input.source,new Date(input.finalizedAt).toISOString()));
  await db.batch(statements);
}
