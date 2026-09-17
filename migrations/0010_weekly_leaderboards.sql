-- Supplemental actuals use the existing player/game/team identities. NULL means unknown.
ALTER TABLE player_game_stats ADD COLUMN passing_interceptions REAL;
ALTER TABLE player_game_stats ADD COLUMN fumbles_lost REAL;
CREATE TABLE team_game_fantasy_stats (
  game_id TEXT NOT NULL REFERENCES games(id),
  team_id TEXT NOT NULL REFERENCES teams(team_id),
  sacks REAL NOT NULL, interceptions REAL NOT NULL, recoveries REAL NOT NULL,
  defensive_tds REAL NOT NULL, points_allowed REAL NOT NULL,
  PRIMARY KEY(game_id, team_id)
);
-- A trusted importer attests full schedule + final-stat coverage, never inferred from kickoff.
CREATE TABLE leaderboard_week_readiness (
  season INTEGER NOT NULL, week INTEGER NOT NULL CHECK(week BETWEEN 1 AND 18),
  game_ids_json TEXT NOT NULL, source TEXT NOT NULL, finalized_at TEXT NOT NULL,
  PRIMARY KEY(season, week)
);
-- Atomic JSON document preserves names, team, scores and media at publication time.
CREATE TABLE weekly_leaderboards (
  season INTEGER NOT NULL, week INTEGER NOT NULL CHECK(week BETWEEN 1 AND 18),
  status TEXT NOT NULL CHECK(status = 'ready'), generated_at TEXT NOT NULL,
  scoring_version TEXT NOT NULL, snapshot_json TEXT NOT NULL,
  PRIMARY KEY(season, week)
);
CREATE TABLE leaderboard_hero_media (
  season INTEGER NOT NULL, week INTEGER NOT NULL,
  player_id TEXT NOT NULL REFERENCES players(player_id), game_id TEXT NOT NULL REFERENCES games(id),
  kind TEXT NOT NULL CHECK(kind IN ('game-action','approved-media')),
  url TEXT NOT NULL, source TEXT NOT NULL, source_url TEXT NOT NULL,
  hero_focal_x REAL NOT NULL DEFAULT 50 CHECK(hero_focal_x BETWEEN 0 AND 100),
  hero_focal_y REAL NOT NULL DEFAULT 50 CHECK(hero_focal_y BETWEEN 0 AND 100),
  selected_at TEXT NOT NULL,
  PRIMARY KEY(season, week, player_id, kind)
);
