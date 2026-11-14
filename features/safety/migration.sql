-- feature: safety
CREATE TABLE blocks (
  uid TEXT NOT NULL,
  target TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (uid, target)
);
CREATE INDEX idx_blocks_target ON blocks (target);
CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  target TEXT NOT NULL,
  reason TEXT NOT NULL,
  detail TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE INDEX idx_reports_open ON reports (resolved_at, created_at);
