-- Migration pour ajouter la gestion des mosaïques / panneaux
-- À exécuter une seule fois dans Neon SQL Editor sur la base existante.

ALTER TABLE targets
  ADD COLUMN IF NOT EXISTS panel_count INTEGER NOT NULL DEFAULT 1;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS panel_index INTEGER NOT NULL DEFAULT 1;

UPDATE targets
SET panel_count = 1
WHERE panel_count IS NULL OR panel_count < 1;

UPDATE sessions
SET panel_index = 1
WHERE panel_index IS NULL OR panel_index < 1;

ALTER TABLE targets
  DROP CONSTRAINT IF EXISTS targets_panel_count_check;

ALTER TABLE targets
  ADD CONSTRAINT targets_panel_count_check
  CHECK (panel_count BETWEEN 1 AND 20);

ALTER TABLE sessions
  DROP CONSTRAINT IF EXISTS sessions_panel_index_check;

ALTER TABLE sessions
  ADD CONSTRAINT sessions_panel_index_check
  CHECK (panel_index BETWEEN 1 AND 20);

CREATE INDEX IF NOT EXISTS sessions_target_id_panel_index_idx
  ON sessions(target_id, panel_index);
