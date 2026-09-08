# Pregame research readiness and player workbench

## Delivered

The Simulation Lab now supports sorting every player-table column in either direction, including team, ceiling (P90/P95), points per $1K and 2×/3×/4× percentages. Filters combine position/FLEX, team, opponent, both sides of a game, player-name search, maximum salary, minimum 3× percentage, availability, remaining budget and roster membership. Filtered rows can be exported as CSV. Filters never remove players from the roster.

The roster builder enforces unique players, eligible Classic slots and the $50,000 cap. Add/remove recalculates remaining salary and average salary per open slot. Moving or swapping compatible players between a base position and FLEX keeps salary unchanged. An occupied FLEX can automatically move to an open base slot when adding another eligible player. Candidate lineups can populate the builder. A legal roster can be evaluated with the current simulation's seed/count/scenario. Rosters persist in local browser storage for the slate, not in an account or contest. Inactive scenario players remain visible in the roster and prevent evaluation until replaced.

## Data evidence

Refreshed DK salary snapshot: `salary-343463a8295e39ff160843ecdbce8659dfc2aeb855e9c183567feb483dcb4943`.
Refreshed ESPN projection archive: `a45096065d6efc59ca50872ccf7b46e21554286ce3f51c2b7bde3c0c85ffaf35`.
The updated research slate still contains 329 eligible players and 305 provisional offensive identities.

- 12/12 game totals and signed home spreads from the ESPN public scoreboard's DraftKings quotes. Home implied points are `(total − home spread)/2`; away implied points are `(total + home spread)/2`. Quotes must match both teams, kickoff, season and week; already-started or ambiguous games are rejected. Quotes retain their capture timestamp. The displayed LV–MIA quote was a **40.5 total, LV −3.5 spread** at capture; these are separate quantities, not a claim of a high-scoring matchup or live odds.
- 253 provisional identities are corroborated by the public crosswalk; 52 require review. Findings include 50 team mismatches and three name/position conflicts (categories overlap). Corroboration compares GSIS, ESPN, name and position; it does not invent a DraftKings-to-GSIS ID crosswalk. **Zero new DraftKings mappings were marked verified.** No production D1 membership claim is made.
- 255 players have a prior-season last-five-game snap-count context. Rows join by PFR→GSIS, restrict to prior-season regular-season data, reject duplicates, and flag changed teams. Historical snap share is displayed as context; it does not silently become a current-week snap projection or change workloads.

Sources: [ESPN public scoreboard](https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=2026&seasontype=2&week=1), [DynastyProcess ID crosswalk](https://github.com/dynastyprocess/data), [crosswalk field dictionary](https://nflreadr.nflverse.com/articles/dictionary_ff_playerids.html), and [NFLverse releases](https://github.com/nflverse/nflverse-data/releases). NFLverse explicitly excludes DraftKings IDs from its player catalog's scope; the inspected fantasy crosswalk also lacks them. Third-party corroboration is evidence for review, not authoritative verification.

## Reproducible collection and freezing

`scripts/prepare_dfs_research.py` accepts recorded scoreboard, crosswalk, snap-count and canonical-catalog files with an explicit scoreboard capture timestamp. It writes enriched input plus a review queue, retaining source hashes and local file receipt timestamps. File receipt time is not a claim of original provider publication time. Existing salary/projection ingestion remains the supported public read-only refresh path. No download or refresh runs from the browser.

```sh
npm run dfs:research -- --input fresh-input.json --scoreboard scoreboard.json --crosswalk playerids.csv --snaps snaps-2025.csv --catalog catalog.json --captured-at CAPTURE_TIME_ISO --output enriched-input.json
npm run dfs:simulate -- --input enriched-input.json --mode standard --output prediction.json
npm run dfs:freeze -- --input enriched-input.json --prediction prediction.json --raw scoreboard.json --raw playerids.csv --raw snaps-2025.csv
```

The freeze command verifies exact input/prediction fingerprints, baseline-only overrides, valid capture times, unexpired inputs, and a pre-lock freeze time. It creates a unique directory atomically, using exclusive files, with normalized input, predictions, optional raw archives and SHA-256 manifest hashes. Existing directories are never overwritten. The initial attempt correctly rejected expired salary data; fresh salaries/projections were fetched before a successful 10,000-draw freeze. Old historical archives were retained.

`npm run dfs:evaluate -- archive-directory actuals-and-windows.json` checks archive hashes, joins exact player/game IDs to final actuals, excludes provisional identities and DST placeholders, and feeds eligible rows into the held-out calibration reporter. Required actuals: `player_id`, normalized `game_id`, `status:'final'`, `completed_at`, and numeric `actual_points`. The file also supplies disjoint training/evaluation windows. Duplicate, live, or mismatched actuals fail. This is a supplied-actuals evaluation interface, not an automated final-score ingest.

The hashes detect accidental content changes; local storage is not an independently timestamped, externally signed attestation. Future identity-review evidence must be reconciled before any provisional archive is used for calibration. Do not relabel predictions as verified or calibrated to bypass the eligibility gate.

## What remains

Completed Week 1 results and verified identity evidence are still needed before reporting forecast accuracy. No historical MAE or percentile calibration is fabricated. No model tuning, ownership, tournament-field simulation, production D1 migration, Cron, authentication automation or contest entry was added.

The next operational step is to review the 52 identity discrepancies and obtain a supported DraftKings identity bridge or documented manual evidence, then evaluate frozen predictions after final results become available. The source files and local frozen receipts are under ignored `.dfs-research/`; the published enriched input retains public provenance and quality flags.

## Validation and frozen receipt

Published to `drlocksmd.com` on September 7, 2026: Worker version `6330f669-7980-4e7e-805d-5ef5c02d09f8`. No production D1 migrations or Cron configuration were applied.

September 7 validation: 50 Node tests and 43 Python tests passed (93 total), plus TypeScript checks. Browser checks confirmed RB filtering, percentage sorting in both directions, candidate loading, salary refunds, legal RB/FLEX swaps with an unchanged budget, and a completed custom-roster simulation. The narrow 641px layout stayed within the page width, with horizontal scrolling confined to the table.

The complete 10,000-draw archive is `pregame-f7497e162c8b51d42a53fa4123407f56`, frozen at `2026-09-07T20:41:15.154Z`. It includes the normalized input, prediction, scoreboard, crosswalk, prior-season snaps, salary snapshot, projection snapshot, and canonical catalog, with file hashes in its manifest.

## Changed files

Added `public/simulation/workbench.js`, `scripts/research/{prepare.py,archive.mjs}`, `scripts/{prepare_dfs_research.py,freeze_dfs_research.mjs,evaluate_frozen_dfs.mjs}`, `tests/{simulation-workbench.test.mjs,research-archive.test.mjs,test_research.py}`, and this report. Updated Simulation Lab HTML/JS/CSS/input, package scripts, `.gitignore`, and data-source documentation.


## September 8 continuation

The shared bundle `049409c3f0aeacba643614ad` now serves both research frontends. It was generated at 2026-09-08T13:57:22.063Z, with 329 players and 12 games. Fresh baseline `sim-fc47a10704e1e20c7f605a8562b0d73a` passed 10,000 draws per game, 120,000 allocation checks, deterministic rerun and independent player/lineup quantile verification. Archive `pregame-0e97387c89b70946bd2ddfddacf71681` was frozen at 2026-09-08T13:59:01.191Z with normalized input, predictions and scoreboard/market representations. The earlier six-source archive is retained.

100 offline tests passed (54 Node and 46 Python), plus TypeScript. Browser verification completed a 1,000-draw simulation, RB/value filtering (67 RBs), all six DFS Daily builds, shared current timestamps and no page overflow at the available 641px width. The protected Worker diagnostic API and legacy CLI defaults still reference their explicit archived slate paths; this release changes the two browser frontends and adds a shared refresh command.

The Mac-based public refresh/publication task is active at 10 a.m. and 5 p.m. America/Chicago, including daylight saving. No production D1 migration or Cron trigger was applied. The [calibration plan](calibration-plan.md) details identity and final-actual prerequisites; current provisional identities remain excluded from accuracy claims.

Release deployed on both custom domains: `cf36bba3-7f3d-456e-9018-1ef2947b2d9f`.
