-- Additive only. Existing teams, players, games and ingest_runs are prerequisites.
CREATE TABLE dfs_slates (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL CHECK (provider = 'DraftKings'),
  season INTEGER NOT NULL CHECK (season BETWEEN 2000 AND 2100),
  week INTEGER NOT NULL CHECK (week BETWEEN 1 AND 18),
  slate_name TEXT NOT NULL,
  slate_date TEXT NOT NULL,
  lock_time TEXT NOT NULL,
  salary_cap INTEGER NOT NULL CHECK (salary_cap = 50000),
  roster_format TEXT NOT NULL CHECK (json_valid(roster_format)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_dfs_slates_week ON dfs_slates(season, week, lock_time);

-- Slate identity/lock/rules are immutable once created. Corrections need a new ID.
-- This also protects concurrent imports against silently changing a slate.
CREATE TRIGGER dfs_slates_immutable_metadata BEFORE UPDATE ON dfs_slates
WHEN NEW.id != OLD.id OR NEW.provider != OLD.provider OR NEW.season != OLD.season
  OR NEW.week != OLD.week OR NEW.slate_name != OLD.slate_name
  OR NEW.slate_date != OLD.slate_date OR NEW.lock_time != OLD.lock_time
  OR NEW.salary_cap != OLD.salary_cap OR NEW.roster_format != OLD.roster_format
BEGIN
  SELECT RAISE(ABORT, 'DFS slate metadata is immutable; use a new slate ID');
END;

-- A whole salary file is an immutable snapshot identified by an existing ingest_run.
-- Nullable canonical IDs explicitly represent unresolved identity, including DST.
CREATE TABLE dfs_player_salaries (
  slate_id TEXT NOT NULL REFERENCES dfs_slates(id),
  import_id TEXT NOT NULL REFERENCES ingest_runs(id),
  salary_key TEXT NOT NULL,
  player_id TEXT REFERENCES players(player_id),
  provider_player_id TEXT,
  player_name TEXT NOT NULL,
  team TEXT NOT NULL REFERENCES teams(team_id),
  opponent TEXT NOT NULL REFERENCES teams(team_id),
  position TEXT NOT NULL CHECK (position IN ('QB','RB','WR','TE','DST')),
  salary INTEGER NOT NULL CHECK (typeof(salary) = 'integer' AND salary > 0 AND salary <= 50000),
  game_id TEXT REFERENCES games(id),
  home_away TEXT CHECK (home_away IN ('home','away')),
  eligible_positions TEXT NOT NULL CHECK (json_valid(eligible_positions)),
  status TEXT,
  imported_at TEXT NOT NULL,
  available_at TEXT NOT NULL,
  PRIMARY KEY (slate_id, import_id, salary_key),
  UNIQUE (slate_id, import_id, player_id),
  CHECK (team != opponent),
  CHECK (position != 'DST' OR player_id IS NULL)
);
CREATE INDEX idx_dfs_salaries_as_of ON dfs_player_salaries(slate_id, available_at DESC, import_id);
CREATE INDEX idx_dfs_salaries_player ON dfs_player_salaries(player_id, slate_id);
