# Simulation V2 — Play-by-Play Engine (V2.0-A)

V1 remains the production research Monte Carlo engine, including player allocation and DraftKings scoring. V2 is a separate experimental game-state engine advancing one play at a time. This milestone implements regulation state, clock, possessions, drives, configurable RUN/PASS outcomes, simplified kicks/scoring, seeded execution and a local benchmark. It intentionally omits individual players, fantasy scoring, injuries, weather, penalties, overtime, full-slate simulation and production integration.

## Existing-code audit before implementation

- `public/simulation/engine.js`: V1 simulation/validation/DraftKings scoring. Reuse its conceptual game IDs, not its player allocation or methodology. Leave unchanged.
- `public/simulation/random.js`: seeded uniform/normal draws and fingerprint utility. Reuse directly, with a TypeScript declaration only.
- `public/simulation/statistics.js`: distribution summaries available for the benchmark. Leave unchanged.
- `public/simulation/contracts.d.ts`: V1 slate/game/player/run shapes; V2 needs explicit state and team totals rather than forcing player-level V1 outputs into a new shape.
- `scripts/build_simulation_input.mjs` and immutable `public/research/bundles`: actual matchups and archived ESPN scoreboard sportsbook total/home-spread with capture times. Reuse a frozen example, not live network requests in tests.
- `src/index.ts`: historical coaching names/context exist; a validated conditional play-caller tendency distribution does not. No new D1 reads/writes are needed.
- Existing test framework: Node's test runner and Python unittest; TypeScript strict check. Node 24 supports local `.ts` execution. V2 tests use the existing Node runner.

No changes to V1 engine/config/random implementation, statistics, optimizer, worker, UI, scoring or saved predictions are required. A separate comparison envelope will wrap either version without implying equivalent player-level outputs.

## Interfaces and state

`src/simulation/v2/engine.ts` exports strongly typed `GameInputV2`, `TeamInputs`, `GameState`, `Outcome`, `Transition`, `Drive`, `TeamTotals`, and `simulateGameV2(input, {seed, maxPlays?, debugTrace?, rules?})`. Explicit pure transitions are `openingState`, `advanceBetweenPlays`, `applyOutcome`, and `startSecondHalf`; selection/outcome helpers are independently testable. State uses **yards from the possessing team's own goal**, integer 1–99. A possession flip mirrors the spot. First downs reset to ten yards or goal-to-go; losses increase distance. No terminal state leaves an invalid down or end-zone field coordinate.

States are PLAYING → HALFTIME → PLAYING → FINAL, or an explicitly incomplete PLAY_LIMIT. The opening receiver is selected with seeded randomness; the other team receives after halftime. Q1/Q3 boundaries preserve down, distance and field. The seed plus model version drives the existing RNG; the run ID fingerprints inputs, seed, resolved rules and guard. Debug mode does not alter results. `comparison.ts` provides a neutral V1/V2 envelope without rewriting V1. V1 player summaries and V2 team summaries are deliberately different payloads.

Output includes final state/score/winner (null for a regulation tie or incomplete run), team totals, drives, clock usage and optional structured trace. Passing yards are gross; net team yards subtract sack yards. Sacks are pass plays, not pass attempts. Turnovers count interceptions/lost run fumbles, not fourth-down failures. First downs include offensive touchdowns. Kicks count in drive plays but not offensive scrimmage plays. Possessions count drives actually started, including partial end-of-half drives. No post-half/final-play scoring possession is fabricated.

## Rules modeled and explicit simplifications

- Four 900-second quarters. Regulation ties remain ties; no overtime or timeout inventory. Halftime is exposed as a state and advanced explicitly, without a halftime wall-time charge.
- Each snap consumes five seconds for incompletions/field goals, six for runs/completions/sacks/interceptions, seven for punts. A snap begun with time remaining finishes and can score even as the clock hits zero; its charged game-clock duration is capped at remaining time.
- Between snaps: normal 29, hurry 13, drain 38 seconds by default. Only a previously running clock consumes this interval. Incompletions, scores, turnovers, kicks, and quarter boundaries stop it. Q4 final five minutes chooses hurry while trailing and drain while leading. No first-half hurry strategy, two-minute warnings, out-of-bounds distinctions, timeouts, spikes, kneels, replay delays, penalties or administrative restart exceptions.
- `operationalSeconds` counts modeled snap/setup time, including setup while game clock is stopped; it is **not** a prediction of broadcast/game wall duration. `clockSeconds` totals exactly 3,600 for completed games. Drive durations include running between-snap time assigned to the current drive.
- Ten-yard series and goal-to-go; fourth-down failure changes possession at the mirrored ending spot. Default fourth-down rules: go with ≤2 yards from own 55 onward; otherwise attempt a field goal within 57 yards; otherwise punt, except trailing late can go. A final-eight-seconds field-goal heuristic applies in Q2/Q4. These are configurable heuristic choices, not optimal fourth-down analytics.
- Punt travels a fixed 43 net yards, no returns; end-zone punts become own-20 touchbacks. Field-goal distance is `117 − field`; success is 95% through 39 yards, 85% through 49, 65% beyond. Missed kicks use mirrored kick spot seven yards behind scrimmage, minimum own 20. No blocks/fakes/returns.
- Touchdowns award six plus an automatic one-point PAT. Field goals award three; an offensive run/completion/sack crossing the own goal awards the defense a safety (two). Scoring starts the receiving offense at own 30 with no kickoff/free-kick time or returns. Own 30 is a standardized modeling assumption, not a complete kickoff rule implementation.
- RUN: rounded/clipped normal yards (−8 to 60), optional lost-fumble rate. PASS: sack first, interception conditional on no sack, then completion conditional on neither; completion yards rounded/clipped normal (−5 to 80). Sack loss is normal 6±2, clipped 1–15. Interception location is normal 12±10 downfield, clipped 0–60; no return, end-zone interception touchback at own 20. Fumbles flip possession at the gain spot, clamped inside the field: own/opponent-end-zone fumble recovery rules are deferred. No defensive return touchdowns, passing fumbles, player allocation or fantasy-point multipliers.
- Team baseline pass rates are required. Configurable additions: +.10 at distance≥8, +.08 on third/fourth down, +.12 trailing late or −.15 leading late, clamped .05–.95. The unconditional historical rate is thus a starting parameter, **not** guaranteed to equal simulated pass share.
- Max plays defaults to 500; reaching it returns PLAY_LIMIT, never a completed-game/winner claim. Validation rejects invalid probabilities, nonfinite inputs, incompatible outcomes and invalid state/clock/field values.

Rules reference: [NFL Football Operations rulebook](https://operations.nfl.com/the-rules/nfl-rulebook), especially timing, scrimmage and scoring. This is an explicitly simplified engine, not a claim of full NFL rules compliance.

## Frozen real matchup and data

`tests/fixtures/v2/matchup.json` freezes Detroit (home) versus New Orleans, September 13, 2026, from an existing research bundle. Market context: DraftKings total 49.5, Detroit −7, via ESPN scoreboard at the captured timestamp in the fixture. Market values are comparison targets only; they do not tune outcomes.

`scripts/prepare_v2_example.py` aggregates existing NFLverse 2025 regular-season player-stat files by team to derive pass/dropback rate, completion rate, sacks, interceptions, rushing efficiency, yards per completion and lost-run-fumble rate. Actual aggregate historical plays/attempts/yards and source SHA-256s are preserved. Missing advanced conditional play-caller distributions are not invented. Prior-season values do not adjust for 2026 roster/system changes. Generic fallback completion/sack/INT/fumble rates are .65/.065/.022/.006, run mean 4.3 and completion mean 10.8; the example supplies observed means/rates instead. Run SD 4.5 and completion SD 8, along with pace/kick/selection defaults, remain illustrative unfitted parameters. Distribution truncation changes effective means and tails.

## Execution, validation and next milestone

Run `npm run v2:benchmark` for 100/1,000/10,000 games; it reads the committed fixture, aggregates in memory and writes `docs/simulation-v2-benchmark.json`. No network, D1 or per-play persistence. Repeat with the same fixture and seeds to reproduce scores; runtime/memory vary. Heap is sampled every 100 games; peak RSS is the process-wide high-water mark, including earlier batches. Neither is per-game memory.

Broad sanity flags (heuristics, not calibrated NFL confidence intervals): 45–80 offensive plays/team, 8–15 possessions/team, 25–65 total points, .5–5 turnovers/game, 3.5–7 net yards/play, 20–48 pass attempts/team and 15–40 rush attempts/team. Compare more directly with the fixture's observed prior-season team averages and archived market. Clearing flags establishes only that mechanics are not obviously broken.

V2 is not imported by any production entry point or served UI. No deployment, D1 changes, production DFS use or Newsroom integration is part of this milestone. Next **V2.0-B recommendation**: empirical play-outcome distributions and conditional pace/play-calling estimates from historical NFLverse play-by-play, then held-out game/drive-level calibration against V1. Review this foundation first; do not proceed automatically.

## Measured V2.0-A benchmark

| Games | Runtime (ms) | Games/sec | Sampled heap MiB | Process peak RSS MiB | Aborts |
|---:|---:|---:|---:|---:|---:|
| 100 | 23.0 | 4348 | 8.2 | 83.6 | 0 |
| 1,000 | 127.1 | 7869 | 10.4 | 84.2 | 0 |
| 10,000 | 1184.0 | 8446 | 17.6 | 100.6 | 0 |

10,000-game means:

- meanHomeScore: 26.362
- meanAwayScore: 17.965
- meanTotal: 44.328
- medianTotal: 44.000
- totalStddev: 11.371
- homeStddev: 8.910
- awayStddev: 7.928
- meanHomeDifferential: 8.397
- playsPerTeam: 66.161
- possessionsPerTeam: 11.598
- passAttemptsPerTeam: 41.939
- rushAttemptsPerTeam: 21.086
- netYardsPerTeam: 359.686
- yardsPerPlay: 5.437
- turnoversPerGame: 1.787
- touchdownsPerGame: 4.840
- averageDriveSeconds: 157.401

Market comparison: simulated total 44.33 versus 49.5; home margin 8.4 versus 7. No broad sanity flags, but the total is about 5.2 points low. This is not a calibrated forecast.

Observed 2025 team context (not a matched historical holdout):

- DET: 62.5 plays, 34.2 pass attempts, 26.0 rush attempts and 404.2 net yards per game.
- NO: 63.2 plays, 34.8 pass attempts, 25.6 rush attempts and 348.8 net yards per game.

The simulation is more pass-heavy than either observed team. This is consistent with the long-distance/third-down adjustments layered on unconditional baseline rates; fitting conditional baselines is a V2.0-B task, not hidden tuning to the market.

Use `npm run v2:simulate -- --seed=review --trace` to inspect an optional play trace locally.

## Regression result

137 tests passed: 77 Node (including 14 new V2 tests) and 60 Python; TypeScript strict check passed. Tests cover opening/first downs/goal-to-go, possession mirroring, running/stopped clocks, all quarter and halftime transitions, last-play scoring, PAT/FG/safety, punt/turnover/down failures, deterministic traces and IDs, tied regulation, max-play incomplete status, valid state sweeps and clock/drive/score/stat conservation. Existing V1 tests remain unchanged and passing. No test failures remain.

## Drive Lab and V2.0-B — September 9 update

The user approved a separate website page after reviewing V2.0-A. `/drive-lab/` now exposes the experimental V2 engine in a browser Dedicated Worker. This supersedes the initial no-page/no-deployment milestone restriction solely for the standalone research sandbox. V1 remains the production DFS model; V2 still has no recommendation, roster-grading or player-allocation integration.

The page supports archived matchups, explicit foundation/empirical version selection, editable team baseline pass rates, seeds, 100/1,000/10,000 games, progress/cancel, score distributions, per-team aggregates, one representative game's drives, and optional first-game trace. Results are labeled as aggregate versus one example. Bulk plays are never stored. Games/markets are frozen examples with capture and kickoff timestamps; they do not auto-update with the production research bundle. Team input season is shown separately. `npm run drive-lab:build` bundles the same typed source into a static browser worker, avoiding a second simulation implementation.

V2.0-B adds `empirical.ts` and an optional versioned profile to the V2 engine. Foundation defaults are preserved; empirical runs identify their model and profile in the run fingerprint. During expanded evaluation a terminal fourth-down goal-to-go edge case surfaced: distance was stale after a failed fourth-down gain as regulation expired. This V2-only state fix has a regression test. V1 files remain unchanged.

### Empirical fit and held-out evaluation

`npm run v2:fit` reads locally archived NFLverse 2024 and 2025 PBP. Fit uses only 2024 regular-season, regulation RUN/PASS plays, excluding penalties, kneels, spikes and missing required numeric fields. Down/distance/late-score cells use 50-observation smoothing toward the league pass baseline, with team baseline deviations added at simulation time. RUN and completed-PASS yardage use weighted observed league histograms rather than Gaussian draws. These are not opponent-adjusted or player-level distributions. Completion, sack, interception and fumble probabilities retain team inputs.

Pace uses adjacent eligible snaps in the same game/quarter/drive/possession, with a running-clock prior result and no out-of-bounds/TD/fumble; acceptable clock gaps are 6–46 seconds, minus an assumed six seconds of play duration. Medians for normal/trailing-late/leading-late replace the foundation's three pace settings. This approximates dead-ball time; timestamps do not directly measure it.

`npm run v2:evaluate` compares A/B over 258 non-overtime 2025 games, 200 draws per game per model, using 2024 team inputs. Fourteen overtime games are excluded. Final scores come from the completed schedule; actual play/yard counts use the filtered PBP cohort and therefore exclude penalties/kneels/spikes, whereas final points include all regulation scoring. Frozen retrospective files can contain later corrections; this is not an immutable pregame forecast backtest. Source hashes and all metrics are in `simulation-v2-b-evaluation.json`. Neither current markets nor held-out 2025 outcomes tune the profile.

Play-call Brier error across 32,116 held-out plays improved from 0.2440 to 0.2138. Full-game scoring remains weak: B underpredicts total points by 9.82 on average. Better play selection does not establish calibrated game scoring. The Drive Lab defaults to foundation A and exposes B as an experiment. Neither is used for DFS decisions.

Next focused work: diagnose drive finishing/red-zone distributions and missing scoring paths; measure conditional yardage and team/opponent adjustments, then evaluate on an additional untouched season before promoting any scoring model. No further phase has been started.

Release verification: 145 tests (82 Node, 63 Python) passed, plus strict TypeScript. Browser checks exercised 1,000 foundation games, 10,000 empirical games, first-game drives/trace, cancellation, and responsive layout without horizontal overflow. The empirical 10,000-game browser run completed in about 1.1 seconds on the development Mac. Runtime varies by device. No server simulation quota or D1 writes are used.

Published standalone Drive Lab on both existing custom domains as version `7a9fb563-858f-4176-8ee9-dca10f492db6`. The Cloudflare API worker and D1 bindings remain unchanged; simulation computation runs in the user's browser.

## V2.0-B — Current Data and Personnel Foundation

Audit before this milestone: Drive Lab loads static `examples.json` and `empirical.json` produced by `build_drive_lab.mjs`. The empirical file fits only 2024 PBP; examples take all team rates from that 2024 profile. Pace is a three-context median, yardage is a league histogram, conditional pass probabilities are smoothed down/distance/late-score cells. Current roster, depth and Madden information are absent. Archived 2026 matchup/market metadata comes from the shared research bundle but never adjusts outcomes. The separate evaluation uses 2025 with 2024 training. Raw 2024/2025 PBP is cached locally, not fetched by page visits. Fallbacks are the V2.0-A team/distribution/kick/clock assumptions already documented above. V1 remains untouched.

This milestone separates current live-profile construction from frozen evaluation configuration, adds personnel snapshots and unit diagnostics, and keeps all personnel attributes outside engine requests.

### Live recency and evaluation separation

`config/v2-live.json` selects 2026 current data, 2025 weight 1, and 2024 weight 0.5; 2026 starts at weight 2. These are configurable starting assumptions (one-season historical half-life), not learned calibration. `build_v2_live.py` builds a separate `live-empirical.json`, and `build_drive_lab.mjs` now uses its team inputs. The frozen `empirical.json` and 2024→2025 evaluation receipt remain intact.

Actual eligible observations on September 9: **2024 32,652; 2025 32,116; 2026 0**. The current-season NFLverse PBP release returned HTTP 404. `v2:live:refresh` checks the public source conservatively and retains last valid files. No future or same-day rows enter the fit. Current source absence is explicit in the UI; roster freshness does not imply available 2026 game observations.

Historical team rates use season-weighted play counts, with `alpha = n/(n+200)` blending toward the historical league. Current team rates receive share `n_current/(n_current+400)` over that stabilized history. League/current conditional calls, yardage histograms and pace use weighted observation counts; the current season's configured league weight is further multiplied by `N_current/(N_current+6400)`. Existing 50-play conditional-cell smoothing remains. Pace is a count-weighted average of per-season context medians, not a pooled median. All priors and season weights are positive-finite validated configuration. Neutral/early-down/red-zone-specific team rates are not new model inputs; existing down/distance/late-score behavior remains the modeled context.

`config/v2-evaluation.json` documents rolling folds: train through 2023→evaluate 2024; through 2024→2025; through 2025→2026. Evaluation season inclusion is strictly excluded by the tested season selector. Only the existing 2024→2025 fold has been executed; the 2023 training fold requires an additional archive, and 2026 awaits completed games. Current live-profile outputs are not described as held-out validation. Do not run the live profile against 2025 and call that a holdout. Late corrections in retrospective source files remain a limitation; frozen pregame receipts are stronger evidence.

### Personnel integration and release scope

See [personnel-ratings.md](personnel-ratings.md) for the source audit, exact attribute keys, tier coverage by position, formulas, sample matchup, storage and performance. Drive Lab adds one independent static `personnel.json` request, comparisons in both directions, expandable starter details and source/roster/depth timestamps. No personnel object is sent to the browser simulation worker. Missing personnel can render unavailable without preventing simulation. V1 engine files remain unchanged. A remains the initial engine choice; both live A team assumptions and optional live B use the newer weighted team baseline.

The schema is created and tested in local SQLite; production D1 has not been migrated. EA refresh is manual and cached at least weekly, separately from roster refresh. Optional QB/RB/receiving composites and historical Madden sources are deferred. Stop after review of this milestone before V2.0-C; recommended next work is narrowly scoped drive-finishing calibration, keeping personnel out of outcome probabilities.

Personnel-foundation verification: **162 passing tests (85 Node, 77 Python; 17 new)** plus TypeScript and Wrangler dry run. The browser exercised current-profile simulation and expandable personnel evidence. The refreshed research/news snapshot was also built through the existing authorized public-data workflow. Madden refresh remains manual.

Published on both existing custom domains as version `34b6dcfe-ad06-4f60-a5b2-093149885e2b`. Remote D1 remains unchanged.
