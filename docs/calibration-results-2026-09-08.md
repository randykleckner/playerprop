# First historical Monte Carlo diagnostic

This is a retrospective diagnostic of the foundation v1.1 engine with reconstructed prior-five-game inputs, not a historical replay of the live ESPN-fed site. It does not know any future contest outcome. Actuals are used only after the forecast inputs are built.

## Identity gate completed

NFLverse Players V2 is canonical. The existing `players/players.csv` release is the source used by [nflreadr load_players](https://raw.githubusercontent.com/nflverse/nflreadr/main/R/load_players.R). The upstream [Players V2 repository](https://github.com/nflverse/nflverse-players) documents its data-file manual-overwrite approach; `config/identity-overrides.json` follows that pattern with exact provider IDs, expected source values, sources, reviewer and effective bounds.

Confidence policy v1: verified means an existing stable/reviewed external-ID assignment; strongly corroborated requires normalized name, canonical team/position, current game/opponent/kickoff and unique NFLverse/ESPN crosswalk agreement, plus the actual ESPN projection ID. The three documented source discrepancies have scoped contextual overrides. They do not invent a provider-issued DK→GSIS bridge. Provisional and unresolved remain separate. Namespaces and player IDs cannot be substituted by an override.

Current eligible offense: 0 verified, 305 strongly corroborated, 0 provisional, 0 unresolved; 24 DST teams separate. The wider salary pool still excludes 23 unresolved identities, 200 disabled/unavailable records and 192 unmatched projections. The eligibility rules were not loosened to reach zero. Identity work stops here under the user's requested scope; no paid provider is needed or integrated.

## Experiment

- Public NFLverse weekly player statistics, 2024 and 2025, and schedules. Source SHA-256 hashes are in `public/research/calibration/latest.json`.
- Build each game's inputs from five earlier same-team, same-season games with recorded offensive opportunity. Do not use current actuals, future rosters, actual game totals, or actual QB/receiver leaders to set inputs.
- Use the most recent observed team, skip history older than 28 days, require five samples and quarterbacks on both sides. Missing/no-opportunity actuals are excluded rather than filled with zero. Injury limitation remains unobserved, so this is a conditional opportunity cohort with selection limitations.
- Use core offensive scoring shared with the foundation: yardage, TDs, interceptions, receptions, fumbles and yardage bonuses. Two-point and return/recovery TD scoring and DST are outside this diagnostic.
- Run 1,000 correlated draws per game over 354 games. No candidate optimization, salaries, ownership, contest finish or value calculation. A constant internal salary field satisfies engine schema only.
- Fit position mean bias and standard-deviation multipliers on 2,661 observations from 2024. Evaluate unchanged parameters on 2,596 observations from 2025; prior 2025 games may update rolling inputs but never fitted parameters.
- Final-stat files downloaded now can contain later corrections. Synthetic prior-day cutoffs only express chronological ordering and are not historical capture evidence. This experiment is excluded from strict archived-forecast performance claims.

## Held-out results

| Metric | Foundation | Training-only adjustment |
|---|---:|---:|
| Mean error (prediction − actual) | -0.618 | +0.437 |
| MAE | 5.271 | 5.403 |
| RMSE | 7.301 | 7.297 |
| Squared error / predicted variance | 1.517 | 0.993 |
| Above P75 | 31.66% | 23.38% |
| Above P90 | 17.49% | 11.52% |

Original positional mean errors: QB -0.365 (300 observations), RB -0.519 (704), WR -0.687 (1,034), TE -0.752 (558). After adjustment: QB +0.937, RB -0.030, WR +0.745, TE +0.188. Percentile exceedance is strict `actual > percentile`; reference rates are approximately 25%/10% for P75/P90, subject to discrete distributions and sample uncertainty.

Across 260 leading-QB/leading-WR-or-TE pair-games (164 unique games), mean simulated within-game correlation is 0.436; observed pooled standardized-residual correlation is 0.435. This aggregate similarity is not proof of pair-level calibration. Shared games and repeated teams are dependent; uncertainty intervals and pair/role stratification remain follow-up work.

**Decision: do not deploy the adjustment.** Aggregate variance/tails improve but MAE worsens and QB/WR bias reverses. These diagnostics guide the next candidate, not a declaration that the live ESPN-fed model is calibrated.

## Reproduction and next backend work

```
npm run dfs:calibrate:prepare -- --stats .dfs-calibration/stats-player-2024.csv --stats .dfs-calibration/stats-player-2025.csv --schedule .dfs-calibration/games.csv --output .dfs-calibration/historical-inputs.json
npm run dfs:calibrate:historical -- .dfs-calibration/historical-inputs.json public/research/calibration/latest.json 1000
```

`calibrationReport` now reports signed mean error, position bias, RMSE, variance ratio and P75/P90 exceedance. Frozen evaluation accepts verified and strongly corroborated tiers, includes tier provenance/P75, and continues to exclude old provisional archives. It does not rewrite old frozen receipts.

Next: full offensive scoring reconciliation, availability-aware cohorts, uncertainty grouped by game/week, additional walk-forward windows, and final-actual ingestion for the new prospective frozen forecasts. Then assess whether improvements transfer to the actual ESPN-fed inputs. Predictions are frozen before kickoff; results and accuracy are measured after games finish. No upcoming result is needed to make a prediction.

## Release verification

Published on both custom domains as Worker version `2215c9f7-3aee-49d6-8748-a613b49bbe6c`. The live bundle is `f54046e9630fa0d709368a99`. Validation passed: 114 tests (61 Node, 53 Python), TypeScript, and browser checks of the player views and calibration report.

A 10,000-draw prospective forecast was frozen at `2026-09-08T19:08:23.696Z` as `pregame-51f886e0ed2e920394d53ed1c3369605`, using bundle `3dabca709ea6b611c91e8795` and archived identity evidence. This receipt remains immutable when subsequent refreshes publish newer bundles. Final outcomes are not yet available.
