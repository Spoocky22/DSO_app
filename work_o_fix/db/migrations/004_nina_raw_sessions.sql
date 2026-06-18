ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'validated';

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS external_id TEXT;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS filename TEXT;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE sessions
SET status = 'validated'
WHERE status IS NULL OR status = '';

UPDATE sessions
SET source = 'manual'
WHERE source IS NULL OR source = '';

ALTER TABLE sessions
  DROP CONSTRAINT IF EXISTS sessions_status_check;

ALTER TABLE sessions
  ADD CONSTRAINT sessions_status_check
  CHECK (status IN ('validated', 'acquired', 'rejected'));

ALTER TABLE sessions
  DROP CONSTRAINT IF EXISTS sessions_source_check;

ALTER TABLE sessions
  ADD CONSTRAINT sessions_source_check
  CHECK (source IN ('manual', 'nina', 'import'));

CREATE UNIQUE INDEX IF NOT EXISTS sessions_source_external_id_unique_idx
  ON sessions(source, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sessions_status_idx
  ON sessions(status);

CREATE INDEX IF NOT EXISTS sessions_source_idx
  ON sessions(source);

CREATE INDEX IF NOT EXISTS sessions_captured_at_idx
  ON sessions(captured_at DESC);
