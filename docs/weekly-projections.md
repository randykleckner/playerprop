# Weekly projection baseline and source consensus

The first lineup objective is to maximize the sum of projected DraftKings fantasy points under the $50,000 cap and full NFL Classic roster requirements: QB, RB, RB, WR, WR, WR, TE, FLEX (RB/WR/TE), DST, unique players and the applicable slate/game rules. This is a constrained optimization problem; choosing players greedily by points or points per dollar does not guarantee the best legal lineup. Maximizing expected points is a useful benchmark, but it is not the same objective as maximizing tournament first-place probability.

## Implemented in this increment

`scripts/dfs/projections.py` defines a separate `DfsProjectionProvider`/`ProjectionSnapshot` contract. Source, season, week, fetch time, scoring basis, original raw response, normalized player records and conversion components are preserved. `consensus()` selects each provider's latest observation available at the requested cutoff, excludes other weeks/scoring systems and unresolved identities, and calculates equal-weight mean, median, source count and disagreement. Optional weights are explicit and renormalized over available sources; a missing source is not zero points. Repeated revisions from one provider do not receive extra votes. A one-source baseline is labeled source_count=1.

`scripts/dfs/espn.py` implements the first public projection adapter. It requests only anonymous league-defaults information:

```text
https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{season}/segments/0/leaguedefaults/3?view=kona_player_info&scoringPeriodId={week}
```

The X-Fantasy-Filter header requests at most 2,000 players sorted by percent owned. Sorting is required by this endpoint when specifying a limit; it has no role in the model's weighting. Reaching the limit is treated as possible truncation and rejected. No private league, authentication, account action or credential is involved. Successful observations are cached six hours and raw source data is archived. This unofficial interface can change; failures preserve prior files and do not affect NFL/salary/sportsbook ingestion.

Only rows matching the exact season, scoringPeriodId, statSourceId=1 (projection), and statSplitTypeId=1 (weekly) are selected. Season totals, historical projections and actual points cannot substitute for a missing weekly projection. Empty projected-stat dictionaries are excluded, not interpreted as zero points. Original appliedTotal is retained as `source_native_points` and never treated as a DraftKings total.

The NFLverse catalog's ESPN IDs provide stable ESPN-to-GSIS mapping. DST uses team identity. This improves projection-side mapping; it does not retroactively verify name-based DraftKings salary mappings or prove that every downloaded GSIS ID is in production D1.

## DraftKings conversion and limitations

Scoring rates were checked against [DraftKings' NFL DFS scoring guide](https://dknetwork.draftkings.com/2025/08/27/nfl-dfs-beginners-guide-draftkings/). ESPN numeric stat-key interpretations were checked against the [espn-api project's stat map](https://raw.githubusercontent.com/cwendt94/espn-api/master/espn_api/football/constant.py), an unofficial implementation reference that requires ongoing validation.

The scoring basis is deliberately named `draftkings-expected-v1-estimate`. Offensive conversion uses projected passing/rushing/receiving yards and touchdowns, receptions, interceptions thrown, fumbles lost, two-point conversions, available return/recovery touchdowns, and projected bonus-event counts. Aggregate two-point conversions are used once; components are not added again.

Bonuses are expectations: three times the projected probability/count of passing 300+ yards or rushing/receiving 100+ yards. A forecast of 290 passing yards can still carry an expected bonus; a forecast of 310 is not automatically awarded a full three points. Tiny negative provider bonus probabilities within 1e-6 are clamped and flagged; material violations fail validation.

ESPN's defensive 18–21 points-allowed bucket crosses DraftKings' 20/21 scoring boundary. The adapter exposes lower/upper conversion values for that bucket and uses their midpoint as a disclosed first estimate. These bounds describe this conversion ambiguity, **not** a player's outcome confidence interval. Sparse omitted stats are provisionally treated as zero within nonempty stat lines; rare scoring events are not fully covered. Both assumptions are flagged on every estimate. This is not yet a validated production scoring/projection model.

## Live diagnostic: September 6, 2026

The Week 1 public response was captured at `2026-09-06T14:20:24.123Z`:

- 1,036 returned player wrappers.
- 461 nonempty usable weekly QB/RB/WR/TE/DST projection records.
- 419 offensive records matched to canonical GSIS IDs through ESPN ID; 10 offensive records remain unresolved.
- 32 DST team records.
- 330 matching-position/team salary comparison records in the previously saved DraftKings slate. This comparison includes candidate salary identities and is explicitly diagnostic, not an optimizer-eligible pool.

| Player | ESPN native points | Converted DK estimate |
| --- | ---: | ---: |
| Jahmyr Gibbs | 21.65 | 22.80 |
| Amon-Ra St. Brown | 18.83 | 19.86 |
| Ja'Marr Chase | 19.95 | 21.13 |

Reports retain full precision, component contributions and flags. The conversion values above are forecasts with declared assumptions, not claims about realized scores.

```bash
npm run dfs:projections -- --season 2026 --week 1

# Add a saved salary observation to produce a diagnostic comparison table.
npm run dfs:projections -- --season 2026 --week 1 \
  --salary-snapshot /absolute/path/to/salary-snapshot.json.gz
```

Raw projection snapshots and reports are saved under ignored `.dfs-projections/`. No production schema, Worker endpoint, Cron or lineup submission was changed. The highest-projected-points optimizer remains a subsequent step after salary identity/slate membership and projection quality checks; this diagnostic does not return a purported optimal lineup.

## Growing into an independently evaluated model

1. Add another publicly accessible or licensed weekly projection provider behind the same interface. Store raw stats and original scoring assumptions rather than averaging incompatible point totals. Keep the ESPN-only baseline for comparison.
2. Build the exact legal $50,000 mean-points optimizer and independently verify its result against exhaustive small fixtures. Exclude stale, disabled, wrong-slate and unresolved records. Preserve the full input snapshot IDs for every lineup.
3. Capture projections before lock and evaluate against complete actual DraftKings scores. Compare source/consensus MAE, RMSE, bias and calibration by position and opportunity level. Fit weights only on earlier weeks; use held-out weeks to judge improvement. Multiple sources may share underlying inputs and errors.
4. Add betting markets as features: book consensus, dispersion, de-vigged probabilities, game totals/spreads, and appropriate player props. A median betting line is not automatically a mean outcome. Retain market inputs separately from model adjustments.
5. Add recent volume/efficiency, snaps, injuries, opponent tendencies, pace, weather and role changes. Avoid arbitrary additive matchup bonuses that double-count information already in ESPN/market projections. Evaluate each feature group's incremental benefit against the same held-out baseline.
6. Once the mean model is reliable, estimate outcome distributions and player/game correlations, then evaluate stacking, ownership and contest-specific objectives. Higher projected mean alone cannot establish a tournament edge.

The project should become the auditable source for its own forecasts: source provenance, explicit assumptions, reproducible predictions and measured performance. Being the most accurate source is an outcome to test, not an assumption.

Validation: 44 tests passed (6 Node, 38 Python), including recorded ESPN parsing, weekly/actual separation, stable-ID mapping, expected bonuses, conversion assumptions, duplicate rejection and source/time/scoring-aware consensus. TypeScript checking also passed. The live raw response was replayed through the diagnostic and archived successfully.
