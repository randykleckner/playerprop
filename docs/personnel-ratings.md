# Madden NFL 27 personnel foundation

September 9, 2026 · V2.0-B — Current Data and Personnel Foundation.

Personnel is a diagnostic layer in [Drive Lab](https://drlocksmd.com/drive-lab/). It does **not** alter any simulation probability, yardage, clock, score, player allocation, DFS recommendation, or V1 behavior. The browser reads a saved static snapshot and never calls EA.

## Source audit and reproducible import

The official [EA ratings page](https://www.ea.com/games/madden-nfl/ratings) serves structured `__NEXT_DATA__`. `props.pageProps.gameDetails.slug` identifies `madden-nfl-27`; `ratingDetails.items` contains 100 records per page and `totalItems` identifies the complete cohort. The observed build ID was `J9U-w62d7n4Os5ydnPWd2`. Subsequent pages use the site's public Next.js JSON delivery:

`https://www.ea.com/_next/data/{discoveredBuildId}/games/madden-nfl/ratings.json?franchiseSlug=madden-nfl&page=2`

The first import read 24 pages, yielding **2,364 unique players**, launch ratings, captured **2026-09-09 14:20:48 UTC**. Build discovery is dynamic; this is not a supported or contracted ratings API. No HTML player-card parsing, credentials, EA account actions, image downloading, or historical Madden collection is involved. Public availability does not grant a redistribution license; confirm permitted use before expanding distribution or commercial use. EA owns its ratings content; Dr Locks is not affiliated with EA.

`PersonnelRatingsProvider` isolates the implementation in `scripts/personnel/provider.py`. It validates the title, required fields, numeric bounds, page totals and unique external IDs, and rejects incomplete imports. Portraits may be absent and are not identity evidence. The original audit encountered absent portrait fields and a large uncompressed depth file; optional portraits and bounded gzip decoding now handle those cases.

Commands from the repository root:

```sh
npm run personnel:import
npm run v2:live:refresh
npm run drive-lab:build
npm run personnel:build
npm run personnel:diagnose -- --away BUF --home HOU
```

EA requests are manual, sequential with a 0.5-second minimum inter-page pause, identifiable read-only headers, and a **minimum seven-day cache**. Source page bodies are content-addressed and archived. An unchanged content hash preserves the original rating timestamp; the latest pointer also records the successful check time. Failures preserve the last complete ratings snapshot. A first-import failure surfaces an error. Roster/depth responses have a separate 24-hour cache. The existing twice-daily research/news automation does not fetch EA or perform D1 migrations. Run the commands above manually when updating this foundation; no new scheduler was installed.

## Current roster and identity

Canonical identities come from NFLverse Players V2 through the existing `dfs.catalog` loader. Current team, position and roster status come from `rosters/roster_2026.csv`; starter evidence comes from `depth_charts/depth_charts_2026.csv.gz` in the [NFLverse data releases](https://github.com/nflverse/nflverse-data/releases). Depth rows use the latest timestamp per team at or before the build cutoff, rank 1, published base offense/defense, excluding special teams. The observed depth timestamp is **2026-09-09 12:06:21 UTC**, with roster fetched **14:20:49 UTC**.

The adapter reuses existing canonical names, normalized-name handling and team normalization. EA provides its own player ID but no direct GSIS/ESPN cross-reference in the audited payload, so **no records are called verified**. A unique canonical/roster alias, current team and compatible position family earns `strongly_corroborated`; a unique name with conflicting team/position remains `provisional`; ambiguity or no candidate remains `unresolved`. Unresolved and provisional records are excluded from unit ratings. Broad OL/front/secondary position families accommodate EA's LEDG/REDG/MIKE/WILL/SAM terminology; they do not prove exact alignment.

`config/personnel-overrides.json` supports reviewed, exact EA-ID overrides with expected name/team, canonical ID, effective/expiry dates, reviewer and source URLs. An override cannot bypass team/position or ambiguous-roster checks. No manual overrides were needed or invented for this import. This Madden cohort is separate from the completed DraftKings eligible-player identity audit.

`ACT` means active roster membership, not healthy, available or confirmed starting on game day. No automatic injury substitution, highest-rated-player selection, or news-driven roster change occurs.

## Attributes and persistence

The source maps `id → external_player_id`, `firstName + lastName → name`, `team.label → canonical team abbreviation`, `position.id → source position`, `overallRating → overall`, and `stats.<field>.value → numeric attributes`. Overall is stored but is never a unit-composite input.

All available numeric attributes are retained. Useful relational columns include throwing power/accuracy/pressure, awareness, speed, acceleration, strength, carrying, catching, blocking subtypes, pass-rush moves, shedding, pursuit, tackling, recognition and man/zone/press. Exact source keys by use:

| Group | Source attributes |
|---|---|
| QB | throwPower, throwAccuracyShort, throwAccuracyMid, throwAccuracyDeep, throwUnderPressure, awareness, playAction, speed, acceleration, carrying |
| RB | speed, acceleration, agility, carrying, breakTackle, trucking, changeOfDirection, catching, passBlock |
| WR / TE | speed, acceleration, catching, catchInTraffic, spectacularCatch, release, shortRouteRunning, mediumRouteRunning, deepRouteRunning, changeOfDirection, awareness |
| OL | strength, awareness, passBlock, passBlockPower, passBlockFinesse, runBlock, runBlockPower, runBlockFinesse, impactBlocking |
| Front | strength, awareness, powerMoves, finesseMoves, blockShedding, pursuit, tackle, acceleration |
| LB | tackle, pursuit, playRecognition, awareness, blockShedding, zoneCoverage, manCoverage, speed, acceleration |
| CB / S | manCoverage, zoneCoverage, press, playRecognition, awareness, speed, acceleration, tackle, pursuit, catching |

The SQLite/D1-compatible migration `0009_personnel_ratings.sql` creates immutable snapshot and normalized player tables, range checks, indexes and update/delete guards. `.personnel/personnel.sqlite` is the populated **local** database. No production D1 migration or data writes were made. Raw EA snapshots are keyed by content; personnel snapshots also fingerprint roster, depth, configuration, overrides and canonical catalog provenance, so a new roster context cannot overwrite earlier joins. Full local mapping issues are in `.personnel/mapping-report.json`. The published `personnel.json` contains unit evidence, timestamps and tier counts rather than the full raw EA archive.

## Unit formulas

Each player score is `sum(attribute × weight) / sum(weights)`. Unit scores average player scores using the positional weights below. All numbers stay on the original **0–99 attribute scale**; there is no percentile, league normalization, probability conversion or fitted performance coefficient. The weights in `config/personnel.json` are explicit initial research assumptions.

| Unit | Attribute weights | Player / position weighting |
|---|---|---|
| Pass protection | passBlock 1, passBlockPower 1, passBlockFinesse 1, awareness 0.5 | LT/RT 1.2; LG/C/RG 1 |
| Run blocking | runBlock 1, runBlockPower 1, runBlockFinesse 1, strength 0.5, impactBlocking 0.5 | Five OL slots equally |
| Pass rush | powerMoves 1, finesseMoves 1, blockShedding 0.5, acceleration 0.5, pursuit 0.5 | Base DL plus 3–4 outside linebackers equally |
| Run front | blockShedding 1, strength 1, tackle 1, pursuit 0.5, playRecognition 0.5 | Base front seven equally |
| Secondary man | manCoverage 2, press 1, playRecognition 1, awareness 1, speed 1 | Published CB/S slots equally |
| Secondary zone | zoneCoverage 2, playRecognition 1, awareness 1, speed 1 | Published CB/S slots equally |
| Secondary overall | manCoverage 1, zoneCoverage 1, press 0.5, playRecognition 1, awareness 1, speed 1 | Published CB/S slots equally |

A complete OL requires one player in each of LT/LG/C/RG/RT. Front/secondary require at least four pass-rush, seven run-front and four secondary slots, respectively. Missing attributes, duplicated assignments, inactive/unmatched players or missing depth lower confidence and mark the result partial. Complete units have **moderate**, never high, confidence because identity corroboration and published depth do not prove game-day roles. Partial sample averages remain visible, but matchup differences are suppressed until both units are complete. Difference = offense attribute score minus opposing defense score; it is not an expected-points advantage.

Skill-position composites and receiver-versus-secondary comparisons are explicitly deferred. Their underlying attributes are available locally.

## Initial coverage, diagnostics and performance

2,364 imported: **0 verified, 1,900 strongly corroborated (80.4%), 320 provisional, 144 unresolved**. There are 32 teams and **179 complete / 224 total unit ratings**. The remaining 45 are partial; missing evidence is expandable in the page. Free agents, outdated team assignments, unfamiliar aliases and canonical-roster omissions require review rather than forced matches.

The first full import used 24 EA pages; a reliable cold-runtime measurement was not retained. A cached import completed in 1.14 seconds. The first personnel build took 7.15 seconds, with a 3.82 MB local SQLite database and approximately 586 KB static diagnostics JSON (uncompressed). Later local history grows intentionally. Drive Lab adds one static JSON fetch and no EA, D1 or Worker query per simulation. A browser 1,000-game current-profile run completed in 0.16 seconds on the development Mac; device runtimes vary.

The full per-position tier table and sample matchup follow. These are snapshot evidence, not current-game forecasts.

| EA position | Strongly corroborated | Provisional | Unresolved |
|---|---:|---:|---:|
| C | 69 | 12 | 7 |
| CB | 189 | 41 | 15 |
| DT | 192 | 29 | 20 |
| FB | 10 | 4 | 0 |
| FS | 83 | 15 | 7 |
| HB | 125 | 22 | 8 |
| K | 28 | 5 | 2 |
| LEDG | 94 | 10 | 6 |
| LG | 65 | 13 | 2 |
| LS | 29 | 4 | 1 |
| LT | 65 | 19 | 5 |
| MIKE | 79 | 10 | 7 |
| P | 28 | 4 | 1 |
| QB | 94 | 12 | 3 |
| REDG | 90 | 13 | 4 |
| RG | 71 | 9 | 7 |
| RT | 63 | 12 | 6 |
| SAM | 17 | 1 | 3 |
| SS | 87 | 12 | 4 |
| TE | 119 | 23 | 7 |
| WILL | 85 | 13 | 4 |
| WR | 218 | 37 | 25 |

### BUF at HOU example

**BUF:** pass protection 80.09 vs HOU pass rush 82.43; run blocking 83.38 vs run front 80.93. Secondary man 78.6, zone 80.88, overall 79.64. All complete, moderate confidence.

- pass protection: LT Dion Dawkins (89.29); LG Alec Anderson (68.29); C Connor McGovern (84.0); RG O'Cyrus Torrence (75.86); RT Spencer Brown (81.0).
- pass rush: LDE T.J. Sanders (75.14); NT Deone Walker (75.57); RDE Ed Oliver (79.86); WLB Greg Rousseau (86.14); SLB Bradley Chubb (77.43).
- run front: LDE T.J. Sanders (79.88); NT Deone Walker (79.88); RDE Ed Oliver (84.12); WLB Greg Rousseau (87.12); LILB Dorian Williams (73.62); RILB Terrel Bernard (78.88); SLB Bradley Chubb (82.0).
- secondary: LCB Christian Benford (85.64); SS Cole Bishop (79.55); FS C.J. Gardner-Johnson (76.82); RCB Maxwell Hairston (77.36); NB Dee Alford (78.82).

**HOU:** pass protection 76.63 vs BUF pass rush 78.83; run blocking 80.05 vs run front 80.79. Secondary man 83.07, zone 87.84, overall 85.24. All complete, moderate confidence.

- pass protection: LT Aireontae Ersery (75.71); LG Keylan Rutledge (77.29); C Evan Brown (75.57); RG Ed Ingram (74.43); RT Trent Brown (79.71).
- pass rush: LDE Will Anderson Jr. (91.43); LDT Tommy Togiai (73.29); RDT Sheldon Rankins (75.86); RDE Danielle Hunter (89.14).
- run front: LDE Will Anderson Jr. (88.75); LDT Tommy Togiai (82.0); RDT Sheldon Rankins (84.38); RDE Danielle Hunter (85.88); WLB Henry To'oTo'o (74.62); MLB Azeez Al-Shaair (82.0); SLB Jacob Hummel (68.88).
- secondary: LCB Derek Stingley Jr. (92.55); SS Reed Blankenship (77.27); FS Calen Bullock (81.27); RCB Kamari Lassiter (88.18); NB Jalen Pitre (86.91).

## Limitations and smallest V2.0-C

EA's public delivery can change. Ratings are subjective video-game attributes; starter evidence is approximate and the weights are uncalibrated. Current ratings must never be retroactively attached to past seasons as though available then. No historical Madden data was obtained. Incomplete identities and depth remain visible; they are not repaired with synthetic players.

The smallest next milestone is **drive-finishing calibration**: retain the frozen historical split, diagnose red-zone/drive-ending score bias, test one conditional-yardage or finishing change on an untouched season, and compare game totals, pace and variance against A/B. Keep Madden diagnostic-only until a historical personnel evidence design can avoid leakage. Do not begin V2.0-C automatically; this milestone is ready for review.

Final refresh: the canonical catalog update corroborated two additional Madden players, raising coverage to 1,900 and lowering unresolved to 144. Two immutable local personnel contexts occupy 7.67 MB; the final build took 7.01 seconds.

Validation: **162 tests passed (85 Node, 77 Python)**, including 17 new tests for recency, provider schema/cache/fallback, identity/overrides, local persistence/immutability, all unit formulas, starter gaps, frontend evidence and personnel isolation. TypeScript and deployment dry run passed. Browser checks confirmed the current empirical engine runs, timestamps render, and starter evidence expands correctly in the narrow layout.
