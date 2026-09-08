# Architecture audit and DFS foundation

## Current implementation status — September 7, 2026

The sections below retain the original repository/D1 audit as historical context. Planned-only optimizer/simulation statements and original test counts are superseded by the current [technical blueprint](../TECHNICAL_BLUEPRINT.md), [Simulation Lab](simulation-lab.md), and [research readiness report](research-readiness.md).

Public DK ingestion, ESPN projections, DFS Daily lineups, Doctor Chart flip cards, correlated Monte Carlo simulations, a sortable/filterable player workbench and a $50,000 roster builder are implemented. The live application uses saved static simulation inputs and browser Web Workers. Local pregame freezing and final-actual evaluation interfaces are implemented, but verified identity reconciliation and historical calibration remain pending. No contest field/ownership model exists.

Production site version: `6330f669-7980-4e7e-805d-5ef5c02d09f8`; 93 tests and TypeScript checks pass. Migrations 0006–0008 remain unapplied remotely; no production Cron jobs were added. The updated next milestone begins with the [simulation audit](simulation-methodology.md) and [data-readiness repair](data-readiness.md), followed by score, roster grading and Newsroom. The audit introduces no runtime architecture changes.

## Original audit record

Audited 2026-09-05. Scope: Milestone 1 and the smallest working salary/slate foundation for Milestone 2. Milestones 3–9 remain planned. The objective is eventually to estimate and maximize contest top-10% probability; the existing prop signal is not that probability.

## Evidence and verification limits

Read all Worker source, five original migrations, four Python scripts, frontend code, configuration, README and technical blueprint. The original TypeScript check passed. There are no tracked files or commits on `main`; all application files were already untracked. No existing content was discarded or committed.

The configured deployment is Worker `drlocks-nfl-props-api`, D1 `playerprop-db` (`15198033-dca2-42cd-bd14-f7fa22bb9d93`), binding `PLAYERPROP_DB`, assets binding `ASSETS`, and custom domains `drlocksmd.com` / `api.drlocksmd.com`. This is configuration evidence, not verification of the deployed revision.

Live D1 schema, applied migrations, row counts, freshness and selected integrity checks were verified through the authenticated dashboard on September 5 Central time (September 6 UTC). See [live audit](d1-live-audit.md). Migrations 0001–0005 are applied; 0006 is not. Key blockers are duplicated 2024 matchup identities, seven self-matchups, all 823 game rows missing kickoff times, absent injury publication dates and a single odds snapshot. No production changes were made. Wrangler authentication remains separate from the working dashboard session.

## Current repository architecture

| Files | Responsibility |
| --- | --- |
| `src/index.ts` | One TypeScript Worker, manual routing, bearer-protected ingestion, D1 queries, SportsGameOdds client and prop signal calculation |
| `wrangler.jsonc` | Worker entrypoint, two custom domains, public assets, existing D1 binding; compatibility date 2026-09-03 |
| `migrations/0001_initial.sql` | Games, player stats, canonical prop lines, persisted signals, ingestion ledger; assumes parent tables exist |
| `migrations/0002_team_display_names.sql` | Updates existing team display names |
| `migrations/0003_defensive_player_stats.sql` | Adds seven defensive statistics to player game logs |
| `migrations/0004_sports_game_odds.sql` | Provider event metadata and timestamped per-book odds observations |
| `migrations/0005_context_and_role_data.sql` | Availability, playing-time roles and team coaching context |
| `scripts/ingest_nflverse.py` | Regular-season weekly player statistics -> authenticated API batches of 100 |
| `scripts/ingest_context_nflverse.py` | Injury reports, offensive snaps, PFR-to-GSIS roster mapping and head coaches -> existing context endpoints |
| `scripts/build_player_media.py`, `scripts/build_team_media.py` | NFLverse public CSVs -> static image URL lookup JSON |
| `public/index.html` | Coming Soon landing page |
| `public/preview/index.html`, `public/app.js` | Prop research cards grouped by game; all qualifying Over/Under signals returned by API |
| `public/story/index.html`, `public/story.js` | Player/market evidence page |
| `public/styles.css`, media JSON, `public/assets/` | Existing presentation/assets |
| `public/fallback-signals.json` | Clearly labeled saved research snapshot on live-board failure |
| `package.json`, `package-lock.json`, `tsconfig.json`, `requirements.txt` | Wrangler/TypeScript build; Python certifi dependency |

There is no React framework, separate Pages build, queue, R2 bucket, model service, optimizer or test framework in the original application. Existing README/blueprint text about a future frontend, placeholder database ID, filters or a five-card limit is partly stale; source code is the authority.

## Current D1 schema, as established by source

The live migration ledger confirms 0001–0005. Legacy `teams`, `players` and `seasons` definitions and explicit indexes have now been recovered in [observed legacy schema](d1-observed-legacy-schema.sql). That file is a reference, not a production migration or full backup. The table below describes the tables introduced by the repository migrations; `seasons` is an additional live table.

| Table | Key / relationships | Columns in checked-in DDL |
| --- | --- | --- |
| `games` | PK `id`; FKs home/away -> teams; unique season/week/type/home/away | season, week, season_type (REG default), kickoff_at, home_team_id, away_team_id |
| `player_game_stats` | PK player_id/game_id; FKs players/games/teams | team_id, opponent_team_id, position, passing_yards, passing_touchdowns, rushing_yards, rushing_touchdowns, receptions, receiving_yards, receiving_touchdowns, targets, carries, snaps, routes, source, updated_at; migration 0003 adds tackles_solo, tackle_assists, tackles_for_loss, sacks, qb_hits, interceptions, passes_defended |
| `prop_lines` | PK id; FKs games/players; unique game/player/book/market/line/fetched_at | game_id, player_id, sportsbook, market_key, line, over_price, under_price, fetched_at |
| `matchup_signals` | PK id; FKs games/players/prop_lines | game_id, player_id, prop_line_id, market_key, direction (over/under/neutral), score, confidence, summary, factors_json, model_version, calculated_at |
| `ingest_runs` | PK id | source, status, started_at, completed_at, records_received, details_json |
| `odds_events` | PK provider/event_id | commence_at, home_team_name, away_team_name, fetched_at |
| `odds_player_props` | PK provider/event_id/odd_id/sportsbook/captured_at; FK provider/event -> odds_events | player_source_id, player_name, market_key, line, over_price, under_price |
| `player_game_availability` | PK player_id/game_id; FKs players/games/teams | team_id, availability_status, role_status, injury_description, practice_status, source, reported_at, notes, updated_at |
| `player_game_roles` | PK player_id/game_id; FKs players/games | offensive_snaps, snap_share, routes_run, route_share, target_share, carry_share, red_zone_targets, red_zone_carries, source, updated_at |
| `team_game_context` | PK team_id/game_id; FKs teams/games/quarterback player | head_coach, offensive_coordinator, offensive_play_caller, quarterback_player_id, offensive_system_label, source, notes, updated_at |

Indexes cover season/week, player/game, opponent/position, game/market/time, signal ranking, availability game/team, roles game/player and context game/team. `prop_lines`, `matchup_signals` and `ingest_runs` have no writers in the original Worker. Whether another system populated them is unknown. The new DFS importer reuses `ingest_runs` rather than adding a duplicate import ledger.

## Existing routes

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/health` | Worker health without a DB read |
| GET | `/api/board?season=&week=&limit=` | Reads persisted `matchup_signals` |
| GET | `/api/signals/live?historySeason=&limit=` | Newest SportsGameOdds capture + historical form/defense/coaching; successful responses cached five minutes |
| GET | `/api/players/:id/game-logs?season=` | Offensive game-log fields |
| GET | `/api/defense/position-splits?season=&position=&metric=&window=` | Opponent totals grouped by position, recent-window average and rank |
| POST | `/api/ingest/player-stats` | Upserts teams, players, games and stats; requires INGEST_TOKEN |
| POST | `/api/ingest/player-availability` | Upserts availability; requires INGEST_TOKEN |
| POST | `/api/ingest/player-roles` | Upserts roles; requires INGEST_TOKEN |
| POST | `/api/ingest/team-context` | Upserts coaching/context; requires INGEST_TOKEN |
| POST | `/api/admin/refresh-sports-game-odds` | Calls paid provider and stores observations; requires INGEST_TOKEN |
| GET | `/preview`, `/story`, `/story/` | Existing asset routing; other requests fall through to ASSETS |

The frontend requests `historySeason=2025` explicitly. The live route bounds candidates to 60, requires at least three of the latest five eligible games, excludes known out/inactive games, and scores 70% historical line gap + 30% opponent positional allowance relative to league allowance. Confidence is a bounded heuristic, not calibrated probability. It returns a mean line with one book name as a label; that label is not proof the aggregated line was offered by that book.

## Existing data pipelines and sportsbook implementation

NFLverse stats ingest keeps regular-season rows with identity/team/opponent/week, converts missing numeric values to zero, and upserts selected offensive and defensive box-score columns. Weekly rosters are used for ID mapping in the context script, not persisted as a full current roster feed. Snap counts populate offensive snaps/share only. Injury report status is classified, but the importer does not populate `reported_at`. Play-by-play is streamed only to extract home/away head coaches. Play calls, EPA, personnel, pressure, pace and conditional tendencies are not calculated or retained.

Sportsbook provider is **SportsGameOdds**, not The Odds API mentioned as an example in the older README. The Worker calls `https://api.sportsgameodds.com/v2/events` with secret `SPORTS_GAME_ODDS_API_KEY`, NFL, oddsAvailable=true, includeAltLines=false, limit=32. Only sideID=over records with available bookmaker lines are ingested; matching under prices are attached. Records use a local capture time. Numeric line selection falls back from the book's line to provider fair/book aggregate values, so not every stored row necessarily represents a directly quoted line from that individual book.

Provider player names are inferred from source IDs. Live joins use exact case-insensitive names, team display names and latest stored team. The signal route restricts to full-game `-game-ou-over` passing yards/TDs, rushing yards/attempts, receiving yards/receptions; consensus is SQL AVG and distinct book count. No median, dispersion, de-vigging, best-side comparisons, opening/current movement or robust ID crosswalk exists. The ingester does not explicitly distinguish game totals from player O/U records, and does not ingest moneyline/spread sides. There is no normalized game-market pipeline, pagination, quota tracking, fetch backoff or near-lock refresh logic. Raw event metadata is overwritten on refresh; selected odds observations are appended, but full provider response bodies are not retained.

## Scheduled jobs

None are configured in the repository: no `triggers.crons`, `scheduled` handler, CI schedule or checked-in external scheduler. Existing jobs are manual scripts/admin calls. External schedules in an account cannot be verified here. The five-minute response cache does not refresh the paid odds source.

Later: weekly NFLverse/schedules/rosters refresh; daily injury/status; bounded odds refresh near kickoff with freshness checks and a request budget. Do not add cron until provider quotas and reliable ingestion completion tracking are established. This increment adds no paid API calls or schedules.

## Reuse and missing Milestones 1–4

| Milestone | Reuse | Missing / next action |
| --- | --- | --- |
| 1: audit | Current Worker, bindings, migrations, scripts, board and blueprint | Live inspection completed; build/test a reproducible local bootstrap from the recovered schema and reconcile schedule defects |
| 2: slates/salaries | Authenticated Worker + D1, teams/players/games, ingest_runs | Foundation now supplies two additive tables, complete-file CSV/JSON import and slate reads. A real Main Slate salary file, verified canonical mappings and current schedule feed remain needed for analytics |
| 3: scoring/projections | Box scores, recent usage, defensive positional totals, per-book snapshots and optional context | Configured DK scoring, complete scoring inputs, separate market/model projections, median consensus, time-safe historical feature queries, uncertainty, result provenance |
| 4: legal mean optimizer | New salary snapshots, fixed Classic roster configuration and future projections | Exact/legal roster search, cap/FLEX/unique-player checks, game-diversity rules verified against provider, locked/excluded players, optional team/stack/bring-back constraints, deterministic optimizer tests and API/UI |

High-priority data issues before projections:

1. `games` is created from whichever player-stat record first supplies that ID; that player's team is assigned home and opponent away without schedule evidence, and kickoff_at is unset. Fallback game IDs can be directional. A schedule adapter must establish trustworthy game identity before game-based correlation/DST features.
2. `player_game_stats.interceptions` is **defensive interceptions** (`def_interceptions`), not QB interceptions thrown. Fumbles lost, offensive two-point conversions, passing interceptions, return touchdowns and full team-DST scoring components are absent. Do not equate unknown scoring inputs to zero in a new model.
3. Stats/roles/availability/context are mutable latest records. `updated_at` records ingestion/update, not historical publication. Current player team is overwritten by ingestion order. Missing timestamp history cannot be reconstructed by backdating.
4. There are no ownership, distributions, contests, simulations, outcome or backtest implementations. No measured DFS edge exists.

## Added foundation and data flow

```text
NFLverse CSVs -> existing Python clients -> existing Worker ingestion -> existing D1 facts
SportsGameOdds -> existing private refresh -> odds_events / odds_player_props -> prop board

Authorized salary CSV or normalized JSON
  -> scripts/dfs/adapters.py (preserves raw CSV rows, no guessed NFL IDs)
  -> scripts/ingest_dfs_salaries.py (offline validation/review or authenticated POST)
  -> src/dfs/foundation.ts (validation, server timestamps, atomic D1 batch)
  -> dfs_slates + dfs_player_salaries + existing ingest_runs
  -> GET /api/dfs/slates and /api/dfs/slates/:id/salaries?as_of=...

Planned: time-safe football/consensus features -> market + model fantasy projections
  -> legal mean optimizer -> distributions -> ownership -> field simulation
  -> estimated P(top 10%)/payout -> historical A–E strategy comparison
```

`0006_dfs_slates_and_salaries.sql` defines the requested slate fields and salary fields, plus import_id, salary_key and available_at. Salaries are keyed by slate/import/salary identity. DST uses a team with null player_id. Unmapped offensive players remain null and are counted explicitly. Team and supplied canonical IDs are validated against existing tables. Game IDs remain null until verified. Imports never create surrogate NFLverse players, teams or games.

An SHA-256 content ID makes identical normalized requests idempotent. Changed files create new complete snapshots. An atomic D1 batch commits slate, raw normalized payload in ingest_runs, salaries and completion together. The slate's metadata cannot change under the same ID. All availability timestamps come from ingestion, and reads require availability and run completion <= min(as_of, lock). They select one complete snapshot, avoiding stale players carried forward from older files. Imports after lock are retained for audit but excluded by this read API; historic publication-proof support is deferred.

## Exact file plan and implementation boundary

Changed now: `src/index.ts` (DFS routing hook only), `package.json` (test command), `README.md` (accurate setup + DFS usage).

Added now: `migrations/0006_dfs_slates_and_salaries.sql`, `src/dfs/foundation.ts`, `scripts/dfs/adapters.py`, `scripts/ingest_dfs_salaries.py`, `tests/dfs.test.mjs`, `tests/test_dfs_import.py`, `tests/fixtures/draftkings-salaries.csv`, `docs/architecture.md`, `docs/data-sources.md`, `docs/dfs-model.md`, `docs/backtesting.md`, `docs/audit-d1.sql`.

No changes to original migrations, existing ingestion scripts, prop calculations, public UI/assets, dependency versions, D1 binding or Wrangler routes. No remote migration or deployment performed.

Proposed next, not implemented: add `scripts/ingest_schedule_nflverse.py`; update existing stats/context adapters to retain source availability and missing scoring fields; add `src/dfs/scoring.ts`, `src/dfs/consensus.ts`, `src/dfs/projections.ts` and then `src/dfs/optimizer.ts`. Migration 0007 now holds the public salary provider observation store. Future scoring-input and projection-run migrations require schedule reconciliation and scoring-input design following the live audit; their DDL and sequence numbers are not yet assigned. Reuse/extend `odds_player_props`, `prop_lines`, `player_game_roles` and `team_game_context` before creating overlapping market/feature tables. Ownership/contest/model-run tables belong to later milestones.

## Blockers and checks

- Live audit completed through the dashboard; production write authorization has not been granted. See d1-live-audit.md for the verified findings and next actions.
- Legacy parent DDL is recovered. Existing tests still use synthetic parent contracts; a reproducible local bootstrap using the observed definitions is the next validation step.
- No actual salary file, current schedule crosswalk or complete DK scoring history was provided. Fixture rows are synthetic and never sent to production.
- Validation passed: TypeScript check, 11 automated tests, offline fixture import, and Wrangler deployment dry run. Tests cover adapters, authenticated routes, Classic/FLEX input validation, snapshot selection, timestamp cutoffs, idempotency, SQLite constraints/atomic rollback and legacy route smoke checks. A separate isolated workerd + D1 binding smoke check also passed import, salary read, duplicate retry and metadata-conflict rejection. The local Miniflare proxy harness stalled; the successful check accessed D1 inside the Worker directly. Test databases used synthetic parent contracts. Live D1 verification is now documented separately in d1-live-audit.md; the earlier tests did not validate that live data.

Cloudflare references checked for this increment: [D1 batch transactions](https://developers.cloudflare.com/d1/worker-api/d1-database/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [Wrangler D1 commands](https://developers.cloudflare.com/d1/wrangler-commands/) and [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/). Existing platform configuration is preserved.

## Public salary provider increment (September 6, 2026)

The GET-only DraftKings adapter and CSV fallback now share a provider-neutral Python snapshot contract. `scripts/diagnose_dk_salaries.py` discovers and explicitly selects NFL Classic slates, normalizes position/FLEX variants, reports identity/quality issues and optionally persists observations in isolated local D1. Migration `0007_dfs_provider_snapshots.sql` stores incomplete source observations separately from the stricter model-ready `dfs_player_salaries` table. No Worker routing, production schedule or projection feed was added. See [operations](data-sources.md) and [live diagnostic](draftkings-diagnostic-2026-09-06.md).
