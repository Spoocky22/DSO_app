# Notifications Discord via webhook

L'agent NINA peut envoyer le même contenu que la notification ntfy dans un salon Discord.

## Côté Discord

Dans le salon voulu :

1. `Modifier le salon`
2. `Intégrations`
3. `Webhooks`
4. `Nouveau webhook`
5. Choisir le salon et copier l'URL du webhook

Cette URL est un secret : toute personne qui la possède peut écrire dans le salon via ce webhook.

## Côté PC remote

Dans `C:\DSO\nina_agent\.env`, ajouter :

```env
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
DISCORD_USERNAME=DSO Sync
```

Puis redémarrer l'agent ou la tâche planifiée.

## Comportement

L'appel `notify()` envoie maintenant le même message vers :

- ntfy, si `NTFY_TOPIC` est configuré ;
- Discord, si `DISCORD_WEBHOOK_URL` est configuré.

Les réglages existants contrôlent toujours quand les notifications sont envoyées :

```env
NTFY_NOTIFY_EACH_IMAGE=false
NTFY_NOTIFY_CONNECTION=false
NTFY_NOTIFY_ERRORS=true
NTFY_END_OF_NIGHT_SUMMARY=true
```

Donc avec la configuration habituelle, Discord reçoit surtout le résumé de fin de nuit, et éventuellement les erreurs si `NTFY_NOTIFY_ERRORS=true`.
