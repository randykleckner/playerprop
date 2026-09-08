# Simulation methodology audit

Audited September 7, 2026 Central (September 8 UTC). Existing model: `nfl-dk-mc-foundation-v1.1`. This audit does not change the simulation methodology or publish new model inputs. See [data readiness](data-readiness.md) for refresh defects identified before feature work.

## Complete path

1. `scripts/diagnose_dk_salaries.py` selects public NFL multi-game Classic draft group metadata and archives normalized salaries. `scripts/dfs/draftkings.py` isolates lobby/draftable parsing. CSV fallback uses the same provider contract. Duplicate position/FLEX variants are combined before research-pool selection.
2. `scripts/diagnose_dfs_projections.py` / `scripts/dfs/espn.py` collect public ESPN weekly projected statistics, join ESPN IDs to the GSIS catalog, and calculate the disclosed `draftkings-expected-v1-estimate` points. The separate multi-provider consensus helper exists, but only ESPN currently supplies player projection statistics.
3. `scripts/dfs-js/pool.mjs` checks NFL Classic metadata, source age, season/week, scheduled team pair and kickoff, availability, salary completeness, identities and matching projections. Provisional name/team/position matches require explicit opt-in. `build_simulation_input.mjs` maps ESPN stat IDs to attempts, targets, carries, efficiency and touchdown allocation weights.
4. `scripts/prepare_dfs_research.py` enriches with exact-game ESPN-reported sportsbook totals/spreads, crosswalk corroboration and prior-season NFLverse/PFR snap context. Home implied points are `(total - home spread)/2`; away implied points are `(total + home spread)/2`. The current audit has DraftKings quotes for all 12 games.
5. Browser `public/simulation/lab.js` fetches a saved slate JSON and sends it to `worker.js`. Browser worker, local CLI and bounded server API call the same `engine.js`.
6. The engine generates football statistics, scores each draw, stores temporary Float32 score arrays, summarizes player/stack/lineup outcomes, and returns those summaries to the UI. The UI provides sort/filter controls, distributions, scenarios, candidate selection and a legal salary-capped roster.

## Sources and their actual roles

- **ESPN player projections:** the only active player projection source. `statistical_projection` is currently misleadingly named: it contains the ESPN-converted value, not a separate NFLverse forecast. `final_projection` is the same source value. `market_projection` is null.
- **Sportsbook game inputs:** captured ESPN scoreboard DraftKings game totals and signed spreads inform scoring environment and script. There are no player-prop or anytime-TD prices in this simulation input. SportsGameOdds feeds the separate prop board; it is not yet blended into this research snapshot.
- **NFLverse:** canonical player catalog and prior-season snaps support identity/context. Historical snap share is displayed, not used to override current projected workload. Existing D1 stats, availability and coach history do not currently feed independent simulation player projections. No current injury feed is connected to simulation beyond salary-provider status filtering.
- **Schedule:** exact current regular-season ESPN team/kickoff matching. Legacy D1 schedule defects are not repaired by this static input workflow.

## Randomness, variance and correlations

`random.js` hashes the seed and uses a deterministic 32-bit uniform generator. Standard normals use Box–Muller; Poisson uses multiplicative sampling; binomial uses Bernoulli trials; multinomial allocation uses sequential binomial draws with a fixed total. Lognormal multipliers have unit expectation before clipping (`exp(sigma*Z - sigma²/2)`).

Each game has its own `${seed}|${game_id}` stream. Players and games are sorted deterministically. Both teams share lognormal environment (sigma .18) and pace (.10). Each team has an efficiency multiplier (.13) multiplied by the shared environment. Player efficiency varies with sigma .20; receiving yardage adds normal noise with SD `7*sqrt(receptions)`, rushing with `3*sqrt(carries)`. Yards are rounded and truncated at zero. These are configurable uncalibrated defaults, not fitted positional variances. Input floor/median/ceiling/stddev are not fitted variance estimates.

Home script is `-home_spread + 7*Z`, with the opposite sign for the away team. Leads lower pass rate by .007 per point and increase modeled plays by .12 per point. Plays scale with shared pace and `(game total/44)^.12`, bounded 30–105. This is a one-game aggregate model, not drive/play sequencing or a live score process. Games have independent streams; there is no slate-wide weather or league factor.

## Opportunity, touchdown and scoring mechanics

Team projected attempts and carries determine baseline volume (bounded 40–85 plays) and pass rate. Simulated pass attempts are binomial; carries equal remaining modeled plays. Targeted passes are 95% of pass attempts by default. Multinomial allocations divide fixed target and carry totals among active players and residual unmodeled players. Fixed share overrides reserve their mass; an OUT/limited player changes the allocation. Residual recipients retain unmodeled opportunities instead of inflating named players to 100% coverage.

Receptions are binomial given targets, player catch rate and projected QB completion context. Passing efficiency anchors receiving efficiency with a bounded .7–1.3 adjustment. Receiving yards across all recipients, including the residual, are allocated to QBs; total passing and receiving yards reconcile. When multiple QBs are present their yards/TDs are allocated by simulated attempts; this does not model exact passer-to-receiver play identities.

Team TD expectation is `max(.1, (implied points - 3*1.5)/7)` times shared environment and a team multiplier. TD count is Poisson, then discrete events are designated passing/rushing using projected TD mix and script. Each event is allocated to an existing reception/carry with remaining capacity, weighted by projected TD rate. If no capacity remains that event is not assigned. Passing TDs reconcile to receiving TDs including residuals. No fractional TD fantasy points are sampled.

Interceptions use a binomial model on incomplete attempts; field goals are Poisson. Offensive fumbles use projected per-opportunity rates. DST uses opposing simulated points, shared interceptions, approximate sacks and independent recoveries. Those recoveries do not reconcile with offensive lost fumbles. Return TDs, safeties, blocked kicks and two-point conversions are omitted; no full scoring completeness claim is made.

Implemented offensive DK score: .04 passing yards + 4 passing TDs - interceptions + .1 rushing/receiving yards + 6 rushing/receiving TDs + receptions - lost fumbles. Each draw adds +3 at ≥300 passing yards, ≥100 rushing yards, and ≥100 receiving yards. DST scoring includes sacks, interceptions, recoveries and points-allowed tiers. Bonuses use the simulated yardage, not expected-bonus values pasted onto simulated points.

## Summaries and candidate lineups

Mean, population standard deviation and interpolated quantiles come from actual score draws. P90/P95 are upper quantiles, not win probabilities. Value probabilities are the share of draws strictly exceeding 2×/3×/4× salary per $1,000. Histograms have 20 bins.

Stacks combine same-iteration scores for QB+WR, QB+TE, QB+two WR, QB+WR+TE and QB+catcher+opponent. Up to 120 are summarized. Shared yards/TDs and game factors induce QB/catcher correlation; competition for fixed opportunity can induce negative teammate covariance.

Candidate search maximizes additive median, P25, P95, value, or mean with a required stack. It uses salary-grid optimization and forces distinct alternatives by exclusions. A sum of player P95s is a candidate-selection objective, not a lineup P95; the displayed lineup P95 is calculated from joint draws. These bounded candidates do not establish the globally optimal lineup percentile. Manual lineups use the same joint draws and validate nine unique entities, Classic slots/FLEX, two teams minimum, and salary ≤$50,000.

Browser modes: 1,000 / 10,000 / 50,000 draws. CLI allows configured counts up to 200,000. Authenticated Worker diagnostics default to 10 and cap at 100, avoiding large request-worker CPU/memory use. Temporary draws are discarded after summaries unless explicitly retained locally. D1 summary migration 0008 remains unapplied remotely.

## Explicit audit answers

| Question | Answer |
| --- | --- |
| Are players independent? | No within a game; opportunities and game/team factors couple them. Separate games use independent streams. |
| Are game/team outcomes correlated? | Yes, via shared environment/pace and opposite script. |
| Are QB/pass catchers correlated? | Yes, via reconciled passing/receiving yards, shared TD totals and conditions. |
| Are targets/carries internally consistent? | Yes including residual recipients: targets ≤ attempts and carries = rush attempts. |
| Are TDs discrete? | Yes, integer events constrained by receptions/carries. |
| Are bonuses based on simulated yards? | Yes, separately in every draw. |
| Same seed reproducible? | Yes with identical input, configuration, count and overrides; seed alone does not identify a run. |
| Are displayed summaries draw-derived? | Yes for player/stack/lineup outputs. The separate projection column remains the input estimate. |

## Real current-slate verification

Fresh salaries: `2026-09-08T02:09:48.400Z`; ESPN projections: `2026-09-08T02:09:44.484Z`; scoreboard capture: `2026-09-08T02:10:00.972228Z` (September 7, about 9:10 PM Central). Draft group 151307, September 13, 12 games, 329 eligible players. Baseline: 10,000 draws, seed `drlocks-v1`, run `sim-1c5a807507462cda8986c5abdd118770`, about 5.42 seconds and 174 MiB peak RSS locally.

`npm test`: 50 Node + 43 Python tests passed; `npm run check` passed. `scripts/audit_dfs_simulation.mjs INPUT BASELINE` independently checks per-draw conservation, TD integrality/capacity, repeat-run equality, player summaries and joint lineup summaries. Float32 lineup accumulation is compared with a 0.0001-point tolerance against independently summed double-precision draws. This rounding tolerance does not affect displayed one-decimal metrics.

The results validate implementation consistency, not predictive accuracy. Identity joins remain provisional; variance, TD rates, residual roles and DST require calibration. No ownership, simulated field, contest finish, win, payout EV or portfolio model exists.
