-- feature: wallet (amounts in integer satang)
CREATE TABLE wallets (
  uid TEXT PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at INTEGER NOT NULL
);
CREATE TABLE ledger (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  kind TEXT NOT NULL,            -- topup | spend | credit | admin | refund …
  title TEXT NOT NULL,
  amount INTEGER NOT NULL,       -- + money in, − money out
  ref TEXT UNIQUE,               -- idempotency key (e.g. 'charge:<id>'); NULL when not needed
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_ledger_uid ON ledger (uid, created_at);
CREATE TABLE charges (
  id TEXT PRIMARY KEY,           -- pay.kasion.dev charge id
  uid TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','expired')),
  qr_payload TEXT,
  note TEXT,
  created_at INTEGER NOT NULL,
  paid_at INTEGER
);
CREATE INDEX idx_charges_uid ON charges (uid, created_at);
