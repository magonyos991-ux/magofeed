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
cd C:\Users\ilias\magofeed-functions; $b="https://raw.githubusercontent.com/magonyos991-ux/magofeed/main/functions-a-deployer/"; if (Test-Path firebase.json) { Copy-Item firebase.json firebase.json.avant -Force }; Invoke-WebRequest -UseBasicParsing -Uri ($b+"firebase.json.modele") -OutFile "firebase.json"; Invoke-WebRequest -UseBasicParsing -Uri ($b+"firestore.rules") -OutFile "firestore.rules"; Invoke-WebRequest -UseBasicParsing -Uri ($b+"firestore.indexes.json") -OutFile "firestore.indexes.json"; cd functions; if (Test-Path index.js) { Copy-Item index.js index.js.avant -Force }; foreach ($f in @("index.js","points-et-parrainage.js","anti-farm.js","notifications-push.js","emails-brevo.js","reconnaissance-ia.js","scan-frigo.js","commerces-monde.js","remplir-enseignes.js","importer-horaires.js","partage.js","sauvegarde.js","don-notification.js","dons.js","verification-commercant.js","recap-fondateur.js","migration-geohash.js")) { Invoke-WebRequest -UseBasicParsing -Uri ($b+$f) -OutFile $f; Write-Host "ok $f" }; npm install @duckdb/node-api geofire-common @google-cloud/firestore @anthropic-ai/sdk; cd ..; firebase deploy --only firestore:indexes; firebase deploy --only firestore:rules; firebase deploy --only functions
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

## Trois fonctions sans code source

Trois fonctions tournent en production et leur code n'est **dans aucun dossier
connu** : `aiCatalogDiscovery`, `notifyAdminNewUser` et `notifyWatchers`.
Elles ont été déployées à la main, avant l'existence de ce dépôt.

C'est pour elles que Firebase continuera de proposer une suppression. Réponds
**N**, tant qu'on n'a pas tranché.

`notifyWatchers` mérite un examen particulier. Le dépôt contient
`notifyStockToWatchers`, qui envoie une notification aux gens qui guettent une
boisson quand elle réapparaît en rayon. Les deux sont déployées. Si elles font
la même chose, **chaque réapparition de stock déclenche deux notifications** —
ce qui expliquerait le problème de cloche qui revient depuis des mois.

Pour le vérifier en trente secondes : console Firebase, onglet **Functions**,
regarde la colonne **Déclencheur** de `notifyWatchers`. Si elle indique un
déclencheur sur `stores/{id}`, c'est un doublon.

Pour récupérer le code d'une de ces trois avant d'en faire quoi que ce soit :
console Google Cloud, **Cloud Functions**, la fonction, onglet **Source**,
bouton **Télécharger le fichier ZIP**.

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
