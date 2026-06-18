# NINA fallback L + vue globale

Cette version ajoute deux choses :

1. Si NINA ne fournit pas de filtre exploitable (`?`, vide, ou filtre non reconnu), l'import classe la pose en `L` par défaut.
   - Côté agent, `NINA_FALLBACK_FILTER=L` est présent dans `.env.example`.
   - Côté API Vercel, un fallback serveur force aussi `L` si aucun filtre valide n'est trouvé.

2. La page d'accueil affiche une vue globale toutes cibles :
   - temps validé / processing total ;
   - acquis NINA brut total ;
   - détail filtre par filtre sur toutes les cibles.

## Replay du log NINA

Le replay relit les lignes `IMAGE-SAVE` du fichier `nina_agent.log` et les renvoie à l'app.
Il sert à récupérer une nuit après correction de filtre, panne réseau, timeout DNS, etc.
Les doublons sont évités par `external_id` / nom de fichier.

Commande manuelle :

```powershell
cd C:\DSO\nina-agent
.\.venv\Scripts\python.exe nina_sync_agent.py --replay-log C:\DSO\nina-agent\nina_agent.log
```

Avec cette version, les filtres inconnus du log seront importés en `L` par défaut.

Pour automatiser une vérification en fin de nuit, le plus simple est de créer une tâche Windows planifiée, par exemple à 12:00 locales, qui lance exactement cette commande.
