-- feature: feed
CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  img TEXT,
  like_n INTEGER NOT NULL DEFAULT 0,
  reply_n INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_posts_time ON posts (created_at);
CREATE TABLE post_likes (
  post_id TEXT NOT NULL,
  uid TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, uid)
);
CREATE TABLE post_replies (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  uid TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_replies_post ON post_replies (post_id, created_at);
