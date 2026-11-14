-- feature: profile
CREATE TABLE profiles (
  uid TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  photos TEXT NOT NULL DEFAULT '[]',
  complete INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
