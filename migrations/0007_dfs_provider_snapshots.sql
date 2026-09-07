-- Provider observations precede the stricter, model-ready dfs_player_salaries contract.
-- Retain incomplete records and flags here; never silently turn them into eligible salaries.
CREATE TABLE dfs_provider_snapshots (
  snapshot_id TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  draft_group_id TEXT,
  slate_metadata_json TEXT NOT NULL CHECK(json_valid(slate_metadata_json)),
  record_count INTEGER NOT NULL CHECK(record_count > 0),
  raw_chunk_count INTEGER NOT NULL CHECK(raw_chunk_count > 0),
  raw_sha256 TEXT NOT NULL,
  complete INTEGER NOT NULL DEFAULT 0 CHECK(complete IN (0,1))
);
CREATE INDEX idx_dfs_provider_snapshot_group ON dfs_provider_snapshots(draft_group_id,fetched_at);
CREATE TABLE dfs_provider_salary_records (
  snapshot_id TEXT NOT NULL REFERENCES dfs_provider_snapshots(snapshot_id),
  ordinal INTEGER NOT NULL,
  record_json TEXT NOT NULL CHECK(json_valid(record_json)),
  PRIMARY KEY(snapshot_id,ordinal)
);
CREATE TABLE dfs_provider_raw_chunks (
  snapshot_id TEXT NOT NULL REFERENCES dfs_provider_snapshots(snapshot_id),
  ordinal INTEGER NOT NULL,
  gzip_base64 TEXT NOT NULL,
  PRIMARY KEY(snapshot_id,ordinal)
);
CREATE TABLE dfs_player_id_mappings (
  namespace TEXT NOT NULL,
  external_id TEXT NOT NULL,
  player_id TEXT NOT NULL REFERENCES players(player_id),
  verified INTEGER NOT NULL DEFAULT 0 CHECK(verified IN (0,1)),
  evidence TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(namespace,external_id)
);
CREATE TRIGGER dfs_provider_complete_guard BEFORE UPDATE ON dfs_provider_snapshots
WHEN OLD.complete=1 OR NEW.snapshot_id!=OLD.snapshot_id OR NEW.source!=OLD.source
  OR NEW.fetched_at!=OLD.fetched_at OR NEW.draft_group_id IS NOT OLD.draft_group_id
  OR NEW.slate_metadata_json!=OLD.slate_metadata_json OR NEW.record_count!=OLD.record_count
  OR NEW.raw_chunk_count!=OLD.raw_chunk_count OR NEW.raw_sha256!=OLD.raw_sha256
  OR (NEW.complete=1 AND (
    (SELECT COUNT(*) FROM dfs_provider_salary_records WHERE snapshot_id=OLD.snapshot_id)!=OLD.record_count
    OR (SELECT COUNT(*) FROM dfs_provider_raw_chunks WHERE snapshot_id=OLD.snapshot_id)!=OLD.raw_chunk_count))
BEGIN SELECT RAISE(ABORT,'Immutable or incomplete salary snapshot'); END;
CREATE TRIGGER dfs_provider_no_delete BEFORE DELETE ON dfs_provider_snapshots
BEGIN SELECT RAISE(ABORT,'Immutable salary snapshot'); END;
CREATE TRIGGER dfs_provider_record_no_update BEFORE UPDATE ON dfs_provider_salary_records
BEGIN SELECT RAISE(ABORT,'Immutable salary record'); END;
CREATE TRIGGER dfs_provider_record_no_delete BEFORE DELETE ON dfs_provider_salary_records
BEGIN SELECT RAISE(ABORT,'Immutable salary record'); END;
CREATE TRIGGER dfs_provider_record_no_append BEFORE INSERT ON dfs_provider_salary_records
WHEN (SELECT complete FROM dfs_provider_snapshots WHERE snapshot_id=NEW.snapshot_id)=1
BEGIN SELECT RAISE(ABORT,'Completed salary snapshot'); END;
CREATE TRIGGER dfs_provider_raw_no_update BEFORE UPDATE ON dfs_provider_raw_chunks
BEGIN SELECT RAISE(ABORT,'Immutable salary archive'); END;
CREATE TRIGGER dfs_provider_raw_no_delete BEFORE DELETE ON dfs_provider_raw_chunks
BEGIN SELECT RAISE(ABORT,'Immutable salary archive'); END;
CREATE TRIGGER dfs_provider_raw_no_append BEFORE INSERT ON dfs_provider_raw_chunks
WHEN (SELECT complete FROM dfs_provider_snapshots WHERE snapshot_id=NEW.snapshot_id)=1
BEGIN SELECT RAISE(ABORT,'Completed salary snapshot'); END;
