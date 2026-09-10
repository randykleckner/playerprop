# V2.0-D — Availability and workload

Drive Lab now prepares expected-active personnel before running **V2 Base** or **V2 Personnel**. V1 and the legacy V2.0-A/B engines remain unchanged. Base uses the same availability-adjusted opportunity inputs but zero Madden influence. A paired Base/Personnel run therefore isolates personnel influence within the same availability scenario.

## Evidence and source precedence

`build_v2_availability.py` reads the official [NFL injury report](https://www.nfl.com/injuries/), NFLverse Players V2 and current roster/depth archives, the archived Madden 27 ratings, and existing NFLverse snap counts. It requires an explicit matching season/week and known injury table columns/designations. Exact normalized name, current team and position family identify injury rows; unresolved rows are retained as issues. NFLverse/ESPN depth crosswalk corrections require exact ESPN ID, name and current team. Madden team aliases normalize NY Jets, NY Giants and LAR/LA; this does not upgrade player identities to verified.

Full practice without a game designation clears an earlier practice-only reduction on the next successful snapshot. A current official designation takes precedence over a practice interpretation. Non-active roster designations prevent a practice report from reactivating a reserve, suspended, cut or retired player. Roster status codes are interpreted narrowly using the [NFLverse roster-status documentation](https://github.com/nflverse/nflreadr/issues/232); other reserve codes remain INACTIVE rather than being called an injury. No uncontrolled news headline can set participation. The official tables cover all positions, so this release does not need an ESPN/Newsroom prose fallback.

Source `updated_at` is the observed fetch time, not an invented publication time. Raw sources remain archived in the existing source caches; each availability snapshot is archived under `.personnel/availability-*.json` before publishing the compact site input. A fetch/schema/cohort failure leaves the last valid public snapshot untouched. Injury **or roster** age beyond 24 hours shows `AVAILABILITY DATA STALE`; timestamps are never refreshed merely because a simulation runs.

The existing twice-daily research refresh now independently refreshes cached personnel sources and builds availability, even if salary refresh fails. No new Cron, migrations, account actions or paid source. Historical player opportunity snapshots keep their own vintage; refreshing injury evidence does not pretend to refit projections or historical means. Rebuild the player inputs explicitly when updating those assumptions.

## States and controls

| State | P(active) prior | Workload if active | Interpretation |
|---|---:|---:|---|
| ACTIVE | 1 | 1 | Full practice/current designation, or explicit scenario |
| LIMITED | 1 | 0.70 | Default practice-only sensitivity assumption; editable in scenarios |
| QUESTIONABLE | 0.75 | 1 | Official designation; probability is an unfitted prior |
| DOUBTFUL | 0.25 | 1 | Official designation; probability is an unfitted prior |
| OUT / IR/PUP / SUSPENDED / INACTIVE | 0 | 0 | Excluded from workload |
| UNKNOWN | 1 | 1 | Active roster, no matched injury designation; preserve baseline with low confidence |

These probabilities and workload multipliers are **model assumptions, not medical estimates supplied by the NFL**. A limited or missed practice is not a confirmed gameday workload restriction. The UI explicitly distinguishes official practice evidence, official game status, and user scenarios. Deterministic expected participation is `P(active) × workload if active`; per-game active/inactive sampling is a later extension. Thus questionable-player tails currently do not include a discrete non-playing mass.

Use the player selector, choose baseline, ACTIVE/full, LIMITED with 0–100%, or OUT, then **Apply & rerun**. Multiple player overrides accumulate; reset restores source evidence. Controls cover fantasy players and supported OL/defensive depth players. Overrides are ephemeral, validated against the selected matchup, and never alter an official snapshot. Missing QB/recipient evidence stops the scenario with an explicit explanation rather than silently dropping team opportunities.

## Expected units and contribution weights

Current depth order controls starter/backup selection. Madden values never select starters. OUT starters are removed before unit ratings are calculated. Available backups absorb vacant role weight in depth order. LIMITED players retain their reduced contribution and cannot regain it through normalization. Duplicate assignments are capped at one role-equivalent contribution per player within a unit; unfilled weight remains missing evidence.

* **OL:** all LT/LG/C/RG/RT slots; 100% primary-role weight, with availability-driven backup substitution. Pass protection weights tackles 1.2 and interior roles 1; run blocking weights each role 1. Missing actual starters remain in the denominator. A reserve with no expected OL contribution does not disable a healthy starting five.
* **Pass rush:** relevant current edges/interior DL and 3–4 outside linebackers. Depth rotation prior 70/20/10%, with role weights (edge 1, DT .7, NT .6).
* **Run front:** DL and relevant linebackers; the same rotation prior, position-role weights .85–1.
* **Secondary/man/zone:** CB, S and nickel where listed; depth rotation prior 90/10%, outside CB weight 1, safety .95, nickel .65.
* **Receiving:** all positive adjusted target-share RB/WR/TE contributors, weighted by target share. Routes are unavailable and are not relabeled as observed routes.

Mapped archived defensive snap shares modify rotation weights. Only positive-snap regular-season games strictly before the modeled season/week are eligible; recency halves every eight weeks and prior-team evidence receives .35 weight. Each observed share is shrunk toward its depth prior with five weighted games of prior strength, then normalized within the role. Additional depth reserves with relevant snap evidence can contribute. All locally available `snaps-*.csv` archives are considered; current-season files enter when available. Offensive snap history is displayed as context, not a forecast of exact gameday snaps. Current depth remains authoritative for OL roles; historical usage is not grounds to replace a newly named starter.

Weights are explicit, unfitted priors in `config/v2-availability.json`. They are a transparent starting point, not measured 2026 snap or pass-rush forecasts. Unit panels show every included player, role, weight, attributes, state, substitution, historical snap evidence and exact missing IDs/attributes.

## Coverage and bounded modifiers

Weighted coverage is rated, corroborated expected contribution divided by **all** expected contribution, including missing roles. The observed composite uses only supported ratings. No average Madden value is imputed to missing players.

* At least **90%**: full bounded modifier.
* **70–90%**: modifier scaled by observed coverage.
* Below **70%**: disabled with exact missing players/evidence.

This permits small reserve gaps while requiring a substantial observed majority. The 90/70 breakpoints are reviewable engineering priors, not calibrated confidence levels. For a matchup channel, the lower of the two unit scales applies. Diagnostics show raw rating differences, scaling, pressure/completion probability changes, distribution tilts and simulated sacks. Existing Madden caps still apply after scaling. Current incomplete cases remain visible; the old first-string audit is retained in a collapsed historical panel.

## Workload conservation

Baseline normal/red-zone/goal-line carry and target shares reuse V2-C's recency-weighted NFL play-by-play, prior-team downweighting, projection/depth fallback and low-volume residual controls. Madden does not set shares. QB pressure/scramble tendencies retain their historical input; available depth backups receive the vacated dropback share. Backup-specific pressure/scramble history is not yet fitted, and fallback inputs are flagged.

For each of the six opportunity pools independently:

1. Retain each player's baseline share multiplied by expected participation.
2. Record the removed share by donor.
3. Distribute it to fully participating eligible teammates in proportion to that opportunity's baseline share (minimum .001), position-role weight and starter/reserve factor (1/.8).
4. Assert the adjusted pool sums to exactly one within numerical tolerance.

Carry redistribution favors RBs (RB 1, QB/WR .1, TE .02). Target redistribution spans receivers, tight ends and backs (WR 1, TE .7, RB .3, QB 0). Red-zone/goal-line pools use their own historical baselines, so transfers can differ. New active depth reserves absent from the older player snapshot have zero baseline share and a small redistribution prior, explicitly flagged. A LIMITED player never absorbs its own reduction; if there is no fully available eligible recipient, the run asks for a usable scenario rather than inventing one.

The player explanation shows baseline and adjusted shares, deltas, **actual donor-to-recipient transfers**, source timestamp, official/scenario state, participation assumptions, snap context, personnel effects and DK quantiles. OUT players stay visible in the active-personnel audit with zero shares but do not appear in simulated player boxes.

## Reproduction and results

```sh
python3 scripts/import_personnel.py
python3 scripts/build_v2_availability.py
node scripts/report_v2_d.mjs
npm run drive-lab:build
npm run check
npm test
```

The all-team and 10,000-game scenario receipt is [simulation-v2-d-report.json](simulation-v2-d-report.json). The immutable pre-implementation audit is [v2-d-previous-gap-audit.json](v2-d-previous-gap-audit.json). Run identity includes injury, roster, Madden, player/projection and empirical snapshots, configuration, evaluation timestamp, scenario fingerprint and seed.

## Limits and next milestone

Practice restrictions remain uncertain before gameday. UNKNOWN is common because an active roster is not a final inactive list. Official inactive-list ingestion and calibrated return-to-play probabilities are not yet available. Historical snap counts help rotations but are not routes, rush assignments, current coaching-system forecasts or individual coverage matchups. No discrete per-game availability sampling, defensive fantasy scoring, ownership, field simulation, win probability or wagering is added.

The smallest next step is a frozen **availability-to-actual-workload evaluation**: compare pregame status/scenario assumptions against final active flags, snaps, carries and targets after games finish, then fit the practice-only multipliers and redistribution priors. Do not proceed automatically beyond V2.0-D.

## Release audit and real-matchup scenario

Availability observed 2026-09-10T14:28:16.689424+00:00; roster 2026-09-10T14:31:43.178976+00:00. 2748 canonical roster records; 139 matched official injury-report players across 30 tables; 1701 players have usable historical snap context. Status counts: UNKNOWN 1551, INACTIVE 819, LIMITED 81, ACTIVE 50, IR/PUP 239, SUSPENDED 6, OUT 1, QUESTIONABLE 1.

Old partial and disabled overlap: an incomplete old unit was disabled even with a partial rating. Six channels are counted; man/zone share the secondary channel. Exact names and IDs remain in the linked JSON audit.

| Team | Old complete | Old partial | Old disabled | Current full | Current scaled | Current disabled | Prior causes |
|---|---:|---:|---:|---:|---:|---:|---|
| ARI | 6 | 0 | 0 | 6 | 0 | 0 | missing Madden mapping |
| ATL | 4 | 2 | 2 | 4 | 2 | 0 | missing Madden mapping |
| BAL | 6 | 0 | 0 | 6 | 0 | 0 | None |
| BUF | 6 | 0 | 0 | 6 | 0 | 0 | missing Madden mapping |
| CAR | 5 | 1 | 1 | 4 | 2 | 0 | missing Madden mapping |
| CHI | 6 | 0 | 0 | 6 | 0 | 0 | None |
| CIN | 6 | 0 | 0 | 6 | 0 | 0 | missing Madden mapping |
| CLE | 6 | 0 | 0 | 4 | 2 | 0 | None |
| DAL | 6 | 0 | 0 | 6 | 0 | 0 | missing Madden mapping |
| DEN | 6 | 0 | 0 | 6 | 0 | 0 | None |
| DET | 4 | 2 | 2 | 4 | 2 | 0 | missing roster evidence; missing Madden mapping |
| GB | 3 | 3 | 3 | 1 | 5 | 0 | missing Madden mapping |
| HOU | 5 | 1 | 1 | 5 | 1 | 0 | missing Madden mapping |
| IND | 6 | 0 | 0 | 5 | 1 | 0 | missing Madden mapping |
| JAX | 5 | 1 | 1 | 4 | 2 | 0 | missing Madden mapping |
| KC | 6 | 0 | 0 | 6 | 0 | 0 | None |
| LA | 0 | 0 | 6 | 6 | 0 | 0 | missing Madden mapping; missing starter |
| LAC | 6 | 0 | 0 | 6 | 0 | 0 | None |
| LV | 6 | 0 | 0 | 6 | 0 | 0 | missing Madden mapping |
| MIA | 2 | 4 | 4 | 2 | 3 | 1 | missing roster evidence; missing Madden mapping |
| MIN | 5 | 1 | 1 | 5 | 0 | 1 | missing roster evidence; missing Madden mapping |
| NE | 6 | 0 | 0 | 6 | 0 | 0 | missing Madden mapping |
| NO | 4 | 2 | 2 | 4 | 2 | 0 | missing Madden mapping |
| NYG | 0 | 0 | 6 | 5 | 1 | 0 | missing Madden mapping |
| NYJ | 0 | 0 | 6 | 5 | 1 | 0 | missing Madden mapping |
| PHI | 4 | 2 | 2 | 4 | 2 | 0 | missing roster evidence; missing Madden mapping |
| PIT | 4 | 2 | 2 | 4 | 2 | 0 | missing Madden mapping |
| SEA | 6 | 0 | 0 | 5 | 1 | 0 | missing Madden mapping |
| SF | 6 | 0 | 0 | 6 | 0 | 0 | None |
| TB | 6 | 0 | 0 | 6 | 0 | 0 | None |
| TEN | 6 | 0 | 0 | 6 | 0 | 0 | missing Madden mapping |
| WAS | 6 | 0 | 0 | 6 | 0 | 0 | missing Madden mapping |

Current disabled channels:

* **MIA pass_rush**, 49.1% weighted evidence: LDE Malik Herring (00-0036682): missing corroborated Madden mapping; weight 0.257; LDT Jordan Phillips (missing:MIA:2:1): missing canonical roster evidence; weight 0.392; LDT Keith Cooper Jr. (00-0040655): missing corroborated Madden mapping; weight 0.308; RDE Josh Uche (missing:MIA:4:1): missing canonical roster evidence; weight 0.775.
* **MIN secondary**, 68.9% weighted evidence: SS Joshua Metellus (missing:MIN:9:1): missing canonical roster evidence; weight 0.736; FS Harrison Smith (00-0029606): missing corroborated Madden mapping; weight 0.677.

**NO at DET, September 13, 2026:** 10,000 games per scenario, low personnel influence, seed `v2-d-review`. Gibbs OUT is a **hypothetical sensitivity experiment**, not an injury news claim. Baseline includes current practice assumptions for both teams.

| Player | Carries before → OUT | Targets before → OUT | DK mean before → OUT | DK P90 before → OUT |
|---|---:|---:|---:|---:|
| Jared Goff | 0.97 → 1.27 | 0.00 → 0.00 | 14.34 → 14.62 | 22.72 → 23.02 |
| Amon-Ra St. Brown | 0.11 → 0.14 | 8.87 → 10.71 | 15.06 → 18.44 | 26.30 → 30.80 |
| Jacob Saylors | 4.83 → 16.49 | 0.83 → 0.88 | 4.50 → 12.52 | 10.20 → 22.60 |
| Sam LaPorta | 0.00 → 0.00 | 5.46 → 6.27 | 8.95 → 10.42 | 16.70 → 19.20 |
| Jahmyr Gibbs | 16.82 → 0.00 | 4.38 → 0.00 | 18.33 → 0.00 | 30.20 → 0.00 |
| Sione Vaki | 1.95 → 6.65 | 0.36 → 0.37 | 1.85 → 4.84 | 5.21 → 10.60 |

Gibbs is removed. Saylors and Vaki receive most vacated carries; targets spread across the remaining receiving group. These are modeled allocations, not a coaching announcement. OL/front/secondary personnel stay the same in this skill-player scenario; receiving membership excludes Gibbs and uses adjusted target shares. Separate substitution tests cover LT, CB and EDGE injuries.

| DET unit | Before | Gibbs OUT |
|---|---:|---:|
| pass_protection | 79.65 | 79.65 |
| run_block | 83.47 | 83.47 |
| pass_rush | 77.96 | 77.96 |
| run_front | 80.57 | 80.57 |
| secondary | 76.67 | 76.67 |
| receiving | 81.90 | 83.77 |

Runtime: baseline 4.69s, OUT 4.79s locally. Exact active player membership, weights and opportunity deltas are in the JSON receipt. A receiving composite can rise when workload moves toward higher-rated pass catchers; this does not establish that an injury improves a real offense.

## Verification

218 tests pass (128 Node + 90 Python), including 35 additions for availability/source parsing, status inference, exact workload conservation, LT/CB/EDGE/QB substitution, weighted coverage, missing reserves, immutable scenarios, snap evidence, stale metadata and reproducibility. TypeScript passes. Browser checks confirm a 50% LIMITED scenario reruns and shows its official baseline, user override and reduced shares. The existing 183 tests remain passing.

Published on both existing custom domains as Cloudflare version `f712de41-2b14-46e5-b989-19c276e7cacf`. The deployment updates static Drive Lab assets; D1 schema and production Cron configuration are unchanged.
