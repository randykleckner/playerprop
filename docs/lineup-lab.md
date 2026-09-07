# Lineup Lab

The frontend at `/lineups/` is linked from `/preview/`. It displays one maximum-mean lineup, two floor-focused alternatives, and three ceiling-focused game stacks for a saved upcoming NFL Classic slate. Root coming-soon and the existing prop board remain intact. No production deployment, remote D1 writes, scheduled refresh, or account actions were added.

## Build locally

Run the existing salary and projection diagnostics first. Save the public ESPN scoreboard for the same regular-season week, then generate a frontend snapshot:

```sh
curl -fsS 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=2026&seasontype=2&week=1&limit=100' -o /tmp/espn-week1.json
npm run dfs:lineups -- --salary PATH_TO_SALARY.json.gz --projections PATH_TO_PROJECTIONS.json.gz --schedule /tmp/espn-week1.json --allow-provisional
npm run dev
```

Open `/lineups/` on the local development server. `--output` overrides `public/lineups/latest.json`. The generator uses saved snapshots only. It checks the season/week, exact matchup and kickoff against the schedule, excludes unavailable/disabled/incomplete players, rejects ambiguous joins, duplicate canonical identities, stale inputs (>24h), future captures and locked slates. It requires six feasible distinct builds before atomically replacing the derived frontend file. Original ingestion snapshots remain immutable.

The default identity policy accepts only verified canonical joins and DST team identities. Current DraftKings name/team/position candidate matches require **explicit `--allow-provisional`**. That flag enables research previews only and never writes back to the verified mapping table. Production membership of the NFLverse catalog is still unverified. No claim is made that the included pool covers every playable athlete.

## Selection rules

All builds use an exact dynamic program over integer salaries: QB, 2 RB, 3 WR, TE, one RB/WR/TE FLEX, DST; 9 unique players; at least 2 teams; salary at most $50,000. The two-team rule follows [DraftKings Classic overview](https://help.draftkings.com/hc/en-us/articles/24807418578707-Game-Style-Classic-Overview-US). This is a research optimizer, not a contest-specific entry validator.

1. Projection leader: maximize ESPN-derived DraftKings mean points within the eligible pool. It need not spend exactly $50,000 if a better projection costs less.
2. Less touchdown dependent: maximize mean minus 50% of projected passing/rushing/receiving (or DST) touchdown points; exclude all reported injury designations.
3. Receiving opportunity: maximize mean minus 25% of touchdown points plus 0.35 per expected reception; exclude reported injury designations.
4. Three game stacks: choose the highest-projected feasible distinct quarterbacks; fix each quarterback, his highest-projected eligible WR/TE, and the highest-projected opposing RB/WR/TE. Maximize remaining mean points and exclude both game defenses.

If an alternative duplicates a previous roster, exclude its highest-salary non-required player and solve again until distinct. Therefore alternatives are optimal under their recorded exclusions, not globally optimal floor/ceiling outcomes. Rosters can overlap substantially. The output retains required/excluded IDs for auditing. All displayed point totals are unmodified mean estimates, never the strategy objective score.

Floor and ceiling are transparent **strategy proxies**. No top-10% chance, win chance, percentile forecast or simulated ceiling is available. ESPN is currently the sole projection source. Historical variance, ownership/field modeling, defensive adjustments and betting lines must be added and backtested before making those claims. ESPN-to-DraftKings scoring limitations are documented in [weekly projections](weekly-projections.md).

## Frontend freshness and availability

The snapshot records source hashes, capture timestamps, source count, scoring basis, model version, pool coverage, excluded counts and provisional identity flags. It expires at the earlier of 24 hours from either source capture or slate lock. The page marks stale research builds prominently, hides locked builds, handles missing/invalid data, and checks age transitions each minute. It does not call DraftKings or ESPN, refresh upstream feeds, submit lineups, or silently relabel an expired slate as next week.

## Initial observed result

September 6, 2026 snapshots, NFL Week 1, DraftKings group 151307, September 13 at 17:00 UTC, 12 games. ESPN schedule verified every included matchup/kickoff. Of 744 salary entries, 329 passed research checks (305 provisional offensive joins plus 24 DST). Rejected: 53 unavailable/disabled, 245 missing matching projections, 117 unresolved identities.

Six builds: leader 143.24 points / $50,000; floor strategies 139.49 and 139.38 / $50,000; PHI stack 138.29 / $49,900; BUF stack 134.78 / $50,000; BAL stack 136.76 / $50,000. These are snapshot estimates, not live recommendations.

Tests cover exact optimization against brute force, FLEX/cap/identity/team rules, required/excluded players, infeasibility, distinct builds, stacks, injury exclusions, recorded joins, week/freshness/lock gates, frontend tier counts, escaping and unavailable states. Tests do not use live endpoints.
