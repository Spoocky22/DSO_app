# Backfill NINA depuis un dossier de fichiers

Cette option sert quand l'agent `nina_sync_agent.py` n'était pas lancé pendant une nuit, mais que les fichiers FITS/XISF sont bien présents sur le PC NINA.

Elle relit les noms de fichiers, reconstruit une pseudo-entrée `IMAGE-SAVE`, puis l'envoie à l'app Vercel via `/api/nina/ingest`.

## Commande de base

Depuis le PC remote :

```powershell
cd C:\DSO\nina_agent
.\.venv\Scripts\python.exe nina_sync_agent.py --backfill-folder "D:\DATA\M8"
```

Par défaut, l'agent utilise le nom du dossier parent comme cible. Si le dossier s'appelle déjà `M8`, `Sh2 129 Panneau 2`, etc., c'est suffisant.

## Forcer la cible

Si le dossier n'a pas le bon nom, indique explicitement la cible :

```powershell
.\.venv\Scripts\python.exe nina_sync_agent.py --backfill-folder "D:\DATA\2026-06-21" --backfill-target "M8"
```

Pour une mosaïque :

```powershell
.\.venv\Scripts\python.exe nina_sync_agent.py --backfill-folder "D:\DATA\Sh2 129 Panneau 2" --backfill-target "Sh2 129 Panneau 2"
```

L'app rattachera alors la cible à `Sh2 129`, panneau `P2`.

## Scan récursif

Si les fichiers sont dans des sous-dossiers :

```powershell
.\.venv\Scripts\python.exe nina_sync_agent.py --backfill-folder "D:\DATA" --backfill-recursive
```

Dans ce mode, chaque fichier prend par défaut le nom de son dossier parent comme cible.

## Dry run

Pour vérifier ce qui serait importé sans rien envoyer à Vercel :

```powershell
.\.venv\Scripts\python.exe nina_sync_agent.py --backfill-folder "D:\DATA\M8" --backfill-dry-run
```

## Formats reconnus

Le parser reconnaît les formats NINA de ce genre :

```text
2026-06-21_23-40-29_H_-10.00_126_600.00_0000_5.60_.fits
2026-06-22_03-25-00_O_-10.00_126_600.00_0002_5.55_.fits
M33_LIGHT_2016-01-01_12-00-00_L_-15_1600_10.21_0001_3.25_21.83.fits
```

Il extrait notamment :

- la date/heure depuis le début du nom de fichier ;
- le filtre (`H` -> `H-alpha`, `O` -> `OIII`, `S` -> `SII`, `V` -> `G`) ;
- le temps de pose ;
- le numéro de frame ;
- le HFR si présent ;
- le SQM si présent.

Les doublons sont évités côté Vercel via le nom de fichier / `external_id`.
