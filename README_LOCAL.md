# DSO Exposure Tracker — lancement local

Application Next.js / React générée par v0 pour suivre les temps de pose par cible, par filtre et par panneau de mosaïque.

## Prérequis

- Node.js 20.9 ou plus récent.
- Docker Desktop, pour lancer PostgreSQL localement.
- pnpm via Corepack, ou pnpm installé globalement.

## Démarrage rapide sous Windows PowerShell

Depuis le dossier du projet :

```powershell
corepack enable
corepack prepare pnpm@latest --activate
pnpm install
copy .env.local.example .env.local
docker compose up -d db
pnpm dev
```

Puis ouvrir :

```text
http://localhost:3000
```

## Démarrage rapide sous Linux / macOS / WSL

```bash
corepack enable
corepack prepare pnpm@latest --activate
pnpm install
cp .env.local.example .env.local
docker compose up -d db
pnpm dev
```

## Base de données

La variable locale attendue est :

```text
DATABASE_URL=postgresql://dso:dso@localhost:5432/dso
```

Le schéma SQL est dans :

```text
db/init/001_schema.sql
```

Il est exécuté automatiquement au premier démarrage du conteneur PostgreSQL.

Si tu veux repartir d'une base vide :

```bash
docker compose down -v
docker compose up -d db
```

Attention : `down -v` supprime les données locales.

## Migration Neon pour les mosaïques

Si la base Neon existe déjà avec l'ancien schéma, exécute une fois le script suivant dans le SQL Editor Neon :

```text
db/migrations/002_panels.sql
```

Il ajoute :

```text
targets.panel_count
sessions.panel_index
```

Les anciennes cibles et sessions restent compatibles : elles sont automatiquement considérées comme des cibles à 1 panneau.

## Commandes utiles

```bash
pnpm dev      # serveur de développement
pnpm build    # build production
pnpm start    # serveur production après build
pnpm lint     # lint si ESLint est configuré
```

## Fonctionnement actuel

- Ajout de cibles DSO.
- Ajout de sessions d'imagerie : filtre, temps de pose unitaire, nombre de poses conservées.
- Agrégation du temps total par cible et par filtre.
- Gestion des cibles simples ou en mosaïque, avec temps de pose comparés panneau par panneau.
- Liste des dernières sessions avec suppression.
- Image et résumé Wikipédia récupérés automatiquement côté serveur.

## Points restant à finaliser

Priorité haute :

1. Ajouter une vraie gestion d'erreur utilisateur pour les actions base de données.
2. Ajouter modification des cibles, notamment le nombre de panneaux après création.
3. Ajouter export CSV/JSON des sessions.
4. Ajouter des objectifs par filtre, la table `goals` est déjà prévue côté base.
5. Ajouter une sauvegarde/import local pour éviter de dépendre uniquement de PostgreSQL.

Priorité moyenne :

1. Authentification si l'app doit être partagée publiquement.
2. Mode multi-utilisateur avec nom d'observateur.
3. Dates de session modifiables manuellement, pas seulement `created_at`.
4. Statistiques par nuit, cible, filtre, instrument, gain, température caméra.
5. Déploiement propre sur un mini-PC ou NAS avec `next start` + reverse proxy.
