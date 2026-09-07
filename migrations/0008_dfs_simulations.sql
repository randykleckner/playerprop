-- Summary-only, immutable research runs. Independent of production player mapping.
CREATE TABLE IF NOT EXISTS dfs_simulation_runs (
 run_id TEXT PRIMARY KEY, slate_id TEXT NOT NULL, model_version TEXT NOT NULL,
 simulation_count INTEGER NOT NULL CHECK(simulation_count>0), seed TEXT NOT NULL,
 input_fingerprint TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 started_at TEXT NOT NULL, completed_at TEXT NOT NULL, data_as_of TEXT, configuration_json TEXT NOT NULL CHECK(json_valid(configuration_json)), status TEXT NOT NULL DEFAULT 'completed' CHECK(status='completed'),
 summary_json TEXT NOT NULL CHECK(json_valid(summary_json))
);
CREATE INDEX IF NOT EXISTS dfs_simulation_slate ON dfs_simulation_runs(slate_id,created_at);
CREATE TABLE IF NOT EXISTS dfs_simulation_player_summaries (
 run_id TEXT NOT NULL REFERENCES dfs_simulation_runs(run_id), player_id TEXT NOT NULL,
 mean REAL NOT NULL, median REAL NOT NULL, stddev REAL NOT NULL, p10 REAL NOT NULL,p25 REAL NOT NULL,p75 REAL NOT NULL,p90 REAL NOT NULL,p95 REAL NOT NULL, probability_2x REAL,probability_3x REAL,probability_4x REAL,
 PRIMARY KEY(run_id,player_id)
);
CREATE TRIGGER IF NOT EXISTS dfs_simulation_expand AFTER INSERT ON dfs_simulation_runs BEGIN
 INSERT INTO dfs_simulation_player_summaries
 SELECT NEW.run_id,json_extract(value,'$.player_id'),json_extract(value,'$.mean'),json_extract(value,'$.median'),json_extract(value,'$.stddev'),json_extract(value,'$.p10'),json_extract(value,'$.p25'),json_extract(value,'$.p75'),json_extract(value,'$.p90'),json_extract(value,'$.p95'),json_extract(value,'$.probability_2x'),json_extract(value,'$.probability_3x'),json_extract(value,'$.probability_4x') FROM json_each(NEW.summary_json,'$.players');
END;
CREATE TRIGGER IF NOT EXISTS dfs_simulation_no_update BEFORE UPDATE ON dfs_simulation_runs BEGIN SELECT RAISE(ABORT,'Immutable simulation'); END;
CREATE TRIGGER IF NOT EXISTS dfs_simulation_no_delete BEFORE DELETE ON dfs_simulation_runs BEGIN SELECT RAISE(ABORT,'Immutable simulation'); END;
CREATE TRIGGER IF NOT EXISTS dfs_simulation_player_no_update BEFORE UPDATE ON dfs_simulation_player_summaries BEGIN SELECT RAISE(ABORT,'Immutable simulation'); END;
CREATE TRIGGER IF NOT EXISTS dfs_simulation_player_no_delete BEFORE DELETE ON dfs_simulation_player_summaries BEGIN SELECT RAISE(ABORT,'Immutable simulation'); END;
