# Le code serveur de Magofeed — un seul dossier, une seule vérité

Tout ce qui tourne sur Firebase est dans **ce dossier du dépôt**, et nulle part
ailleurs. Sur ton PC, il n'existe **qu'un seul** dossier de déploiement :

```
C:\Users\ilias\magofeed-functions\
    firebase.json              <- dit a Firebase ou trouver le reste
    firestore.rules            <- les regles de securite de la base
    firestore.indexes.json     <- les index composites
    functions\
        index.js               <- branche toutes les fonctions
        *.js                   <- les fonctions elles-memes
        node_modules\          <- installe par npm, jamais touche a la main
```

## Pourquoi ce fichier a été réécrit

Les fonctions avaient été déployées au fil des mois depuis **plusieurs dossiers
différents**. Le jour où on déployait depuis l'un, Firebase constatait que les
fonctions de l'autre n'étaient plus dans le code source et proposait de les
**supprimer**. Un « oui » de trop et huit fonctions qui marchent disparaissaient.

C'est fini. Un dossier, un `index.js`, tout dedans.

## La règle à ne jamais oublier

> Si Firebase demande **« Would you like to proceed with deletion? »**, la
> réponse est **N**.

Répondre non ne bloque rien : le message le dit lui-même, le reste du
déploiement continue. Ne réponds `y` que si tu sais exactement quelle fonction
disparaît et pourquoi.

## Remettre tout en ordre — une seule commande

Elle sauvegarde ton `firebase.json` et ton `index.js` actuels sous
`.avant`, télécharge la version de référence de chaque fichier, installe les
dépendances, puis déploie les index, les règles et les fonctions dans cet
ordre.

```powershell
cd C:\Users\ilias\magofeed-functions; $b="https://raw.githubusercontent.com/magonyos991-ux/magofeed/main/functions-a-deployer/"; if (Test-Path firebase.json) { Copy-Item firebase.json firebase.json.avant -Force }; Invoke-WebRequest -UseBasicParsing -Uri ($b+"firebase.json.modele") -OutFile "firebase.json"; Invoke-WebRequest -UseBasicParsing -Uri ($b+"firestore.rules") -OutFile "firestore.rules"; Invoke-WebRequest -UseBasicParsing -Uri ($b+"firestore.indexes.json") -OutFile "firestore.indexes.json"; cd functions; if (Test-Path index.js) { Copy-Item index.js index.js.avant -Force }; foreach ($f in @("index.js","points-et-parrainage.js","anti-farm.js","notifications-push.js","emails-brevo.js","reconnaissance-ia.js","scan-frigo.js","commerces-monde.js","remplir-enseignes.js","importer-horaires.js","partage.js","sauvegarde.js","don-notification.js","outils-admin.js","notif-admin.js","catalogue-ia.js","dons.js","verification-commercant.js","recap-fondateur.js","migration-geohash.js")) { Invoke-WebRequest -UseBasicParsing -Uri ($b+$f) -OutFile $f; Write-Host "ok $f" }; npm install @duckdb/node-api geofire-common @google-cloud/firestore @anthropic-ai/sdk; cd ..; firebase deploy --only firestore:indexes; firebase deploy --only firestore:rules; firebase deploy --only functions
```

Après ça, les autres dossiers Firebase de ton PC ne servent plus à rien. Ne les
efface pas tout de suite : lis d'abord « Trois fonctions sans code source »
plus bas.

## Ce qui tourne, et d'où ça vient

| Fichier | Fonctions | Secret nécessaire |
|---|---|---|
| `points-et-parrainage.js` | crédit des points, parrainage, gel des soldes | aucun |
| `anti-farm.js` | sanction des faux stocks | aucun |
| `notifications-push.js` | découverte promue, photo refusée, chasse proche, stock guetté | aucun |
| `emails-brevo.js` | e-mails de chasse | `BREVO_API_KEY` (en place) |
| `reconnaissance-ia.js` | reconnaissance d'une boisson par photo | `ANTHROPIC_API_KEY` (en place) |
| `scan-frigo.js` | une photo de frigo, tout un rayon | `ANTHROPIC_API_KEY` (en place) |
| `commerces-monde.js` | commerces du monde entier via Overture Maps | aucun |
| `remplir-enseignes.js` | rayon **probable** d'une enseigne, jamais « vérifié » | aucun |
| `importer-horaires.js` | horaires d'ouverture depuis OpenStreetMap | aucun |
| `partage.js` | aperçu des liens partagés | aucun |
| `sauvegarde.js` | sauvegarde de la base, chaque nuit et à la demande | aucun |
| `don-notification.js` | notification à chaque don Ko-fi | `KOFI_JETON` (en place) |
| `notif-admin.js` | push quand quelqu'un s'inscrit ou lie son Gmail | aucun |
| `catalogue-ia.js` | fiche écrite par l'IA sur un code-barres inconnu, alcool écarté | `ANTHROPIC_API_KEY` (en place) |
| `outils-admin.js` | **pas une fonction** : l'outil partagé qui prévient les admins | aucun |

## Ce qui attend, et ce qui l'attend

| Fichier | Ce qui manque |
|---|---|
| `verification-commercant.js` | un compte Stripe, puis `STRIPE_CLE` et `STRIPE_WEBHOOK` |
| `dons.js` | un compte Stripe, puis `STRIPE_CLE` et `STRIPE_WEBHOOK_DON` |
| `recap-fondateur.js` | ta décision : il t'envoie une push par jour, tous les jours |

Les trois sont dans le dossier mais pas branchés dans `index.js`. Les brancher
avant d'avoir leurs secrets ferait **échouer le déploiement du lot entier**,
points compris. Les lignes sont écrites en commentaire au bas de `index.js`,
il n'y a qu'à enlever les deux slashs.

`migration-geohash.js` n'est pas une fonction : c'est un script à lancer une
fois, à la main. Il ne doit jamais être branché dans `index.js`.

## Le code perdu, retrouvé le 4 septembre 2026

Trois fonctions tournaient en production sans qu'aucune copie n'existe dans le
dépôt. Elles avaient été déployées à la main, avant l'existence de ce dossier.
C'est pour elles que Firebase proposait une suppression à chaque déploiement,
et un « oui » les aurait effacées définitivement.

Leur source a été récupérée dans la console Cloud Run, onglet **Source** du
service. Les trois tenaient dans un seul `index.js`.

| Fonction | Décision |
|---|---|
| `aiCatalogDiscovery` | **gardée**, rangée dans `catalogue-ia.js` |
| `notifyAdminNewUser` | **gardée**, rangée dans `notif-admin.js` |
| `notifyWatchers` | **supprimée** : doublon avéré |

### notifyWatchers : la cloche qui sonnait deux fois

Elle écoutait `stores/{storeId}` en `written`. `notifyStockToWatchers`, celle
du dépôt, écoute le **même chemin** en `updated`. Les deux partaient à chaque
mise à jour d'un magasin : les gens recevaient deux notifications au lieu
d'une, depuis le 26 juillet 2026.

Celle qu'on garde est aussi la meilleure des deux. Elle porte le garde-fou
contre la tempête, qui la fait taire au-delà de trois boissons ajoutées d'un
coup — un remplissage d'enseigne en ajoute jusqu'à mille deux cents sur des
milliers de magasins, et sans ce garde-fou le déclencheur part une fois par
boisson et par magasin. Elle respecte aussi le rayon choisi par la personne, de
1 à 20 km, là où l'ancienne imposait 10 km à tout le monde. Et elle recoupe
l'identité du destinataire avant d'envoyer.

Son code a été lu, compris, et volontairement pas conservé.

### Ce qui a été corrigé en rangeant aiCatalogDiscovery

**L'emoji.** La version d'origine en demandait un à l'IA et l'écrivait dans la
fiche. Magofeed n'en affiche aucun, c'est une règle absolue, et les 696
boissons natives portent toutes `emoji:""`. Cette fonction était la porte par
laquelle ils revenaient : **39 des 65 fiches du catalogue partagé en portaient
un**, et l'application les affichait vraiment. Le champ est maintenant vide, et
le mot ne figure même plus dans la demande faite à l'IA. Pour nettoyer les
fiches déjà écrites, il y a un bouton dans Administration → Sécurité.

**L'alcool, deux fois plutôt qu'une.** On ne fait plus dépendre d'un seul
booléen renvoyé par un modèle la promesse la plus importante de l'app. Une
liste de mots passe sur le nom et la marque, avant l'appel à l'IA puis sur ce
qu'elle propose, et le degré d'alcool publié par OpenFoodFacts est lu
directement.

L'ordre compte dans ce filtre. La ginger beer, le ginger ale, la root beer, le
Virgin Cola et la Malta portent un mot d'alcool sans en contenir une goutte —
ce sont exactement les sodas exotiques que Magofeed existe pour trouver. Ils
sont reconnus **avant** la liste des mots interdits. Et chaque mot court est
borné des deux côtés : sans cela, `gin` attrapait Virgin Cola, `ale` attrapait
Pale, `rum` attrapait Serum. 35 cas d'essai passent, faux positifs compris.

**Le dédoublonnage** relisait le catalogue entier à chaque scan. Il cherche
maintenant d'abord par code-barres, ce qui est exact et ne coûte qu'une
lecture.

**L'identifiant** venait de `Date.now()`, donc deux scans dans la même
milliseconde recevaient le même numéro. La place est désormais vérifiée avant
l'écriture.

## Les règles de sécurité

Elles se déploient avec la commande ci-dessus. Avant tout changement, le banc
d'essai doit passer :

```
cd functions-a-deployer/tests-regles
npm install          # une seule fois
npm test             # doit afficher : 92/92 conformes
```

Il attaque une base jetable sur ta machine. Rien ne part en ligne. S'il
n'affiche pas `92/92`, ne déploie pas.
