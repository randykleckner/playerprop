-- These tables hold the facts that turn a stat trend into a comparable matchup.
-- They are intentionally separate from box-score data: an inactive player, a
-- limited player, and a healthy starter must never be treated as the same role.

CREATE TABLE IF NOT EXISTS player_game_availability (
  player_id TEXT NOT NULL REFERENCES players(player_id),
  game_id TEXT NOT NULL REFERENCES games(id),
  team_id TEXT NOT NULL REFERENCES teams(team_id),
  availability_status TEXT NOT NULL CHECK(availability_status IN ('active', 'limited', 'questionable', 'out', 'inactive', 'unknown')),
  role_status TEXT NOT NULL DEFAULT 'unknown' CHECK(role_status IN ('starter', 'rotation', 'backup', 'unknown')),
  injury_description TEXT,
  practice_status TEXT,
  source TEXT NOT NULL,
  reported_at TEXT,
  notes TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (player_id, game_id)
);
CREATE INDEX IF NOT EXISTS idx_availability_game_team ON player_game_availability(game_id, team_id, availability_status);

CREATE TABLE IF NOT EXISTS player_game_roles (
  player_id TEXT NOT NULL REFERENCES players(player_id),
  game_id TEXT NOT NULL REFERENCES games(id),
  offensive_snaps REAL,
  snap_share REAL,
  routes_run REAL,
  route_share REAL,
  target_share REAL,
  carry_share REAL,
  red_zone_targets REAL,
  red_zone_carries REAL,
  source TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (player_id, game_id)
);
CREATE INDEX IF NOT EXISTS idx_player_roles_game ON player_game_roles(game_id, player_id);

CREATE TABLE IF NOT EXISTS team_game_context (
  team_id TEXT NOT NULL REFERENCES teams(team_id),
  game_id TEXT NOT NULL REFERENCES games(id),
  head_coach TEXT,
  offensive_coordinator TEXT,
  offensive_play_caller TEXT,
  quarterback_player_id TEXT REFERENCES players(player_id),
  offensive_system_label TEXT,
  source TEXT NOT NULL,
  notes TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (team_id, game_id)
);
CREATE INDEX IF NOT EXISTS idx_team_context_game ON team_game_context(game_id, team_id);
