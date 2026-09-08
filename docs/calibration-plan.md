# Earning a calibrated research model

Status: September 8, 2026. The current foundation v1.1 engine is reproducible and mechanically tested, but its predictive probabilities have not been validated against eligible held-out final results. More Monte Carlo draws reduce sampling noise; they do not correct biased forecasts or assumptions.

## Existing foundations

- Immutable pregame input/prediction archives with hashes, exact input fingerprints and pre-lock timestamps: `scripts/research/archive.mjs` and `dfs:freeze`.
- Final-only exact player/game joins, provisional-identity and placeholder-DST exclusions: `dfs:evaluate`.
- Chronological training/evaluation window checks and basic MAE, P10/P90 tail coverage, standardized error and position splits: `calibrationReport`.
- The shared snapshot baseline passed 10,000 draws per game, 120,000 game-allocation checks, reproducibility and independent player/lineup quantile checks. These verify implementation, not forecast accuracy.

The current 305 eligible offensive identities are provisional. The evaluator deliberately excludes them. Name agreement or an ESPN crosswalk does not establish a verified DraftKings identity. No accuracy result is available from this pool yet.

## Delivery sequence and evidence gates

1. **Identity evidence.** Review exact namespaced provider IDs and canonical GSIS IDs, prioritizing conflicting positions/teams and the active research pool. Record reviewer, source URL/archive hash, effective dates and reason. A trade can be valid; team mismatch alone must not automatically reject or approve a mapping. Preserve original frozen predictions and attach a separately versioned review receipt; implement and test evaluator support before admitting retrospectively reviewed identities.
2. **Final actual ingestion.** Normalize schedule IDs and final NFLverse game/player statistics into versioned observations. Recompute DraftKings points from statistics, including bonuses, turnovers and scoring rules, instead of joining an unrelated fantasy scoring total. Track final status, corrections, source timestamp and availability. Separate inactive, limited, missing and active-zero games. No missing row becomes a zero. Keep DST excluded until its model and scoring are supported.
3. **Pregame collection.** Freeze each selected evaluation forecast before kickoff with model/config/source versions, identities, salaries, probabilities and availability. Salary refresh alone does not freeze a prediction. Deduplicate repeated refreshes to one predefined forecast horizon per player/game for each evaluation cohort. Historical backfills require genuinely historical pregame inputs; today's projections cannot stand in for last season's forecasts.
4. **Chronological fitting.** Tune earlier games only, using walk-forward validation inside the training period. Begin with position/role mean bias, variance and tail shape. Add workload, availability, recency, coaching changes and game/team correlation only when supported by dated inputs. Group splits and uncertainty estimates by game/week to avoid treating correlated observations as independent.
5. **Untouched evaluation.** Lock parameters before the later evaluation period. Compare with the same captured ESPN baseline and simple position/role baselines. Report MAE/bias, P10–P90 coverage, P90/P95 exceedance, and 2×/3×/4× reliability and Brier scores, with sample counts and uncertainty. Inspect position, salary, role and availability cohorts. Predeclare tolerances and minimum evidence before looking at evaluation outcomes; do not select a winning threshold afterward. The current reporter needs extension for these metrics, baselines and intervals.
6. **Scoped promotion and monitoring.** Publish the evaluation window, training window, frozen model/config, exclusions, uncertainty and limitations. Change the label only for the positions/markets actually supported by the evidence. Recheck on subsequent weeks and after source, role or coaching changes. Repeated failures revert the affected cohort to provisional research status.

A calibrated P90 should be exceeded about 10% of the time across an appropriate evaluation sample; it is not a player's chance of winning a contest. There is no guaranteed number of weeks that earns calibration. Small or unstable samples remain inconclusive. Player marginal calibration also does not establish lineup tail calibration: joint game/team dependencies need separate evaluation. Ownership, field simulation, top-10% finishes and ROI remain later milestones.

## Next concrete implementation

Build the evidence-backed identity review ledger and final-stat adapter next. The current `/research/` page is a read-only diagnostic queue, not an approval workflow. Production D1 changes require a separate concrete migration review. The local evaluator currently accepts supplied actuals; it does not download final stats automatically.


## September 8 confidence-tier and calibration update

The earlier strict DK-bridge blocker is superseded by the user-approved four-tier policy: NFLverse Players V2 is canonical, and all 305 eligible offensive players are strongly corroborated, including three scoped manual overrides. None is represented as provider-ID verified. Stop identity work; no paid provider integration. Repeated identity and uncalibrated labels are removed from the main player views; details retain tier counts and validation limitations.

Completed a 354-game reconstructed historical Monte Carlo diagnostic: 2024 training, 2025 held out, positional mean error, variance scaling, P75/P90 exceedance and QB/receiver correlation. The experimental correction is not deployed because improved tails came with worse MAE. See [results and next backend steps](calibration-results-2026-09-08.md).
