# Ce qu'il te reste à faire — 15 minutes, une seule fois

Tout ce qui est dans l'app est **déjà en ligne**. Ce fichier ne concerne que le
serveur, qui ne se déploie pas tout seul.

## 1. Les règles Firestore (le plus important, 2 min)

Tant que tu ne lances pas cette commande, la base reste ouverte : toutes les
corrections de règles décrites plus bas ne s'appliquent pas.

```
cd functions-a-deployer/tests-regles
npm install          # une seule fois
npm test             # doit afficher : 68/68 conformes
cd ../..
firebase deploy --only firestore:rules
```

Le banc d'essai attaque une base jetable sur ta machine. Rien ne part en ligne.
S'il n'affiche pas `68/68`, **ne déploie pas** : dis-le-moi.

## 2. Les Cloud Functions (10 min)

```
firebase deploy --only functions:notifyHuntNearby,functions:notifyStockToWatchers,functions:notifyDiscoveryPromoted,functions:notifyPhotoRejected,functions:emailHuntStarted,functions:emailHuntFound,functions:sendTestEmail,functions:identifyDrink,functions:confirmAiDrink,functions:identifyFridge,functions:antiFarmRupture
```

## 3. La sauvegarde quotidienne (5 min, à faire une fois)

```
cd functions
npm install @google-cloud/firestore
```

Ajoute au bout de `functions/index.js` :

```js
Object.assign(exports, require("./sauvegarde"));
```

Puis :

```
firebase deploy --only functions:sauvegardeQuotidienne,functions:sauvegarderMaintenant
```

Ouvre ensuite l'app → **Administration** → carte **Sécurité**, et appuie sur
« Sauvegarder maintenant ». La pastille doit passer au vert avec la date du
jour. Tant que la fonction n'est pas déployée, elle reste grise — c'est voulu :
une sauvegarde dont on ignore l'état est pire que pas de sauvegarde, parce
qu'on cesse de s'en méfier.

**Essaie la restauration une fois, pendant que tout va bien**, sur un projet de
test :

```
gcloud firestore import gs://TON-PROJET.appspot.com/sauvegardes/AAAA-MM-JJ
```

Une restauration qu'on découvre le jour de l'incident n'est pas une sauvegarde.

## 4. Deux réglages dans la console Firebase (5 min)

- **Restreindre la clé Web par référent HTTP.** Console Google Cloud →
  API et services → Identifiants → la clé Web → Restrictions d'application →
  Sites web → ajouter `magonyos991-ux.github.io/*` (et ton futur domaine).
  La clé restera publique dans la page — c'est normal, elle est faite pour ça —
  mais elle ne servira plus depuis ailleurs.

- **App Check.** C'est le mécanisme qui prouve qu'un appel vient bien de ton
  app et pas d'un script. Je ne l'ai volontairement pas activé : l'activer sans
  l'initialiser côté app couperait tout, pour tout le monde, d'un coup. C'est
  le prochain chantier de sécurité, et il se fait à deux — toi dans la console,
  moi dans le code.

## 4 bis. Les commerces du monde entier (10 min, à faire maintenant)

Ton collègue a tapé Filiates : zéro magasin. OpenStreetMap, la source de
l'app, n'y connaît qu'un commerce — un salon funéraire — là où Google en montre
sept. Des régions entières sont vides dans OSM : Grèce rurale, Balkans, Afrique,
Amérique latine, Asie.

La fonction `chercherCommerces` interroge **Overture Maps** (74 millions de
lieux, données ouvertes, licence qui autorise à les stocker et à les afficher
sur n'importe quelle carte) quand OSM connaît moins de cinq commerces dans une
zone. Vérifié sur Filiates : elle trouve les deux supérettes de ta capture
Google. Dakar : 44 commerces. Chaque zone n'est interrogée qu'une fois par mois,
pour tout le monde. Aucun compte, aucune clé, aucun coût de lecture.

```
cd functions
npm install @duckdb/node-api geofire-common
```

Ajoute au bout de `functions/index.js` :

```js
Object.assign(exports, require("./commerces-monde"));
```

Puis :

```
firebase deploy --only functions:chercherCommerces
```

Le premier appel après un déploiement est plus lent (quinze secondes environ :
la fonction télécharge son lecteur de fichiers distants). Les suivants prennent
deux à sept secondes.

**Pour tester :** ouvre l'app, cherche « Filiates », et attends. Le message en
bas de la carte doit passer par « Recherche des commerces dans le monde… » puis
afficher les magasins. Sans la fonction déployée, il dira honnêtement « Aucun
commerce connu ici (OpenStreetMap, Overture) » — et non plus « Aucun magasin »
comme si on avait cherché partout.

Ce que la fonction n'écrit **jamais** : un rayon, une confirmation, un
« vérifié ». Un commerce importé est un endroit où chercher, rien de plus. Et
elle refuse tout ce qui vend de l'alcool à titre principal.

## 5. Le jour où tu auras ton numéro d'entreprise

Tant que tu n'es pas enregistré, **saute cette section** : l'app marche, la
procédure manuelle de certification aussi, et rien ne casse.

Encaisser un euro en Belgique demande un numéro d'entreprise (BCE) et un compte
Stripe à ce nom. C'est une démarche du monde réel — guichet d'entreprises,
quelques centaines d'euros, quelques jours — que personne ne peut faire à ta
place.

Une fois que tu l'as :

```
cd functions
npm install stripe
firebase functions:secrets:set STRIPE_CLE
firebase functions:secrets:set STRIPE_WEBHOOK
```

Colle tes clés Stripe **uniquement** dans ces invites. Jamais dans un fichier,
jamais dans une conversation, jamais dans un message.

Ajoute au bout de `functions/index.js` :

```js
Object.assign(exports, require("./verification-commercant"));
```

Puis :

```
firebase deploy --only functions:ouvrirVerificationCommercant,functions:stripeWebhook
```

Le déploiement affiche l'adresse de `stripeWebhook`. Va la coller dans Stripe →
Développeurs → Webhooks, en écoutant l'événement `checkout.session.completed`.
Stripe te donne alors une clé de signature `whsec_...` : refais
`firebase functions:secrets:set STRIPE_WEBHOOK` avec elle, et redéploie
`stripeWebhook`.

Enfin, **une seule ligne à changer dans l'app** — cherche `VERIF_PAIEMENT` dans
`index.html` et passe-le de `false` à `true`. Le bouton « Vérifier ma boutique
— 1 € » apparaît alors dans la fiche de revendication, avec le formulaire
manuel conservé juste en dessous.

Ce que le paiement pose, et ce qu'il ne pose pas : il prouve **qui** tient la
boutique, donc il pose le badge « tenu par son gérant » et la fiche privée. Il
ne pose jamais « rayon vu sur place » (un fait constaté) ni « mis en avant »
(de la publicité). C'est toute la raison pour laquelle ces trois signaux ont
été séparés avant d'ouvrir une caisse.

## Ce que je n'ai pas fait, et pourquoi

- **Une politique de contenu (CSP) complète.** L'app utilise des gestionnaires
  d'événements en ligne partout et parle à une dizaine de domaines
  (OpenStreetMap, Nominatim, Overpass, Open Food Facts, Firebase, cdnjs…). Une
  CSP trop serrée casse l'app en silence, et je ne peux pas tester tous ces
  domaines depuis ici. La partie qui compte le plus — la vérification
  d'intégrité des trois bibliothèques chargées depuis cdnjs — est faite et
  testée.

- **Le profil public reste lisible par tous.** C'est ce qui fait marcher le
  classement et la recherche de joueurs. Ce qui y figure est ce que tu as
  choisi d'y mettre : pseudo, avatar, points, dix favoris. Le fermer voudrait
  dire passer ces deux écrans par une Cloud Function.

- ~~Le champ `owner` d'un magasin certifié est public~~ — **corrigé.** Le lien
  boutique-gérant vit maintenant dans `merchants/{uid}`, lisible par son seul
  propriétaire. Les magasins certifiés avant ce changement continuent de
  fonctionner grâce à l'ancien champ, qui n'est plus jamais écrit.
