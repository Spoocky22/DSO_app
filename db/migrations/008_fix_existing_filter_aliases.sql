-- Corrige les poses NINA déjà importées avec le mauvais filtre
-- lorsque le filtre réel est identifiable dans le nom de fichier.

UPDATE sessions
SET filter = 'OIII'
WHERE source = 'nina'
  AND filename IS NOT NULL
  AND filter <> 'OIII'
  AND (
    filename LIKE '%_O_%'
    OR filename ILIKE '%_OIII_%'
    OR filename ILIKE '%_O3_%'
  );

UPDATE sessions
SET filter = 'SII'
WHERE source = 'nina'
  AND filename IS NOT NULL
  AND filter <> 'SII'
  AND (
    filename LIKE '%_S_%'
    OR filename ILIKE '%_SII_%'
    OR filename ILIKE '%_S2_%'
  );

UPDATE sessions
SET filter = 'G'
WHERE source = 'nina'
  AND filename IS NOT NULL
  AND filter <> 'G'
  AND (
    filename LIKE '%_V_%'
    OR filename ILIKE '%_GREEN_%'
    OR filename ILIKE '%_VERT_%'
  );
