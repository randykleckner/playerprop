import {dkScore} from '../../public/simulation/engine.js';

export const POSITIONS = ['QB','RB','WR','TE','DST'] as const;
export const SCORING_VERSION = 'drlocks-dkScore-v1';
export interface Leader {
  position: string; playerId: string|null; gameId: string; teamId: string; team: string;
  name: string; fantasyPoints: number; playerImage: string|null; teamLogo: string|null;
}
export interface HeroImage {
  url: string|null; source: string; sourceUrl: string|null; gameId: string; playerId: string;
  focalX: number; focalY: number; selectedAt: string; kind: string;
}
export interface Snapshot {
  season: number; week: number; status: 'ready'; generatedAt: string; scoringVersion: string;
  leaders: Leader[]; hero: Leader & {image: HeroImage};
}
interface Environment { PLAYERPROP_DB: D1Database; ASSETS: Fetcher }
export const normalizeTeam = (team: string) => ({LAR:'LA',JAC:'JAX',WSH:'WAS',OAK:'LV',SD:'LAC',STL:'LA'}[team] ?? team);
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100);
export function rankLeaders(rows: Leader[]) {
  // Rank at published precision; stable canonical IDs break ties, not input order.
  const sorted = rows.map(row=>({...row,fantasyPoints:cents(row.fantasyPoints)/100})).sort((a,b)=>
    cents(b.fantasyPoints)-cents(a.fantasyPoints) || (a.playerId??a.teamId).localeCompare(b.playerId??b.teamId));
  return {leaders:POSITIONS.map(position=>sorted.find(row=>row.position===position)).filter((r):r is Leader=>!!r),hero:sorted.find(row=>row.playerId!==null)};
}
export function isGenerationTime(time: number) {
  const parts = new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',weekday:'short',hour:'2-digit',hourCycle:'h23'}).formatToParts(time);
  return parts.find(p=>p.type==='weekday')?.value==='Tue' && parts.find(p=>p.type==='hour')?.value==='07';
}
export const safeImage = (url: unknown): string|null => typeof url==='string' && (url.startsWith('https://') || /^\/(?!\/)/.test(url)) ? url : null;
export async function catalogs(assets: Fetcher) {
  async function read(path: string) {
    try { const response=await assets.fetch(new Request(`https://drlocksmd.com/${path}`));return response.ok ? await response.json<Record<string,{headshot?:string;logo?:string}>>() : {}; }
    catch { return {}; }
  }
  const [players,teams]=await Promise.all([read('player-media.json'),read('team-media.json')]);return {players,teams};
}
export interface HeroProvider { getHeroImage(input: {playerId:string;gameId:string;season:number;week:number}): Promise<HeroImage|null> }
export function approvedMediaProvider(db: D1Database): HeroProvider {
  return {async getHeroImage(input) {
    const row=await db.prepare(`SELECT * FROM leaderboard_hero_media WHERE season=? AND week=? AND player_id=? AND game_id=? ORDER BY CASE kind WHEN 'game-action' THEN 0 ELSE 1 END LIMIT 1`)
      .bind(input.season,input.week,input.playerId,input.gameId).first<{url:string;source:string;source_url:string;hero_focal_x:number;hero_focal_y:number;selected_at:string;kind:string}>();
    return row && safeImage(row.url) ? {url:row.url,source:row.source,sourceUrl:row.source_url,gameId:input.gameId,playerId:input.playerId,focalX:row.hero_focal_x,focalY:row.hero_focal_y,selectedAt:row.selected_at,kind:row.kind}:null;
  }};
}
export async function resolveHero(leader: Leader, season:number, week:number, provider:HeroProvider,timeoutMs=1500): Promise<HeroImage> {
  let timer: ReturnType<typeof setTimeout>|undefined;
  try { const photo=await Promise.race([provider.getHeroImage({playerId:leader.playerId!,gameId:leader.gameId,season,week}),new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),timeoutMs);})]); if(photo && safeImage(photo.url))return photo; }
  catch(error) { console.warn('leaderboard_hero_unavailable',String(error)); }
  finally { if(timer!==undefined)clearTimeout(timer); }
  return {url:safeImage(leader.playerImage)||safeImage(leader.teamLogo),source:leader.playerImage?'existing-player-media':'existing-team-media',sourceUrl:null,gameId:leader.gameId,playerId:leader.playerId!,focalX:50,focalY:40,selectedAt:new Date().toISOString(),kind:leader.playerImage?'headshot':'team'};
}
export async function readSnapshot(db:D1Database,season:number,week:number):Promise<Snapshot|null> {
  const row=await db.prepare('SELECT snapshot_json FROM weekly_leaderboards WHERE season=? AND week=? AND status=\'ready\'').bind(season,week).first<{snapshot_json:string}>();
  return row ? JSON.parse(row.snapshot_json) : null;
}
interface ActualRow { player_id:string; game_id:string; team_id:string; position:string; display_name:string; team_abbreviation:string; passing_yards:number;passing_touchdowns:number;rushing_yards:number;rushing_touchdowns:number;receiving_yards:number;receiving_touchdowns:number;receptions:number;passing_interceptions:number|null;fumbles_lost:number|null }
interface DefenseRow {game_id:string;team_id:string;team_name:string;team_abbreviation:string;sacks:number;interceptions:number;recoveries:number;defensive_tds:number;points_allowed:number}
export async function generateWeek(env:Environment,season:number,week:number,provider:HeroProvider=approvedMediaProvider(env.PLAYERPROP_DB)) {
  const db=env.PLAYERPROP_DB,existing=await readSnapshot(db,season,week); if(existing)return existing;
  const ready=await db.prepare('SELECT game_ids_json FROM leaderboard_week_readiness WHERE season=? AND week=?').bind(season,week).first<{game_ids_json:string}>();
  if(!ready)return null;
  const expected=new Set<string>(JSON.parse(ready.game_ids_json));
  const games=(await db.prepare("SELECT id,home_team_id,away_team_id FROM games WHERE season=? AND week=? AND season_type='REG'").bind(season,week).all<{id:string;home_team_id:string;away_team_id:string}>()).results.filter(g=>expected.has(g.id));
  if(!expected.size||games.length!==expected.size)return null;
  const actuals=(await db.prepare(`SELECT s.*,p.display_name,t.team_abbreviation FROM player_game_stats s JOIN games g ON g.id=s.game_id JOIN players p ON p.player_id=s.player_id JOIN teams t ON t.team_id=s.team_id WHERE g.season=? AND g.week=? AND g.season_type='REG' AND s.position IN ('QB','RB','WR','TE')`).bind(season,week).all<ActualRow>()).results.filter(s=>expected.has(s.game_id));
  const defenses=(await db.prepare(`SELECT d.*,t.team_name,t.team_abbreviation FROM team_game_fantasy_stats d JOIN games g ON g.id=d.game_id JOIN teams t ON t.team_id=d.team_id WHERE g.season=? AND g.week=? AND g.season_type='REG'`).bind(season,week).all<DefenseRow>()).results.filter(s=>expected.has(s.game_id));
  if(actuals.some(s=>s.passing_interceptions===null||s.fumbles_lost===null)||games.some(g=>[g.home_team_id,g.away_team_id].some(team=>!actuals.some(s=>s.game_id===g.id&&s.team_id===team)||!defenses.some(s=>s.game_id===g.id&&s.team_id===team))))return null;
  const media=await catalogs(env.ASSETS);
  const identity=(teamId:string,abbreviation:string)=>({teamId,team:normalizeTeam(abbreviation),teamLogo:safeImage(media.teams[normalizeTeam(abbreviation)]?.logo)});
  const rows:Leader[]=actuals.map(s=>({position:s.position,playerId:s.player_id,gameId:s.game_id,name:s.display_name,...identity(s.team_id,s.team_abbreviation),playerImage:safeImage(media.players[s.player_id]?.headshot),fantasyPoints:dkScore({...s,passing_tds:s.passing_touchdowns,rushing_tds:s.rushing_touchdowns,receiving_tds:s.receiving_touchdowns,interceptions:s.passing_interceptions!},s.position)}));
  rows.push(...defenses.map(s=>({position:'DST',playerId:null,gameId:s.game_id,name:s.team_name,...identity(s.team_id,s.team_abbreviation),playerImage:null,fantasyPoints:dkScore(s,'DST')})));
  // Weekly totals combine multiple games, with the highest-scoring game used for artwork.
  const totals=new Map<string,Leader>();
  for(const row of rows.sort((a,b)=>b.fantasyPoints-a.fantasyPoints||a.gameId.localeCompare(b.gameId))){const key=row.playerId??`team:${row.teamId}`,prior=totals.get(key);if(prior)prior.fantasyPoints+=row.fantasyPoints;else totals.set(key,{...row});}
  const {leaders,hero}=rankLeaders([...totals.values()]);if(leaders.length!==POSITIONS.length||!hero)return null;
  const snapshot:Snapshot={season,week,status:'ready',generatedAt:new Date().toISOString(),scoringVersion:SCORING_VERSION,leaders,hero:{...hero,image:await resolveHero(hero,season,week,provider)}};
  await db.prepare(`INSERT INTO weekly_leaderboards (season,week,status,generated_at,scoring_version,snapshot_json) VALUES (?,?,'ready',?,?,?) ON CONFLICT(season,week) DO NOTHING`).bind(season,week,snapshot.generatedAt,SCORING_VERSION,JSON.stringify(snapshot)).run();
  return readSnapshot(db,season,week);
}
export async function scheduledGeneration(env:Environment,time:number) {
  if(!isGenerationTime(time))return;
  const weeks=await env.PLAYERPROP_DB.prepare(`SELECT r.season,r.week FROM leaderboard_week_readiness r LEFT JOIN weekly_leaderboards w ON w.season=r.season AND w.week=r.week WHERE w.week IS NULL AND r.finalized_at<=? ORDER BY r.season DESC,r.week DESC LIMIT 18`).bind(new Date(time).toISOString()).all<{season:number;week:number}>();
  for(const week of weeks.results){const snapshot=await generateWeek(env,week.season,week.week);console.log(JSON.stringify({event:'leaderboard_generation',...week,status:snapshot?'ready':'pending'}));}
}
