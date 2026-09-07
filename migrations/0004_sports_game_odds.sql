CREATE TABLE IF NOT EXISTS odds_events (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  commence_at TEXT,
  home_team_name TEXT,
  away_team_name TEXT,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY(provider, event_id)
);

CREATE TABLE IF NOT EXISTS odds_player_props (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  odd_id TEXT NOT NULL,
  player_source_id TEXT,
  player_name TEXT,
  market_key TEXT NOT NULL,
  sportsbook TEXT NOT NULL,
  line REAL NOT NULL,
  over_price INTEGER,
  under_price INTEGER,
  captured_at TEXT NOT NULL,
  PRIMARY KEY(provider, event_id, odd_id, sportsbook, captured_at),
  FOREIGN KEY(provider, event_id) REFERENCES odds_events(provider, event_id)
);
CREATE INDEX IF NOT EXISTS idx_odds_player_props_lookup ON odds_player_props(event_id, market_key, captured_at DESC);
