-- kasion framework core tables. Add your own tables in 0002_*.sql and later files; never edit an applied migration.
CREATE TABLE users (
  uid TEXT PRIMARY KEY,               -- Firebase uid
  email TEXT UNIQUE,
  name TEXT,
  photo TEXT,
  blocked INTEGER NOT NULL DEFAULT 0, -- suspended by an admin
  last_seen INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_users_created ON users (created_at);
-- images plugin: compressed uploads stored as BLOBs (≤ 900 KB each)
CREATE TABLE images (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  folder TEXT NOT NULL,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_images_uid ON images (uid, created_at);
-- push plugin: one row per subscribed device
CREATE TABLE push_subs (
  endpoint TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_push_uid ON push_subs (uid);
-- chat plugin: thread = 'm:<uidA>:<uidB>' (uids sorted)
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  thread TEXT NOT NULL,
  sender_uid TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  img TEXT,
  created_at INTEGER NOT NULL,
  delivered_at INTEGER,
  read_at INTEGER
);
CREATE INDEX idx_messages_thread ON messages (thread, created_at);
CREATE TABLE chat_reads (
  uid TEXT NOT NULL,
  thread TEXT NOT NULL,
  read_at INTEGER NOT NULL,
  PRIMARY KEY (uid, thread)
);
-- calls plugin
CREATE TABLE calls (
  id TEXT PRIMARY KEY,
  caller TEXT NOT NULL,
  callee TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ringing','answered','declined','ended','missed')),
  video INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_calls_callee_status ON calls (callee, status, created_at);
