-- Migration pour autoriser une correction manuelle du redshift par cible.
-- À exécuter une seule fois dans Neon SQL Editor sur la base existante.

ALTER TABLE targets
  ADD COLUMN IF NOT EXISTS redshift_override DOUBLE PRECISION;

ALTER TABLE targets
  DROP CONSTRAINT IF EXISTS targets_redshift_override_check;

ALTER TABLE targets
  ADD CONSTRAINT targets_redshift_override_check
  CHECK (redshift_override IS NULL OR (redshift_override > -0.1 AND redshift_override < 20));
