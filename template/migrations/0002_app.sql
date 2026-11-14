-- Example app table used by the starter "notes" feature. Replace with your own schema.
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_notes_time ON notes (created_at);
