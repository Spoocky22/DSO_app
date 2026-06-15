CREATE TABLE IF NOT EXISTS targets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  panel_count INTEGER NOT NULL DEFAULT 1,
  redshift_override DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT targets_panel_count_check CHECK (panel_count BETWEEN 1 AND 20),
  CONSTRAINT targets_redshift_override_check CHECK (redshift_override IS NULL OR (redshift_override > -0.1 AND redshift_override < 20))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  target_id TEXT NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
  panel_index INTEGER NOT NULL DEFAULT 1,
  filter TEXT NOT NULL CHECK (filter IN ('L', 'R', 'G', 'B', 'V', 'H-alpha', 'OIII', 'SII')),
  sub_exposure INTEGER NOT NULL CHECK (sub_exposure > 0),
  sub_count INTEGER NOT NULL CHECK (sub_count > 0),
  status TEXT NOT NULL DEFAULT 'validated' CHECK (status IN ('validated', 'acquired', 'rejected')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'nina', 'import')),
  external_id TEXT,
  filename TEXT,
  captured_at TIMESTAMPTZ,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sessions_panel_index_check CHECK (panel_index BETWEEN 1 AND 20)
);

CREATE TABLE IF NOT EXISTS goals (
  target_id TEXT NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
  filter TEXT NOT NULL CHECK (filter IN ('L', 'R', 'G', 'B', 'V', 'H-alpha', 'OIII', 'SII')),
  target_seconds INTEGER NOT NULL CHECK (target_seconds > 0),
  PRIMARY KEY (target_id, filter)
);

CREATE INDEX IF NOT EXISTS sessions_target_id_created_at_idx
  ON sessions(target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sessions_filter_idx
  ON sessions(filter);

CREATE INDEX IF NOT EXISTS sessions_target_id_panel_index_idx
  ON sessions(target_id, panel_index);

CREATE UNIQUE INDEX IF NOT EXISTS sessions_source_external_id_unique_idx
  ON sessions(source, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sessions_status_idx
  ON sessions(status);

CREATE INDEX IF NOT EXISTS sessions_source_idx
  ON sessions(source);

CREATE INDEX IF NOT EXISTS sessions_captured_at_idx
  ON sessions(captured_at DESC);
