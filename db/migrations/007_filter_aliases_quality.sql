-- Normalisation des alias filtres NINA et stockage qualité image.
-- V/G sont fusionnés en G ; O/OIII en OIII ; S/SII en SII ; H/Ha en H-alpha.

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS hfr DOUBLE PRECISION;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS fwhm DOUBLE PRECISION;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS sqm DOUBLE PRECISION;

UPDATE sessions
SET filter = 'G'
WHERE lower(filter) IN ('v', 'visual', 'johnsonv', 'photometricv', 'green', 'vert');

UPDATE sessions
SET filter = 'OIII'
WHERE lower(filter) IN ('o', 'o3', 'oiii', 'oxygen', 'oxygeniii', 'oxygen3');

UPDATE sessions
SET filter = 'SII'
WHERE lower(filter) IN ('s', 's2', 'sii', 'sulfur', 'sulfurii', 'sulphur', 'sulphurii');

UPDATE sessions
SET filter = 'H-alpha'
WHERE lower(filter) IN ('h', 'ha', 'halpha', 'h-alpha', 'hydrogenalpha');

-- Fusion prudente des objectifs V -> G, en évitant les conflits de clé primaire.
DELETE FROM goals g
WHERE lower(g.filter) IN ('v', 'visual', 'johnsonv', 'photometricv')
  AND EXISTS (
    SELECT 1 FROM goals gg
    WHERE gg.target_id = g.target_id
      AND gg.filter = 'G'
  );

UPDATE goals
SET filter = 'G'
WHERE lower(filter) IN ('v', 'visual', 'johnsonv', 'photometricv');

UPDATE goals
SET filter = 'OIII'
WHERE lower(filter) IN ('o', 'o3', 'oiii', 'oxygen', 'oxygeniii', 'oxygen3');

UPDATE goals
SET filter = 'SII'
WHERE lower(filter) IN ('s', 's2', 'sii', 'sulfur', 'sulfurii', 'sulphur', 'sulphurii');

UPDATE goals
SET filter = 'H-alpha'
WHERE lower(filter) IN ('h', 'ha', 'halpha', 'h-alpha', 'hydrogenalpha');

ALTER TABLE sessions
  DROP CONSTRAINT IF EXISTS sessions_filter_check;

ALTER TABLE sessions
  ADD CONSTRAINT sessions_filter_check
  CHECK (filter IN ('L', 'R', 'G', 'B', 'H-alpha', 'OIII', 'SII'));

ALTER TABLE goals
  DROP CONSTRAINT IF EXISTS goals_filter_check;

ALTER TABLE goals
  ADD CONSTRAINT goals_filter_check
  CHECK (filter IN ('L', 'R', 'G', 'B', 'H-alpha', 'OIII', 'SII'));

ALTER TABLE sessions
  DROP CONSTRAINT IF EXISTS sessions_hfr_check;

ALTER TABLE sessions
  ADD CONSTRAINT sessions_hfr_check
  CHECK (hfr IS NULL OR hfr > 0);

ALTER TABLE sessions
  DROP CONSTRAINT IF EXISTS sessions_fwhm_check;

ALTER TABLE sessions
  ADD CONSTRAINT sessions_fwhm_check
  CHECK (fwhm IS NULL OR fwhm > 0);

ALTER TABLE sessions
  DROP CONSTRAINT IF EXISTS sessions_sqm_check;

ALTER TABLE sessions
  ADD CONSTRAINT sessions_sqm_check
  CHECK (sqm IS NULL OR sqm > 0);
