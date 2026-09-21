# Research workspace and Simulation Station

Implementation receipt — September 21, 2026. Public deployment verification is recorded below after release.

Research is a connected vanilla-JS workspace at `/research/`. Canonical identity review remains at `/research/readiness/`; calibration remains at `/research/calibration/`. Existing links from readiness summaries now point to the identity review page.

## Repository inspection and reuse

- Season Leaders: `public/lineups/season-leaders.js` and its published NFLverse JSON, `scripts/refresh_season_leaders.py`. The component now mounts in Research; its JSON URL stays backward compatible for Command Center.
- Recommendations: `public/lineups/index.html`, `lineups.js`, archived immutable research bundles and `public/lineups/archive.json`. Projection leaders and generated recommendations remain in place.
- Player statistics: NFLverse weekly player CSV and D1 `player_game_stats`/`games`; existing `/api/defense/position-splits` and player game-log endpoints. Research uses the current-season weekly snapshot rather than silently querying historical D1 seasons.
- Identity/salaries: canonical player IDs already present in simulation inputs; historical immutable simulation bundles supply salary observations. No name-based joins are introduced.
- Simulation: `public/simulation/engine.js`, `statistics.js`, supported `applyOverrides`, shared game draws and scoring; no new Monte Carlo model.
- Coaching: `public/drive-lab/live-empirical.json` team profiles, not a verified named-coach feed.
- Weather: independently refreshed `public/drive-lab/upcoming.json`, joined by teams AND season/week.
- News: canonical player IDs in `public/newsroom/latest.json`; report timestamps and return estimates preserved.
- Builder: `public/builder/page.js`, shared salary/eligibility validation and `addPlayer` roster logic. The handoff preserves the current draft and rejects invalid additions.
- Worker: existing static asset handler serves the new modules. Existing D1 migrations remain unchanged, including salary snapshots, simulation receipts and player-game context.

## Phase receipt

| Phase | Result | Implementation and limitations |
|---|---|---|
| 1 Navigation / Season Leaders / tables | LIVE data, implemented | Research nav; leaders moved after local browser verification; readiness preserved. `table.js` supplies null-last sorting, pagination, session column validation. |
| 2 Player research | LIVE data, implemented; advanced fields PARTIAL | Canonical salary/projection joins; search, position/team/opponent, salary/projection thresholds, current slate, Last 1/3/5 calendar weeks, season/custom weeks, seven presets and individual columns. Current salary and forecast are distinct from historical totals. Missing routes/snaps/red-zone/ownership stay unavailable. |
| 3 DST | PARTIAL | Current-season offensive performance against each defense, Overall/QB/RB/WR/TE, season/Last 3/Last 5, per-game denominators, yards/carry and distinct game sample sizes. No opponent adjustment, individual coverage, missed tackles, EPA, explosive-play or injury-adjusted defense claims. Clicking a defense selects opposing current-slate players. |
| 4 Play callers | PARTIAL | Sortable historical stabilized team pass/rush, completion/sack rates and efficiency; selecting team filters its players. Coach identities, recent/script-specific rates, motion/play action and personnel grouping are NOT AVAILABLE. Training seasons and profile timestamp are visible. |
| 5 Derived metrics | PARTIAL | Archived salary history and exact prior-week change; actual-minus-expected production gap; mean/median/P25/P75/P90 and breakout from existing MC. Expected FP is retrospective position-cohort usage estimation, not a validated pregame opportunity model. |
| 6 Values / Find Value | PARTIAL | Featured top four plus sortable table and supported salary/projection/targets/breakout filters. Central score weights and per-player contributions visible. No invented matchup, injury shock, weather, trend or ownership components. |
| 7 Detail/context | PARTIAL | Player selection carries across tabs; automatically joins positional defense, team tendencies, same-week game/weather, player news, historical usage, salary observations and model outputs. No automated injury opportunity estimates. |
| 8 Simulation Station | Integrated, model PARTIAL | Same workspace; selected player; baseline/scenario same seed and 1,000 draws; carry multiplier, workload, OUT, target-share change, team pass rate, game total. Comparison player and same-game joint threshold rate. Weather/routes/red-zone scenario controls NOT AVAILABLE; unavailable controls are not simulated. |
| 9 Natural-language architecture | PARTIAL | Restricted deterministic grammar for position, salary, minimum targets and points threshold. Interpretation is visible; unsupported clauses explicitly reported, never fabricated. It applies supported filters only; user selects player and runs simulation. No LLM/API dependency. |
| 10 Builder connection | Implemented; scenario-projection transfer NOT AVAILABLE | Add/Lock via current-slate canonical ID, existing eligibility/$50k validation, preserve current roster. Session My Research marks Value/Core. Builder still uses published baseline projections, explicitly stated; scenario scores are not silently substituted. |

No mocked metrics or placeholder numeric values were added. `PARTIAL` means a real subset works; it does not mean the entire requested roadmap is complete.

## New files and modified files

New: `public/research/{features,table,columns,context,value-model,query,simulation-worker,workspace}.js`, `workspace.css`, `readiness/index.html`, `tests/research-workspace.test.mjs`, `tests/test_research_weekly.py`, this document.

Modified: Research index/readiness links; global shell navigation; Lineups index and reused Season Leaders component; Command Center leaders link; Builder handoff; `scripts/refresh_season_leaders.py` and its generated JSON; technical blueprint.

**Database migrations: none. API routes: none.** The existing published stats JSON gains additive `weekly_records`. No new ingestion source or scheduled job. Existing refresh cadence automatically writes weekly records on successful NFLverse refresh and retains the last valid file on failure.

## Metric definitions and approximations

- Historical rows are actual recorded appearances, not invented zero-production records for inactive/missing players. Last 3 means last three calendar weeks, not last three active games. Sample counts show recorded appearances. Comparable-role segmentation is not yet implemented.
- Offensive DraftKings scoring includes yardage bonuses, interceptions and lost passing/rushing/receiving fumbles. Return/defensive touchdowns and two-point conversions are omitted; it is explicitly labeled offensive scoring and is not a full contest settlement total. Missing required fields propagate null. Kickers/defenders are not assigned offensive DK scores.
- Expected offensive FP uses the selected-window position cohort's points per pass attempt, carry and target, multiplied by the player's corresponding historical workload. At least ten distinct cohort players are required. This is a contemporaneous descriptive benchmark (includes the subject), not a pregame forecast or held-out fitted expected-points model. Actual and expected cover the same offensive scoring components. Production gap is actual minus expected; no automatic regression/rebound conclusion.
- Value Score v1 weights: efficiency 30%, projection 15%, P90 20%, breakout 20%, targets+carries 15%. Components are within-position empirical percentile ranks. Available configured weights are rescaled; coverage is shown. A 100% configured score still excludes future matchup/weather/injury/ownership inputs. Score is a heuristic, not a win probability. Inactive players are not featured.
- Breakout uses actual MC `probability_3x`: outcomes strictly greater than three times salary in thousands. `VALUE_CONFIG` records the v1 threshold assumption; changing threshold implementation must update outcome measurement and receipt together. Threshold learning by salary band is future work, not claimed calibrated. P90 is individual score ceiling, not a top-10% contest finish.
- Joint probability only covers players in the same game and the same user-selected threshold. It counts shared draws rather than multiplying marginals. TD event includes passing/rushing/receiving touchdowns and is not an anytime-scorer sportsbook market.
- Historical salaries are latest archived research observations for up to five prior weeks, not a complete DK salary history. Previous salary requires the exact preceding week; gaps remain unknown. The current salary belongs to the selected current slate.
- Source loads settle independently. Historical statistics remain usable if salary/projection refresh fails. Cross-season stats are not attached as current-season production. Market capture/report timestamps stay original; data-health alerts and stale salary/stats labels are shown.

## Validation

Fixture tests cover navigation/move, week windows/absences, exact IDs and game joins, filters, null-last sorting, column persistence, source failures/staleness, missing metrics, DST position/recency, team/weather joins, salary gaps, score components, query interpretation and MC OUT/breakout behavior. Python fixtures cover weekly normalization, current-week exclusion and duplicate rejection.

Browser checks: 303-player table, 72 RB filter and PTS/$1K ordering, featured MC values, selected Gibbs baseline versus OUT (29.3 mean to 0; breakout 56.9% to 0), and canonical builder handoff (one RB added/locked, $8,800 salary deducted). Test-added player was removed afterward.

Remaining engineering work: verified coaching and script views; validated opportunity model with active-role samples; salary-band threshold calibration; weather/injury redistribution controls with evidence; broader query grammar; scenario projection transfer into optimization; enhanced context-table column management. These are not represented as finished.

Final automated verification: **213 JavaScript + 119 Python = 332 tests passed**, plus `npm run check` and `git diff --check`. Additional browser checks verified RB defensive switching, team-tendency tab, Last 1 / Rushing preset, no captured console errors, and restoration of the test roster. User commit `729dd4a` captured the main implementation while the final refinements were still underway.
