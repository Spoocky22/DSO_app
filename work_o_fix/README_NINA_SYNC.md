# DSO App — NINA raw acquisition sync

Cette version ajoute une couche **acquisition brute NINA** séparée du temps validé après processing.

## Modèle logique

- `validated` : temps conservé après tri/prétraitement, saisi manuellement dans l'app.
- `acquired` : temps brut reçu automatiquement depuis NINA.
- `rejected` : prévu pour une étape suivante, quand on importera le tri/rejet.

Le dashboard affiche donc deux compteurs séparés :

- **Temps validé / processing**
- **Acquis NINA brut**

## Migration Neon

Dans Neon → SQL Editor, exécuter une seule fois :

```sql
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
```

Le même SQL se trouve dans :

```text
db/migrations/004_nina_raw_sessions.sql
```

## Variables Vercel

Ajouter dans Vercel → Project → Settings → Environment Variables :

```env
NINA_INGEST_TOKEN=une-longue-cle-secrete
```

La même valeur devra être utilisée dans l'agent NINA local.

Il faut redéployer après l'ajout de cette variable.

## Tester l'endpoint côté app

Après déploiement :

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "https://TON-APP.vercel.app/api/nina/ingest" `
  -Headers @{ Authorization = "Bearer TA_CLE_NINA_INGEST" }
```

Réponse attendue :

```json
{"ok":true,"message":"NINA ingest endpoint ready"}
```

## Agent local sur le PC NINA

L'agent est dans :

```text
nina-agent/nina_sync_agent.py
```

Installation sur le PC où tourne NINA :

```powershell
cd chemin\vers\DSO_App\nina-agent
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

Modifier `.env` :

```env
DSO_APP_URL=https://TON-APP.vercel.app
NINA_INGEST_TOKEN=la-meme-cle-que-dans-vercel
NINA_WS_URL=ws://localhost:1888/v2/socket
NTFY_TOPIC=dso-ton-topic-long-et-random
NTFY_SERVER=https://ntfy.sh
NTFY_TOKEN=
```

Test sans NINA :

```powershell
python .\nina_sync_agent.py --test
```

Par défaut, le test envoie une pose `M51` de 300 s en `H-alpha`. Si une cible `M51` existe déjà dans l'app, la pose est ajoutée à cette cible dans le compteur **Acquis NINA brut**. Sinon, la cible `M51` est créée.

On peut aussi choisir la cible du test :

```powershell
python .\nina_sync_agent.py --test --test-target M31 --test-filter L --test-exposure 120
```

Le matching côté app essaie d'abord le nom exact, puis un identifiant catalogue sûr : `M51`, `Messier 51`, `M51 test NINA` peuvent donc pointer vers la cible existante `M51` si elle existe.

Lancement réel :

```powershell
python .\nina_sync_agent.py
```

L'agent écoute les événements `IMAGE-SAVE` du plugin NINA Advanced API et envoie chaque image sauvegardée vers :

```text
/api/nina/ingest
```

## Côté NINA

Il faut installer/activer le plugin **Advanced API** dans NINA. Le WebSocket documenté par le plugin est typiquement :

```text
ws://localhost:1888/v2/socket
```

L'événement utilisé est `IMAGE-SAVE`, qui fournit notamment :

- `TargetName`
- `Filter`
- `ExposureTime`
- `Date`
- `Filename`

## ntfy

Si `NTFY_TOPIC` est vide, aucune notification n'est envoyée.

Si `NTFY_TOPIC` est renseigné, l'agent envoie une notification après chaque import réussi, donc la notification confirme que :

```text
NINA → agent → app Vercel → Neon
```

a fonctionné.

## Cibles mosaïques / panneaux

Les acquisitions NINA peuvent maintenant être rattachées à un panneau de mosaïque.

Méthodes supportées :

1. Champ explicite `panelIndex` dans le payload envoyé à `/api/nina/ingest`.
2. Détection automatique dans le `TargetName` ou le `Filename` avec des formes comme :
   - `M31 P2`
   - `M31_P2_Ha_001.fits`
   - `M31 Panel 2`
   - `M31 panneau 2`
   - `M31 tile 2`

Si une cible existe déjà sous le nom `M31`, une acquisition NINA nommée `M31 P2` est rattachée à `M31`, panneau 2. Si le nombre de panneaux de la cible était trop petit, il est augmenté automatiquement jusqu'au panneau détecté.

Tests utiles :

```powershell
python .\nina_sync_agent.py --test --test-target M31 --test-panel 1
python .\nina_sync_agent.py --test --test-target M31 --test-panel 2
python .\nina_sync_agent.py --test --test-target "M31 P3"
```

Attention : si NINA ne met aucune information de panneau dans le nom de cible, le nom de fichier ou les métadonnées, l'app ne peut pas l'inventer. Dans ce cas, tout est rangé dans `P1`.
