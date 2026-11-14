-- feature: invites
ALTER TABLE users ADD COLUMN invite TEXT;
ALTER TABLE users ADD COLUMN invited_by TEXT;
CREATE UNIQUE INDEX idx_users_invite ON users (invite);
CREATE INDEX idx_users_invited_by ON users (invited_by);
