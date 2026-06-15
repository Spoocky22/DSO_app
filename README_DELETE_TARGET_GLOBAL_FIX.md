# Correctif suppression cible / vue globale

Ce correctif évite que la carte **VUE GLOBALE TOUTES CIBLES** conserve le temps d’exposition d’une cible supprimée.

Changements :

- `deleteTarget()` supprime explicitement les `sessions` et `goals` liés avant de supprimer la cible.
- `getState()` ignore aussi les sessions orphelines au cas où il en resterait déjà dans la base.
- le cache SWR côté navigateur retire immédiatement la cible et ses sessions, puis revalide avec Neon.

## Migration Neon recommandée

Exécuter une fois :

```sql
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
```

Le fichier correspondant est :

```text
db/migrations/006_cleanup_orphan_sessions.sql
```
