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
