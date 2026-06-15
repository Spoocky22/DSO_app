-- Ajoute le filtre photométrique V comme filtre distinct de G.
-- À exécuter une seule fois dans Neon SQL Editor.

ALTER TABLE sessions
  DROP CONSTRAINT IF EXISTS sessions_filter_check;

ALTER TABLE sessions
  ADD CONSTRAINT sessions_filter_check
  CHECK (filter IN ('L', 'R', 'G', 'B', 'V', 'H-alpha', 'OIII', 'SII'));

ALTER TABLE goals
  DROP CONSTRAINT IF EXISTS goals_filter_check;

ALTER TABLE goals
  ADD CONSTRAINT goals_filter_check
  CHECK (filter IN ('L', 'R', 'G', 'B', 'V', 'H-alpha', 'OIII', 'SII'));
