# NINA : alias filtres + HFR/FWHM/SQM

Cette version normalise les filtres NINA avant écriture en base :

- `V` est fusionné avec `G`
- `O`, `O3`, `OIII` deviennent `OIII`
- `S`, `S2`, `SII` deviennent `SII`
- `H`, `Ha`, `H-alpha` deviennent `H-alpha`
- filtre inconnu/vide reste envoyé en `L` par défaut côté agent si `NINA_FALLBACK_FILTER=L`

Elle ajoute aussi trois colonnes optionnelles dans `sessions` :

- `hfr`
- `fwhm`
- `sqm`

L'app essaie de lire ces valeurs depuis les champs NINA, ou à défaut depuis le nom du fichier avec des motifs du type :

```text
..._HFR-2.54_SQM-19.72_...
..._HFR_2.54_SQM_19.72_...
..._FWHM-3.10_...
```

Dans l'onglet Stats, la période courante affiche par filtre :

```text
HFR moyen ± écart type
FWHM moyen ± écart type
SQM moyen ± écart type
```

SQM restera vide si NINA ne reçoit pas une vraie valeur depuis une source météo/sky-quality ou si le token ne se résout pas dans le nom de fichier.

## Migration Neon

Exécuter une fois :

```text
db/migrations/007_filter_aliases_quality.sql
```

## Agent NINA

Copier le nouveau script sur le PC remote :

```text
C:\DSO\nina_agent\nina_sync_agent.py
```

Puis relancer l'agent.
