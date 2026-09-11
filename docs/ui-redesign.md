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

## Second increment — all-page visual migration
- All existing routes now use a light workspace, navy navigation, compact controls and shared tables. Removed the temporary legacy dark palette. Root route now opens the redesigned Home.
- Home aggregates real slate games, recommendations, source freshness and current news; existing shared model insights remain available in a disclosure.
- Recommendations use compact overview cards with expandable rosters and floor/ceiling/stack view links. Builder handoffs are retained. Floor and ceiling strategies remain honestly labeled proxies.
- Props is a searchable, market-filtered table with an in-place detail dialog. Existing matchup card/chart remains in the detail disclosure. Confidence is not misrepresented as a probability; receptions are included in Receiving.
- News is a dense sourced table with status filters and detail dialogs, including practice participation and report times.
- Drive Lab has a game selector in the toolbar, an inspector, and tabs for overview, matchup, projections, what-if and evidence. Existing engines/parameters are preserved. The game selector explicitly displays NO vs DET with a chevron, hover and keyboard focus styles; fixed zero-size font inheritance.
- Simulation Station has searchable arbitrary player selection, a primary distribution view, percentiles and a settings inspector. Full player/roster workbench, stacks, candidate lineups and scenarios remain available.
- Analytics promotes stored historical diagnostics and positional charts; methodology remains available. No invented ROI or accuracy percentages.
- Saved content has compact lineup and scenario tabs; existing IndexedDB configurations can be loaded through library links. Settings provides persisted table density and source/storage details.
- Added shared player-headshot enhancement using the existing canonical-ID media catalog; initials remain the fallback.
- Asset versions prevent older cached scripts and styles from mixing with the redesigned pages.

### Verification
Full regression suite passed (154 JavaScript tests, 93 Python tests). TypeScript passed. Browser checks covered prop filtering/detail, injury filtering/source detail, Drive Lab game switching and a 100-game run, Simulation Station player search and a 1,000-draw run, saved scenario creation/library/reload, stored analytics rendering and mobile page widths. The Drive Lab selector was visually verified at desktop and 390px mobile widths. No backend analytical changes or deployment.

## Visual polish sprint — September 11, 2026

Preserved routes, the shared shell, Builder structure, research bundle joins, optimizer, and simulation calculations. Added shared portrait sizes, avatar groups, position pills, strategy/action SVGs, sportsbook badges, confidence meters, stack previews, and histogram markers. Portraits resolve through the existing catalogs with a headshot → team logo → initials fallback, including failed image requests.

Recommendations now distinguish overall, floor strategy, and upside stacks through restrained green/teal/purple accents, stronger projection hierarchy, player clusters, and actual required-player connections with bring-back labels. No floor, ownership, correlation, or win probabilities were invented. Builder uses lock/unlock and exclude icons, descriptive empty positions, and player matchup metadata. Props adds score meters, book badges, and portrait/team identity in details. Saved lineups share the player clusters; news sources use compact badges.

Simulation charts now mark projection, median, P25/P75, and a sportsbook reference only when provided, using histogram bin boundaries. Seed controls are under Advanced; Drive engine/assumption controls are collapsed. Fixed control movement to use the detached inspector's own subtree. Methodology remains available in disclosures, and archived/stale/fallback notices remain visible.

Validation: TypeScript check; syntax checks for changed JavaScript; 158 JavaScript and 93 Python tests passed. Added tests for missing confidence, bounded meters, chart marker placement, canonical avatar identities, stack bring-backs, and catalog fallback order. Live browser checks covered loaded portraits, recommendation cards at 1280px and 390px (no document overflow), simulation execution and markers, Advanced seed placement, Builder lock/unlock (restored prior state), Props detail dialog, and NO vs DET selector/team logos. Local static Props preview cannot serve the live API and correctly displays its saved-data fallback notice.
