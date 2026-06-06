CREATE TABLE IF NOT EXISTS targets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  panel_count INTEGER NOT NULL DEFAULT 1 CHECK (panel_count BETWEEN 1 AND 20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  target_id TEXT NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
  panel_index INTEGER NOT NULL DEFAULT 1 CHECK (panel_index BETWEEN 1 AND 20),
  filter TEXT NOT NULL CHECK (filter IN ('L', 'R', 'G', 'B', 'H-alpha', 'OIII', 'SII')),
  sub_exposure INTEGER NOT NULL CHECK (sub_exposure > 0),
  sub_count INTEGER NOT NULL CHECK (sub_count > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS goals (
  target_id TEXT NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
  filter TEXT NOT NULL CHECK (filter IN ('L', 'R', 'G', 'B', 'H-alpha', 'OIII', 'SII')),
  target_seconds INTEGER NOT NULL CHECK (target_seconds > 0),
  PRIMARY KEY (target_id, filter)
);

CREATE INDEX IF NOT EXISTS sessions_target_id_created_at_idx
  ON sessions(target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sessions_filter_idx
  ON sessions(filter);

CREATE INDEX IF NOT EXISTS sessions_target_id_panel_index_idx
  ON sessions(target_id, panel_index);
