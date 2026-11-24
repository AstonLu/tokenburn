-- Tokenburn schema. Money in integer cents.
CREATE TABLE profiles (
  id          TEXT PRIMARY KEY,
  claim_hash  TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL,
  updated_at  TEXT,
  usd_total   INTEGER NOT NULL DEFAULT 0
);

-- One row per profile, device, UTC day, tool and model. Re-uploads merge field-wise with MAX.
CREATE TABLE usage_rows (
  profile_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  device_id   TEXT NOT NULL,
  d           TEXT NOT NULL,
  tool        TEXT NOT NULL,
  model       TEXT NOT NULL,
  tin         INTEGER NOT NULL DEFAULT 0,
  tout        INTEGER NOT NULL DEFAULT 0,
  cr          INTEGER NOT NULL DEFAULT 0,
  cw          INTEGER NOT NULL DEFAULT 0,
  cw1h        INTEGER NOT NULL DEFAULT 0,
  think       INTEGER NOT NULL DEFAULT 0,
  n           INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (profile_id, device_id, d, tool, model)
);

CREATE TABLE rate_limits (
  key         TEXT PRIMARY KEY,
  count       INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX rate_limits_expires ON rate_limits (expires_at);
