CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rounds (
  round_id INTEGER PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'open',
  pulse_index INTEGER,
  hex TEXT,
  day_key TEXT NOT NULL,
  week_key TEXT NOT NULL,
  resolved_at INTEGER
);
CREATE TABLE IF NOT EXISTS picks (
  round_id INTEGER NOT NULL,
  player_id TEXT NOT NULL,
  hex TEXT NOT NULL,
  submitted_at INTEGER NOT NULL,
  closeness REAL,
  rank INTEGER,
  PRIMARY KEY (round_id, player_id)
);
CREATE INDEX IF NOT EXISTS rounds_day ON rounds(day_key);
CREATE INDEX IF NOT EXISTS rounds_week ON rounds(week_key);
CREATE INDEX IF NOT EXISTS rounds_status ON rounds(status);
