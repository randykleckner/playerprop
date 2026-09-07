/** DraftKings NFL Classic foundation. No projections or contest probabilities yet. */
export const CLASSIC_RULES = {
  salary_cap: 50000,
  roster_format: { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 1, DST: 1, flex_positions: ["RB", "WR", "TE"] },
} as const;
export const IMPORT_VERSION = "dfs-salary-import-v1";
const MAX_BYTES = 1024 * 1024;
const positions = ["QB", "RB", "WR", "TE", "DST"];
const aliases: Record<string, string> = { JAC: "JAX", LAR: "LA", WSH: "WAS", OAK: "LV", SD: "LAC", STL: "LA" };

class InputError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InputError("Expected a JSON object.");
  return value as Record<string, unknown>;
}
function text(value: unknown, field: string, max = 160): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value)) throw new InputError(`Invalid ${field}.`);
  return value.trim();
}
function optionalText(value: unknown, field: string): string | null {
  return value == null || value === "" ? null : text(value, field);
}
function integer(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw new InputError(`${field} must be an integer from ${min} to ${max}.`);
  return value;
}
export function timestamp(value: unknown): string {
  const input = text(value, "timestamp");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(input) || !Number.isFinite(Date.parse(input))) throw new InputError("Use an ISO timestamp with seconds and an explicit timezone.");
  const date = input.slice(0, 10);
  if (new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new InputError("Invalid calendar date.");
  return new Date(input).toISOString();
}
export function modelingCutoff(asOf: string, lock: string): string {
  return [timestamp(asOf), timestamp(lock)].sort()[0];
}
function team(value: unknown): string {
  const code = text(value, "team", 3).toUpperCase();
  return aliases[code] ?? code;
}

export function normalizeImport(input: unknown) {
  const body = object(input);
  const s = object(body.slate);
  if (s.provider !== "DraftKings") throw new InputError("Only DraftKings NFL Classic is supported.");
  const slate = {
    id: text(s.id, "slate.id", 100), provider: "DraftKings",
    season: integer(s.season, "season", 2000, 2100), week: integer(s.week, "week", 1, 18),
    slate_name: text(s.slate_name, "slate_name"), slate_date: text(s.slate_date, "slate_date", 10),
    lock_time: timestamp(s.lock_time), salary_cap: CLASSIC_RULES.salary_cap,
    roster_format: CLASSIC_RULES.roster_format,
  };
  if (!/^[a-zA-Z0-9_-]+$/.test(slate.id)) throw new InputError("slate.id permits letters, numbers, underscores and hyphens.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(slate.slate_date) || timestamp(`${slate.slate_date}T00:00:00Z`).slice(0, 10) !== slate.slate_date) throw new InputError("Invalid slate_date.");
  if (s.salary_cap != null && s.salary_cap !== 50000) throw new InputError("NFL Classic requires a $50,000 cap.");
  if (s.roster_format != null && JSON.stringify(s.roster_format) !== JSON.stringify(CLASSIC_RULES.roster_format)) throw new InputError("Unsupported roster_format; omit it to use NFL Classic.");
  if (!Array.isArray(body.salaries) || body.salaries.length < 1 || body.salaries.length > 1000) throw new InputError("Provide a complete snapshot of 1–1000 salaries.");
  const keys = new Set<string>(), identities = new Set<string>(), canonicalIds = new Set<string>();
  const salaries = body.salaries.map((value) => {
    const row = object(value);
    const position = text(row.position, "position").toUpperCase();
    if (!positions.includes(position)) throw new InputError("Only QB, RB, WR, TE and DST positions are supported.");
    const player_name = text(row.player_name, "player_name");
    const provider_player_id = optionalText(row.provider_player_id, "provider_player_id");
    const player_id = optionalText(row.player_id, "player_id");
    const teamId = team(row.team), opponent = team(row.opponent);
    if (teamId === opponent) throw new InputError("A player cannot face their own team.");
    if (position === "DST" && player_id) throw new InputError("DST must use team identity; leave player_id null.");
    const identity = position === "DST" ? `DST:${teamId}` : JSON.stringify([player_name.toLowerCase(), teamId, position]);
    const salary_key = provider_player_id ? `dk:${provider_player_id}` : identity;
    if (keys.has(salary_key) || identities.has(identity) || (player_id && canonicalIds.has(player_id))) throw new InputError(`Duplicate salary/player: ${player_name}.`);
    keys.add(salary_key); identities.add(identity); if (player_id) canonicalIds.add(player_id);
    const allowed = [position, ...(["RB", "WR", "TE"].includes(position) ? ["FLEX"] : [])];
    const eligible = row.eligible_positions ?? allowed;
    if (!Array.isArray(eligible) || eligible.length !== allowed.length || new Set(eligible).size !== eligible.length || !allowed.every((p) => eligible.includes(p))) throw new InputError(`Invalid NFL Classic eligibility for ${position}.`);
    const home_away = optionalText(row.home_away, "home_away");
    if (home_away && !["home", "away"].includes(home_away)) throw new InputError("home_away must be home, away or null.");
    return {
      salary_key, player_id, provider_player_id, player_name, team: teamId, opponent, position,
      salary: integer(row.salary, "salary", 1, 50000), game_id: optionalText(row.game_id, "game_id"),
      home_away, eligible_positions: allowed, status: optionalText(row.status, "status"),
      raw_row: row.raw_row == null ? null : object(row.raw_row),
    };
  }).sort((a, b) => a.salary_key < b.salary_key ? -1 : a.salary_key > b.salary_key ? 1 : 0);
  return { slate, salaries, source: text(body.source, "source"), model_version: IMPORT_VERSION };
}

async function readBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new InputError("Use application/json.", 415);
  if (!request.body) throw new InputError("Missing request body.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new InputError("Salary import exceeds 1 MiB.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes)); }
  catch { throw new InputError("Invalid JSON body."); }
}
async function authorized(request: Request, token?: string): Promise<boolean> {
  if (!token) return false;
  const hash = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  const [actual, expected] = await Promise.all([hash(request.headers.get("authorization") ?? ""), hash(`Bearer ${token}`)]);
  let difference = 0;
  for (let i = 0; i < actual.length; i++) difference |= actual[i] ^ expected[i];
  return difference === 0;
}

async function ingest(request: Request, db: D1Database, token?: string) {
  if (!await authorized(request, token)) return json({ error: "Unauthorized" }, 401);
  const body = normalizeImport(await readBody(request));
  const serialized = JSON.stringify(body);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(serialized));
  const importId = `dfs-${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  const capturedAt = new Date().toISOString();
  const s = body.slate;
  // Explicit canonical IDs only: names and latest-team fields are not reliable crosswalks.
  // Bulk validation and insertion keep a complete file within a few D1 statements.
  const invalid = await db.prepare(`SELECT
      json_extract(j.value, '$.player_name') AS player_name
    FROM json_each(?) j
    LEFT JOIN teams t ON t.team_id = json_extract(j.value, '$.team')
    LEFT JOIN teams o ON o.team_id = json_extract(j.value, '$.opponent')
    LEFT JOIN players p ON p.player_id = json_extract(j.value, '$.player_id')
    LEFT JOIN games g ON g.id = json_extract(j.value, '$.game_id')
    WHERE t.team_id IS NULL OR o.team_id IS NULL
      OR (json_extract(j.value, '$.player_id') IS NOT NULL AND
        (p.player_id IS NULL OR p.position != json_extract(j.value, '$.position')))
      OR (json_extract(j.value, '$.game_id') IS NOT NULL AND
        (g.id IS NULL OR g.season != ? OR g.week != ? OR g.season_type != 'REG'
          OR NOT ((g.home_team_id = t.team_id AND g.away_team_id = o.team_id)
               OR (g.home_team_id = o.team_id AND g.away_team_id = t.team_id))))
    LIMIT 1`).bind(JSON.stringify(body.salaries), s.season, s.week).first<{ player_name: string }>();
  if (invalid) throw new InputError(`Unknown or inconsistent team/player/game identity for ${invalid.player_name}. Verify mappings or leave canonical IDs null.`, 422);
  await db.batch([
    db.prepare(`INSERT INTO dfs_slates (id, provider, season, week, slate_name, slate_date, lock_time, salary_cap, roster_format, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET provider=excluded.provider, season=excluded.season, week=excluded.week,
        slate_name=excluded.slate_name, slate_date=excluded.slate_date, lock_time=excluded.lock_time,
        salary_cap=excluded.salary_cap, roster_format=excluded.roster_format`).bind(s.id, s.provider, s.season, s.week, s.slate_name, s.slate_date, s.lock_time, s.salary_cap, JSON.stringify(s.roster_format), capturedAt, capturedAt),
    db.prepare(`INSERT INTO ingest_runs (id, source, status, started_at, records_received, details_json)
      VALUES (?, 'dfs_salaries', 'running', ?, ?, ?) ON CONFLICT(id) DO NOTHING`).bind(importId, capturedAt, body.salaries.length, serialized),
    db.prepare(`INSERT INTO dfs_player_salaries
      (slate_id, import_id, salary_key, player_id, provider_player_id, player_name, team, opponent, position,
       salary, game_id, home_away, eligible_positions, status, imported_at, available_at)
      SELECT ?, ?, json_extract(value, '$.salary_key'), json_extract(value, '$.player_id'),
        json_extract(value, '$.provider_player_id'), json_extract(value, '$.player_name'), json_extract(value, '$.team'),
        json_extract(value, '$.opponent'), json_extract(value, '$.position'), json_extract(value, '$.salary'),
        json_extract(value, '$.game_id'), json_extract(value, '$.home_away'), json_extract(value, '$.eligible_positions'),
        json_extract(value, '$.status'), ?, ? FROM json_each(?) WHERE true
      ON CONFLICT(slate_id, import_id, salary_key) DO NOTHING`).bind(s.id, importId, capturedAt, capturedAt, JSON.stringify(body.salaries)),
    db.prepare(`UPDATE ingest_runs SET status='complete', completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id=? AND status='running'`).bind(importId),
  ]);
  const run = await db.prepare("SELECT started_at, completed_at FROM ingest_runs WHERE id=?").bind(importId).first<{ started_at: string; completed_at: string }>();
  return json({ slate_id: s.id, import_id: importId, rows: body.salaries.length,
    unmapped_players: body.salaries.filter((row) => row.position !== "DST" && !row.player_id).length,
    model_version: IMPORT_VERSION, generated_at: run?.completed_at, data_as_of: run?.started_at,
    eligible_before_lock: !!run && run.completed_at <= s.lock_time });
}

async function salaries(url: URL, id: string, db: D1Database) {
  const slate = await db.prepare("SELECT * FROM dfs_slates WHERE id=?").bind(id).first<{ lock_time: string; roster_format: string }>();
  if (!slate) return json({ error: "Slate not found." }, 404);
  const asOf = timestamp(url.searchParams.get("as_of") ?? new Date().toISOString());
  const cutoff = modelingCutoff(asOf, slate.lock_time);
  const snapshot = await db.prepare(`SELECT s.import_id, r.started_at, r.completed_at FROM dfs_player_salaries s
    JOIN ingest_runs r ON r.id=s.import_id
    WHERE s.slate_id=? AND s.available_at<=? AND r.completed_at<=? AND r.status='complete'
    ORDER BY r.completed_at DESC, s.available_at DESC, r.rowid DESC LIMIT 1`).bind(id, cutoff, cutoff).first<{ import_id: string; started_at: string; completed_at: string }>();
  const result = snapshot ? await db.prepare("SELECT * FROM dfs_player_salaries WHERE slate_id=? AND import_id=? ORDER BY salary DESC, salary_key").bind(id, snapshot.import_id).all<{ eligible_positions: string; position: string; player_id: string | null }>() : null;
  const rows = (result?.results ?? []).map((row) => ({ ...row, eligible_positions: JSON.parse(row.eligible_positions) }));
  return json({ slate: { ...slate, roster_format: JSON.parse(slate.roster_format) }, as_of: cutoff,
    import_id: snapshot?.import_id ?? null, generated_at: snapshot?.completed_at ?? null,
    data_as_of: snapshot?.started_at ?? null, model_version: IMPORT_VERSION, salaries: rows,
    unmapped_players: rows.filter((row) => row.position !== "DST" && !row.player_id).length });
}

/** Return null for unrelated routes so the existing prop board remains in control. */
export async function dfsRoute(request: Request, db: D1Database, token?: string): Promise<Response | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/dfs\/slates\/([a-zA-Z0-9_-]+)\/salaries$/);
  try {
    if (url.pathname === "/api/ingest/dfs-salaries") {
      return request.method === "POST" ? await ingest(request, db, token) : json({ error: "Use POST." }, 405);
    }
    if (match) return request.method === "GET" ? await salaries(url, match[1], db) : json({ error: "Use GET." }, 405);
    if (url.pathname === "/api/dfs/slates") {
      if (request.method !== "GET") return json({ error: "Use GET." }, 405);
      const season = url.searchParams.has("season") ? integer(Number(url.searchParams.get("season")), "season", 2000, 2100) : null;
      const week = url.searchParams.has("week") ? integer(Number(url.searchParams.get("week")), "week", 1, 18) : null;
      const result = await db.prepare(`SELECT * FROM dfs_slates WHERE (? IS NULL OR season=?) AND (? IS NULL OR week=?) ORDER BY lock_time DESC, id LIMIT 100`).bind(season, season, week, week).all<{ roster_format: string }>();
      return json({ slates: result.results.map((s) => ({ ...s, roster_format: JSON.parse(s.roster_format) })) });
    }
    if (url.pathname.startsWith("/api/dfs/")) return json({ error: "DFS route not found." }, 404);
    return null;
  } catch (error) {
    if (error instanceof InputError) return json({ error: error.message }, error.status);
    const message = error instanceof Error ? error.message : "";
    if (message.includes("DFS slate metadata is immutable")) return json({ error: "Slate metadata differs. Use a new slate ID." }, 409);
    if (message.includes("no such table")) return json({ error: "DFS database prerequisites/migration are not installed." }, 503);
    console.error("DFS request failed", error);
    return json({ error: "DFS database operation failed." }, 500);
  }
}
