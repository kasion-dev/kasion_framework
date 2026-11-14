-- feature: rooms
CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  about TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#00A85A',
  sort INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE room_messages (
  id TEXT PRIMARY KEY,
  room TEXT NOT NULL,
  uid TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  img TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_room_messages ON room_messages (room, created_at);
-- Start with few rooms so early members meet in the same place; add more as the community grows.
INSERT INTO rooms (id, name, about, color, sort) VALUES
  ('lobby', 'ห้องรวม', 'คุยได้ทุกเรื่อง ทักทายกันก่อน', '#E0356B', 1),
  ('help', 'ถาม-ตอบ', 'มีคำถามอะไร ถามได้ที่นี่', '#3B82F6', 2),
  ('offtopic', 'นอกเรื่อง', 'เรื่องสัพเพเหระ', '#F59E0B', 3);
