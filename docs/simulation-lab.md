# Monte Carlo foundation — Simulation Lab

This milestone adds an isolated correlated NFL Classic simulator, a browser lab, CLI research runner, bounded Worker diagnostics, and immutable summary persistence. It is an **uncalibrated foundation**, not an ownership, field, contest-finish, payout, or portfolio model.

## Use the lab

Open `/simulation/` from either Prop board or DFS Daily. Choose the saved slate, Quick (1,000), Standard (10,000), or Deep (50,000), enter a seed, and run a baseline. Computation runs in a dedicated browser Web Worker, with progress and cancellation. The page remains interactive.

The player table sorts by mean, median, P90, value, and 3× probability. It includes projection, mean, median, P25, P90, P95, standard deviation, and 2×/3×/4× percentages. Click a name for a histogram, P10/min/max, projection comparison, and opportunity averages. Sportsbook baseline is shown as unavailable when absent.

Stack explorer filters QB, team, opponent, and stack form. Cream candidate cards show the five objectives, player lists, salaries, means, medians, P25/P90/P95, and score-threshold percentages. The manual form validates QB/2 RB/3 WR/TE/FLEX/DST, nine unique players, at least two teams, and the $50,000 cap.

The scenario workbench accepts OUT, limited workload, carries multiplier, target-share change, absolute target/rush shares, snap share, game total, and team pass rate. It preserves the baseline and compares mean/P90/3× percentages, targets, carries, and team pass-rate changes. It reuses the baseline seed and draw count. Changes that alter random branching introduce Monte Carlo noise; same seed is not a perfect paired-random-number experiment. Summary JSON downloads include baseline and current results; browser draws are discarded after aggregation.

## Real input and provenance

The checked-in archive is draft group **151307**, NFL Classic, Sunday September 13, 2026, 12 games. It joins saved DK salary data to ESPN Week 1 projections and the recorded ESPN schedule. It has 329 eligible rows: 305 provisionally matched offensive identities and 24 team defenses. Rejections: 53 disabled/unavailable, 245 without a matching projection, and 117 unresolved identities. Provisional research use requires `--allow-provisional`; these matches are not promoted to verified canonical mappings.

Capture timestamps, SHA-256 archive hashes, expiry, coverage, and quality flags accompany the normalized slate. The builder checks freshness **at archive capture time** for reproducible research; the UI separately flags expiry relative to now. A historical research archive must not be represented as a current feed. No live salary, projection, sportsbook, or account request occurs during simulation or tests.

`public/simulation/contracts.d.ts` describes the normalized contract. `inputs` carries expected attempts, targets, carries, probabilities and per-opportunity efficiencies. `projected_opportunities` mirrors source expectations for consumers. Final projection is a comparison baseline, not a fantasy-score distribution or post-simulation multiplier. Missing snap share, routes, sportsbook baseline and input percentile estimates remain null. `routes` and `touchdown_probability` are reserved interface fields in v1; convert a researched TD estimate into explicit per-opportunity TD weights before use. No raw anytime-TD price is silently treated as a calibrated probability.

Build a new input:

```sh
npm run dfs:simulation-input -- --salary salary.json.gz --projections projections.json.gz --schedule scoreboard.json --allow-provisional --output public/simulation/slates/151307.json
```

An optional `--markets markets.json` accepts an array keyed by normalized `game_id` (sorted team abbreviations joined with `-`), with `total`, `home_spread` (negative = home favorite), optional implied totals, source and capture timestamp. The bundled archive has no market totals/spreads or anytime-TD prices. Those are deliberately unavailable, not invented bookmaker observations. Register new published inputs in `public/simulation/slates.json`.

## Football model

1. Each game has seeded random streams. Shared mean-one lognormal environment and pace factors plus a normal score-margin/script factor affect both teams. Team-specific lognormal efficiency affects yardage.
2. Team plays are anchored to projected QB attempts plus carries, with bounded pace and game-total adjustments. A sampled lead reduces pass tendency and increases rushing volume; trailing does the reverse. Pass attempts are binomial draws from plays; carries are the exact complement.
3. Exact multinomial allocation splits targets among RB/WR/TE and carries among rushers. QB attempts are allocated separately. A residual recipient represents unmodeled/off-pool players. Targets never exceed team attempts; carries exactly equal team rush attempts. OUT/limited players relinquish opportunity; remaining weights and the residual renormalize. Limited QB attempts left unfilled by the QB pool go to the residual quarterback. Unsupported position-specific overrides fail explicitly. Absolute shares reserve a fraction before allocating the remainder. A zero share means zero opportunity. Snap-share overrides scale workload relative to the known share, or relative to 1 when unknown.
4. Receptions are binomial, conditional on allocated targets and completion/catch inputs. Receiving and rushing yards come from opportunities × efficiency plus scaled yardage noise, rounded to nonnegative integers. QB projected passing yards anchor team receiving efficiency with a bounded 0.7–1.3 adjustment. QB passing yards equal the sum of receiving yards, including residual players.
5. Team TD counts are Poisson with expectation `(implied points − 3 × expected field goals) / 7`. Expected TDs are floored at 0.1. Projected QB pass TDs and rush TD weights inform the pass/rush split. TDs are discrete and allocated to actual receptions or carries using projected TDs per opportunity. TD counts cannot exceed those events; unallocatable events are dropped. The model does not simulate drives, exact possessions, extra-point misses, or defensive scores in team points.
6. DraftKings scores derive from the resulting stats: full PPR, 0.04 passing yards, 0.1 rush/receiving yards, 4 pass TD, 6 rush/receiving TD, −1 interception/lost fumble; actual 300/100/100 yard thresholds earn the three-point bonuses. Lost fumbles use projected per-opportunity rates.
7. DST is explicitly approximate: opposing points determine the scoring bracket, opposing interceptions count, and sacks/recoveries use simplified count models. Recoveries do not reconcile to offensive fumbles yet. No safeties, blocked kicks, return TDs or two-point conversions. This limitation also explains differences from ESPN-derived point projections.

## Correlations and fallback configuration

`config.js` stores all defaults. The initial shared loadings are environment 0.18, pace 0.10, team efficiency 0.13, player efficiency 0.20, script standard deviation 7 points, and pass-rate change 0.007 per point of script. They are **factor loadings, not fitted Pearson correlations**. Missing totals/spreads use 44/0, fallback plays 64, pass rate 0.57, catch probability 0.65, receiving efficiency 11, rushing efficiency 4.2, and expected field goals 1.5.

QB/WR/TE share completions, yards and TDs. Opposing pass catchers share environment/pace. Passing and rushing compete for finite plays, teammates compete for finite opportunities, and DST depends inversely on opposing production. Negative conditional allocation covariance does not imply every observed teammate fantasy-score correlation is negative.

Empirical integration uses `options.configuration` with replacement loadings and `calibration: {status, source, trainingWindow}` provenance. Fit those loadings on a separate training window, record them in a versioned configuration JSON, and evaluate out of sample. Raw Pearson coefficients cannot simply replace loadings; fitting must map observed residual covariance into the shared-factor model. Output retains the configuration and remains labeled uncalibrated until a future reviewed model version completes validation.

## Results, stacks, candidates

Player distributions report mean, population standard deviation, linearly interpolated percentiles, extrema, a 20-bin histogram and **strict exceedance** percentages. A $5,000 player's 3× threshold is 15 points. Score thresholds are configurable arrays. Constant distributions remain valid; ties do not exceed a threshold.

Stack combinations cover QB+WR, QB+TE, QB+WR+WR, QB+WR+TE, and QB+catcher+opposing catcher. Candidate receivers are bounded to four per team and two bringbacks. Round-robin selection across quarterbacks and stack types prevents the first teams from consuming the default 120-stack budget. These are measured candidates, not an exhaustive or optimal stack set.

Five lineup objectives reuse the existing exact salary-grid dynamic program: median, P25 floor, P95 ceiling, value, and required stack. `options.stackPlayerIds` supplies a forced stack. Default lineup thresholds are 120/140/160/180/200; stack thresholds 30/40/50/60. Optimization uses additive player objectives; the selected lineup's true joint percentiles are then calculated from summed **same-iteration** scores. An additive P25/P95 objective does not guarantee the highest joint lineup P25/P95. No exhaustive roster enumeration is performed.

The deterministic run ID uses a 128-bit non-cryptographic fingerprint of the full input/configuration/seed/options, not an authorization token. Archive provenance additionally uses SHA-256. Persistent duplicate IDs are rejected, never overwritten. Scores use temporary Float32 arrays; floating-point results should be reproduced with the same model/runtime, with tiny numerical tolerances for cross-engine comparisons.

## CLI and API

```sh
npm run dfs:simulate -- --mode standard --seed research-1
npm run dfs:simulate -- --count 25000 --seed research-1 --overrides scenario.json --lineups lineups.json --configuration config.json --output .dfs-simulations/scenario.json
npm run dfs:simulate -- --count 1000 --seed saved-1 --persist-local .dfs-simulations/research.sqlite
```

`--persist-local` creates a standalone local SQLite research database using the D1-compatible migration. It does not connect to or modify production D1. Count is configurable up to the foundation safety ceiling in `DEFAULTS`; mode presets are convenience defaults. CLI output includes measured runtime and process memory. Never commit private local research results by accident: `.dfs-simulations/` is ignored.

Worker routes:

| Route | Behavior |
|---|---|
| GET `/api/dfs/simulations/slates` | Saved input catalog |
| POST `/api/dfs/simulations/slate` | `{slate_id, simulation_count, seed, overrides?, persist?}` |
| POST `/api/dfs/simulations/lineup` | Same plus `player_ids` (or `lineup`) array |
| GET `/api/dfs/simulations/{run_id}` | Previously persisted summary |
| GET `/api/dfs/stacks/{slate_id}` | Stacks from latest persisted run |

POST requires the existing `Authorization: Bearer INGEST_TOKEN`; no token is exposed in the lab. Only saved server-side slate assets are accepted. Requests are bounded to 20 KB, 40 overrides, and at most 100 diagnostic draws (default 10). `mode` supports known mode names but returns 422 when their count exceeds the Worker diagnostic limit. Candidate optimization is disabled for synchronous Worker requests. Larger analysis runs belong in the browser/CLI. Missing simulation tables return 503 on reads without breaking existing NFL routes. Persistence failures return the computed result with 409, so the caller can retain the summary.

## Persistence

Migration `0008_dfs_simulations.sql` adds immutable runs and player summaries; a single insert atomically expands normalized player results via a SQLite trigger. It stores model/count/seed/input fingerprint, started/completed/capture timestamps, configuration, completed status, and the complete summary JSON including stacks and lineup results. Per-player mean/median/stddev/P10/P25/P75/P90/P95 and 2×/3×/4× probabilities are also indexed by run/player. Raw iterations are never stored. Foreign keys reference the run, not provisionally matched production player IDs. Duplicate inserts and updates/deletes fail.

This migration is prepared and tested locally. **No production D1 migration or Cron was configured for this milestone.** Enabling production summary persistence requires a separate database change; the browser lab does not depend on it.

## Held-out validation

`npm run dfs:calibrate -- heldout.json` reports MAE, P10/P90 calibration, positional errors, and mean squared standardized residuals. Input includes disjoint `trainingWindow` and `evaluationWindow` (ISO start/end) and `cases` with player/game/position, game date, pregame capture date, mean/actual/P10/P90/stddev. Duplicate observations, nonfinite metrics, postgame projections and overlapping windows are rejected.

No valid historical calibration score is claimed. The available production audit found 2024 schedule duplication and no archived historical pregame salary/projection pairs suitable for held-out evaluation. Current tests verify accounting, probability direction and software behavior using recorded inputs; they do not prove calibrated forecast accuracy. The next milestone should archive pregame inputs, verify identities, add current game markets/usage data, and calibrate on a disjoint set of completed weeks before introducing ownership or simulated fields.

## Future natural-language boundary

A later interpreter can produce the same structured payload, resolve player names to slate IDs, validate it, and show the scenario for review. Example: “Run 25,000 with Henderson inactive” becomes `{slate_id, simulation_count:25000, seed, overrides:[{target:'player',id:'canonical-id',parameter:'out',value:true}]}` routed to an appropriate execution surface. Carry-share sweeps are a list of independent overrides/runs compared against a preserved baseline. No language interpretation or automated entry is implemented here.

## Measured performance and execution limits

Final full-slate benchmark on Apple Silicon, Node v24.14.0, 329 players / 12 games, including 120 stack summaries and five candidate lineups:

| Draws | Runtime | Peak process RSS | JS heap at finish | Draw/array buffers at finish |
|---|---:|---:|---:|---:|
| 1,000 | 0.73 s | 109.9 MiB | 19.6 MiB | 1.3 MiB |
| 10,000 | 5.38 s | 170.7 MiB | 16.6 MiB | 12.6 MiB |
| 50,000 | 26.27 s | 367.6 MiB | 30.5 MiB | 63.1 MiB |

Reproduce with `npm run dfs:benchmark`; machine-readable output is `docs/simulation-benchmarks.json`. Each count starts a fresh Node process. This is one measurement per count, not a benchmark confidence interval. Process RSS includes Node/runtime overhead and is not directly equivalent to isolate memory; arrays become collectible after aggregation and may remain allocated until garbage collection.

Cloudflare currently documents 128 MB per isolate, 10 ms CPU per Free request, and a 30-second default CPU limit on Paid requests (configurable up to five minutes). See [Workers limits](https://developers.cloudflare.com/workers/platform/limits/). These CPU-heavy full-slate runs do not fit Free synchronous execution and Deep has substantial memory pressure even on Paid. The 100-draw API limit is a diagnostic ceiling, not certification against an unknown account's CPU budget. No plan upgrade or hosting change was made. The smallest execution choice is the implemented browser Web Worker / local CLI; production Worker profiling is still required before expanding server-side execution.

## Verification and files for this milestone

All **81 tests passed** (43 Node, 38 Python), plus TypeScript checking and Wrangler bundle dry-run. Tests cover deterministic results, exact allocation, discrete TD caps, actual yardage bonuses, QB/catcher and opposing-game correlation directions, DST opposition, conditional competing volume, game script, legal/capped lineups, all five stack forms, OUT/limited/zero-share/multiplier scenarios, baseline immutability, percentiles, held-out validation guards, authenticated bounded API requests, and atomic immutable storage. Local SQLite summary persistence was also exercised by the CLI.

Browser checks verified 329 displayed player rows, an OUT scenario comparison, the zero-score histogram, a legal manually selected $50,000 lineup and its joint distribution, and no page overflow at a 390px viewport. The histogram and cream lineup cards retain the site's dark navy/lime visual language.

Added:

- `public/simulation/{config,random,statistics,engine,optimizer,persistence,worker,lab}.js`
- `public/simulation/{contracts,engine,persistence}.d.ts`
- `public/simulation/{index.html,lab.css,slates.json,slates/151307.json}`
- `scripts/{build_simulation_input,simulate_dfs,validate_dfs_simulation,benchmark_dfs_simulation}.mjs`
- `src/simulation/routes.ts`
- `migrations/0008_dfs_simulations.sql`
- `tests/simulation.test.mjs`
- `docs/{simulation-lab.md,simulation-benchmarks.json}`

Updated `src/index.ts` for isolated routing; `scripts/dfs-js/optimizer.mjs` now reexports the shared solver without changing the existing lineup interface; `public/preview/index.html` and `public/lineups/index.html` add navigation; `tests/dfs.test.mjs` exercises new routes; `package.json`, `.gitignore` and `docs/data-sources.md` add tooling/research documentation. The repository was untracked before this work, so this explicit manifest identifies milestone changes rather than presenting the whole repository as a new diff.

Published application version: `39d90cde-5c17-4c83-ad43-c39c69aa6328`, model `nfl-dk-mc-foundation-v1.1`. The live `/simulation/` page completed a 1,000-draw run with 329 player rows. Public health and slate-catalog checks passed. The saved-stack endpoint correctly reports that production migration 0008 is pending. Production D1 was not modified. System Python's public smoke check encountered a local CA-store error; the same read-only checks succeeded with the system curl TLS trust store, without disabling certificate verification.
