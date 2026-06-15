-- Nettoyage défensif : retire les sessions/objectifs dont la cible n’existe plus.
-- Utile si la base a été créée avant que le ON DELETE CASCADE soit correctement appliqué.

DELETE FROM sessions
WHERE NOT EXISTS (
  SELECT 1
  FROM targets
  WHERE targets.id = sessions.target_id
);

DELETE FROM goals
WHERE NOT EXISTS (
  SELECT 1
  FROM targets
  WHERE targets.id = goals.target_id
);
