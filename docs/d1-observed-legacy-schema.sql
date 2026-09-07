-- Observed verbatim from production sqlite_master on 2026-09-06 UTC.
-- Reference only: not a migration, full export, or authorization to execute.
CREATE TABLE teams ( team_id TEXT PRIMARY KEY, team_name TEXT NOT NULL, team_abbreviation TEXT NOT NULL, conference TEXT, division TEXT, location TEXT, nickname TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP );
CREATE TABLE players ( player_id TEXT PRIMARY KEY, display_name TEXT NOT NULL, first_name TEXT, last_name TEXT, position TEXT, position_group TEXT, jersey_number INTEGER, birth_date TEXT, height INTEGER, weight INTEGER, college_name TEXT, current_team_id TEXT, status TEXT, gsis_id TEXT, pfr_id TEXT, espn_id TEXT, nfl_id TEXT, ngs_id TEXT, pff_id TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP );
CREATE TABLE seasons ( season INTEGER PRIMARY KEY, start_date TEXT, end_date TEXT, is_current INTEGER DEFAULT 0 );
CREATE INDEX idx_teams_abbreviation ON teams(team_abbreviation);
CREATE INDEX idx_players_gsis_id ON players(gsis_id);
CREATE INDEX idx_players_pfr_id ON players(pfr_id);
CREATE INDEX idx_players_position ON players(position);
