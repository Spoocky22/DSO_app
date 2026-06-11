# Correction manuelle du redshift

Cette version ajoute une correction manuelle du redshift par cible.

## Migration Neon

Avant de déployer cette version sur Vercel, exécuter une seule fois dans Neon SQL Editor :

```sql
ALTER TABLE targets
  ADD COLUMN IF NOT EXISTS redshift_override DOUBLE PRECISION;

ALTER TABLE targets
  DROP CONSTRAINT IF EXISTS targets_redshift_override_check;

ALTER TABLE targets
  ADD CONSTRAINT targets_redshift_override_check
  CHECK (redshift_override IS NULL OR (redshift_override > -0.1 AND redshift_override < 20));
```

Le même SQL est disponible dans :

```text
db/migrations/003_redshift_override.sql
```

## Fonctionnement

- Wikidata reste utilisé automatiquement si aucun redshift manuel n'est défini.
- Le bouton `Corriger z` permet de forcer une valeur par cible.
- Le bouton `Revenir auto` supprime la correction et réutilise Wikidata.
- La correction est stockée dans Neon dans `targets.redshift_override`.

## Exemple

Pour une cible où Wikidata donne une valeur douteuse, entrer par exemple :

```text
0.00347
```

ou, pour une galaxie blueshiftée :

```text
-0.001
```
