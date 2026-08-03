# Preuve d'antériorité horodatée — Magofeed

> Titulaire des droits (mention légale) : **Ilias Benabdellah** — Bruxelles, Belgique.
> Ce dossier constitue une **preuve datée, par tiers de confiance, infalsifiable**,
> que l'intégralité du code Magofeed existait à la date d'horodatage ci-dessous.
> Info générale — ceci n'est pas un conseil juridique.

## Ce qui a été fait ici (gratuit, automatique)

L'intégralité du code source (55 fichiers) a été résumée en **une empreinte
cryptographique unique** (SHA-256), puis cette empreinte a été **horodatée sur
la blockchain Bitcoin** via le protocole **OpenTimestamps**.

Personne — pas même toi — ne peut modifier après coup la date de cet ancrage.
Si un jour quelqu'un prétend avoir écrit ce code avant toi, cette preuve
démontre que **ton code existait déjà** à cette date, à la seconde près.

### Fichiers de ce dossier

| Fichier | Rôle |
|---|---|
| `EMPREINTES-fichiers.txt` | Empreinte SHA-256 de **chaque** fichier du projet |
| `EMPREINTE-GLOBALE.txt` | Empreinte unique de tout le projet (résume tout) |
| `EMPREINTE-GLOBALE.txt.ots` | **La preuve blockchain** (OpenTimestamps) — le fichier précieux |

### Données de référence (au moment de l'horodatage)

- **Empreinte globale SHA-256** : `eec660b3eb2a8893edfb4d1bf3aea4ad58a4017405bb8e0aa3c40703b019d1da`
- **Commit Git ancré** : `7d9f52f090b695e4d54d493bfbfbcd535ef6baef`
- **Nombre de fichiers empreintés** : 55

## Comment vérifier la preuve (toi ou un tribunal, plus tard)

1. Installer l'outil : `pip install opentimestamps-client`
2. Dans ce dossier, lancer :
   ```
   ots verify EMPREINTE-GLOBALE.txt.ots
   ```
   L'outil affiche la **date Bitcoin** à laquelle l'empreinte a été ancrée.
3. Pour prouver qu'un fichier n'a pas changé : recalculer son empreinte avec
   `sha256sum` et la comparer à `EMPREINTES-fichiers.txt`.

## ⏳ À faire dans ~24 h : « compléter » la preuve (30 secondes)

L'ancrage Bitcoin met quelques heures à être confirmé. Une fois confirmé, la
preuve peut être rendue **autonome** (elle n'aura plus besoin des serveurs
OpenTimestamps pour être vérifiée). Il suffit de lancer une fois :

```
ots upgrade EMPREINTE-GLOBALE.txt.ots
```

Puis re-commiter le fichier `.ots` mis à jour. (Si tu oublies, ce n'est pas
grave : la preuve reste valable, tant que les serveurs OpenTimestamps existent.)

---

## Voie officielle recommandée (Bruxelles) : i-DEPOT du BOIP

La preuve blockchain ci-dessus est excellente et **gratuite**. Pour une preuve
**officielle reconnue** en Belgique/Benelux (certificat papier opposable, très
apprécié des juges et investisseurs), ajoute par-dessus un **i-DEPOT** :

- Site : https://www.boip.int/fr/entrepreneurs/idepot
- Tarif : ~**37 €** pour 5 ans (ou ~**52 €** pour 10 ans)
- Ton **compte BOIP est à ton nom** (Ilias Benabdellah) → c'est LÀ que ton
  identité légale est officiellement liée au projet, en privé.
- **Quoi déposer** : exporte en PDF le fichier `01-CONCEPT-idepot.md`, et tu
  peux y joindre ce dossier de preuves (ou au moins `EMPREINTE-GLOBALE.txt`).

Résultat : tu combines **antériorité technique** (blockchain, datée à la
seconde) + **antériorité officielle** (i-DEPOT, certificat opposable). C'est la
ceinture **et** les bretelles.
