# NINA : filtre V, filtre vide et replay de log

## Filtre V

Cette version ajoute le filtre `V` comme filtre distinct de `G`. Il faut appliquer
la migration Neon :

```sql
-- db/migrations/005_add_v_filter.sql
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
```

## Filtre vide côté NINA

Si NINA renvoie un filtre vide, l'app refuse l'image car elle ne peut pas deviner
scientifiquement le filtre. Deux solutions :

1. faire en sorte que NINA écrive le filtre dans l'événement, le chemin ou le nom de fichier ;
2. utiliser temporairement `NINA_FALLBACK_FILTER` dans `nina-agent/.env`.

Exemple :

```env
NINA_FALLBACK_FILTER=H-alpha
```

À utiliser seulement si toutes les images sans filtre appartiennent bien à ce filtre.

## Rejouer un log après correction

L'agent peut réimporter les lignes `IMAGE-SAVE` d'un ancien `nina_agent.log`.
Les doublons sont ignorés par l'app grâce au nom de fichier/external_id.

```powershell
.\.venv\Scripts\python.exe nina_sync_agent.py --replay-log C:\DSO\nina-agent\nina_agent.log
```

Pour rejouer des images dont le filtre était vide :

```powershell
.\.venv\Scripts\python.exe nina_sync_agent.py --replay-log C:\DSO\nina-agent\nina_agent.log --fallback-filter H-alpha
```
