-- feature: people (coarse location is optional; coordinates never leave the server)
CREATE TABLE user_locations (
  uid TEXT PRIMARY KEY,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  updated_at INTEGER NOT NULL
);
