-- Local-first personnel evidence; no automatic production migration.
CREATE TABLE IF NOT EXISTS personnel_rating_snapshots (
 id TEXT PRIMARY KEY, provider TEXT NOT NULL, game_title TEXT NOT NULL,
 captured_at TEXT NOT NULL, source_version TEXT, player_count INTEGER NOT NULL,
 roster_at TEXT NOT NULL, depth_at TEXT NOT NULL, sources_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS personnel_player_ratings (
 snapshot_id TEXT NOT NULL REFERENCES personnel_rating_snapshots(id),
 external_player_id TEXT NOT NULL, canonical_player_id TEXT, name TEXT NOT NULL,
 team TEXT, position TEXT NOT NULL, overall REAL CHECK(overall BETWEEN 0 AND 99),
 mapping_status TEXT NOT NULL CHECK(mapping_status IN ('verified','strongly_corroborated','provisional','unresolved')),
 mapping_confidence REAL CHECK(mapping_confidence BETWEEN 0 AND 1),
 throw_power REAL CHECK(throw_power BETWEEN 0 AND 99),
 short_accuracy REAL CHECK(short_accuracy BETWEEN 0 AND 99),
 medium_accuracy REAL CHECK(medium_accuracy BETWEEN 0 AND 99),
 deep_accuracy REAL CHECK(deep_accuracy BETWEEN 0 AND 99),
 under_pressure REAL CHECK(under_pressure BETWEEN 0 AND 99),
 awareness REAL CHECK(awareness BETWEEN 0 AND 99),
 speed REAL CHECK(speed BETWEEN 0 AND 99),
 acceleration REAL CHECK(acceleration BETWEEN 0 AND 99),
 strength REAL CHECK(strength BETWEEN 0 AND 99),
 carrying REAL CHECK(carrying BETWEEN 0 AND 99),
 catching REAL CHECK(catching BETWEEN 0 AND 99),
 pass_block REAL CHECK(pass_block BETWEEN 0 AND 99),
 pass_block_power REAL CHECK(pass_block_power BETWEEN 0 AND 99),
 pass_block_finesse REAL CHECK(pass_block_finesse BETWEEN 0 AND 99),
 run_block REAL CHECK(run_block BETWEEN 0 AND 99),
 run_block_power REAL CHECK(run_block_power BETWEEN 0 AND 99),
 run_block_finesse REAL CHECK(run_block_finesse BETWEEN 0 AND 99),
 impact_blocking REAL CHECK(impact_blocking BETWEEN 0 AND 99),
 power_moves REAL CHECK(power_moves BETWEEN 0 AND 99),
 finesse_moves REAL CHECK(finesse_moves BETWEEN 0 AND 99),
 block_shedding REAL CHECK(block_shedding BETWEEN 0 AND 99),
 pursuit REAL CHECK(pursuit BETWEEN 0 AND 99),
 tackling REAL CHECK(tackling BETWEEN 0 AND 99),
 play_recognition REAL CHECK(play_recognition BETWEEN 0 AND 99),
 man_coverage REAL CHECK(man_coverage BETWEEN 0 AND 99),
 zone_coverage REAL CHECK(zone_coverage BETWEEN 0 AND 99),
 press REAL CHECK(press BETWEEN 0 AND 99),
 attributes_json TEXT NOT NULL, evidence_json TEXT NOT NULL,
 PRIMARY KEY(snapshot_id,external_player_id)
);
CREATE INDEX IF NOT EXISTS personnel_canonical ON personnel_player_ratings(canonical_player_id,snapshot_id);
CREATE INDEX IF NOT EXISTS personnel_team_position ON personnel_player_ratings(snapshot_id,team,position);
CREATE TRIGGER IF NOT EXISTS personnel_snapshot_no_update BEFORE UPDATE ON personnel_rating_snapshots BEGIN SELECT RAISE(ABORT,'immutable personnel snapshot'); END;
CREATE TRIGGER IF NOT EXISTS personnel_ratings_no_update BEFORE UPDATE ON personnel_player_ratings BEGIN SELECT RAISE(ABORT,'immutable personnel rating'); END;
CREATE TRIGGER IF NOT EXISTS personnel_snapshots_no_delete BEFORE DELETE ON personnel_rating_snapshots BEGIN SELECT RAISE(ABORT, 'Immutable personnel snapshot'); END;
CREATE TRIGGER IF NOT EXISTS personnel_ratings_no_delete BEFORE DELETE ON personnel_player_ratings BEGIN SELECT RAISE(ABORT, 'Immutable personnel rating'); END;
