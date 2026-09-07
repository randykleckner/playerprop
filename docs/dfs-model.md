# DFS model: implemented boundary and next baseline

## Status update — September 7, 2026

The milestone descriptions below record the earlier design. ESPN projection conversion, legal lineup generation, correlated Monte Carlo distributions, candidate optimization and the interactive salary-capped roster are now implemented. Read [Simulation Lab](simulation-lab.md) for exact scoring/model limitations and [research readiness](research-readiness.md) for source and calibration gates. The implemented search is bounded; no ownership, contest-field, top-10% or ROI model is claimed. The next operational milestone is player identity review, followed by final-outcome evaluation.

The intended objective is estimated P(top 10%) for DraftKings NFL Classic Main Slate, initially Single Entry. Expected ROI becomes another objective when contest payouts are known. There is no validated DFS model or demonstrated edge yet.

## Implemented foundation

`src/dfs/foundation.ts` configures the $50,000 cap, QB/RB/RB/WR/WR/WR/TE/FLEX/DST slots and FLEX eligibility for RB/WR/TE. It validates salary input, not a nine-player lineup. That salary module does not implement fantasy scoring, projections or optimization; the new local projection adapter is described below. Ingest responses/salary snapshots include import version (`dfs-salary-import-v1`), generated_at (completion) and data_as_of (capture); this is provenance for ingestion, not a trained model version.

Salary data and raw source rows are retained as complete snapshots. Player identities can remain unresolved; future projection/optimizer code must explicitly reject unresolved offensive-player joins or document a separately identified projection source. DST uses a team entity rather than fake player records. Historical reads are bounded by capture/completion and lock time.

## Milestone 3: transparent fantasy baseline (planned)

The first projection-provider increment is now implemented locally: public ESPN weekly stats, a disclosed DraftKings expected-points conversion, stable ESPN-to-GSIS mapping, immutable file snapshots, and a scoring/time-aware multi-source consensus function. Only ESPN is connected so far. See [weekly projections](weekly-projections.md) for evidence, commands and remaining quality gates. The optimizer, market features and learned model below remain planned.

1. Verify DraftKings' current Classic scoring and all lineup eligibility rules from official contest rules. Store scoring rates, bonuses and DST points-allowed tiers in configuration. Add passing interceptions thrown, fumbles lost, two-point conversions, return scoring and full team-DST outcomes to ingestion before claiming complete historical DK scores. Existing interceptions are defensive picks.
2. Reuse per-book odds snapshots, retaining genuine individual-book observations distinctly from provider aggregate fallbacks. Match canonical players/games and full-game market identity. Compute median and mean, book count and dispersion from each book's latest available observation at the same historical cutoff; separate alt lines and sides. Add de-vigged probability conversion for appropriate price markets. A yards O/U line is not automatically the expected yards.
3. Build a time-safe feature layer for recent weighted opportunity/efficiency, matchup and available injury/coaching context. Missing routes, coverage or goal-line roles must remain unknown. Avoid silently treating a last-five mean as a complete fantasy model.
4. Preserve market_based_projection and model_projection separately. Record feature inputs, source snapshot IDs, missing-data notes, model_version, generated_at and data_as_of. Explain disagreements; do not overwrite market values with model values.
5. Add DraftKings scoring, odds conversion, consensus, projection and historical-cutoff tests before exposing a player projection board. Tests must cover bonus thresholds, negative events, missing fields and DST tiers.

## Milestone 4: legal mean optimizer (planned)

Start with a solver whose feasibility can be checked independently: exactly nine unique roster entities, one QB, two RB, three WR, one TE, one eligible FLEX and one DST, salary <= $50,000, plus any official game-diversity rule confirmed during implementation. Handle locked/excluded players and infeasibility explicitly. Optional minimum salary, team counts, ownership totals, stacks and bring-backs remain configurable, not assumed optimal.

Optimize projected fantasy points as the baseline. There is **no optimizer command or API yet**. Do not return a heuristic lineup as an exact maximum or label a mean projection as a probability. Add cap/position/FLEX/duplicate/locked-player/infeasibility tests and compare a small solver fixture to exhaustive enumeration.

## Later milestones

Conditional empirical outcome distributions should expose p10/p25/median/p75/p90, mean and standard deviation, with seeded simulation. Add ownership imports/forecasting and out-of-time MAE, RMSE, Spearman and bucket calibration before simulating realistic legal fields. Actual ownership is an outcome available after lock, never a same-contest feature. Game-level correlation can then model QB/pass-catcher upside, opposing offense and DST relationships, and opportunity competition.

Contest evaluation must use shared simulated outcomes for our lineup and field, documented ranking/tie/payout conventions, and report P(top 50/25/10/5/1%), P(first), expected payout and ROI where defined. Optimize P(top 10%) against simulation estimates with independent evaluation simulations to avoid overfitting Monte Carlo noise. Compare the strategies in backtesting.md before adopting complexity. No ownership scraping, simulated win claims or automatic contest entry is part of this increment.
