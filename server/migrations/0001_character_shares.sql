CREATE TABLE character_shares (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('jointed', 'paper')),
  joints_json TEXT NOT NULL,
  pose_json TEXT,
  image_key TEXT NOT NULL UNIQUE,
  image_type TEXT NOT NULL,
  image_bytes INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'quarantined', 'deleted')),
  delete_token_hash TEXT NOT NULL,
  rights_confirmed INTEGER NOT NULL DEFAULT 0,
  minor_confirmed INTEGER NOT NULL DEFAULT 0,
  report_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  moderated_at INTEGER,
  deleted_at INTEGER
);

CREATE INDEX idx_character_shares_owner_created ON character_shares(owner_id, created_at);
CREATE INDEX idx_character_shares_status_expiry ON character_shares(status, expires_at);

CREATE TABLE character_reports (
  id TEXT PRIMARY KEY,
  share_id TEXT NOT NULL REFERENCES character_shares(id),
  reporter_hash TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (share_id, reporter_hash)
);

CREATE INDEX idx_character_reports_share ON character_reports(share_id);
