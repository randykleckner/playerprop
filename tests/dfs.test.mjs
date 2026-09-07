import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";

// Exercise real SQLite constraints/queries and actual Worker route code without
// remote D1 or provider calls. These parent tables are TEST contracts, not a
// claimed production schema or a replacement bootstrap migration.
const temp = mkdtempSync(join(tmpdir(), "playerprop-dfs-tests-"));
for (const [source, target] of [["src/simulation/routes.ts", "simulation.mjs"], ["src/dfs/foundation.ts", "foundation.mjs"], ["src/index.ts", "worker.mjs"]]) {
  const code = readFileSync(source, "utf8").replace('"./dfs/foundation"', '"./foundation.mjs"').replace('"./simulation/routes"', '"./simulation.mjs"').replaceAll('../../public/simulation/', pathToFileURL(process.cwd() + '/public/simulation/').href);
  writeFileSync(join(temp, target), ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
}
const { normalizeImport, modelingCutoff, timestamp } = await import(pathToFileURL(join(temp, "foundation.mjs")));
const { default: worker } = await import(pathToFileURL(join(temp, "worker.mjs")));
after(() => rmSync(temp, { recursive: true, force: true }));

function database() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE teams (team_id TEXT PRIMARY KEY, team_abbreviation TEXT, team_name TEXT, updated_at TEXT);
    CREATE TABLE players (player_id TEXT PRIMARY KEY, display_name TEXT, position TEXT, current_team_id TEXT REFERENCES teams(team_id), updated_at TEXT);
    INSERT INTO teams VALUES ('CHI','CHI','Chicago Bears',NULL),('GB','GB','Green Bay Packers',NULL),('LA','LA','Los Angeles Rams',NULL);
    INSERT INTO players VALUES ('gsis-qb','Sample Quarterback','QB','CHI',NULL);`);
  for (const file of readdirSync("migrations").filter((f) => f.endsWith(".sql")).sort()) sql.exec(readFileSync(`migrations/${file}`, "utf8"));
  const prepare = (query, params = []) => ({
    bind: (...values) => prepare(query, values),
    first: async () => sql.prepare(query).get(...params) ?? null,
    all: async () => ({ results: sql.prepare(query).all(...params), success: true }),
    run: async () => ({ ...sql.prepare(query).run(...params), success: true }),
  });
  const db = { prepare, batch: async (statements) => {
    sql.exec("BEGIN");
    try { const results = []; for (const s of statements) results.push(await s.run()); sql.exec("COMMIT"); return results; }
    catch (e) { sql.exec("ROLLBACK"); throw e; }
  } };
  return { sql, db };
}

function payload() {
  return {
    slate: { id: "dk-test", provider: "DraftKings", season: 2099, week: 1, slate_name: "Test Main", slate_date: "2099-09-13", lock_time: "2099-09-13T17:00:00Z" },
    source: "test",
    salaries: [
      { player_name: "Sample Quarterback", player_id: "gsis-qb", provider_player_id: "1001", team: "CHI", opponent: "GB", position: "QB", salary: 6500 },
      { player_name: "Sample Receiver, Jr.", provider_player_id: "1002", team: "CHI", opponent: "GB", position: "WR", salary: 5100, raw_row: { Name: "Sample Receiver, Jr." } },
      { player_name: "Packers", provider_player_id: "1003", team: "GB", opponent: "CHI", position: "DST", salary: 3000 },
    ],
  };
}
async function fetchRoute(db, path, body, { token = "test-token", contentType = "application/json", method } = {}) {
  return worker.fetch(new Request(`https://local.test${path}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: { authorization: `Bearer ${token}`, "content-type": contentType },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  }), { PLAYERPROP_DB: db, INGEST_TOKEN: "test-token", ASSETS: { fetch: async () => new Response("existing static assets") } });
}
const route = "/api/ingest/dfs-salaries";

test("Classic configuration, FLEX, aliases and missing canonical IDs", () => {
  const p = payload(); p.salaries[1].team = "LAR";
  const normalized = normalizeImport(p);
  assert.equal(normalized.slate.salary_cap, 50000);
  assert.deepEqual(normalized.slate.roster_format, { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 1, DST: 1, flex_positions: ["RB", "WR", "TE"] });
  assert.deepEqual(normalized.salaries[1].eligible_positions, ["WR", "FLEX"]);
  assert.equal(normalized.salaries[1].team, "LA");
  assert.equal(normalized.salaries[1].player_id, null);
  assert.equal(normalized.salaries[2].player_id, null);
});

test("reject invalid roster variants, salaries, IDs, duplicates and dates", () => {
  const mutations = [
    (p) => p.slate.provider = "FanDuel", (p) => p.slate.salary_cap = 60000,
    (p) => p.slate.roster_format = { CPT: 1 }, (p) => p.slate.lock_time = "2099-09-13T17:00:00",
    (p) => p.slate.slate_date = "2099-02-30", (p) => p.slate.week = 19,
    (p) => p.salaries[0].salary = 0, (p) => p.salaries[0].salary = 50001,
    (p) => p.salaries[0].salary = 5000.5, (p) => p.salaries[0].salary = "5000",
    (p) => p.salaries[0].position = "CPT", (p) => p.salaries[0].eligible_positions = ["QB", "FLEX"],
    (p) => p.salaries[1].eligible_positions = ["WR"], (p) => p.salaries[1].eligible_positions = ["WR", "FLEX", "FLEX"],
    (p) => p.salaries[2].player_id = "gsis-qb", (p) => p.salaries[0].opponent = "CHI",
    (p) => p.salaries.push(p.salaries[0]), (p) => p.salaries[1].provider_player_id = "1001",
    (p) => p.salaries[0].provider_player_id = 1001, (p) => p.salaries = [],
  ];
  for (const mutate of mutations) { const p = payload(); mutate(p); assert.throws(() => normalizeImport(p)); }
  assert.throws(() => timestamp("2026-02-30T00:00:00Z"));
});

test("import is atomic, idempotent, source-preserving and leaves legacy data intact", async () => {
  const { sql, db } = database();
  try {
    assert.equal((await fetchRoute(db, route, payload(), { token: "wrong" })).status, 401);
    const response = await fetchRoute(db, route, payload());
    assert.equal(response.status, 200, await response.clone().text());
    const first = await response.json();
    const second = await (await fetchRoute(db, route, payload())).json();
    assert.equal(first.import_id, second.import_id);
    assert.equal(first.generated_at, second.generated_at);
    assert.equal(first.unmapped_players, 1);
    assert.equal(sql.prepare("SELECT COUNT(*) n FROM dfs_player_salaries").get().n, 3);
    assert.equal(sql.prepare("SELECT COUNT(*) n FROM ingest_runs").get().n, 1);
    assert.equal(sql.prepare("SELECT COUNT(*) n FROM players").get().n, 1);
    const source = JSON.parse(sql.prepare("SELECT details_json FROM ingest_runs").get().details_json);
    assert.equal(source.salaries[1].raw_row.Name, "Sample Receiver, Jr.");
    const board = await (await fetchRoute(db, "/api/dfs/slates/dk-test/salaries")).json();
    assert.equal(board.salaries.length, 3);
    assert.equal(board.import_id, first.import_id);
    assert.equal((await (await fetchRoute(db, "/health")).json()).ok, true);
    assert.equal(await (await fetchRoute(db, "/preview")).text(), "existing static assets");
    assert.equal((await fetchRoute(db, "/api/board?season=2099&week=1")).status, 200);
    assert.equal((await fetchRoute(db, "/api/players/gsis-qb/game-logs?season=2099")).status, 200);
  } finally { sql.close(); }
});

test("bad foreign keys and metadata conflicts cannot partially mutate imports", async (t) => {
  const { sql, db } = database();
  try {
    const wrongPlayer = payload(); wrongPlayer.salaries[0].player_id = "not-a-player";
    assert.equal((await fetchRoute(db, route, wrongPlayer)).status, 422);
    assert.equal(sql.prepare("SELECT COUNT(*) n FROM dfs_slates").get().n, 0);
    const wrongTeam = payload(); wrongTeam.salaries[0].team = "XYZ";
    assert.equal((await fetchRoute(db, route, wrongTeam)).status, 422);
    const wrongGame = payload(); wrongGame.salaries[0].game_id = "unknown-game";
    assert.equal((await fetchRoute(db, route, wrongGame)).status, 422);
    assert.equal((await fetchRoute(db, route, payload())).status, 200);
    const conflict = payload(); conflict.slate.lock_time = "2099-09-13T18:00:00Z";
    assert.equal((await fetchRoute(db, route, conflict)).status, 409);
    assert.equal(sql.prepare("SELECT COUNT(*) n FROM ingest_runs").get().n, 1);
    sql.exec("CREATE TRIGGER force_salary_failure BEFORE INSERT ON dfs_player_salaries BEGIN SELECT RAISE(ABORT, 'test rollback'); END;");
    const fail = payload(); fail.slate.id = "rollback-test";
    const errorLog = t.mock.method(console, "error", () => {});
    assert.equal((await fetchRoute(db, route, fail)).status, 500);
    assert.equal(errorLog.mock.callCount(), 1);
    assert.equal(sql.prepare("SELECT COUNT(*) n FROM dfs_slates").get().n, 1);
    assert.equal(sql.prepare("SELECT COUNT(*) n FROM ingest_runs").get().n, 1);
  } finally { sql.close(); }
});

test("historical cutoff clamps to lock and selects a whole eligible snapshot", async () => {
  const { sql, db } = database();
  try {
    assert.equal(modelingCutoff("2099-09-14T00:00:00Z", "2099-09-13T17:00:00Z"), "2099-09-13T17:00:00.000Z");
    assert.equal(timestamp("2099-09-13T12:00:00-05:00"), "2099-09-13T17:00:00.000Z");
    const p = payload(); p.salaries[0].available_at = "2000-01-01T00:00:00Z";
    const first = await (await fetchRoute(db, route, p)).json();
    assert.ok(first.data_as_of > "2000-01-01T00:00:00Z"); // Input cannot backdate capture.
    // Fixed source times are only injected directly into an isolated TEST database.
    sql.prepare("UPDATE dfs_player_salaries SET available_at=?, imported_at=? WHERE import_id=?").run("2099-09-13T15:00:00.000Z", "2099-09-13T15:00:00.000Z", first.import_id);
    sql.prepare("UPDATE ingest_runs SET completed_at=? WHERE id=?").run("2099-09-13T15:00:00.000Z", first.import_id);
    const next = payload(); next.salaries = [next.salaries[0]]; next.salaries[0].salary = 7000;
    const second = await (await fetchRoute(db, route, next)).json();
    sql.prepare("UPDATE dfs_player_salaries SET available_at=? WHERE import_id=?").run("2099-09-13T16:00:00.000Z", second.import_id);
    sql.prepare("UPDATE ingest_runs SET completed_at=? WHERE id=?").run("2099-09-13T16:00:00.000Z", second.import_id);
    const before = await (await fetchRoute(db, "/api/dfs/slates/dk-test/salaries?as_of=2099-09-13T14:00:00Z")).json();
    assert.equal(before.salaries.length, 0);
    const prior = await (await fetchRoute(db, "/api/dfs/slates/dk-test/salaries?as_of=2099-09-13T15:30:00Z")).json();
    assert.equal(prior.salaries.length, 3);
    assert.equal(prior.import_id, first.import_id);
    const atCapture = await (await fetchRoute(db, "/api/dfs/slates/dk-test/salaries?as_of=2099-09-13T15:00:00Z")).json();
    assert.equal(atCapture.import_id, first.import_id); // Equality is available.
    const current = await (await fetchRoute(db, "/api/dfs/slates/dk-test/salaries?as_of=2099-09-13T18:00:00Z")).json();
    assert.equal(current.salaries.length, 1); // Never carry removed players forward.
    assert.equal(current.salaries[0].salary, 7000);
    sql.prepare("UPDATE ingest_runs SET completed_at=? WHERE id=?").run("2099-09-13T17:00:01.000Z", second.import_id);
    const afterLock = await (await fetchRoute(db, "/api/dfs/slates/dk-test/salaries?as_of=2099-09-13T18:00:00Z")).json();
    assert.equal(afterLock.import_id, first.import_id); // Completion after lock is excluded too.
    sql.prepare("UPDATE dfs_player_salaries SET available_at=? WHERE import_id=?").run("2099-09-13T15:00:00.000Z", second.import_id);
    sql.prepare("UPDATE ingest_runs SET completed_at=? WHERE id=?").run("2099-09-13T15:00:00.000Z", second.import_id);
    const tied = await (await fetchRoute(db, "/api/dfs/slates/dk-test/salaries?as_of=2099-09-13T18:00:00Z")).json();
    assert.equal(tied.import_id, second.import_id); // Same millisecond: later run wins.
  } finally { sql.close(); }
});

test("HTTP validation and missing migration responses", async () => {
  const { sql, db } = database();
  try {
    assert.equal((await fetchRoute(db, route, "{bad")).status, 400);
    assert.equal((await fetchRoute(db, route, payload(), { contentType: "text/csv" })).status, 415);
    assert.equal((await fetchRoute(db, route, "x".repeat(1024 * 1024 + 1))).status, 413);
    assert.equal((await fetchRoute(db, route, undefined)).status, 405);
    assert.equal((await fetchRoute(db, "/api/dfs/slates?week=-1")).status, 400);
    assert.equal((await fetchRoute(db, "/api/dfs/slates/missing/salaries")).status, 404);
    sql.exec("DROP TABLE dfs_player_salaries; DROP TABLE dfs_slates;");
    assert.equal((await fetchRoute(db, "/api/dfs/slates")).status, 503);
    assert.equal((await fetchRoute(db, "/health")).status, 200);
  } finally { sql.close(); }
});

test('Doctor Chart uses an actual sportsbook quote and exact recent totals/defensive window', async () => {
  const {sql,db}=database();
  db.batch=async statements=>Promise.all(statements.map(s=>s.all()));
  globalThis.caches={default:{match:async()=>undefined,put:async()=>{}}};
  sql.exec(`UPDATE teams SET team_name='Chicago Bears' WHERE team_id='CHI'; UPDATE teams SET team_name='Green Bay Packers' WHERE team_id='GB';
    INSERT INTO odds_events VALUES ('sports_game_odds','event','2026-09-13T17:00:00Z','Green Bay Packers','Chicago Bears','2026-09-06T12:00:00Z');
    INSERT INTO odds_player_props(provider,event_id,odd_id,player_name,market_key,sportsbook,line,captured_at) VALUES
    ('sports_game_odds','event','passing-game-ou-over','Sample Quarterback','passing_yards','fanduel',250.5,'2026-09-06T12:00:00Z'),
    ('sports_game_odds','event','passing-game-ou-over','Sample Quarterback','passing_yards','draftkings',275.5,'2026-09-06T12:00:00Z');`);
  for(let week=1;week<=6;week++){
    sql.prepare('INSERT INTO games(id,season,week,home_team_id,away_team_id) VALUES (?,2025,?,\'CHI\',\'GB\')').run(`g${week}`,week);
    sql.prepare('INSERT INTO player_game_stats(player_id,game_id,team_id,opponent_team_id,position,passing_yards) VALUES (\'gsis-qb\',?,\'CHI\',\'GB\',\'QB\',?)').run(`g${week}`,week*50);
  }
  const response=await fetchRoute(db,'/api/signals/live?historySeason=2025');assert.equal(response.status,200);
  const data=await response.json();const s=data.signals[0];assert.equal(s.line,275.5);assert.equal(s.sportsbook,'draftkings');assert.equal(s.lineSource,'quoted');
  assert.equal(s.recentTotal,1000);assert.equal(s.recentAverage,200);assert.equal(s.recentUnderCount,4);assert.equal(s.recentOverCount,1);assert.equal(s.recentPushCount,0);
  assert.equal(s.defenseRecentGames,5);assert.equal(s.defenseRecentAverageAllowed,200);assert.equal(s.defenseAverageAllowed,175);assert.equal(s.historySeason,2025);
  sql.close();
});

test('simulation API authenticates, bounds work, persists and retrieves immutable summaries', async () => {
  const {sql,db}=database();
  const input=JSON.parse(readFileSync('public/simulation/slates/151307.json','utf8'));
  const env={PLAYERPROP_DB:db,INGEST_TOKEN:'research-test-token',ASSETS:{fetch:async request=>new URL(request.url).pathname.endsWith('/151307.json')?Response.json(input):new Response('missing',{status:404})}};
  const call=(path,body,token='research-test-token')=>worker.fetch(new Request(`https://local.test${path}`,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${token}`},body:body===undefined?undefined:JSON.stringify(body)}),env);
  const path='/api/dfs/simulations/slate';
  assert.equal((await call(path,{slate_id:'151307'},'wrong')).status,401);
  assert.equal((await call(path,{slate_id:'151307',mode:'deep'})).status,422);
  assert.equal((await call(path,{slate_id:'151307',simulation_count:101})).status,422);
  assert.equal((await call(path,{slate_id:'151307',junk:'x'.repeat(21000)})).status,413);
  assert.equal((await call(path,{slate_id:'999'})).status,404);
  const body={slate_id:'151307',simulation_count:10,seed:'api-test',persist:true};
  const response=await call(path,body);assert.equal(response.status,200);const result=await response.json();
  assert.equal(result.players.length,329);assert.equal(result.stacks.length,120);
  assert.equal((await call(path,body)).status,409);
  const saved=await call(`/api/dfs/simulations/${result.run_id}`);assert.deepEqual(await saved.json(),result);
  const stacks=await call('/api/dfs/stacks/151307');assert.equal((await stacks.json()).stacks.length,120);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM dfs_simulation_runs').get().n,1);
  assert.equal((await call('/api/dfs/simulations/lineup',{slate_id:'151307',lineup:[]})).status,400);
  sql.close();
});
