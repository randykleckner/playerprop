# Live D1 audit — 2026-09-05 America/Chicago

Verified through the authenticated Cloudflare dashboard SQL console, completed around 2026-09-06 03:25 UTC. Database: `playerprop-db`, UUID `15198033-dca2-42cd-bd14-f7fa22bb9d93`. Only SELECT/schema inspection queries were executed. No migration, data repair, deployment or provider refresh was performed. This is a sequence of observations, not a transactionally consistent backup.

## Schema and migrations

Migrations 0001–0005 are applied. The first four were applied September 3 UTC; 0005 was applied September 4 at 14:08:05 UTC. Migration 0006 is not applied and neither DFS table exists.

Live application tables: teams, players, seasons, games, player_game_stats, prop_lines, matchup_signals, ingest_runs, odds_events, odds_player_props, player_game_availability, player_game_roles, team_game_context. Internal tables: d1_migrations and _cf_KV. No application triggers or views were returned. The missing legacy parent definitions and their explicit indexes are recorded in `d1-observed-legacy-schema.sql`; this is a schema reference, not a production migration or full backup.

`pragma_foreign_key_check` returned no violations. This does not establish semantic game correctness.

## Stored coverage

| Measurement | 2024 REG | 2025 REG |
| --- | ---: | ---: |
| Game records with player stats | 551 | 272 |
| Player-game stat rows | 5,340 | 18,522 |
| Weeks represented | 1–18 | 1–18 |
| Missing kickoff timestamps | 551 | 272 |
| Duplicate unordered matchup groups within season/week/type | 272 | 0 |
| Extra game rows in those groups | 272 | 0 |
| Games with identical home and away team | 7 | 0 |

No 2026 game records were returned. The 2024 count must not be interpreted as 551 real games. After grouping by unordered team pair, there are 272 duplicated matchup groups plus seven self-matchup records. There are zero repeated player/season/week/type groups in player_game_stats, so duplicated game identities do not by themselves prove duplicated player-stat rows. Reconciliation requires authoritative schedule IDs and a reviewed mapping of every dependent record; blindly deleting duplicates is unsafe.

Latest stats update: 2024 at `2026-09-03 17:27:29`; 2025 at `2026-09-03 17:37:58`. These are storage updates, not original source availability dates or proof of complete scoring coverage.

| Table | Rows / completeness |
| --- | --- |
| teams | 32 |
| players | 2,145 |
| seasons | 3 |
| prop_lines | 0 |
| matchup_signals | 0 |
| ingest_runs | 0 |
| player_game_availability | 5,581; all missing reported_at |
| player_game_roles | 20,490; all have snap_share; none have routes_run |
| team_game_context | 544; all have head_coach; none have offensive_play_caller |

Latest availability, role and context updates respectively: September 4 UTC at 14:36:41, 14:37:29 and 14:37:32. Empty canonical prop/signal tables do not imply the live board is empty: its current calculation uses odds_player_props directly.

## Odds history

SportsGameOdds has 32 events and 2,731 observations across 14 market keys. All observations share the single capture timestamp `2026-09-03T17:59:48.691Z`; event freshness is the same. This is insufficient for historical movement or point-in-time odds backtests.

| Market | Observations | Distinct books |
| --- | ---: | ---: |
| defense_sacks | 12 | 1 |
| passing+rushing_yards | 25 | 3 |
| passing_attempts | 27 | 1 |
| passing_completions | 27 | 1 |
| passing_touchdowns | 131 | 5 |
| passing_yards | 135 | 5 |
| points | 484 | 7 |
| receiving_longestReception | 68 | 1 |
| receiving_receptions | 367 | 5 |
| receiving_yards | 391 | 5 |
| rushing+receiving_yards | 26 | 3 |
| rushing_attempts | 30 | 1 |
| rushing_yards | 223 | 5 |
| touchdowns | 785 | 4 |

## Next work and user input

1. Prepare and test an authoritative schedule importer and a non-destructive reconciliation report for 2024, including the seven self-matchups. Add verified kickoff times and current-season schedule coverage before matching DFS games. Production repair remains a separate reviewed write operation.
2. Build a reproducible local schema from the observed legacy definitions plus migrations, and validate the existing salary foundation against it. Preserve the distinction between schema recovery and recovery of historical source snapshots.
3. Obtain a real DraftKings Classic salary CSV from the user, with target season/week, slate name or ID and verified lock time/timezone. This is the next needed user input; additional Cloudflare access is not needed to finish this audit or prepare local changes.
4. After local validation, present the exact production migration/deployment and any repair plan for approval. The current authorization is read-only; do not apply 0006 or repair live data under it.

Re-run checks in `audit-d1.sql` when preparing deployment. A console query with seven UNION branches failed with `too many terms in compound SELECT`; it made no changes. The checked-in audit now uses smaller compound queries.
