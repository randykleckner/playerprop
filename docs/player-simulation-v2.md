# V2.0-C — Personnel-Aware Plays + Fantasy Player Outcomes

This release keeps V1 DFS, the V2 foundation and legacy empirical engine, and adds **V2 Base** and **V2 Personnel**. Base records offensive player outcomes while retaining the previous empirical engine's exact play RNG sequence. Personnel is a separate, configurable experiment. Neither new variant optimizes lineups or predicts contest performance.

## Architecture and control

- `engine.ts`: existing clock/drive/state transition implementation, with optional play resolver and post-play observer hooks. Ordinary callers use the original resolver. Resolved scramble plays count as rushes, not pass attempts.
- `player-types.ts`: canonical player inputs, shares, pressure evidence, box scores and configuration types.
- `personnel-influence.ts`: centralized validation and bounded probability/distribution interventions.
- `player-engine.ts`: separate opportunity RNG, attribution, shared DraftKings scoring and run provenance.
- `player-bulk.ts`: bounded in-memory aggregation, pure run/player lookup and matched-engine comparison.
- `build_v2_players.py`: offline NFLverse opportunity/pressure evidence, current roster/depth, current ESPN projection priors and matched DK salary snapshots. Existing persisted Madden identity joins are reused.
- `browser-worker.ts`: the same typed engines run in a Dedicated Worker; no server simulation or D1 writes.
- `player-views.js`: expandable team/position player distributions, first-game box scores, personnel explanation and Base/Personnel comparison.

The original `resolvePlay` still generates each baseline outcome. Player allocation and personnel interventions use separate seeded streams. At zero influence, all modifiers are zero; tagging pressure/runner/target metadata consumes no baseline RNG draws and changes no game outcomes. Tests compare complete team totals, drives, clock and final state across 50 seeds with the pre-existing empirical engine. Another test verifies Base versus Personnel-at-zero produces identical aggregate football and DK distributions.

Each new result identifies model/engine, seed, full influence configuration, empirical profile/version, player snapshot, Madden snapshot and roster snapshot. The original foundation and legacy empirical choices explicitly report zero influence and null unused personnel provenance. V1 implementation files are unchanged.

## Player opportunity evidence

Historical PBP comes from the same configured eligible seasons as the live profile, currently 2024/2025; no current 2026 observations or future/same-day rows are invented. Only eligible regulation RUN/PASS plays enter the opportunity builder. NFLverse canonical IDs and current `ACT` roster membership are required. The published rank-one base-offense depth chart selects exactly one expected QB per team; if QB evidence is missing/ambiguous the player engine rejects that matchup, leaving legacy V2 available. Backups are not assigned QB work without evidence.

The pool contains current QB/RB/WR/TE players, treating FB as RB. Madden ratings never determine volume. Current research-source inactive flags exclude those entries. `ACT` and depth rank do not establish game-day health; no automatic Newsroom substitutions or injury adjustments occur.

For each player, carry/target shares are observed within games where that player had a recorded opportunity. These are **opportunity-bearing game samples**, not proof of all active games. This avoids fabricating inactive-game zeros, but may bias usage upward when active zero-opportunity games are missing. Routes and snaps remain null where existing evidence is absent.

Weights combine configured season recency with an eight-week within-season half-life, relative to the latest observed week in that season. Prior-team samples are multiplied by 0.35; coach/system changes are not yet explicitly modeled. Each observed share is stabilized toward the available current ESPN projected-opportunity prior using `weighted_games / (weighted_games + 5)`. Where no projection exists, explicit position/depth priors replace it; those cases are flagged, not called empirical projections. Position/depth priors are in `config/v2-opportunity.json` (starter weight 3, reserve weight 1). A rookie can therefore receive a role-based opportunity prior without Madden ability being mistaken for workload.

Red-zone (inside the 20) and goal-line (inside the five) shares are separately observed and shrunk toward normal shares over a 20-weighted-game prior. They are normalized within the active current pool for the relevant play context. Last-five observed-week shares are retained as diagnostics. No new route participation or snap measurements are claimed.

Carry and target weights always sum to one across eligible recipients. Each actual rush selects **one** runner; each targeted pass selects **one** receiver. Low-share canonical players remain in the underlying pool and appear under other contributors, so residual opportunities and TDs still belong to actual players. Reserves with fewer than two weighted usage games, no meaningful projection and no starter role share a capped residual pool (3% of carries, 4% of targets). They remain actual canonical recipients, with explicit sparse-role flags. The UI highlights non-residual starters, QBs, carry shares at least 4% or target shares at least 2.5%; it does not simulate independent target/carry totals for each player.

### QB rushing and pressure

The legacy empirical RUN distribution already includes QB scrambles. To preserve the control, Base allocates QB carries from historical/projected shares and labels a QB carry as scramble versus designed using its historical scramble fraction. This is an attribution approximation: a Base scramble label does not retroactively turn the original RUN call into a PASS decision.

Personnel can additionally convert an affected pressured dropback into a real scramble outcome; that records a QB rush, consumes a play, can score a rushing TD and does not count as a pass attempt. QB-specific scramble efficiency and pressured passing attributes are retained for future work, not fitted here.

NFLverse `sack OR qb_hit OR qb_scramble` supplies an observed **pressure proxy**, not complete charted pressure. Team pressure frequencies/conditional outcomes shrink toward league frequencies over 200 weighted dropbacks. In the control, sacks imply pressure; nonsacks receive posterior proxy tags so the proxy marginal matches the baseline. A bounded personnel change can add or remove pressure for a small subset of plays. Only changed pressure states are re-resolved through sack, scramble, untargeted incompletion or pass attempt branches. The untargeted-incompletion branch uses pressured incompletions as an approximation; it does not claim that every such observed NFL incompletion was a throwaway. Interceptions and residual attempts continue to use the empirical team baseline.

## Bounded Madden interventions

`config/v2-personnel.json` contains every personnel coefficient and preset. Presets: zero 0, low 0.5, standard 1, high 1.5. **Low** is initially selected in the UI; Base always forces zero. These are unfitted research assumptions, not optimized against BUF/HOU or future outcomes.

| Channel | Modifier at influence L | Hard limit |
|---|---|---|
| Pressure | `-(pass protection − pass rush) × 0.002 × L` | ±0.06 probability; modified pressure clipped to [0.08, 0.60] |
| Completion | `(receiving − secondary) × 0.0015 × L` | ±0.04 probability; modified completion clipped to [0.15, 0.90] |
| Rush shape | `(run blocking − run front) × 0.012 × L` | ±0.20 tilt |
| Completion shape | `(receiving − secondary) × 0.008 × L` | ±0.20 tilt |

At exact zero, even baseline rates outside these intervention bounds are left untouched to preserve the control. Schema validation rejects nonfinite values, invalid probabilities, negative weights and influence outside [0,1.5]. Additional hard safety limits prevent configuration from expanding pressure beyond ±0.15, completion beyond ±0.10 or shape tilt beyond ±0.40 without an intentional code change.

Blocking/front/secondary composites reuse the exact [V2.0-B unit formulas](personnel-ratings.md). Incomplete units disable their channel. Receiving uses target-share-weighted player composites of release, short/medium/deep route running and catching (weight 1 each), speed/acceleration/catch-in-traffic (weight 0.5 each). At least 90% of target share must have corroborated ratings, and the opposing secondary must be complete. Otherwise receiving adjustments are disabled. When small receiving gaps remain, the difference is attenuated by observed share and coverage is explicitly reported; missing players are not assigned invented Madden values.

Rush histogram weights become `original_count × (1 + tilt × category_score)`, with category scores loss/stuff −1, short gain (<4 yards) −0.5, successful gain +0.25, first-down gain +0.6, explosive (15+ yards) +1. Priority is loss, explosive, first down, short, other. Completion histograms give 20+ yard outcomes score +1 and other outcomes 0. A rejection/conditional redraw method preserves the empirical support and achieves the tilted distribution without adding fixed yards to every play. Remaining field distance still caps actual recorded yardage.

Pressure and completion interventions are coupled to baseline outcomes: unchanged plays stay unchanged. These channels are simplified, bounded experiments; video-game attributes are never interpreted as literal probabilities or fantasy-point bonuses.

## Statistics, TDs and DraftKings

Every player stat comes from a resolved play. A passing TD credits the QB and exactly one receiver; a rushing TD credits only its runner. Sacks do not create attempts/targets. Untargeted pressure incompletions create an attempt but no target. All other modeled attempts have one target, including interceptions and ordinary incompletions. Rush carries/yards, pass yards, receptions, attempts, sacks, turnovers and TD ownership reconcile exactly to team totals.

The unchanged centralized `public/simulation/engine.js` `dkScore` computes .04/pass yard, 4/pass TD, −1/INT, .1/rush or receiving yard, 6/rush or receiving TD, 1/reception, −1/fumble lost, plus actual 300-pass/100-rush/100-receiving yard bonuses. Only existing rushing fumble events are modeled; receiving/sack fumbles, laterals, two-point plays, special-team TDs, penalties and overtime are outside this version.

Bulk output supplies mean, median, P10/P25/P75/P90/P95 for football stats and DK points, discrete 1+/2+ rushing-or-receiving TD probabilities, separate QB passing-TD probabilities, yardage-bonus probabilities, and 2×/3×/4× salary probabilities when a matched snapshot salary exists. Threshold probabilities use **at least** the threshold; percentile values come directly from game draws. No ceiling/floor multiplier is used. Salary timestamps are shown; archived salaries do not become current prices merely because a simulation is rerun.

## UI, data interface and storage

Drive Lab retains the original page layout and adds:

- V2 Base, V2 Personnel and paired comparison choices, plus the original foundation/legacy engines.
- Influence presets, shared matchup/count/seed, existing progress and cancellation.
- Team/position fantasy player rows with expandable distributions and source limitations.
- First-game player box scores and named play recipients when trace is selected.
- Team and player deltas for a matched Base/Personnel comparison, including passing/rushing/receiving yards and DK mean/P90.
- Explicit personnel channel changes and source snapshot metadata.

`playerOutcome(run, canonicalId)` is the pure future drill-down interface: it returns opportunity/stat/DK distributions, provenance, matchup and personnel context. A new public endpoint or separate Player Lab page is unnecessary for this browser-only milestone.

Runs are ephemeral in the browser. Typed arrays hold bounded numeric draws for quantiles; completed game objects are discarded except the requested first-game example. There are no per-play D1 rows or remote schema changes. The benchmark intentionally saves one research example and aggregate receipts locally, with no bulk play traces. Do not enable general play persistence.

## Rebuild and validation

```sh
npm run v2:players:build
npm run drive-lab:build
npm run v2:benchmark:players
npm test
npm run check
```

Refresh the existing roster/personnel and public research snapshots first when needed, then rebuild player inputs against those exact snapshots. No EA fetch occurs during games or page visits. Current refresh remains independent of this experimental engine.

## Known limits and smallest V2.0-D

Current Madden snapshots cannot support an honest historical personnel backtest by being attached to old games. Usage evidence is sparse for rookies, changed teams and zero-opportunity active games. Depth status is not a health model. Pressure is a public-data proxy; Base scramble attribution and personnel pressure branches are simplified. Receiver matchups are unit-level, with no shadow-corner or route-concept claims. All players still draw from team/league rushing and completion-yard distributions rather than individualized efficiency distributions. Underlying V2 scoring bias remains; this milestone does not establish calibrated forecasts or tournament value.

The smallest V2.0-D is **frozen pregame player forecast evaluation**: freeze both engines/configurations before kickoff, ingest final actuals afterward, measure opportunity/yard/TD/DK bias and interval coverage by position, and diagnose drive-finishing bias. Keep an untouched evaluation cohort before changing coefficients. No V2 lineup optimization, Dr Locks Score replacement, ownership, field simulation, win probability or tournament EV is included. Stop after V2.0-C review.

## Recorded release example and benchmark

BUF at HOU, seed `v2-c-review`, low influence (0.5), 10,000 games per engine. The full machine-readable receipt is [simulation-v2-c-benchmark.json](simulation-v2-c-benchmark.json). These are experimental outputs, not calibrated predictions.

| Engine | Games | Seconds | Games/sec | Numeric draw storage | Process RSS after run |
|---|---:|---:|---:|---:|---:|
| base | 1,000 | 0.44 | 2,258 | 3.70 MB | 104.7 MB |
| personnel | 1,000 | 0.44 | 2,252 | 3.70 MB | 123.6 MB |
| base | 10,000 | 3.92 | 2,551 | 37.04 MB | 176.9 MB |
| personnel | 10,000 | 3.97 | 2,517 | 37.04 MB | 247.7 MB |

27 canonical players are tracked for this matchup. RSS includes Node, retained comparison summaries and garbage-collection effects; it is not an isolated engine peak. Numeric draw storage is bounded at 37.04 MB for 10,000 games in this matchup. No bulk play trace is retained.

### Same-input team comparison

| Team / metric | Base | Personnel | Delta |
|---|---:|---:|---:|
| BUF points | 18.25 | 18.08 | -0.17 |
| BUF offensivePlays | 58.95 | 58.93 | -0.02 |
| BUF passAttempts | 28.90 | 28.81 | -0.09 |
| BUF rushingAttempts | 28.26 | 28.30 | +0.04 |
| BUF sacks | 1.79 | 1.82 | +0.03 |
| BUF passingYards | 197.78 | 194.65 | -3.12 |
| BUF rushingYards | 123.34 | 124.78 | +1.43 |
| HOU points | 17.04 | 17.07 | +0.03 |
| HOU offensivePlays | 56.78 | 56.82 | +0.05 |
| HOU passAttempts | 31.33 | 31.30 | -0.03 |
| HOU rushingAttempts | 23.30 | 23.36 | +0.06 |
| HOU sacks | 2.15 | 2.16 | +0.02 |
| HOU passingYards | 202.60 | 202.72 | +0.12 |
| HOU rushingYards | 102.20 | 102.14 | -0.05 |

### Selected 10,000-game player outcomes

TD probability below means rushing or receiving TD; passing TD probability is separate.

| Player | Mean targets / carries | Mean pass / rush / rec yards | 1+ rush/rec TD | 1+ pass TD | DK mean | DK median | P90 | P95 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Nico Collins | 7.27 / 0.08 | 0.0 / 0.3 / 46.7 | 23.7% | 0.0% | 10.98 | 9.80 | 19.90 | 23.60 |
| C.J. Stroud | 0.00 / 2.24 | 202.7 / 9.8 / 0.0 | 7.8% | 69.4% | 13.51 | 12.80 | 21.40 | 24.26 |
| Woody Marks | 2.08 / 9.85 | 0.0 / 43.3 / 13.7 | 32.9% | 0.0% | 9.38 | 8.10 | 17.30 | 20.70 |
| Josh Allen | 0.00 / 5.83 | 194.7 / 25.8 / 0.0 | 19.3% | 69.7% | 15.49 | 14.82 | 24.06 | 27.06 |
| James Cook | 1.92 / 14.76 | 0.0 / 65.1 / 13.0 | 40.9% | 0.0% | 12.42 | 11.10 | 22.00 | 25.80 |
| Dalton Kincaid | 3.70 / 0.00 | 0.0 / 0.0 / 25.0 | 11.7% | 0.0% | 5.66 | 4.70 | 11.70 | 14.40 |

| Player | DK mean Base → Personnel | DK P90 Base → Personnel |
|---|---:|---:|
| Nico Collins | 10.96 → 10.98 | 19.90 → 19.90 |
| C.J. Stroud | 13.52 → 13.51 | 21.48 → 21.40 |
| Woody Marks | 9.31 → 9.38 | 17.20 → 17.30 |
| Josh Allen | 15.66 → 15.49 | 24.44 → 24.06 |
| James Cook | 12.41 → 12.42 | 22.00 → 22.00 |
| Dalton Kincaid | 5.75 → 5.66 | 11.80 → 11.70 |

### First personnel game

Final score: **BUF 21 — HOU 17**. This is only the first seeded game.

| Team | Pass C/A | Pass yards | Rush attempts / yards | TD | Sacks taken | Turnovers |
|---|---:|---:|---:|---:|---:|---:|
| HOU | 20/34 | 174 | 26 / 118 | 2 | 1 | 1 |
| BUF | 13/17 | 157 | 31 / 113 | 3 | 2 | 0 |

| Player | Pass C/A, YD, TD, INT | Rush ATT, YD, TD | REC/TGT, YD, TD | DK |
|---|---:|---:|---:|---:|
| HOU Dalton Schultz | 0/0, 0, 0, 0 | 0, 0, 0 | 6/10, 52, 0 | 11.20 |
| HOU David Montgomery | 0/0, 0, 0, 0 | 9, 45, 0 | 0/0, 0, 0 | 4.50 |
| HOU Nico Collins | 0/0, 0, 0, 0 | 0, 0, 0 | 2/6, 4, 0 | 2.40 |
| HOU Brevin Jordan | 0/0, 0, 0, 0 | 0, 0, 0 | 1/1, 4, 0 | 1.40 |
| HOU Kayshon Boutte | 0/0, 0, 0, 0 | 0, 0, 0 | 2/2, 17, 0 | 3.70 |
| HOU Xavier Hutchinson | 0/0, 0, 0, 0 | 0, 0, 0 | 5/6, 39, 0 | 8.90 |
| HOU C.J. Stroud | 20/34, 174, 1, 1 | 2, 4, 0 | 0/0, 0, 0 | 10.36 |
| HOU Cade Stover | 0/0, 0, 0, 0 | 0, 0, 0 | 1/3, 22, 0 | 3.20 |
| HOU Jaylin Noel | 0/0, 0, 0, 0 | 0, 0, 0 | 2/4, 4, 1 | 8.40 |
| HOU Woody Marks | 0/0, 0, 0, 0 | 15, 69, 1 | 1/1, 32, 0 | 17.10 |
| HOU Marlin Klein | 0/0, 0, 0, 0 | 0, 0, 0 | 0/1, 0, 0 | 0.00 |
| BUF DJ Moore | 0/0, 0, 0, 0 | 1, 11, 0 | 3/5, 19, 0 | 6.00 |
| BUF Josh Allen | 13/17, 157, 3, 0 | 9, 31, 0 | 0/0, 0, 0 | 21.38 |
| BUF Ty Johnson | 0/0, 0, 0, 0 | 1, -1, 0 | 1/2, 15, 0 | 2.40 |
| BUF James Cook | 0/0, 0, 0, 0 | 14, 47, 0 | 2/2, 39, 2 | 22.60 |
| BUF Khalil Shakir | 0/0, 0, 0, 0 | 1, 2, 0 | 1/1, 9, 0 | 2.10 |
| BUF Dalton Kincaid | 0/0, 0, 0, 0 | 0, 0, 0 | 3/3, 6, 0 | 3.60 |
| BUF Ray Davis | 0/0, 0, 0, 0 | 4, 19, 0 | 1/1, 11, 0 | 4.00 |
| BUF Keon Coleman | 0/0, 0, 0, 0 | 1, 4, 0 | 1/1, 45, 1 | 11.90 |
| BUF Jackson Hawes | 0/0, 0, 0, 0 | 0, 0, 0 | 0/1, 0, 0 | 0.00 |
| BUF Skyler Bell | 0/0, 0, 0, 0 | 0, 0, 0 | 1/1, 13, 0 | 2.30 |

Validation: **183 tests passed (100 Node, 83 Python), 21 new**, plus strict TypeScript. Coverage includes control equivalence, deterministic traces, stat/TD conservation across engines, individual QB/RB/WR/TE attribution, DK bonuses, bounded personnel channels, empirical shape frequencies, pressure-proxy interventions, current-roster/usage priors, residual caps, snapshot mismatch rejection, aggregate quantiles, comparison constraints and the player lookup/UI output.

Browser verification ran 10,000 games per engine in paired comparison, rendered player distributions and the first-game box score, and expanded Josh Allen’s football/DK distributions. Personnel-only browser runtime was 3.32 seconds in that check; Node benchmark timings above are from the fixed release receipt.

Release: Cloudflare version `c903230d-ca04-4c0b-b943-23e2bec44b5e`, on the existing domains. All 13 available matchups completed under both player engines (26 release checks). Paired-run cancellation was verified. No production D1 migration, new Cron trigger, authenticated provider action or V1 replacement occurred.

## V2.0-D — expected-active personnel

Drive Lab now supports current availability, depth-driven replacements, historical snap-informed rotations, weighted Madden evidence, conserved opportunity redistribution and ephemeral ACTIVE/LIMITED/OUT controls. V1 and legacy V2 controls are preserved; V2 Base uses the same availability scenario with zero Madden influence. See [availability and workload](availability-and-workload.md) for sources, unfitted participation priors, all 32 team audit results, remaining gaps and the 10,000-game scenario receipt. This supersedes first-string-only/complete-evidence limitations in historical sections above.
