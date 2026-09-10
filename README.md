# Dr. Locks NFL research

NFL prop research, weekly DraftKings lineup exploration, and a reproducible Monte Carlo Simulation Lab. The live site is [drlocksmd.com](https://drlocksmd.com). Predictions and confidence indicators are uncalibrated research estimates; contest finish probabilities are not implemented.

## Current application — September 7, 2026

- `/preview/`: collapsible game board with kickoff/weather context and sports cards that flip to the Doctor Chart evidence briefing. Bookmaker quotes retain source timestamps. The anime doctor badge appears at confidence ≥80%; confidence is a heuristic, not a win probability.
- `/lineups/`: DFS Daily saved weekly builds: highest projection, two floor considerations, and three ceiling/stack candidates.
- `/simulation/`: seeded 1,000/10,000/50,000-draw browser simulations; correlated game/team outcomes, player distributions, stack explorer, scenario comparisons and candidate lineups. Sort all player columns, combine position/team/opponent/game/salary/value filters, export filtered CSV, and build a legal nine-player roster with a live $50,000 budget and eligible FLEX swaps. Rosters save on the device and can be simulated.
- Public read-only DraftKings lobby/draftables ingestion with immutable salary snapshots and CSV fallback. ESPN weekly projections are the first connected projection source.
- Research enrichment: captured totals/spreads for 12 games, identity corroboration and prior-season snap context. Immutable pregame archives and a supplied-final-actuals evaluation interface are available locally.

The current saved slate has 329 eligible players, 305 provisional offensive identities, 52 identity discrepancies requiring review, and 255 players with historical snap context. No DraftKings IDs were newly verified. The model is not historically calibrated; ownership, contest-field simulation, ROI and top-10% probabilities remain future work.

## Development and validation

Requires Node 24+ and Python 3.11+.

```sh
npm ci
python3 -m pip install -r requirements.txt
npm run check
npm test
npm run dev
```

Latest validation: 93 passing tests (50 Node, 43 Python), TypeScript checks, browser sorting/filtering, roster refunds/FLEX swaps and custom simulation. Tests use recorded fixtures and isolated local storage, not live DraftKings endpoints.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dfs:diagnose -- --list-only` | Discover public NFL draft groups |
| `npm run dfs:projections -- --season 2026 --week 1` | Archive ESPN weekly projection inputs |
| `npm run dfs:lineups -- --help` | Build saved DFS Daily lineups |
| `npm run dfs:simulation-input -- --help` | Build normalized simulation input |
| `npm run dfs:simulate -- --help` | Run local Monte Carlo simulation |
| `npm run dfs:research -- --help` | Enrich recorded inputs with markets and identity/usage context |
| `npm run dfs:freeze -- --help` | Freeze pregame input, prediction and raw sources |
| `npm run dfs:evaluate -- ARCHIVE ACTUALS_JSON` | Evaluate eligible final actuals against a frozen prediction |

See individual scripts and the linked operations documents for required arguments. No automated account access, wagering, contest entry or submission is implemented.

## Hosting and database boundaries

Cloudflare Worker `drlocks-nfl-props-api` serves `public/` and the API on both custom domains, using D1 binding `PLAYERPROP_DB`. This is a Workers static-assets deployment, not a separate Pages build. Keep `INGEST_TOKEN` and `SPORTS_GAME_ODDS_API_KEY` in Worker secrets or ignored local environment files.

The read-only D1 audit recovered legacy schema and confirmed migrations 0001–0005. Migrations 0006–0008 are implemented locally but have not been applied to production. Review [the migration runbook](docs/data-sources.md) before any database operation; application deployment does not apply migrations. No production Cron jobs are configured.

The latest published site version is `6330f669-7980-4e7e-805d-5ef5c02d09f8`. Approved application releases use `npx wrangler deploy --keep-vars`; database changes require separate authorization. GitHub source is `randykleckner/playerprop`; ignored local source archives and credentials are excluded from commits.

## Technical documentation and roadmap

- [Technical blueprint](TECHNICAL_BLUEPRINT.md): current system contracts and operations.
- [Architecture](docs/architecture.md): original audit and current implementation summary.
- [Data sources](docs/data-sources.md): endpoints, provenance, refresh/fallback and migration policy.
- [Doctor Chart](docs/doctor-chart.md), [weekly projections](docs/weekly-projections.md), [DFS Daily](docs/lineup-lab.md).
- [Simulation Lab](docs/simulation-lab.md): model, API, performance and limitations.
- [Research readiness](docs/research-readiness.md): source checks, frozen predictions and calibration gates.
- [DFS model](docs/dfs-model.md) and [backtesting](docs/backtesting.md): implemented boundaries and remaining objectives.

Current milestone: [simulation audit](docs/simulation-methodology.md) and [data-readiness repair](docs/data-readiness.md), then transparent player scores, roster grading, Newsroom and scenario links. Step 1 passed 120,000 game-draw invariant checks and repeat-run equality on fresh inputs. Automatic refresh and later features are pending. The first complete local commit exists; GitHub push is blocked by invalid saved credentials.


## September 8 shared snapshot release

DFS Daily and Simulation Lab now share an immutable research bundle with CURRENT / AGING / STALE / FAILED source readiness and a read-only identity/exclusion report. Public collection runs via `npm run dfs:refresh`; the approved Mac task runs at 10 a.m. and 5 p.m. America/Chicago and publishes validated changes. It requires this Mac to be available. No production D1 migration or Cron trigger was added.

See [delivery order](docs/upgrade-roadmap.md) and [calibration plan](docs/calibration-plan.md). Identity verification and final-result ingestion remain the next calibration prerequisites; the model is still uncalibrated.


## September 8 identity evidence audit

Corrected provider team-code aliases, reducing eligible-player context discrepancies from 52 to 3. Added source-backed scoped findings for Gainwell, Okonkwo and Bredeson, and a priority-filtered evidence report. 302 candidates are corroborated; all 305 offensive DK mappings remain provisional. No names were automatically verified. The missing requirement is an independently documented DK→ESPN/GSIS ID bridge. See [evidence review](docs/identity-evidence-review.md).


## September 8 confidence-tier and calibration update

The earlier strict DK-bridge blocker is superseded by the user-approved four-tier policy: NFLverse Players V2 is canonical, and all 305 eligible offensive players are strongly corroborated, including three scoped manual overrides. None is represented as provider-ID verified. Stop identity work; no paid provider integration. Repeated identity and uncalibrated labels are removed from the main player views; details retain tier counts and validation limitations.

Completed a 354-game reconstructed historical Monte Carlo diagnostic: 2024 training, 2025 held out, positional mean error, variance scaling, P75/P90 exceedance and QB/receiver correlation. The experimental correction is not deployed because improved tails came with worse MAE. See [results and next backend steps](docs/calibration-results-2026-09-08.md).

### Newsroom

`/newsroom/` provides brief, actionable player news with source links, filters and newspaper icons across player views. `npm run news:refresh` fetches the public ESPN RSS and official NFL injury report; it also runs with the existing 10 a.m./5 p.m. Central refresh. See [Newsroom architecture and coverage](docs/newsroom.md). No additional keys or paid news service are required.

### Simulation V2 foundation (local experiment)

V1 remains the production research simulator. V2.0-A is a separate deterministic play-by-play game-state/clock foundation, with no player allocation or production recommendation integration. Run `npm run v2:simulate -- --trace` or `npm run v2:benchmark`. See [architecture, rules, limitations and measured benchmark](docs/simulation-v2.md). V2.0-B requires review before implementation.

Drive Lab is available at `/drive-lab/` as a separate experimental page. It supports V2 foundation/empirical comparisons, drive summaries and optional traces while V1 stays the DFS model. Build its browser worker with `npm run drive-lab:build`; fit/evaluate historical profiles with `npm run v2:fit` and `npm run v2:evaluate` after preparing the documented local data files.

Drive Lab's current-data/personnel foundation is documented in [personnel-ratings.md](docs/personnel-ratings.md). Use `npm run personnel:import`, `npm run v2:live:refresh`, `npm run drive-lab:build`, then `npm run personnel:build` to refresh the manual diagnostic bundle. `npm run personnel:diagnose -- --away BUF --home HOU` prints starter evidence and unit comparisons. Madden ratings are diagnostic only, with a minimum seven-day cache; the existing research/news schedule does not refresh EA.

V2.0-C adds separately selectable Base/Personnel player outcomes in Drive Lab. After refreshing the source snapshots, run `npm run v2:players:build` then `npm run drive-lab:build`; `npm run v2:benchmark:players` records the 1,000/10,000-game comparison. See [player simulation methodology and release receipt](docs/player-simulation-v2.md). V1 remains the DFS model.

## Simulation V2.0-D

Expected-active personnel and workload redistribution are implemented in Drive Lab. Official injury/practice evidence, canonical roster/depth, historical snap context and Madden attributes feed a pure preparation step before Base/Personnel simulations. Scenario controls and source-grounded player explanations preserve official snapshots. See [availability and workload](docs/availability-and-workload.md) for the release audit and known limits. Next proposed milestone: freeze pregame availability inputs and evaluate final workload; no automatic expansion beyond V2.0-D.
