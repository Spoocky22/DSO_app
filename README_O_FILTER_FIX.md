# Correctif O/OIII importé en L

Ce correctif donne la priorité au filtre détecté dans le nom de fichier NINA.

Cas visé : l’évènement NINA renvoie un filtre vide ou fallback `L`, mais le fichier contient `_O_`.
L’API classe alors la pose en `OIII` au lieu de `L`.

Il faut aussi corriger les anciennes lignes déjà écrites en base, car un changement de code ne modifie pas rétroactivement les sessions existantes. Voir le SQL fourni dans `db/migrations/008_fix_existing_filter_aliases.sql`.
