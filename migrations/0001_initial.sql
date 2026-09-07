PRAGMA foreign_keys = ON;

-- `teams` and `players` already exist in playerprop-db. The prop tables below
-- deliberately use their established primary-key and column names.

CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,
  season_type TEXT NOT NULL DEFAULT 'REG',
  kickoff_at TEXT,
  home_team_id TEXT NOT NULL REFERENCES teams(team_id),
  away_team_id TEXT NOT NULL REFERENCES teams(team_id),
  UNIQUE(season, week, season_type, home_team_id, away_team_id)
);
CREATE INDEX IF NOT EXISTS idx_games_season_week ON games(season, week, season_type);

CREATE TABLE IF NOT EXISTS player_game_stats (
  player_id TEXT NOT NULL REFERENCES players(player_id),
  game_id TEXT NOT NULL REFERENCES games(id),
  team_id TEXT NOT NULL REFERENCES teams(team_id),
  opponent_team_id TEXT NOT NULL REFERENCES teams(team_id),
  position TEXT NOT NULL,
  passing_yards REAL NOT NULL DEFAULT 0,
  passing_touchdowns REAL NOT NULL DEFAULT 0,
  rushing_yards REAL NOT NULL DEFAULT 0,
  rushing_touchdowns REAL NOT NULL DEFAULT 0,
  receptions REAL NOT NULL DEFAULT 0,
  receiving_yards REAL NOT NULL DEFAULT 0,
  receiving_touchdowns REAL NOT NULL DEFAULT 0,
  targets REAL,
  carries REAL,
  snaps REAL,
  routes REAL,
  source TEXT NOT NULL DEFAULT 'nflverse',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(player_id, game_id)
);
CREATE INDEX IF NOT EXISTS idx_player_game_stats_matchup ON player_game_stats(opponent_team_id, position);
CREATE INDEX IF NOT EXISTS idx_player_game_stats_player ON player_game_stats(player_id, game_id);

CREATE TABLE IF NOT EXISTS prop_lines (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  player_id TEXT NOT NULL REFERENCES players(player_id),
  sportsbook TEXT NOT NULL,
  market_key TEXT NOT NULL,
  line REAL NOT NULL,
  over_price INTEGER,
  under_price INTEGER,
  fetched_at TEXT NOT NULL,
  UNIQUE(game_id, player_id, sportsbook, market_key, line, fetched_at)
);
CREATE INDEX IF NOT EXISTS idx_prop_lines_game_market ON prop_lines(game_id, market_key, fetched_at DESC);

CREATE TABLE IF NOT EXISTS matchup_signals (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  player_id TEXT NOT NULL REFERENCES players(player_id),
  prop_line_id TEXT REFERENCES prop_lines(id),
  market_key TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('over', 'under', 'neutral')),
  score REAL NOT NULL,
  confidence REAL NOT NULL,
  summary TEXT NOT NULL,
  factors_json TEXT NOT NULL,
  model_version TEXT NOT NULL,
  calculated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_matchup_signals_board ON matchup_signals(game_id, score DESC, calculated_at DESC);

CREATE TABLE IF NOT EXISTS ingest_runs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  records_received INTEGER NOT NULL DEFAULT 0,
  details_json TEXT
);
