# Data-readiness audit and implementation plan

September 7, 2026 Central. This records Step 1 findings before implementing automatic refresh, scoring, roster grading or Newsroom. The existing UI and engine are preserved at this checkpoint.

## Why STALE SNAPSHOT appears

`public/lineups/lineups.js` reads `public/lineups/latest.json`, a deployed static artifact, not a snapshot table. `scripts/build_dfs_lineups.mjs` generates it manually. It was generated September 6 at 19:05:54 UTC; salary capture was 13:50:03 UTC and projection capture 14:20:24 UTC. Expiry is the earliest of salary capture +24h, projection capture +24h, and slate lock: September 7 at 13:50:03 UTC (8:50 AM Central).

The warning's “builds over 24 hours old” wording is inaccurate: the source can expire before the generated build is 24 hours old. `generated_at` must not reset source freshness. Refreshing `public/simulation/slates/151307.json` on September 7 did not regenerate DFS Daily's separate artifact. Refreshing a browser fetches the same deployed file. The one-minute frontend timer only observes expiry/lock transitions.

No Cron, scheduled handler or external pipeline generates newer artifacts. Existing Python DK transport implements caching (six-hour discovery, two-hour salary refresh), lock stop, five-second request spacing and one-hour error backoff, but something must invoke it. Those durations are not an active schedule. SportsGameOdds also requires a manual protected refresh. Source archives are local ignored files; optional D1 tables 0006–0008 are not applied in production.

## What 744 represents

Newest audit salary response: one NFL Classic draft group 151307, 12 games, 1,372 raw draftables normalized to 744 player/DST entries. RB/WR/TE position/FLEX representations are combined. It is not a multi-slate comparison. Pool: QB 92, RB 161, WR 299, TE 168, DST 24. It includes disabled players, deep reserves and players without a usable projection.

The old displayed build excluded 53 disabled/unavailable, 245 missing matching projections and 117 unresolved identities. The refreshed audit excludes **200 disabled/unavailable, 194 without matching projections, 21 unresolved identities**; 329 remain (305 offensive candidates, 24 team defenses). Counts are first-failure categories, not overlapping diagnoses. Across all 720 offensive salary entries, 599 have unique name/team/position candidates and 121 are unresolved; this differs from the downstream eligible pool.

Existing filters reject non-NFL/non-Classic/single-game snapshots wholesale, check schedule pair/kickoff and stale sources, then availability/completeness/identity/projection. Duplicate canonical identities throw rather than being silently discarded. Missing salary and missing game context are grouped; OUT/IR/doubtful/disabled are grouped. There is no explicit per-row draft-group membership check, and no explicit invalid-position exclusion before the projection join. The selected endpoint supplies membership, but the next increment should validate normalized row membership against the selected draft group's competition set and report separate reasons.

## Mapping and projection truth

Resolution currently prefers stable namespaced IDs, then verified mapping rows, then normalized name/team/position candidates. Conflicts/collisions remain unresolved. Explicit manual alias evidence is not yet implemented. No DraftKings stable-ID bridge is available in the downloaded NFLverse catalog/crosswalk. ESPN-to-GSIS matches do not verify DK-to-GSIS matches. For the research pool, 253 provisional matches are corroborated and 52 require review. Zero offensive DK mappings are newly verified. Sportsbook prop joins use names/team separately; a three-provider stable crosswalk is not established.

Only ESPN supplies per-player forecasts. `statistical_projection` currently duplicates ESPN points, `final_projection` is ESPN, and `market_projection` is null. NFLverse prior-season snap context exists for 255 players; this is not an independent statistical points forecast. Captured game totals/spreads cover 12/12 games and influence simulation, but SportsGameOdds player props and current injuries do not feed the snapshot. Blending duplicated ESPN values as independent sources would overstate coverage.

## Planned next implementation, in order

1. One validated snapshot pipeline/pointer for DFS Daily and Simulation Lab, preserving immutable source/artifact versions. Separate generated, fetched, successfully checked and last-attempt timestamps. Content hashing skips unchanged recomputation; checks must not pretend unchanged older payloads were newly published.
2. CURRENT / AGING / STALE / FAILED readiness states with last-success fallback and explicit error/source timestamps. Lock is a separate state; stale inputs remain visibly stale. Distinguish missing source from stale source and from unavailable identity evidence.
3. More precise selected-slate exclusion and identity-confidence diagnostics. Stable/verified/provisional/ambiguous/unresolved counts stay separate; no invented numeric probability of identity correctness.
4. Independent NFLverse statistical and sportsbook-implied estimates only when required scoring/mapping/sample data exists. Preserve ESPN, market, statistical and blend separately, with component coverage and missingness.
5. An automated refresh runner appropriate for existing Python/Node jobs, conservative source schedules and content-change detection. The latest user brief authorizes automatic scheduling; earlier no-Cron restriction is superseded for this milestone. Production storage changes must be concrete, tested and reported. Do not put full Python ingestion or 10k simulations in a request Worker. GitHub authentication currently blocks a repository-backed scheduler; no schedule is claimed active.
6. Verify a fresh baseline, then implement configured player score, roster grading, Newsroom, and news-to-scenario links in that order. These features are not implemented by this audit.

The site should report selected-slate salary entities, verified/provisional/unresolved mapping counts, NFL stats coverage, game-market and player-prop coverage, current injury coverage, source projection coverage and artifact readiness independently. Forecast and contest accuracy claims remain gated by held-out validation.
