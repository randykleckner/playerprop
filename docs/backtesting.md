# Backtesting contract (planned)

No historical contest importer, replay engine or performance results exist yet. Milestone 8 will implement them after the baseline optimizer and simulation layers. This document defines the evaluation requirements; it is not a claim of an executed backtest.

## Availability and leakage

Every modeled input needs source identity, a defensible available_at/capture timestamp, and immutable revisions. Require `available_at <= slate_lock_time`, and use only data available at the specific decision time if earlier than lock. Stats from a slate's games, final fantasy scores, actual ownership, and later injury/odds updates are outcomes, not pre-lock features.

The new salary API implements a conservative slice: both salary availability and completed import time must be <= min(requested as_of, lock_time). It chooses one whole eligible snapshot. Availability comes from server ingestion time; a client cannot label a newly uploaded old file as historically available. Pre-lock historical files lacking publication evidence cannot be used to claim a strict retrospective decision replay. They may support separately labeled exploratory analysis, excluded from validated performance reporting.

Existing NFL stats, injury/role/context upserts do not preserve source revisions. updated_at is not proof of historical publication. A game date alone cannot establish when final stats were available. Existing liveSignals has no historical cutoff and must not be used for replay. Recover verified source archives or begin prospective snapshot capture; never invent old availability dates.

## Replay procedure

For each eligible historical slate, freeze the pre-lock source snapshot IDs and model version, train only on earlier slates, generate football and ownership projections, construct each strategy's lineup, and evaluate against legally obtained complete contest results. Preserve salary/roster legality, entry fee, payout structure, field size, lineup fantasy scores, winning score, cash line and ties. Incomplete results must be labeled and excluded from metrics that need a complete field.

Actual ownership and fantasy outcomes are stored in an outcome-only path with post-lock availability; future training may consume earlier contests' outcomes. Split training/validation/test chronologically by slate, not randomly by player rows. Tune hyperparameters and strategy selection on earlier validation slates; keep final evaluation slates untouched.

## Required strategy comparison

| Strategy | Comparison |
| --- | --- |
| A | Highest mean projected fantasy points under legal roster/cap constraints |
| B | Projection plus a declared salary-value objective |
| C | Projection plus projected ownership |
| D | Projection plus ownership and correlation/roster construction |
| E | Full simulated field optimization for P(top 10%) or expected ROI |

Use the same eligible slates, information cutoffs and contest entry count for all five. Fix the formula, solver limits and model version for each strategy before scoring test slates. Keep simulation seeds and candidate selection/evaluation draws reproducible. Report excluded slates and reasons to prevent survivorship bias.

## Metrics and interpretation

Record each slate's fantasy score, rank/percentile (with an explicit tie convention), top-10/5/1% and cash indicators, entry fees and prizes. Aggregate mean score/percentile, top-percentile frequency, cash frequency, total and per-slate ROI, cumulative bankroll/ROI, maximum bankroll drawdown and number of independent slates. Define ROI as `(prizes - entry fees) / entry fees` and leave it unavailable for zero/missing entry fees. Use rank/payout tie splitting consistent with the contest, and use confidence intervals clustered by slate rather than treating correlated lineups as independent evidence.

Report ownership MAE/RMSE/Spearman and calibration by ownership bucket separately from contest performance. Report uncertainty and simulation sample counts with probability estimates. Add play-caller, pressure/coverage, injury, defense and game-script features only when time-safe ablation tests improve held-out results. More complicated strategies may perform worse; no edge claim is supported until this comparison is run.

## Available checks now

`npm test` tests salary snapshot cutoff equality/exclusion, timezone normalization, completion after lock, duplicate retry timestamps, immutable slate metadata, all-or-nothing imports and selection of a whole revised salary file. It also checks source adapter errors and some legacy route behavior. Scoring, optimizer, ownership and full historical-replay tests are required in their implementation milestones, not represented as passing by these foundation tests.


## September 8 confidence-tier and calibration update

The earlier strict DK-bridge blocker is superseded by the user-approved four-tier policy: NFLverse Players V2 is canonical, and all 305 eligible offensive players are strongly corroborated, including three scoped manual overrides. None is represented as provider-ID verified. Stop identity work; no paid provider integration. Repeated identity and uncalibrated labels are removed from the main player views; details retain tier counts and validation limitations.

Completed a 354-game reconstructed historical Monte Carlo diagnostic: 2024 training, 2025 held out, positional mean error, variance scaling, P75/P90 exceedance and QB/receiver correlation. The experimental correction is not deployed because improved tails came with worse MAE. See [results and next backend steps](calibration-results-2026-09-08.md).
