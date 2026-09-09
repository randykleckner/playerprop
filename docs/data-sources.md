# Data sources and operations

## Source inventory

Weekly projected points are now supported through a separate public ESPN adapter. See [weekly projection operations and scoring assumptions](weekly-projections.md). This is currently one connected projection source; the provider/consensus layer supports additional compatible sources without mixing ESPN native totals with DraftKings estimates.

| Source | Current adapter and stored subset | Availability limits |
| --- | --- | --- |
| [NFLverse weekly player stats](https://github.com/nflverse/nflverse-data/releases/tag/stats_player) | `ingest_nflverse.py`; regular-season offensive and selected defensive player-game stats | Missing numeric input becomes zero; upserts erase prior revisions; source publication time not retained |
| [NFLverse injuries](https://github.com/nflverse/nflverse-data/releases/tag/injuries) | `ingest_context_nflverse.py`; status, injury, practice notes | No reported_at imported; absence of a record is not proof of health |
| [NFLverse weekly rosters](https://github.com/nflverse/nflverse-data/releases/tag/weekly_rosters) | Context script maps PFR IDs to GSIS | Used transiently, not a current roster/depth-chart store |
| [NFLverse snap counts](https://github.com/nflverse/nflverse-data/releases/tag/snap_counts) | Context script imports offense_snaps and offense_pct | No routes/personnel features imported |
| [NFLverse play-by-play](https://github.com/nflverse/nflverse-data/releases/tag/pbp) | Context script extracts head coaches once per game | No conditional play-caller statistics retained |
| NFLverse players/teams releases | Media builders -> public player/team JSON | Static headshot/logo URL maps, not analytical history |
| [SportsGameOdds](https://sportsgameodds.com/) | Private Worker refresh -> odds_events, odds_player_props | Selected O/U observations only; no full response archive, moneyline/spread pipeline, quota telemetry or historical publication proof |
| Public DraftKings lobby/draftables (unofficial) | `dfs/draftkings.py` -> provider-neutral observations, raw archive and local D1 diagnostic | Anonymous GET only; selection/refresh guards; fragile undocumented schema; no production schedule |
| User-supplied DraftKings-compatible salary CSV | Existing importer and `CsvSalaryProvider` fallback | Requires explicit slate identity and verified lock time. No ownership data or contest results |

These URLs identify configured sources; this audit did not refresh their datasets or call the paid provider. The actual stored years/counts and freshness are now verified in [the live D1 audit](d1-live-audit.md).

The new DraftKings diagnostic was separately exercised against both public endpoints on September 6, 2026. See [recorded diagnostic findings](draftkings-diagnostic-2026-09-06.md).

## Automated public DraftKings salary discovery

`scripts/dfs/providers.py` defines the `DfsSalaryProvider` contract and `SalarySnapshot` with source, fetched_at, slate metadata, normalized records, raw source representation and warnings. `DraftKingsWebProvider` and `CsvSalaryProvider` both return it. DraftKings JSON interpretation is isolated in `scripts/dfs/draftkings.py`; the HTTP cache, mapping, quality reporting and storage modules consume the shared contract. Existing NFL and sportsbook ingestion routes do not import or execute this adapter.

Only these URLs are permitted by the anonymous transport:

- `https://www.draftkings.com/lobby/getcontests?sport=NFL`
- `https://api.draftkings.com/draftgroups/v1/draftgroups/{draftGroupId}/draftables`

These are **unofficial, undocumented interfaces**, with no availability or compatibility guarantee. There are no authenticated requests, cookies, account actions, authentication automation, contest entry, lineup submission or wagering. Redirects are rejected. Requests identify themselves as `playerprop-nfl-salary-reader/1.0 (public salary research; anonymous read-only)`.

### Observed schema and explicit selection

Lobby fields currently include `SelectedSport`, `DraftGroups`, `Contests`, `GameTypes`, and `GameSets`. Draft groups use `DraftGroupId`, `Sport`, `GameCount`, `StartDate`, `GameTypeId`, `ContestTypeId`, and `GameSetKey`. Contest references use `dg`, `gameType`, `gameTypeId`, and `sd` (a `/Date(milliseconds)/` value). The adapter joins game-type names and game-set competitions, deduplicates groups by ID, and flags contradictory metadata. Contest-only groups are retained but cannot be automatically selected without a known game count.

`config/dfs-salaries.json` configures the Main Slate window. Defaults: NFL, exact `Classic` type, at least two games, Sunday starts between 12:00 inclusive and 14:00 exclusive in `America/New_York`. Optional `--slate-date` filters the local calendar date. Selection excludes locked groups, missing/conflicting metadata, Showdown, Madden, Snake, Best Ball and unknown variants. It chooses the nearest eligible date, then the largest game count on that date. A tie requires an explicit group ID; array ordering and contest prize amounts never choose the slate. This is a configurable selection rule, not a guarantee that a provider labels it “Main.”

Draftables fields observed: `draftableId`, `playerId`, `playerDkId`, `displayName`, `firstName`, `lastName`, `position`, `salary`, `status`, `isDisabled`, `rosterSlotId`, `teamId`, `teamAbbreviation`, nested `competition`, and top-level `competitions` with home/away teams and start times. Seven-digit fractional ISO timestamps are normalized to UTC milliseconds. An empty `errorStatus` object is currently a success response.

Classic emits distinct position and FLEX draftable IDs for many players. Matching salary/context rows collapse to one record with all `draftable_ids`. Repeated identical draftable IDs get a `duplicate_draftable` flag. Conflicting salary/context or reused draftable IDs across players fail the web import rather than selecting an arbitrary record. The raw archive retains every original row. Known competition count and earliest kickoff must agree with lobby metadata. Missing optional values remain null; missing salary/opponent/start/team/name/position are flagged instead of manufactured. Explicit unsupported positions/contest formats and unrecognized envelopes fail with a provider-specific error.

### Refresh and failure policy

Invoke the diagnostic periodically from a local runner when desired; no Cron job, background process or production schedule is installed. The client uses a durable local cache and an exclusive process lock:

- Lobby discovery: at most once every six hours by default.
- Selected player pool: first request immediately, then at most once every two hours before lock.
- Configured cache intervals have a 30-minute floor; network request starts are spaced by at least five seconds (configurable up to 60).
- Failures impose at least one hour of backoff, honoring a longer `Retry-After`. There are no immediate retries or endpoint fan-out.
- Cached reads preserve the original `fetched_at` and do not create a new observation. Each fresh successful fetch has its own timestamp even when salaries are identical.
- Refresh stops at lock. `--debug-after-lock` is explicit diagnostic access and retains rate limits; resulting post-lock observations are excluded by the downstream `latest()` reader.
- A salary observation older than three hours is flagged stale. Historical staleness is evaluated at lock, not indefinitely after a slate ends.

HTTP/JSON/schema failures leave existing snapshots intact. `--csv-fallback` uses a complete CSV belonging to the same selected slate. If the lobby itself fails, supply reviewed normalized metadata with `--slate-json` plus the CSV, or use the original CSV importer below. Fallback is reported with its own source and acquisition timestamp; it is never labeled as a fresh web response.

### Snapshot storage and identity

Every successful ingestion is archived as an exclusively created gzip JSON file under ignored `.dfs-salaries/snapshots/`. The archive includes the raw lobby and draftables observations (each with its own fetch time), normalized records and metadata. Its content-addressed ID includes source and fetched_at, so replaying an observation is idempotent and a later identical fetch is distinct.

Migration `0007_dfs_provider_snapshots.sql` adds a source-observation manifest, normalized JSON records, chunked gzip/base64 raw data and `dfs_player_id_mappings`. Raw chunks avoid large D1 SQL statements; a SHA-256 digest verifies reconstruction. Completion requires all declared records/chunks. Readers use only complete snapshots, and triggers prevent edits, deletions or appended rows after completion. An interrupted local write remains incomplete and can be resumed; it is not visible as a successful observation.

These are **source observations**, with weaker completeness requirements than the existing `dfs_player_salaries` model-ready contract. They intentionally retain disabled/incomplete/unmapped records for diagnostics. `LocalD1.latest(group, as_of)` exposes the same source-independent metadata/records for either provider and excludes observations after lock or the requested cutoff. This increment does not wire the feed into projections or silently promote incomplete pools to the existing salary API. The original CSV importer and its model-ready storage remain available unchanged.

Identity resolution order:

1. Match shared stable external IDs within the same namespace in the canonical catalog.
2. Use a **verified** entry in the existing `dfs_player_id_mappings` table (or a supplied export).
3. Generate normalized name + team + position candidates. A unique name fallback still requires review and retains null `player_id`; ambiguous candidates, position conflicts and canonical collisions also remain unresolved. Historical team fields may be stale.

`playerId`, `playerDkId`, `draftableId` and NFL GSIS IDs are distinct namespaces; numeric equality across them proves nothing. DST uses team identity and is excluded from the player mapping percentage. Namespaced mapping input examples:

```json
[
  {"namespace":"draftkings_player_dk_id","external_id":"693115","player_id":"VERIFIED_CANONICAL_ID","verified":true,"evidence":"Describe the verified crosswalk"}
]
```

The canonical export is an array containing `player_id`, `display_name`, `position`, `current_team_id`, and optional `external_ids` (a namespace-to-ID object), `gsis_id`, `pfr_id`, `espn_id`, or `nfl_id`. The isolated local D1 is initially empty. When no supplied/local catalog exists, the diagnostic now automatically fetches the project’s public NFLverse players source, caches it for 24 hours, and archives the raw CSV by SHA-256. This is the same GSIS namespace used by the project, but membership in live D1 is not inferred. NFLverse does not publish DraftKings IDs, so name/team/position matches remain review candidates. `--canonical-json` and `--mapping-json` remain optional overrides; you do not need to download a catalog manually. `--no-catalog-fetch` disables this network step; recorded fixture replays are always offline. Catalog failure preserves salary ingestion and is surfaced as a warning; an existing stale catalog is retained and identified.

The full diagnostic report lists unresolved candidates, mapping denominator/success rate, disabled players, missing opponents/start times/salaries, duplicate draftables, and stale-snapshot status. An empty catalog is explicitly identified as unevaluated, not as evidence of bad production mapping coverage.

### Diagnostic commands

```bash
# Fetch/list discovery metadata only; subsequent calls respect the cache.
npm run dfs:diagnose -- --list-only

# Automatically select the configured Main Slate and print the first ten salaries.
npm run dfs:diagnose

# Explicit group; optional isolated local D1 persistence.
npm run dfs:diagnose -- --draft-group-id 151307 --persist-local

# Evaluate a verified catalog/crosswalk; CSV is used only if the web provider fails.
npm run dfs:diagnose -- --canonical-json /path/to/players.json \
  --mapping-json /path/to/mappings.json --csv-fallback /path/to/same-slate.csv

# Fully offline fixture replay (use the fixture's recorded time, never today's timestamp).
npm run dfs:diagnose -- --lobby-file tests/fixtures/draftkings/lobby.json \
  --draftables-file tests/fixtures/draftkings/draftables-151307.json \
  --recorded-at 2026-09-06T13:50:03.190Z --draft-group-id 151307 --debug-after-lock
```

`--persist-local` uses its own Wrangler config and state under `.dfs-salaries/d1`, bootstrapping the observed legacy schema and observation tables only. It never runs `--remote`, deploys a Worker, applies production migrations or configures Cron. Both provider tests and fixture replays are independent of live DraftKings availability. The fixture README identifies recorded fields versus test-generated mutations.

## Environment

- Node 24+ for the test runner's built-in SQLite support; installed TypeScript/Wrangler from `npm ci`.
- Python 3.11+; `python3 -m pip install -r requirements.txt` (certifi for network ingestion). Salary dry-run and unit tests use the standard library.
- Worker secrets: `INGEST_TOKEN` and `SPORTS_GAME_ODDS_API_KEY` (existing). Keep both server-side.
- CLI ingestion: `PLAYERPROP_API_URL` and `PLAYERPROP_INGEST_TOKEN`. HTTPS origin required; the salary importer additionally permits HTTP loopback for local testing.
- Cloudflare operations: existing Wrangler account authentication or `CLOUDFLARE_API_TOKEN` supplied securely in the execution environment. No new secrets/bindings are needed.

## Repeat the live D1 audit

First inspect the schema and pending migrations; these commands are read-only:

```sh
npx wrangler d1 execute playerprop-db --remote --command "SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name" --json
npx wrangler d1 migrations list playerprop-db --remote
```

After verifying tables from migrations 0001–0005 are present:

```sh
npx wrangler d1 execute playerprop-db --remote --file docs/audit-d1.sql --json
npx wrangler d1 export playerprop-db --remote --no-data --output /tmp/playerprop-schema.sql
```

Record applied migrations, complete parent DDL, counts, null kickoff/report dates, seasons and odds capture coverage in architecture.md. Inspect existing tables before proposing new ones. Wrangler remained unauthenticated, but the live read-only audit subsequently succeeded through the authenticated Cloudflare dashboard. Findings are in d1-live-audit.md; legacy definitions are in d1-observed-legacy-schema.sql.

## Migrations and local setup

Migration 0006 is additive and depends on existing teams, players, games and ingest_runs. It does not modify migrations 0001–0005. **Do not run the migration chain against an empty database without first bootstrapping the recovered legacy schema.** The observed DDL is a reference; a tested local bootstrap is still pending. `npm test` creates an isolated synthetic database explicitly for tests; it is not a production bootstrap.

Once a verified local copy/bootstrap of the existing schema is available:

```sh
npm ci
python3 -m pip install -r requirements.txt
npm run db:migrate:local
npm run check
npm test
npm run dev
```

Set a local-only INGEST_TOKEN in ignored `.dev.vars` for authenticated local imports. Never put credentials in `public/`. With the live schema verified and the change reviewed, deployment order is migration then Worker:

```sh
npx wrangler d1 migrations list playerprop-db --remote
npm run db:migrate:remote
npm run deploy
```

Those commands are a runbook; no remote migration or deployment was executed during this change. Existing endpoints do not depend on the new tables; DFS reads return a clear 503 if the required tables are missing.

## Salary import

Download a salary file you are authorized to use. Required CSV headers: Position, Name, Salary, TeamAbbrev, Game Info. Optional: ID, Roster Position, Status. Quoted names, a UTF-8 BOM, team aliases and RB/WR/TE FLEX eligibility are handled. Missing opponents, invalid salaries, duplicate players and Showdown/CPT eligibility are rejected. CSV Game Info establishes only the supplied opponent/home-away metadata; it is not converted into an invented canonical game ID or lock timestamp. Verify slate membership and lock against the contest before importing.

Offline example using **synthetic fixture rows and dates**, not a real slate:

```sh
python3 scripts/ingest_dfs_salaries.py tests/fixtures/draftkings-salaries.csv \
  --slate-id example-main --season 2026 --week 1 \
  --slate-date 2026-09-13 --lock-time 2026-09-13T17:00:00Z \
  --dry-run --output /tmp/salary-payload.json
```

For a real file, supply real metadata and the existing API/token environment variables, then omit `--dry-run`. The CLI sends one complete JSON snapshot to `POST /api/ingest/dfs-salaries`. Maximum 1,000 rows and 1 MiB normalized request. Validate the whole file before posting. No splitting into partial snapshots; a later snapshot supersedes the whole salary pool. Identical payload retries preserve the original import and timestamps.

Optional `--player-map /path/to/mapping.json` supplies verified strings such as `{"draftkings-id":"nflverse-gsis-id"}`. Unmapped players retain provider ID/name/team/position with null player_id. DST always has null player_id and uses its team. The API verifies teams and supplied player/game IDs; it does not auto-match names or create parent records. Caller-supplied canonical identity is an assertion to verify, not evidence that two players with the same name are identical.

Additional adapters return the same record contract in `scripts/dfs/adapters.py`. `--format json` accepts an array of normalized salary records and the same slate CLI arguments. Other ingestion clients may post the normalized envelope directly:

```json
{
  "slate": {
    "id": "example-main", "provider": "DraftKings", "season": 2026, "week": 1,
    "slate_name": "NFL Classic Main Slate", "slate_date": "2026-09-13",
    "lock_time": "2026-09-13T17:00:00Z"
  },
  "source": "authorized-manual-import",
  "salaries": [{
    "provider_player_id": "example-id", "player_id": null,
    "player_name": "Example Receiver", "team": "CHI", "opponent": "GB",
    "position": "WR", "salary": 5000, "eligible_positions": ["WR", "FLEX"],
    "game_id": null, "home_away": "away", "status": null
  }]
}
```

The server sets imported_at/available_at and logs model_version, source and raw normalized rows. Clients cannot backdate availability. Identical slate IDs require identical metadata; a correction uses a new ID. Salary changes or mapping corrections produce a new snapshot. Historical files imported today remain useful source artifacts but cannot be asserted to have been available before a past lock.

Reads: `GET /api/dfs/slates?season=2026&week=1` (maximum 100); `GET /api/dfs/slates/example-main/salaries?as_of=2026-09-13T16:00:00Z`. Omit as_of for now, clamped to lock; URL-encode a plus sign in a timezone offset. Empty salaries/import_id=null means no completed eligible snapshot. The API returns unmapped_players, import_id and version/timestamp provenance. Post-lock imports remain in D1 for audit, excluded from this modeling read.

## Existing ingestion and scheduling

```sh
python3 scripts/ingest_nflverse.py --season 2025 --available-seasons
python3 scripts/ingest_nflverse.py --season 2025 --dry-run
python3 scripts/ingest_context_nflverse.py --season 2025 --dry-run
```

Omit dry-run to use existing authenticated ingest routes. NFLverse dry-run still downloads source data; salary dry-run performs no network calls. Context flags `--availability`, `--roles`, `--coaches` limit the datasets; otherwise all run. Run stats before context so referenced player/game records exist. Media builders refresh local public JSON and require a later asset deployment. SportsGameOdds refresh remains a manually invoked authenticated admin route. There are no Cron Triggers or new paid API calls in this increment.

## Automatic catalog validation — September 6, 2026

The first automatic NFLverse catalog load returned 24,828 player records. Against the existing 744-record DraftKings snapshot, 599 of 720 offensive players had a unique name/team/position candidate (83.2%); 121 had no candidate, and 24 DST records used team identity. There were still zero confirmed stable-ID mappings: these candidates are not silently promoted or written to production. The full local report contains each candidate’s GSIS and other available external IDs for verification.

Catalog ingestion lives in `scripts/dfs/catalog.py`, independently of the DraftKings HTTP allowlist. It uses the existing public NFLverse players release, records source URL/fetch time/hash, and rejects missing schema or duplicate GSIS IDs. Its provenance is included in the immutable salary observation archive. No manual salary or catalog file is required for the default diagnostic.

### Frontend lineup research

`npm run dfs:lineups` combines saved salary/projection snapshots with the public ESPN NFL scoreboard for matchup/week validation, then writes a derived frontend snapshot for `/lineups/`. See [Lineup Lab](lineup-lab.md) for explicit optimization rules, provisional identity opt-in, capture timestamps, freshness gates and remaining floor/ceiling limitations. No provider requests occur in the frontend and no production schedule is configured.

### Game-board kickoff and forecast widgets

The prop board reads the public ESPN scoreboard for the displayed date range (`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=YYYYMMDD-YYYYMMDD&limit=100`). It uses event kickoff, venue and event-level `weather.temperature` (°F) / `weather.displayValue`. This is separate from projections and never modifies model confidence. Team orientation and kickoff must match when available; ambiguous matches are rejected. Legacy saved signals without kickoff use an exact, unique full matchup name within the returned date range.

Responses are cached in the browser session for 15 minutes. An eight-second timeout and a timestamped local ESPN snapshot provide graceful fallback. Forecasts older than six hours, unavailable forecasts and games already started are labeled rather than treated as current conditions. Roofed venues show outdoor conditions with an explicit unverified-roof-status note. Source and capture time appear beneath each game. ESPN's unofficial schema may change. No authenticated requests, weather subscription or production Cron was added.

The board now uses native keyboard-accessible game disclosures, retains kickoff/weather while collapsed, links to **DFS Daily**, and shows the illustrated lock only when the existing numeric model confidence is strictly greater than 80 (and at most 100). The badge does not represent a calibrated win probability.

### Sports-card evidence display

Prop cards now flip in place instead of navigating to a story page. The front shows the player portrait/name, exact line and direction, a rank-derived opponent DST grade, model confidence, and a recent-average comparison. The back uses the same signal snapshot for a short report, recent average versus the line, opponent/league averages, defense rank, and snap share when available. No additional projection or probability is invented. Grades describe defensive strength for that position/market: A+ ranks 1–4 (fewest allowed), A 5–8, B 9–16, C 17–24, D 25–32. The reverse explains the scale and distinguishes confidence from calibrated win probability.

Click, Enter or Space flips a card; Escape returns to its front. Inactive faces are hidden from assistive technology, focus stays on the card button, and reduced-motion preferences disable animation. The original `/story/` route remains available for existing links.

## Monte Carlo Simulation Lab

`/simulation/` consumes saved normalized salary/projection/schedule archives. The first research slate is DK draft group 151307 (2026 Week 1), with 329 eligible players and explicit provisional identity flags. It performs no live sportsbook or account actions. Missing game markets use labeled 44-point / zero-spread assumptions; missing routes, snap shares, and anytime-TD prices are not fabricated. Optional sourced game markets can be supplied to the input builder.

Shared game environment, opportunity allocation and discrete football statistics generate correlated DraftKings outcomes. Browser/CLI runs support 1,000/10,000/50,000+ draws; Worker requests are authenticated, bounded diagnostics. Summary-only immutable persistence is defined by migration 0008, which has not been applied to production. Read [Simulation Lab methodology, provenance, limitations and validation](simulation-lab.md) before interpreting these uncalibrated distributions as forecasts. No ownership, field, contest-finish probability, wagering or automated entry is implemented.

### Research readiness enrichment

The published simulation input now includes captured ESPN-reported DraftKings game totals/home spreads, a conservative DynastyProcess/NFLverse identity review, and prior-season NFLverse/PFR snap context. Original projection/salary capture times remain intact. Historical usage does not become a current projection, and corroborated identity candidates remain provisional. See [research readiness, frozen predictions and player workbench](research-readiness.md) for provenance, local freeze/evaluation commands and remaining calibration requirements.


## Shared research refresh — September 8, 2026

`npm run dfs:refresh` runs one public-only DK/ESPN collection cycle. The approved Mac task invokes it at 10 a.m. and 5 p.m. America/Chicago and publishes validated changes. The two frontends resolve `/research/latest.json` to immutable shared artifacts. Errors preserve the last valid data and appear separately from source freshness. ESPN scoreboard date responses can omit top-level season; the collector derives one consistent season/week from events and rejects ambiguity. Provider caches and conservative limits remain in effect. No authenticated DraftKings/account actions, paid odds refresh, production Cron or D1 migrations are part of this runner.

## Actionable Newsroom — September 8, 2026

The [Newsroom](newsroom.md) ingests ESPN NFL RSS and official NFL injury-report tables, with canonical player links, short factual templates, source timestamps, separately labeled implications and conservative expiry. Public JSON news returned 403; RSS is the active ESPN adapter. The existing 10 a.m./5 p.m. Central refresh automatically publishes news independently of salary success. Raw evidence and immutable snapshots stay in `.newsroom/`; browser views read `/newsroom/latest.json`. No account actions, paid provider, D1 migration or automatic projection adjustment is involved. Official team feeds and contextual teammate/defender/coaching impacts are not yet connected.

## EA Madden NFL 27 personnel diagnostics

Drive Lab imports official public EA structured ratings into immutable local snapshots, with a minimum seven-day cache and no authenticated actions. NFLverse Players V2, current rosters and published depth charts supply identity and starter evidence. These ratings do not influence simulation outcomes. Exact delivery details, field mappings, confidence tiers, refresh commands and source limitations are in [personnel-ratings.md](personnel-ratings.md). Current live PBP uses weighted 2025/2024 data until eligible 2026 observations become available; frozen historical evaluation remains separate.
