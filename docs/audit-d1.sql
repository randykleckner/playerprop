-- Read-only follow-up audit. No provider API requests or database writes.
SELECT name, type, sql FROM sqlite_master
WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name;
PRAGMA table_info(teams);
PRAGMA table_info(players);
PRAGMA foreign_key_check;
SELECT name, applied_at FROM d1_migrations ORDER BY id;
SELECT g.season, g.season_type, COUNT(DISTINCT g.id) AS games,
  COUNT(*) AS player_game_rows, MIN(s.updated_at) AS first_update,
  MAX(s.updated_at) AS latest_update
FROM player_game_stats s JOIN games g ON g.id=s.game_id
GROUP BY g.season, g.season_type;
SELECT season, COUNT(*) AS games, SUM(kickoff_at IS NULL) AS missing_kickoff
FROM games GROUP BY season;
SELECT provider, COUNT(*) AS events, MAX(fetched_at) AS latest_fetch FROM odds_events GROUP BY provider;
SELECT provider, market_key, COUNT(*) AS observations, COUNT(DISTINCT sportsbook) AS books,
  MIN(captured_at) AS earliest_capture, MAX(captured_at) AS latest_capture
FROM odds_player_props GROUP BY provider, market_key;
SELECT 'teams' AS table_name, COUNT(*) AS rows FROM teams
UNION ALL SELECT 'players', COUNT(*) FROM players
UNION ALL SELECT 'prop_lines', COUNT(*) FROM prop_lines
UNION ALL SELECT 'matchup_signals', COUNT(*) FROM matchup_signals
UNION ALL SELECT 'ingest_runs', COUNT(*) FROM ingest_runs;
SELECT 'player_game_availability' AS table_name, COUNT(*) AS rows FROM player_game_availability
UNION ALL SELECT 'player_game_roles', COUNT(*) FROM player_game_roles
UNION ALL SELECT 'team_game_context', COUNT(*) FROM team_game_context;
SELECT COUNT(*) AS seasons FROM seasons;
SELECT season, COUNT(*) AS duplicate_matchup_groups, SUM(n-1) AS extra_rows
FROM (
  SELECT season, week, season_type, MIN(home_team_id,away_team_id),
    MAX(home_team_id,away_team_id), COUNT(*) AS n
  FROM games GROUP BY 1,2,3,4,5 HAVING COUNT(*)>1
) GROUP BY season;
SELECT season, COUNT(*) AS games, SUM(home_team_id=away_team_id) AS self_matchups,
  MIN(week) AS first_week, MAX(week) AS last_week, COUNT(DISTINCT week) AS weeks
FROM games GROUP BY season;
SELECT COUNT(*) AS duplicate_player_weeks FROM (
  SELECT s.player_id, g.season, g.week, g.season_type, COUNT(*) AS n
  FROM player_game_stats s JOIN games g ON g.id=s.game_id
  GROUP BY 1,2,3,4 HAVING COUNT(*)>1
);
SELECT COUNT(*) AS availability_rows, SUM(reported_at IS NULL) AS missing_reported_at FROM player_game_availability;
SELECT COUNT(*) AS role_rows, SUM(routes_run IS NOT NULL) AS with_routes,
  SUM(snap_share IS NOT NULL) AS with_snap_share FROM player_game_roles;
SELECT COUNT(*) AS context_rows, SUM(head_coach IS NOT NULL) AS with_head_coach,
  SUM(offensive_play_caller IS NOT NULL) AS with_play_caller FROM team_game_context;
