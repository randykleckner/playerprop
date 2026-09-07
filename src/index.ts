import { simulationRoute } from "./simulation/routes";
import { dfsRoute } from "./dfs/foundation";

interface Env {
  PLAYERPROP_DB: D1Database;
  ASSETS: Fetcher;
  INGEST_TOKEN?: string;
  SPORTS_GAME_ODDS_API_KEY?: string;
}

interface PlayerStatInput {
  player_id: string;
  player_name: string;
  position: string;
  team: string;
  opponent: string;
  game_id: string;
  season: number;
  week: number;
  passing_yards?: number;
  passing_touchdowns?: number;
  rushing_yards?: number;
  rushing_touchdowns?: number;
  receptions?: number;
  receiving_yards?: number;
  receiving_touchdowns?: number;
  targets?: number;
  carries?: number;
  tackles_solo?: number;
  tackle_assists?: number;
  tackles_for_loss?: number;
  sacks?: number;
  qb_hits?: number;
  interceptions?: number;
  passes_defended?: number;
}

interface PlayerAvailabilityInput {
  player_id: string;
  game_id: string;
  team_id: string;
  availability_status: "active" | "limited" | "questionable" | "out" | "inactive" | "unknown";
  role_status?: "starter" | "rotation" | "backup" | "unknown";
  injury_description?: string;
  practice_status?: string;
  source: string;
  reported_at?: string;
  notes?: string;
}

interface PlayerRoleInput {
  player_id: string;
  game_id: string;
  offensive_snaps?: number;
  snap_share?: number;
  routes_run?: number;
  route_share?: number;
  target_share?: number;
  carry_share?: number;
  red_zone_targets?: number;
  red_zone_carries?: number;
  source: string;
}

interface TeamContextInput {
  team_id: string;
  game_id: string;
  head_coach?: string;
  offensive_coordinator?: string;
  offensive_play_caller?: string;
  quarterback_player_id?: string;
  offensive_system_label?: string;
  source: string;
  notes?: string;
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
const nullableNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const unauthorized = () => json({ error: "Unauthorized" }, 401);
const teamNames: Record<string, string> = {
  ARI: "Arizona Cardinals", ATL: "Atlanta Falcons", BAL: "Baltimore Ravens", BUF: "Buffalo Bills", CAR: "Carolina Panthers", CHI: "Chicago Bears", CIN: "Cincinnati Bengals", CLE: "Cleveland Browns",
  DAL: "Dallas Cowboys", DEN: "Denver Broncos", DET: "Detroit Lions", GB: "Green Bay Packers", HOU: "Houston Texans", IND: "Indianapolis Colts", JAX: "Jacksonville Jaguars", KC: "Kansas City Chiefs",
  LA: "Los Angeles Rams", LAC: "Los Angeles Chargers", LV: "Las Vegas Raiders", MIA: "Miami Dolphins", MIN: "Minnesota Vikings", NE: "New England Patriots", NO: "New Orleans Saints", NYG: "New York Giants",
  NYJ: "New York Jets", PHI: "Philadelphia Eagles", PIT: "Pittsburgh Steelers", SEA: "Seattle Seahawks", SF: "San Francisco 49ers", TB: "Tampa Bay Buccaneers", TEN: "Tennessee Titans", WAS: "Washington Commanders",
};
const teamName = (abbreviation: string) => teamNames[abbreviation] ?? abbreviation;

async function upsertStats(db: D1Database, stats: PlayerStatInput[]) {
  for (const stat of stats) {
    if (!stat.player_id || !stat.game_id || !stat.team || !stat.opponent || !stat.position) throw new Error("Each stat requires player_id, game_id, team, opponent, and position.");
  }
  const teams = new Set(stats.flatMap((stat) => [stat.team, stat.opponent]));
  const players = new Map(stats.map((stat) => [stat.player_id, stat]));
  const games = new Map(stats.map((stat) => [stat.game_id, stat]));
  const statements: D1PreparedStatement[] = [
    ...[...teams].map((team) => db.prepare("INSERT INTO teams (team_id, team_abbreviation, team_name) VALUES (?, ?, ?) ON CONFLICT(team_id) DO UPDATE SET team_abbreviation = excluded.team_abbreviation, team_name = excluded.team_name, updated_at = CURRENT_TIMESTAMP").bind(team, team, teamName(team))),
    ...[...players.values()].map((stat) => db.prepare("INSERT INTO players (player_id, display_name, position, current_team_id) VALUES (?, ?, ?, ?) ON CONFLICT(player_id) DO UPDATE SET display_name = excluded.display_name, position = excluded.position, current_team_id = excluded.current_team_id, updated_at = CURRENT_TIMESTAMP").bind(stat.player_id, stat.player_name, stat.position, stat.team)),
    ...[...games.values()].map((stat) => db.prepare("INSERT INTO games (id, season, week, home_team_id, away_team_id) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING").bind(stat.game_id, stat.season, stat.week, stat.team, stat.opponent)),
    ...stats.map((stat) => db.prepare(`INSERT INTO player_game_stats (player_id, game_id, team_id, opponent_team_id, position, passing_yards, passing_touchdowns, rushing_yards, rushing_touchdowns, receptions, receiving_yards, receiving_touchdowns, targets, carries, tackles_solo, tackle_assists, tackles_for_loss, sacks, qb_hits, interceptions, passes_defended)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(player_id, game_id) DO UPDATE SET team_id = excluded.team_id, opponent_team_id = excluded.opponent_team_id, position = excluded.position, passing_yards = excluded.passing_yards, passing_touchdowns = excluded.passing_touchdowns, rushing_yards = excluded.rushing_yards, rushing_touchdowns = excluded.rushing_touchdowns, receptions = excluded.receptions, receiving_yards = excluded.receiving_yards, receiving_touchdowns = excluded.receiving_touchdowns, targets = excluded.targets, carries = excluded.carries, tackles_solo = excluded.tackles_solo, tackle_assists = excluded.tackle_assists, tackles_for_loss = excluded.tackles_for_loss, sacks = excluded.sacks, qb_hits = excluded.qb_hits, interceptions = excluded.interceptions, passes_defended = excluded.passes_defended, updated_at = CURRENT_TIMESTAMP`)
      .bind(stat.player_id, stat.game_id, stat.team, stat.opponent, stat.position, number(stat.passing_yards), number(stat.passing_touchdowns), number(stat.rushing_yards), number(stat.rushing_touchdowns), number(stat.receptions), number(stat.receiving_yards), number(stat.receiving_touchdowns), number(stat.targets), number(stat.carries), number(stat.tackles_solo), number(stat.tackle_assists), number(stat.tackles_for_loss), number(stat.sacks), number(stat.qb_hits), number(stat.interceptions), number(stat.passes_defended)))
  ];
  await db.batch(statements);
}

async function ingestPlayerStats(request: Request, env: Env) {
  if (!env.INGEST_TOKEN || request.headers.get("authorization") !== `Bearer ${env.INGEST_TOKEN}`) return unauthorized();
  const body = await request.json<{ stats?: PlayerStatInput[] }>();
  const stats = body.stats;
  if (!Array.isArray(stats) || stats.length === 0 || stats.length > 100) return json({ error: "Provide 1–100 stats in { stats: [...] }." }, 400);
  await upsertStats(env.PLAYERPROP_DB, stats);
  return json({ inserted: stats.length });
}

async function ingestAvailability(request: Request, env: Env) {
  if (!env.INGEST_TOKEN || request.headers.get("authorization") !== `Bearer ${env.INGEST_TOKEN}`) return unauthorized();
  const body = await request.json<{ availability?: PlayerAvailabilityInput[] }>();
  const availability = body.availability;
  if (!Array.isArray(availability) || availability.length === 0 || availability.length > 100) return json({ error: "Provide 1–100 records in { availability: [...] }." }, 400);
  if (availability.some((record) => !record.player_id || !record.game_id || !record.team_id || !record.availability_status || !record.source)) return json({ error: "Each availability record needs player_id, game_id, team_id, availability_status, and source." }, 400);
  await env.PLAYERPROP_DB.batch(availability.map((record) => env.PLAYERPROP_DB.prepare(`INSERT INTO player_game_availability (player_id, game_id, team_id, availability_status, role_status, injury_description, practice_status, source, reported_at, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(player_id, game_id) DO UPDATE SET team_id = excluded.team_id, availability_status = excluded.availability_status, role_status = excluded.role_status, injury_description = excluded.injury_description, practice_status = excluded.practice_status, source = excluded.source, reported_at = excluded.reported_at, notes = excluded.notes, updated_at = CURRENT_TIMESTAMP`)
    .bind(record.player_id, record.game_id, record.team_id, record.availability_status, record.role_status ?? "unknown", record.injury_description ?? null, record.practice_status ?? null, record.source, record.reported_at ?? null, record.notes ?? null)));
  return json({ inserted: availability.length });
}

async function ingestRoles(request: Request, env: Env) {
  if (!env.INGEST_TOKEN || request.headers.get("authorization") !== `Bearer ${env.INGEST_TOKEN}`) return unauthorized();
  const body = await request.json<{ roles?: PlayerRoleInput[] }>();
  const roles = body.roles;
  if (!Array.isArray(roles) || roles.length === 0 || roles.length > 100) return json({ error: "Provide 1–100 records in { roles: [...] }." }, 400);
  if (roles.some((record) => !record.player_id || !record.game_id || !record.source)) return json({ error: "Each role record needs player_id, game_id, and source." }, 400);
  await env.PLAYERPROP_DB.batch(roles.map((record) => env.PLAYERPROP_DB.prepare(`INSERT INTO player_game_roles (player_id, game_id, offensive_snaps, snap_share, routes_run, route_share, target_share, carry_share, red_zone_targets, red_zone_carries, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(player_id, game_id) DO UPDATE SET offensive_snaps = excluded.offensive_snaps, snap_share = excluded.snap_share, routes_run = excluded.routes_run, route_share = excluded.route_share, target_share = excluded.target_share, carry_share = excluded.carry_share, red_zone_targets = excluded.red_zone_targets, red_zone_carries = excluded.red_zone_carries, source = excluded.source, updated_at = CURRENT_TIMESTAMP`)
    .bind(record.player_id, record.game_id, nullableNumber(record.offensive_snaps), nullableNumber(record.snap_share), nullableNumber(record.routes_run), nullableNumber(record.route_share), nullableNumber(record.target_share), nullableNumber(record.carry_share), nullableNumber(record.red_zone_targets), nullableNumber(record.red_zone_carries), record.source)));
  return json({ inserted: roles.length });
}

async function ingestTeamContext(request: Request, env: Env) {
  if (!env.INGEST_TOKEN || request.headers.get("authorization") !== `Bearer ${env.INGEST_TOKEN}`) return unauthorized();
  const body = await request.json<{ context?: TeamContextInput[] }>();
  const context = body.context;
  if (!Array.isArray(context) || context.length === 0 || context.length > 100) return json({ error: "Provide 1–100 records in { context: [...] }." }, 400);
  if (context.some((record) => !record.team_id || !record.game_id || !record.source)) return json({ error: "Each team context record needs team_id, game_id, and source." }, 400);
  await env.PLAYERPROP_DB.batch(context.map((record) => env.PLAYERPROP_DB.prepare(`INSERT INTO team_game_context (team_id, game_id, head_coach, offensive_coordinator, offensive_play_caller, quarterback_player_id, offensive_system_label, source, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(team_id, game_id) DO UPDATE SET head_coach = excluded.head_coach, offensive_coordinator = excluded.offensive_coordinator, offensive_play_caller = excluded.offensive_play_caller, quarterback_player_id = excluded.quarterback_player_id, offensive_system_label = excluded.offensive_system_label, source = excluded.source, notes = excluded.notes, updated_at = CURRENT_TIMESTAMP`)
    .bind(record.team_id, record.game_id, record.head_coach ?? null, record.offensive_coordinator ?? null, record.offensive_play_caller ?? null, record.quarterback_player_id ?? null, record.offensive_system_label ?? null, record.source, record.notes ?? null)));
  return json({ inserted: context.length });
}

async function board(url: URL, db: D1Database) {
  const season = Number(url.searchParams.get("season"));
  const week = Number(url.searchParams.get("week"));
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 100);
  if (!Number.isInteger(season) || !Number.isInteger(week)) return json({ error: "season and week are required integer query parameters." }, 400);
  const result = await db.prepare(`SELECT ms.id, ms.direction, ms.score, ms.confidence, ms.summary, ms.factors_json, ms.market_key, ms.calculated_at, p.player_id, p.display_name AS player_name, p.position, t.team_abbreviation AS player_team, pl.line, pl.sportsbook, pl.over_price, pl.under_price, g.id AS game_id
    FROM matchup_signals ms JOIN games g ON g.id = ms.game_id JOIN players p ON p.player_id = ms.player_id LEFT JOIN teams t ON t.team_id = p.current_team_id LEFT JOIN prop_lines pl ON pl.id = ms.prop_line_id
    WHERE g.season = ? AND g.week = ? ORDER BY ms.score DESC, ms.confidence DESC LIMIT ?`).bind(season, week, limit).all();
  return json({ season, week, signals: result.results });
}

async function gameLogs(playerId: string, url: URL, db: D1Database) {
  const season = Number(url.searchParams.get("season"));
  if (!Number.isInteger(season)) return json({ error: "season is required." }, 400);
  const result = await db.prepare(`SELECT g.season, g.week, t.team_abbreviation AS opponent, s.position, s.passing_yards, s.passing_touchdowns, s.rushing_yards, s.rushing_touchdowns, s.receptions, s.receiving_yards, s.receiving_touchdowns, s.targets, s.carries
    FROM player_game_stats s JOIN games g ON g.id = s.game_id JOIN teams t ON t.team_id = s.opponent_team_id WHERE s.player_id = ? AND g.season = ? ORDER BY g.week DESC`).bind(playerId, season).all();
  return json({ playerId, season, gameLogs: result.results });
}

const propMetrics = new Set([
  "passing_yards", "passing_touchdowns", "rushing_yards", "rushing_touchdowns",
  "receptions", "receiving_yards", "receiving_touchdowns",
]);

type SupportedMarket = {
  metric: "passing_yards" | "passing_touchdowns" | "rushing_yards" | "rushing_touchdowns" | "receptions" | "receiving_yards" | "receiving_touchdowns" | "carries";
  label: string;
};

const supportedMarkets: Record<string, SupportedMarket> = {
  passing_yards: { metric: "passing_yards", label: "passing yards" },
  passing_touchdowns: { metric: "passing_touchdowns", label: "passing touchdowns" },
  rushing_yards: { metric: "rushing_yards", label: "rushing yards" },
  rushing_attempts: { metric: "carries", label: "rushing attempts" },
  receiving_yards: { metric: "receiving_yards", label: "receiving yards" },
  receiving_receptions: { metric: "receptions", label: "receptions" },
};

type LivePropCandidate = {
  event_id: string;
  commence_at: string | null;
  home_team_name: string;
  away_team_name: string;
  player_id: string;
  player_name: string;
  position: string;
  player_team_id: string;
  home_team_id: string;
  away_team_id: string;
  market_key: string;
  line: number;
  sportsbooks: number;
  sportsbook_names: string | null;
  sportsbook_quotes: string;
};

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

async function liveSignals(url: URL, db: D1Database) {
  const historySeason = Number(url.searchParams.get("historySeason")) || 2025;
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 100);
  // Build a bounded candidate pool. The board ranks this pool after calculating its
  // player and defense context; the API cache prevents repeat reads between refreshes.
  const candidateLimit = Math.min(Math.max(limit * 2, 20), 60);
  if (!Number.isInteger(historySeason)) return json({ error: "historySeason must be an integer." }, 400);

  const latest = await db.prepare("SELECT MAX(captured_at) AS captured_at FROM odds_player_props WHERE provider = 'sports_game_odds'").first<{ captured_at: string | null }>();
  if (!latest?.captured_at) return json({ error: "No sportsbook props have been imported yet." }, 404);
  const marketKeys = Object.keys(supportedMarkets);
  const candidates = await db.prepare(`WITH candidate_props AS (
      SELECT o.event_id, e.commence_at, e.home_team_name, e.away_team_name, p.player_id, p.display_name AS player_name,
        p.position, p.current_team_id AS player_team_id, home.team_id AS home_team_id, away.team_id AS away_team_id,
        o.market_key, ROUND(AVG(o.line), 2) AS line, COUNT(DISTINCT o.sportsbook) AS sportsbooks,
        GROUP_CONCAT(DISTINCT o.sportsbook) AS sportsbook_names,
        json_group_array(json_object('sportsbook', o.sportsbook, 'line', o.line)) AS sportsbook_quotes
      FROM odds_player_props o
      JOIN odds_events e ON e.provider = o.provider AND e.event_id = o.event_id
      JOIN players p ON lower(trim(p.display_name)) = lower(trim(o.player_name))
      JOIN teams home ON lower(home.team_name) = lower(e.home_team_name)
      JOIN teams away ON lower(away.team_name) = lower(e.away_team_name)
      WHERE o.provider = 'sports_game_odds' AND o.captured_at = ?
        AND o.odd_id LIKE '%-game-ou-over'
        AND o.market_key IN (${marketKeys.map(() => "?").join(", ")})
        AND (
          (o.market_key IN ('passing_yards', 'passing_touchdowns') AND p.position = 'QB')
          OR (o.market_key IN ('receiving_yards', 'receiving_receptions') AND p.position IN ('WR', 'TE', 'RB'))
          OR (o.market_key IN ('rushing_yards', 'rushing_attempts') AND p.position IN ('RB', 'QB', 'WR'))
        )
      GROUP BY o.event_id, o.player_name, o.market_key
    )
    SELECT * FROM candidate_props
    WHERE player_team_id = home_team_id OR player_team_id = away_team_id
    ORDER BY sportsbooks DESC, player_name ASC
    LIMIT ?`).bind(latest.captured_at, ...marketKeys, candidateLimit).all<LivePropCandidate>();

  // Select a real quoted line, never attach a book logo to a cross-book average.
  const candidatesWithOpponent = (candidates.results ?? []).flatMap(candidate => {
    let quotes: { sportsbook: string; line: number }[];
    try { quotes = JSON.parse(candidate.sportsbook_quotes); } catch { return []; }
    quotes = quotes.filter(q => typeof q.sportsbook === "string" && q.sportsbook && typeof q.line === "number" && Number.isFinite(q.line));
    const priority = (book: string) => book.toLowerCase().replace(/[^a-z]/g, "") === "draftkings" ? 0 : 1;
    quotes.sort((a,b) => priority(a.sportsbook) - priority(b.sportsbook) || a.sportsbook.localeCompare(b.sportsbook) || a.line - b.line);
    if (!quotes.length) return [];
    const quote = quotes[0];
    return [{ ...candidate, line: quote.line, selected_sportsbook: quote.sportsbook,
      opponent_team_id: candidate.player_team_id === candidate.home_team_id ? candidate.away_team_id : candidate.home_team_id }];
  });
  const statements: D1PreparedStatement[] = [];
  for (const candidate of candidatesWithOpponent) {
    const market = supportedMarkets[candidate.market_key];
    statements.push(db.prepare(`SELECT s.${market.metric} AS value, g.week, COALESCE(a.availability_status, 'unknown') AS availability_status, r.snap_share
      FROM player_game_stats s JOIN games g ON g.id = s.game_id
      LEFT JOIN player_game_availability a ON a.player_id = s.player_id AND a.game_id = s.game_id
      LEFT JOIN player_game_roles r ON r.player_id = s.player_id AND r.game_id = s.game_id
      WHERE s.player_id = ? AND g.season = ? AND COALESCE(a.availability_status, 'active') NOT IN ('out', 'inactive')
      ORDER BY g.week DESC LIMIT 5`).bind(candidate.player_id, historySeason));
    statements.push(db.prepare(`WITH defense_games AS (
        SELECT s.opponent_team_id AS defense_team_id, s.game_id, g.week, SUM(s.${market.metric}) AS allowed
        FROM player_game_stats s JOIN games g ON g.id = s.game_id
        WHERE g.season = ? AND s.position = ?
        GROUP BY s.opponent_team_id, s.game_id, g.week
      ), recent_defense AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY defense_team_id ORDER BY week DESC, game_id DESC) AS recency FROM defense_games
      ), recent_allowance AS (
        SELECT defense_team_id, AVG(allowed) AS recent_allowed, COUNT(*) AS recent_games FROM recent_defense WHERE recency <= 5 GROUP BY defense_team_id
      ), defense_averages AS (
        SELECT defense_team_id, AVG(allowed) AS average_allowed FROM defense_games GROUP BY defense_team_id
      ), league_average AS (
        SELECT AVG(average_allowed) AS league_average_allowed FROM defense_averages
      ), ranked AS (
        SELECT defense_team_id, average_allowed,
          league_average.league_average_allowed,
          RANK() OVER (ORDER BY average_allowed ASC) AS rank_fewest_allowed
        FROM defense_averages CROSS JOIN league_average
      ) SELECT ranked.average_allowed, ranked.league_average_allowed, ranked.rank_fewest_allowed, recent_allowance.recent_allowed, recent_allowance.recent_games FROM ranked LEFT JOIN recent_allowance USING (defense_team_id) WHERE ranked.defense_team_id = ?`).bind(historySeason, candidate.position, candidate.opponent_team_id));
    statements.push(db.prepare(`WITH recent_games AS (
        SELECT s.game_id, s.team_id
        FROM player_game_stats s JOIN games g ON g.id = s.game_id
        LEFT JOIN player_game_availability a ON a.player_id = s.player_id AND a.game_id = s.game_id
        WHERE s.player_id = ? AND g.season = ? AND COALESCE(a.availability_status, 'active') NOT IN ('out', 'inactive')
        ORDER BY g.week DESC LIMIT 5
      ) SELECT tc.head_coach, tc.offensive_coordinator, tc.offensive_play_caller, COUNT(*) AS games
      FROM recent_games rg
      JOIN team_game_context tc ON tc.game_id = rg.game_id AND tc.team_id = rg.team_id
      GROUP BY tc.head_coach, tc.offensive_coordinator, tc.offensive_play_caller
      ORDER BY games DESC LIMIT 1`).bind(candidate.player_id, historySeason));
  }
  // D1 batches have a maximum statement count. A full slate can contain more than 250
  // eligible player markets, and each needs history, defense, and team-context queries.
  const results: D1Result<unknown>[] = [];
  for (let index = 0; index < statements.length; index += 500) {
    results.push(...await db.batch(statements.slice(index, index + 500)));
  }
  const signals = candidatesWithOpponent.flatMap((candidate, index) => {
    const history = (results[index * 3]?.results ?? []) as { value: number; week: number; availability_status: string; snap_share: number | null }[];
    const defense = (results[index * 3 + 1]?.results?.[0] ?? null) as { average_allowed: number; league_average_allowed: number; rank_fewest_allowed: number; recent_allowed: number | null; recent_games: number } | null;
    const coaching = (results[index * 3 + 2]?.results?.[0] ?? null) as { head_coach: string | null; offensive_coordinator: string | null; offensive_play_caller: string | null; games: number } | null;
    if (history.length < 3 || !defense || !supportedMarkets[candidate.market_key]) return [];
    const values = history.map((row) => number(row.value));
    const documentedAvailabilityGames = history.filter((row) => row.availability_status !== "unknown").length;
    const limitedGames = history.filter((row) => row.availability_status === "limited").length;
    const snapShares = history.map((row) => row.snap_share).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const recentAverage = values.reduce((total, value) => total + value, 0) / values.length;
    const hitRate = values.filter((value) => value > candidate.line).length / values.length;
    const defenseAllowed = Number(defense.average_allowed);
    const leagueDefenseAllowed = Number(defense.league_average_allowed);
    const historyEdge = (recentAverage - candidate.line) / Math.max(candidate.line, 1);
    // Position-defense allowance is a team total, so compare it to the league's team total for that position.
    // Comparing it to an individual player's line would systematically exaggerate Over signals.
    const defenseEdge = (defenseAllowed - leagueDefenseAllowed) / Math.max(leagueDefenseAllowed, 1);
    const score = Math.round((clamp(historyEdge, -0.5, 0.5) * 0.7 + clamp(defenseEdge, -0.5, 0.5) * 0.3) * 1000) / 10;
    const direction = score >= 4 ? "over" : score <= -4 ? "under" : "neutral";
    const confidence = Math.round(clamp((values.length / 5) * 45 + Math.abs(score) * 0.55 + candidate.sportsbooks * 3, 0, 85));
    const market = supportedMarkets[candidate.market_key];
    const defenseRank = number(defense.rank_fewest_allowed);
    const summary = `${direction === "neutral" ? "Near the line" : direction.toUpperCase()} ${candidate.line} ${market.label}: last ${values.length} average ${recentAverage.toFixed(1)} (${Math.round(hitRate * 100)}% over); ${candidate.opponent_team_id} allows ${defenseAllowed.toFixed(1)} per game to ${candidate.position}s versus a league average of ${leagueDefenseAllowed.toFixed(1)} (rank ${defenseRank} fewest).`;
    return [{
      eventId: candidate.event_id,
      commenceAt: candidate.commence_at,
      matchup: `${candidate.away_team_name} at ${candidate.home_team_name}`,
      awayTeam: candidate.away_team_id,
      homeTeam: candidate.home_team_id,
      playerId: candidate.player_id,
      playerName: candidate.player_name,
      position: candidate.position,
      playerTeam: candidate.player_team_id,
      opponentTeam: candidate.opponent_team_id,
      marketKey: candidate.market_key,
      marketLabel: market.label,
      line: candidate.line,
      sportsbooks: candidate.sportsbooks,
      sportsbook: candidate.selected_sportsbook,
      lineSource: "quoted",
      oddsCapturedAt: latest.captured_at,
      historySeason,
      direction,
      score,
      confidence,
      recentGames: values.length,
      recentTotal: values.reduce((total, value) => total + value, 0),
      recentGameValues: history.map(row => ({ week: row.week, value: number(row.value) })),
      recentOverCount: values.filter(value => value > candidate.line).length,
      recentUnderCount: values.filter(value => value < candidate.line).length,
      recentPushCount: values.filter(value => value === candidate.line).length,
      defenseRecentAverageAllowed: defense.recent_allowed == null ? null : Math.round(defense.recent_allowed * 10) / 10,
      defenseRecentGames: defense.recent_games,
      recentAverage: Math.round(recentAverage * 10) / 10,
      hitRate: Math.round(hitRate * 100),
      defenseAverageAllowed: Math.round(defenseAllowed * 10) / 10,
      leagueDefenseAverageAllowed: Math.round(leagueDefenseAllowed * 10) / 10,
      defenseRankFewestAllowed: defenseRank,
      documentedAvailabilityGames,
      limitedGames,
      recentSnapShare: snapShares.length ? Math.round((snapShares.reduce((total, value) => total + value, 0) / snapShares.length) * 1000) / 10 : null,
      historicalHeadCoach: coaching?.head_coach ?? null,
      historicalPlayCaller: coaching?.offensive_play_caller ?? null,
      historicalCoachingGames: coaching?.games ?? 0,
      summary,
    }];
  }).sort((left, right) => Math.abs(right.score) - Math.abs(left.score) || right.confidence - left.confidence).slice(0, limit);
  return json({ historySeason, capturedAt: latest.captured_at, signals, excludedMarkets: ["touchdowns", "receiving_longestReception", "passing_completions", "passing_attempts", "rushing+receiving_yards", "passing+rushing_yards", "defense_sacks"] });
}

async function defensivePositionSplits(url: URL, db: D1Database) {
  const season = Number(url.searchParams.get("season"));
  const position = url.searchParams.get("position")?.toUpperCase();
  const metric = url.searchParams.get("metric") ?? "receiving_yards";
  const window = Math.min(Math.max(Number(url.searchParams.get("window")) || 18, 1), 18);
  if (!Number.isInteger(season) || !position || !propMetrics.has(metric)) {
    return json({ error: "season, position, and a supported metric are required." }, 400);
  }
  const result = await db.prepare(`WITH position_games AS (
      SELECT s.opponent_team_id AS defense_team_id, s.position, s.game_id, g.week,
        SUM(s.${metric}) AS metric_total, SUM(COALESCE(s.targets, 0)) AS targets_total,
        SUM(COALESCE(s.receptions, 0)) AS receptions_total
      FROM player_game_stats s
      JOIN games g ON g.id = s.game_id
      WHERE g.season = ? AND g.season_type = 'REG' AND s.position = ?
      GROUP BY s.opponent_team_id, s.position, s.game_id, g.week
    ), recent_games AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY defense_team_id, position ORDER BY week DESC) AS game_recency
      FROM position_games
    ), summaries AS (
      SELECT defense_team_id, position, COUNT(*) AS sample_games,
        ROUND(AVG(metric_total), 2) AS average_allowed,
        ROUND(AVG(targets_total), 2) AS average_targets_allowed,
        ROUND(AVG(receptions_total), 2) AS average_receptions_allowed
      FROM recent_games WHERE game_recency <= ?
      GROUP BY defense_team_id, position
    )
    SELECT t.team_id, t.team_abbreviation, t.team_name, summaries.position, summaries.sample_games,
      summaries.average_allowed, summaries.average_targets_allowed, summaries.average_receptions_allowed,
      RANK() OVER (ORDER BY summaries.average_allowed ASC) AS rank_fewest_allowed
    FROM summaries JOIN teams t ON t.team_id = summaries.defense_team_id
    ORDER BY rank_fewest_allowed ASC, t.team_abbreviation ASC`).bind(season, position, window).all();
  return json({ season, position, metric, window, defensiveSplits: result.results });
}

type SportsGameOddsEvent = {
  eventID?: string; id?: string; startTime?: string; commenceTime?: string;
  teams?: { home?: { names?: { long?: string } }; away?: { names?: { long?: string } } };
  odds?: Record<string, { oddID?: string; playerID?: string; statEntityID?: string; marketName?: string; statID?: string; sideID?: string; fairOverUnder?: string; bookOverUnder?: string; byBookmaker?: Record<string, { available?: boolean; overUnder?: string; odds?: string }> }>;
};

const numeric = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const inferredPlayerName = (sourceId?: string) => sourceId?.replace(/_NFL$/, "").replace(/_\d+$/, "").split("_").map((part) => part.charAt(0) + part.slice(1).toLowerCase()).join(" ") ?? null;

async function syncSportsGameOdds(env: Env) {
  if (!env.SPORTS_GAME_ODDS_API_KEY) return json({ error: "SPORTS_GAME_ODDS_API_KEY is not configured." }, 503);
  const source = new URL("https://api.sportsgameodds.com/v2/events");
  source.searchParams.set("apiKey", env.SPORTS_GAME_ODDS_API_KEY);
  source.searchParams.set("leagueID", "NFL");
  source.searchParams.set("oddsAvailable", "true");
  source.searchParams.set("includeAltLines", "false");
  source.searchParams.set("limit", "32");
  const response = await fetch(source, { headers: { "accept": "application/json" } });
  if (!response.ok) return json({ error: "SportsGameOdds request failed.", upstreamStatus: response.status }, 502);
  const payload = await response.json<unknown>();
  const root = payload as { events?: SportsGameOddsEvent[]; data?: SportsGameOddsEvent[] };
  const events = Array.isArray(payload) ? payload as SportsGameOddsEvent[] : root.events ?? root.data ?? [];
  const provider = "sports_game_odds";
  const capturedAt = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  let propsStored = 0;
  for (const event of events) {
    const eventId = String(event.eventID ?? event.id ?? "");
    if (!eventId) continue;
    statements.push(env.PLAYERPROP_DB.prepare(`INSERT INTO odds_events (provider, event_id, commence_at, home_team_name, away_team_name, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(provider, event_id) DO UPDATE SET commence_at = excluded.commence_at, home_team_name = excluded.home_team_name, away_team_name = excluded.away_team_name, fetched_at = excluded.fetched_at`)
      .bind(provider, eventId, event.startTime ?? event.commenceTime ?? null, event.teams?.home?.names?.long ?? null, event.teams?.away?.names?.long ?? null, capturedAt));
    for (const odd of Object.values(event.odds ?? {})) {
      if (odd.sideID !== "over") continue;
      for (const [sportsbook, book] of Object.entries(odd.byBookmaker ?? {})) {
        const line = numeric(book.overUnder ?? odd.fairOverUnder ?? odd.bookOverUnder);
        if (!book.available || line === null) continue;
        const opposite = odd.oddID ? event.odds?.[odd.oddID.replace(/-over$/, "-under")] : undefined;
        const under = opposite?.byBookmaker?.[sportsbook];
        statements.push(env.PLAYERPROP_DB.prepare(`INSERT INTO odds_player_props (provider, event_id, odd_id, player_source_id, player_name, market_key, sportsbook, line, over_price, under_price, captured_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(provider, eventId, odd.oddID ?? `${odd.statID}-${odd.statEntityID}`, odd.playerID ?? odd.statEntityID ?? null, inferredPlayerName(odd.playerID ?? odd.statEntityID), odd.statID ?? "unknown", sportsbook, line, numeric(book.odds), numeric(under?.odds), capturedAt));
        propsStored += 1;
      }
    }
  }
  for (let index = 0; index < statements.length; index += 500) await env.PLAYERPROP_DB.batch(statements.slice(index, index + 500));
  return json({ provider, eventsFound: events.length, propsStored, capturedAt });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    try {
    if (request.method === "GET" && url.pathname === "/health") return json({ ok: true, service: "drlocks-nfl-props-api" });
    const simulationResponse = await simulationRoute(request, env);
    if (simulationResponse) return simulationResponse;
    const dfsResponse = await dfsRoute(request, env.PLAYERPROP_DB, env.INGEST_TOKEN);
    if (dfsResponse) return dfsResponse;
    if (request.method === "POST" && url.pathname === "/api/ingest/player-stats") return ingestPlayerStats(request, env);
    if (request.method === "POST" && url.pathname === "/api/ingest/player-availability") return ingestAvailability(request, env);
    if (request.method === "POST" && url.pathname === "/api/ingest/player-roles") return ingestRoles(request, env);
    if (request.method === "POST" && url.pathname === "/api/ingest/team-context") return ingestTeamContext(request, env);
    if (request.method === "GET" && url.pathname === "/api/board") return board(url, env.PLAYERPROP_DB);
    if (request.method === "GET" && url.pathname === "/api/signals/live") {
      const cached = await caches.default.match(request);
      if (cached) return cached;
      const response = await liveSignals(url, env.PLAYERPROP_DB);
      if (response.ok) {
        response.headers.set("cache-control", "public, max-age=300");
        await caches.default.put(request, response.clone());
      }
      return response;
    }
    if (request.method === "GET" && url.pathname === "/api/defense/position-splits") return defensivePositionSplits(url, env.PLAYERPROP_DB);
    if (request.method === "POST" && url.pathname === "/api/admin/refresh-sports-game-odds") {
      if (!env.INGEST_TOKEN || request.headers.get("authorization") !== `Bearer ${env.INGEST_TOKEN}`) return unauthorized();
      return syncSportsGameOdds(env);
    }
    const logMatch = url.pathname.match(/^\/api\/players\/([^/]+)\/game-logs$/);
    if (request.method === "GET" && logMatch) return gameLogs(decodeURIComponent(logMatch[1]), url, env.PLAYERPROP_DB);
      if (request.method === "GET" && url.pathname === "/preview") {
        return env.ASSETS.fetch(new Request(new URL("/preview/index.html", url), request));
      }
      if (request.method === "GET" && (url.pathname === "/story" || url.pathname === "/story/")) {
        return env.ASSETS.fetch(new Request(new URL("/story/index.html", url), request));
      }
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error("Worker request failed", error);
      return json({ error: "Internal server error", detail: error instanceof Error ? error.message : "Unknown error" }, 500);
    }
  }
} satisfies ExportedHandler<Env>;
