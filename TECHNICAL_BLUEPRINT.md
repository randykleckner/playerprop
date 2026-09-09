# Dr. Locks NFL Prop Board — Technical Blueprint

## Purpose

Dr. Locks is an explainable NFL player-prop research application. It combines historical NFL player statistics, current sportsbook prices, and position-specific opponent context to surface props worth researching. It is not a prediction guarantee, automated betting system, or financial advice.

## Production architecture

```text
NFLverse weekly player stats ──> Python importer ─┐
                                                   │ authenticated JSON batches
SportsGameOdds live NFL props ──> Cloudflare Worker ──> Cloudflare D1
                                                   │
drlocksmd.com browser board <──── Worker static assets + /api/signals/live
```

Cloudflare components:

- Worker: `drlocks-nfl-props-api`
- API host: `api.drlocksmd.com`
- Board host: `drlocksmd.com`
- D1 database: `playerprop-db`
- D1 binding in Worker: `PLAYERPROP_DB`
- Secrets: `INGEST_TOKEN` and `SPORTS_GAME_ODDS_API_KEY`

The static application is bundled with the Worker in `public/`. The public root (`/`) is intentionally a minimal Coming Soon page while the current research board is available at `/preview/`. Because the board and API are served by the same Worker, the browser fetches `/api/signals/live` on the same origin. API keys and ingest credentials never reach the browser.

## Source data

### NFLverse history

`scripts/ingest_nflverse.py` downloads NFLverse weekly player-stat CSV releases. It sends batches of at most 100 records to `POST /api/ingest/player-stats` with `Authorization: Bearer <INGEST_TOKEN>`.

The importer supports passing, rushing, receiving, and selected defensive player statistics. It uses `certifi` for TLS certificate validation and an identifying user agent for stable source access.

Imported historical coverage currently includes 2024 and 2025. The live board uses 2025 as its historical baseline because the imported current props are for a future slate and 2026 player-game history is not yet available.

### Context and role history

`scripts/ingest_context_nflverse.py` imports three separate historical fact sets for a season:

- NFLverse injury reports: reported player availability, injury description, and practice participation
- NFLverse snap counts: offensive snaps and share of team offensive snaps
- NFLverse play-by-play: historical head coach for each team-game

This separation matters. A player listed as `out` or `inactive` is excluded from the player’s normal historical sample; a player listed as `limited` remains visible as a caveat rather than silently becoming a normal zero-production game. The first import supports 2025 availability, snap share, and head-coach history. Offensive coordinator and play-caller records are intentionally blank until a verified source is loaded—those claims must not be guessed.

### SportsGameOdds lines

The private route `POST /api/admin/refresh-sports-game-odds` calls the SportsGameOdds event endpoint with the Worker secret. It saves raw event and per-book prop snapshots before any ranking logic runs.

Key raw tables:

- `odds_events`: provider event ID and home/away team names
- `odds_player_props`: one row per provider event, player prop, sportsbook, and capture time

The live signal route only uses `odd_id` values ending in `-game-ou-over`. This intentionally excludes first-quarter, second-quarter, third-quarter, fourth-quarter, and other segmented markets that share the same player and stat name.

## D1 model

Core normalized tables:

| Table | Role |
| --- | --- |
| `teams` | NFL team IDs, abbreviations, and display names |
| `players` | NFLverse player IDs, names, positions, and last known team |
| `games` | Season/week game identity and teams |
| `player_game_stats` | Player-level offensive and selected defensive game statistics |
| `odds_events` | Raw provider event metadata |
| `odds_player_props` | Raw sportsbook prop snapshots |
| `prop_lines` | Reserved canonical line table for future scheduled-game mapping |
| `matchup_signals` | Reserved persisted signal/audit table for future model runs |
| `player_game_availability` | Weekly injury/availability and role-status facts, separate from the box score |
| `player_game_roles` | Offensive snaps, snap share, routes, and future usage-share fields |
| `team_game_context` | Team-game coaching, quarterback, play-caller, and system facts |

Raw odds remain immutable snapshots. The current live endpoint calculates a board response from the newest capture rather than overwriting historical price data.

## Current live signal model

Endpoint:

```text
GET /api/signals/live?historySeason=2025&limit=100
```

Supported markets and history fields:

| Market | Historical metric | Allowed player positions |
| --- | --- | --- |
| `passing_yards` | passing yards | QB |
| `passing_touchdowns` | passing touchdowns | QB |
| `rushing_yards` | rushing yards | RB, QB, WR |
| `rushing_attempts` | carries | RB, QB, WR |
| `receiving_yards` | receiving yards | WR, TE, RB |
| `receiving_receptions` | receptions | WR, TE, RB |

The model deliberately excludes touchdowns, longest-reception, combined, completions/attempts, and defensive markets. They need market-specific treatment and should not be force-fit into a yards/receptions model.

### Candidate construction

1. Select the newest SportsGameOdds snapshot.
2. Keep full-game over/under markets only.
3. Match provider player names to NFLverse player names case-insensitively.
4. Require the player’s last known NFL team to be one of the imported event teams.
5. Select an actual full-game bookmaker quote, preferring DraftKings and otherwise using deterministic sportsbook ordering. Carry the selected book and capture timestamp through every comparison.
6. Reject market/position combinations that cannot be meaningful, for example passing yards for a defensive tackle.

### Recent form

For each candidate, retrieve the player’s five most recent eligible games in `historySeason`. Any game recorded in `player_game_availability` as `out` or `inactive` is excluded. Limited-game records stay in the sample but are returned to the frontend as a visible caution.

```text
recent_average = mean(last five values)
hit_rate       = count(value > selected line) / games sampled
history_edge   = (recent_average - selected line) / max(selected line, 1)
```

At least three historical games are required. Candidates with less history are omitted rather than padded with guesses.

### Opponent positional context

For the candidate player’s position and prop statistic, calculate the opponent defense’s average allowed per game from all relevant players in the historical season. Then rank all defenses from fewest to most allowed.

```text
defense_edge = (opponent positional allowance - league positional allowance)
               / max(league positional allowance, 1)
```

This compares team-level defensive totals with the league’s team-level total for that position. It does **not** compare a team’s total WR allowance directly to one WR’s prop line, which would overstate an edge.

### Score and direction

Both inputs are bounded at ±0.50 before weighting so an extreme or stale input cannot dominate the board.

```text
score = 100 × [0.70 × clamp(history_edge, -0.50, 0.50)
             + 0.30 × clamp(defense_edge, -0.50, 0.50)]

direction = Over    when score >= 4
            Under   when score <= -4
            Neutral otherwise
```

The confidence field is a bounded data-completeness indicator, not an estimated probability of winning. It combines available recent games, score magnitude, and sportsbook count, and is capped at 85.

## Board behavior

The frontend consists of `public/index.html`, `public/styles.css`, and `public/app.js`.

It renders a responsive game-based research board with:

- player/team text search
- market, position, direction filters
- sorting by absolute edge, confidence, or line
- plain-English facts: the number on the board, recent average, what the opponent gives up, and why the matchup made the shortlist
- an expandable story view that distinguishes verified facts from information still being added
- refresh button that refetches without caching

The current board groups qualifying leads by collapsible game, with kickoff and weather context. See docs/doctor-chart.md for the current sports-card presentation.

Cards use the Dr. Locks identity and a doctor/lock badge at confidence ≥80%. This heuristic is not a calibrated probability. The reverse presents supporting figures for investigation.

The board defaults to a dark sportsbook-inspired theme and includes a Light mode toggle. The choice is retained in browser local storage only; it is not sent to the Worker.

## Dr. Locks character system

The header uses `public/assets/dr-locks-default.png`, an original anime-inspired football analytics scientist. This is the default “studying the slate” pose. Future character assets must preserve the core identity: green glasses, dark hair with a white streak, white coat over charcoal sports-tech clothing, lime accents, and an analytical tablet.

Planned context-aware poses are: default research, confident edge, caution/injury context, and coaching/system-change review. A future frontend state can select the appropriate asset without changing the data model or exposing private data.

### Read protection and availability fallback

`/api/signals/live` bounds its candidate pool to a maximum of 60 players/markets per fresh calculation and caches successful responses at the Cloudflare edge for five minutes. This prevents every visitor refresh from repeating the same D1-heavy calculation.

If the live D1 response is temporarily unavailable, the browser loads `public/fallback-signals.json`, a clearly labeled last-known snapshot. It is a presentation safety net, not a replacement for the live endpoint; a normal live response automatically takes precedence once available.

## Operations runbook

### Refresh sportsbook lines

Run locally only after `PLAYERPROP_INGEST_TOKEN` is set in the current terminal:

```sh
curl -sS -X POST https://api.drlocksmd.com/api/admin/refresh-sports-game-odds -H Authorization:\ Bearer\ $PLAYERPROP_INGEST_TOKEN
```

### Ingest a historical season

```sh
python3 scripts/ingest_nflverse.py --season 2025
```

### Import historical availability, role, and coach context

After setting the existing local `PLAYERPROP_API_URL` and `PLAYERPROP_INGEST_TOKEN` environment variables, run:

```sh
python3 scripts/ingest_context_nflverse.py --season 2025
```

The importer is idempotent: re-running it updates the same player/game or team/game fact instead of creating duplicates. Use `--dry-run` to count records without sending anything to the Worker.

### Deploy application changes

```sh
npm run check
npx wrangler deploy
```

Never commit or paste `INGEST_TOKEN` or `SPORTS_GAME_ODDS_API_KEY`. Set both only through Cloudflare Worker secrets.

## Known limits and next engineering steps

1. **Schedule mapping:** Raw odds events currently lack a normalized season/week game record. Ingest a schedule source so each live event can populate `games`, `prop_lines`, and persisted `matchup_signals` accurately.
2. **Player identity:** Name matching covers most players but needs a provider-to-NFLverse ID crosswalk for rookies, suffixes, and traded players.
3. **Recency:** Replace the fixed 2025 parameter with current-season ingestion plus dates/time-decay weighting.
4. **Usage and availability:** Add routes, snaps, injuries, depth chart, inactive status, and projected starters.
   - A player inactive or limited by injury must not be represented as a normal “last five” zero-production game.
   - Track teammate availability and target/usage redistribution. For example, a receiver’s historical performance should be segmented by whether other primary pass catchers were active.
   - Store a per-game availability status and model the player’s role only in comparable active-game samples.
5. **Advanced matchup data:** Shadow-corner and coverage claims require licensed defender assignment/coverage data. Team positional splits are not individual coverage evidence.
6. **Coaching context:** Add current play caller, offensive coordinator, head coach, and offensive system tenure by team/season. Coach/team changes must reset or downweight prior-system assumptions.
7. **Market modeling:** Create separate models for anytime touchdowns, alternate lines, long receptions, combo props, and defensive player markets.
8. **Backtesting:** Record historical lines/snapshots, define closing-line and outcome evaluation, and calibrate weights using out-of-sample testing before relying on scores.
9. **Automation:** Add a scheduled Worker trigger or external scheduler to refresh odds and score the board on a controlled cadence, respecting provider quotas.
10. **Precomputed signals:** Move live score generation to a scheduled, persisted `matchup_signals` model run. The browser should then read a compact table rather than calculating an entire slate on demand.


## Current DFS and simulation architecture — September 7, 2026

This section supersedes earlier planned-only DFS descriptions. Detailed prop-card source rules are maintained in [Doctor Chart](docs/doctor-chart.md).

```text
DraftKings anonymous lobby/draftables → Python salary adapter → immutable local observations
ESPN weekly projections → projection provider / disclosed DK conversion → local snapshot
Saved salary + projection + schedule → normalized simulation input
Recorded ESPN game markets + crosswalk + prior-season snaps → research enrichment
Normalized input → shared seeded Monte Carlo core → browser Web Worker or local CLI
Summary distributions → sortable player workbench / stack explorer / candidate optimizer
Selected roster → legal-slot validation + $50k budget → joint-outcome lineup simulation
Input + prediction + raw sources → immutable pregame archive → eligible final-actual evaluation
```

### Modules and execution

`public/simulation/engine.js`, `random.js`, `statistics.js`, `config.js`, and `optimizer.js` are shared browser/CLI simulation modules. The foundation v1.1 model allocates constrained football opportunities, applies discrete touchdowns and DK scoring/bonuses, and correlates shared game/team conditions. DST remains a placeholder model. Candidate search is bounded, not an exhaustive tournament optimizer.

`public/simulation/workbench.js` owns pure filtering, sorting and roster mutation rules. `lab.js` binds these to the table, local-device roster persistence, CSV export and worker execution. Filters do not mutate the roster. Nine unique players must occupy QB/RB/RB/WR/WR/WR/TE/FLEX/DST under $50,000; moves validate both sides of a swap. Column percentages describe score/value thresholds, not contest finishes.

Browser and CLI support 1k/10k/50k draws. `src/simulation/routes.ts` offers authenticated, bounded Worker POST runs (default 10, max 100) and saved-run/stack reads. Large work does not execute in the request Worker. Migration 0008 supplies immutable summary persistence, with atomic expansion; missing production tables return an explicit unavailable result. No per-draw histories are stored in D1.

### Persistence and source contracts

Migrations 0006 (slates/salaries), 0007 (provider observations), and 0008 (simulation summaries) remain local-only. Production D1 was not migrated. The live browser uses saved static slate inputs and executes simulations on the device.

Every source carries capture/provenance metadata. Research enrichment adds signed home spreads and totals from exact scheduled games, identity discrepancy flags and historical snaps as context only. Corroboration does not promote DraftKings IDs to verified status. The current 329-player slate has 253 corroborated provisional identities, 52 requiring review, 255 historical usage contexts, and markets for 12/12 games.

`scripts/research/archive.mjs` freezes exact baseline fingerprints before lock and before input expiry, preserves raw files when supplied, and checks hashes on read. Evaluation joins final actuals to exact frozen player/game IDs and excludes provisional identities and DST placeholders. Local hashes are integrity checks, not externally timestamped attestations. Calibration remains pending real final outcomes and verified identity evidence.

### Release, checks and next milestone

Site version `6330f669-7980-4e7e-805d-5ef5c02d09f8` is deployed on both custom domains. Current verification: 93 tests plus TypeScript and browser workbench/roster checks. See [research readiness](docs/research-readiness.md) for the 10,000-draw frozen receipt and [Simulation Lab](docs/simulation-lab.md) for benchmark/Worker limits.

Next: a traceable identity review queue with exact provider/canonical IDs, discrepancy priority and evidence requirements. No automatic verification from name matching. Follow with final-actual ingestion and held-out calibration; ownership, field simulation and top-10%/ROI optimization follow only after those foundations.


## Next milestone audit checkpoint — September 7 evening

The user-defined order is: audit existing simulation/staleness; repair ingestion/readiness/mapping/projection coverage and automatic refresh; verify a current baseline; add transparent player scores; add roster grading; add Newsroom; connect impact scenarios. This supersedes the identity-review-only next-step plan above.

[Simulation methodology](docs/simulation-methodology.md) traces every current source, allocation/distribution/correlation assumption and UI output. Fresh 10k-draw run `sim-1c5a807507462cda8986c5abdd118770` passed deterministic repeat equality, 120,000 game-draw invariants and player/joint-lineup quantile checks. No engine methodology changed.

[Data-readiness audit](docs/data-readiness.md) identifies two separate static artifacts, manual-only regeneration, source-based expiry mislabeled as build age, and ESPN duplicated under the statistical projection label. The 744 salary entries belong to one selected draft group; 329 pass current research-pool gates. No automatic refresh, new score, roster grade or Newsroom is claimed at this checkpoint. No new migration or deployment was performed during this audit.


## September 8 shared snapshot release

DFS Daily and Simulation Lab now share an immutable research bundle with CURRENT / AGING / STALE / FAILED source readiness and a read-only identity/exclusion report. Public collection runs via `npm run dfs:refresh`; the approved Mac task runs at 10 a.m. and 5 p.m. America/Chicago and publishes validated changes. It requires this Mac to be available. No production D1 migration or Cron trigger was added.

See [delivery order](docs/upgrade-roadmap.md) and [calibration plan](docs/calibration-plan.md). Identity verification and final-result ingestion remain the next calibration prerequisites; the model is still uncalibrated.


## September 8 identity evidence audit

Corrected provider team-code aliases, reducing eligible-player context discrepancies from 52 to 3. Added source-backed scoped findings for Gainwell, Okonkwo and Bredeson, and a priority-filtered evidence report. 302 candidates are corroborated; all 305 offensive DK mappings remain provisional. No names were automatically verified. The missing requirement is an independently documented DK→ESPN/GSIS ID bridge. See [evidence review](docs/identity-evidence-review.md).


## September 8 confidence-tier and calibration update

The earlier strict DK-bridge blocker is superseded by the user-approved four-tier policy: NFLverse Players V2 is canonical, and all 305 eligible offensive players are strongly corroborated, including three scoped manual overrides. None is represented as provider-ID verified. Stop identity work; no paid provider integration. Repeated identity and uncalibrated labels are removed from the main player views; details retain tier counts and validation limitations.

Completed a 354-game reconstructed historical Monte Carlo diagnostic: 2024 training, 2025 held out, positional mean error, variance scaling, P75/P90 exceedance and QB/receiver correlation. The experimental correction is not deployed because improved tails came with worse MAE. See [results and next backend steps](docs/calibration-results-2026-09-08.md).

## Newsroom milestone — September 8, 2026

Added the [actionable Newsroom](docs/newsroom.md): isolated Python RSS/injury adapters, immutable local source evidence, atomic public snapshot, expiry-aware shared player icons and accessible dialogs across cards, lineup tables, roster/stacks and simulation results. The existing twice-daily Mac refresh includes independent news ingestion and automatic publishing. Templates distinguish sourced facts from performance implications; news does not alter Monte Carlo inputs. Next news expansion: official team adapters and evidence-backed teammate/defender/coaching relationships, with coverage and temporal validation before broader auto-publication.

## Simulation V2.0-A — local foundation

Added a separate strongly typed `src/simulation/v2` game-state/clock engine and comparison envelope. Reuses the existing deterministic RNG; V1 methodology, scoring, UI and execution remain unchanged. The local benchmark runs 100/1,000/10,000 regulation games from a frozen real matchup with NFLverse 2025 team aggregates and archived market comparisons. No D1 persistence, V2 deployment, fantasy-player allocation or production recommendations. See [V2 architecture and measured results](docs/simulation-v2.md). Review required before V2.0-B empirical distributions and game/drive calibration.

### Drive Lab and V2.0-B

After user approval, the standalone `/drive-lab/` page exposes V2 through a bundled browser Dedicated Worker with cancellation, bounded counts and optional first-game trace. It does not replace V1 or feed recommendations. The empirical profile fits 2024 PBP; 2025 held-out diagnostics show better play-call Brier error (0.244→0.214) but substantial scoring underprediction. Foundation A remains selected by default. See [V2 update](docs/simulation-v2.md) and the checked-in evaluation JSON for assumptions, source hashes and metrics.
