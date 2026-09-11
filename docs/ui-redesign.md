# UI redesign inventory and rollout

## Audit (September 10, 2026)
- Frontend: static HTML, CSS and native ES modules in public/. No SPA framework or build is required. Worker static assets serve directory routes; /board and /story also have Worker aliases.
- Hosting: src/index.ts, ASSETS and PLAYERPROP_DB bindings in wrangler.jsonc. Existing D1 migrations cover players/games/stats, props, availability/roles/context, odds, DFS salaries/provider identities, simulation summaries, personnel ratings.
- Existing APIs: /api/board, /api/signals/live, /api/defense/position-splits, player game logs; /api/dfs/slates and slate salaries; /api/dfs/simulations/slates, saved simulations/stacks and authenticated diagnostic simulation POSTs. Ingestion endpoints remain unchanged.
- Data: research/latest.json points to an immutable, matched salary/projection/simulation/recommendation bundle. Reuse loadResearch and snapshotState. Do not silently fall back to older unrelated slates.
- Optimizer: public/simulation/optimizer.js exact salary-grid optimizer; workbench.js supplies position eligibility, add/remove and salary validation. Simulation engine and V2/Personnel engines remain untouched.
- Props: app.js, game-context.js and prop-card.js use existing board/line/signal data. Preserve preview and story routes.
- News/personnel: newsroom feeds, official injury reports, personnel and availability snapshots have separate source coverage. DFS active flag is salary-pool eligibility, not proof of medical status.
- Persistence: simulation roster uses dfs-roster:<slate> in localStorage; model configurations and runs use IndexedDB via modeling/store.js. No account-level saved-lineup API exists. New named lineup library is explicitly browser-local.
- Refresh: scripts and an existing Mac schedule refresh research/news at 10 a.m./5 p.m. Central (README); no Worker cron is configured.
- Existing tools: Command Center, Betting Engineer, Drive Lab, Simulation Lab, DFS Daily, Props, Newsroom, Research and Calibration must remain accessible.
- Worktree already contains substantial analytical/modeling edits. Preserve those edits.

## First increment
Shared responsive sidebar and toolbar, reusable UI tokens, dedicated /builder/ workspace using the existing optimizer in a Web Worker, local named lineup library, recommendation/stack handoff, basic display preferences. Apply the shell to existing tools while retaining their page internals. Detailed page redesigns follow the specification's phase sequence.

## Remaining phases
Curated recommendation drilldowns, dense Props/detail redesign, Drive Lab and Simulation Station workspace redesign, authoritative injury detail, stored analytics views, saved scenario library, Home aggregation, and final account/mobile polish. Existing functionality remains available during migration. No authentication providers or unsupported metrics are invented.

## Validation of first increment
- TypeScript check passed.
- Full repository suite: 151 JavaScript tests and 93 Python tests passed, including eight new Builder integration tests.
- Browser checked: search, add player, lock player, worker generation, named save, load saved roster, recommendation stack handoff, and 390px mobile layout (no document overflow).
- Existing mean optimizer result matches the published baseline lineup projection. Canonical player IDs survive recommendation transfers.
- Local preview: Python static server on port 4173; API-dependent legacy pages require the normal Worker environment. No deployment performed.
- Repository-wide whitespace check reports a pre-existing trailing blank line in scripts/build_v2_availability.py; that file was not changed by this increment.
