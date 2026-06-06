# Image illustrative + vérification H-alpha

Cette version ajoute un enrichissement automatique des fiches de cible :

- image principale depuis Wikipédia/Wikimedia, via l'API Wikipédia ;
- identifiant Wikidata associé si disponible ;
- redshift Wikidata `P1090` si disponible ;
- calcul de la longueur d'onde observée de H-alpha : `656.28 * (1 + z)` ;
- badges de compatibilité simplifiée pour filtres H-alpha 3, 5, 7 et 12 nm centrés sur 656.3 nm.

Aucune migration Neon n'est nécessaire pour cette étape : les informations sont récupérées dynamiquement via `/api/object-image` et mises en cache côté Next/Vercel.

## Limites connues

- Le test H-alpha est volontairement simplifié : il ne modélise pas la courbe réelle de transmission du filtre.
- Le décalage dû au faisceau rapide / angle d'incidence du filtre n'est pas encore pris en compte.
- Si Wikidata ne fournit pas de redshift `P1090`, aucun badge H-alpha n'est affiché.
- Les noms ambigus peuvent retourner une mauvaise page Wikipédia ; dans ce cas, il faudra plus tard ajouter un champ manuel `wikidata_id` ou `wiki_title` par cible.
