# Statistiques NINA + résumé ntfy de fin de nuit

## Onglet Stats

L'application ajoute un onglet `Stats` dans l'interface principale.

Il comptabilise uniquement les acquisitions brutes NINA :

- `status = acquired`
- `source = nina`

Les temps validés / processing saisis à la main restent séparés.

L'onglet permet de voir :

- total NINA brut historique ;
- période courante et précédente ;
- comparaison semaine / mois / année ;
- détail par filtre ;
- historique des dernières semaines/mois/années ;
- top cibles de la période courante.

Aucune migration Neon n'est nécessaire pour cet onglet.

## ntfy fin de nuit

L'agent NINA peut envoyer une notification de résumé quand NINA ne sauvegarde plus d'image pendant un certain temps.

Dans `C:\DSO\nina_agent\.env`, ajouter ou modifier :

```env
NTFY_TOPIC=ton_topic_ntfy
NTFY_SERVER=https://ntfy.sh
NTFY_TOKEN=
NTFY_END_OF_NIGHT_SUMMARY=true
NTFY_NIGHT_IDLE_MINUTES=45
```

Par défaut, l'agent n'envoie pas une notification pour chaque image :

```env
NTFY_NOTIFY_EACH_IMAGE=false
```

Pour recevoir aussi une notification à chaque pose importée :

```env
NTFY_NOTIFY_EACH_IMAGE=true
```

Le résumé de fin de nuit contient :

- temps total NINA brut ;
- nombre de poses ;
- total par filtre ;
- total par cible/panneau.

Si vous avez souvent de longues pauses entre cibles, augmente `NTFY_NIGHT_IDLE_MINUTES`, par exemple :

```env
NTFY_NIGHT_IDLE_MINUTES=90
```

## Déploiement

Pas de migration Neon.

Pour Vercel :

```powershell
git add .
git commit -m "Add NINA statistics and ntfy night summary"
git push
```

Pour le PC remote, remplacer seulement :

```text
C:\DSO\nina_agent\nina_sync_agent.py
C:\DSO\nina_agent\.env.example
```

Puis redémarrer l'agent.
