CREATE TABLE IF NOT EXISTS watches (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  label TEXT NOT NULL,
  part TEXT NOT NULL,
  location TEXT NOT NULL,
  radius REAL NOT NULL DEFAULT 25,
  product_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  stores_json TEXT NOT NULL DEFAULT '[]',
  last_checked_at TEXT,
  last_error TEXT,
  notified_available INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_watches_device ON watches(device_id);
CREATE INDEX IF NOT EXISTS idx_watches_location ON watches(location);

CREATE TABLE IF NOT EXISTS subscriptions (
  device_id TEXT PRIMARY KEY,
  subscription_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS location_backoff (
  location TEXT PRIMARY KEY,
  until_ms INTEGER NOT NULL
);


CREATE TABLE IF NOT EXISTS device_settings (
  device_id TEXT PRIMARY KEY,
  active_start TEXT NOT NULL DEFAULT '09:00',
  active_end TEXT NOT NULL DEFAULT '02:00',
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  updated_at TEXT NOT NULL
);
