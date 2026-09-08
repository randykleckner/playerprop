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
