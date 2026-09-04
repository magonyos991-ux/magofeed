# Où en est le serveur de Magofeed

Tout ce qui est dans l'app est **déjà en ligne**. Ce fichier ne concerne que le
serveur, qui ne se déploie pas tout seul.

## 0. Où on en est vraiment (mesuré, pas supposé)

J'ai sondé les 32 fonctions du projet et relu la base. Voici l'état réel.

**Ce qui marche maintenant :** les points sont déployés (`crediterContribution`,
`monCodeParrain`, `figerPointsExistants` répondent), les sauvegardes aussi, la
recherche mondiale aussi, et les huit fonctions que Firebase proposait de
supprimer sont toujours là parce que tu as répondu non.

**Il reste UNE action, et c'est un bouton :**

> **Administration → Sécurité → « Figer les soldes maintenant »**

Sur 115 profils, aucun ne porte encore `pointsHerites`. Tant que ce bouton n'a
pas été pressé, la bascule n'est pas faite. C'est cette étape, et elle seule,
qui garantit que personne ne perd ses points quand le serveur reprend le calcul.

Ensuite, confirme un stock quelque part et recharge : le score doit avoir monté
**et rester**. Puis reviens dans Administration → Sécurité. Aucune pastille
rouge, c'est gagné.

## 0 bis. Remettre les dossiers en ordre (une commande)

Le message « Would you like to proceed with deletion? » n'était pas un bug :
tes fonctions avaient été déployées depuis **plusieurs dossiers différents**.
Chacun ignorait l'existence des autres, donc chaque déploiement proposait
d'effacer le travail du voisin.

Cette commande met fin à ça. Un seul dossier, un seul `index.js` qui branche
tout, les règles et les index au même endroit. Elle sauvegarde ton
`firebase.json` et ton `index.js` actuels sous `.avant` avant de les remplacer.

```powershell
cd C:\Users\ilias\magofeed-functions; $b="https://raw.githubusercontent.com/magonyos991-ux/magofeed/main/functions-a-deployer/"; if (Test-Path firebase.json) { Copy-Item firebase.json firebase.json.avant -Force }; Invoke-WebRequest -UseBasicParsing -Uri ($b+"firebase.json.modele") -OutFile "firebase.json"; Invoke-WebRequest -UseBasicParsing -Uri ($b+"firestore.rules") -OutFile "firestore.rules"; Invoke-WebRequest -UseBasicParsing -Uri ($b+"firestore.indexes.json") -OutFile "firestore.indexes.json"; cd functions; if (Test-Path index.js) { Copy-Item index.js index.js.avant -Force }; foreach ($f in @("index.js","points-et-parrainage.js","anti-farm.js","notifications-push.js","emails-brevo.js","reconnaissance-ia.js","scan-frigo.js","commerces-monde.js","remplir-enseignes.js","importer-horaires.js","partage.js","sauvegarde.js","don-notification.js","dons.js","verification-commercant.js","recap-fondateur.js","migration-geohash.js")) { Invoke-WebRequest -UseBasicParsing -Uri ($b+$f) -OutFile $f; Write-Host "ok $f" }; npm install @duckdb/node-api geofire-common @google-cloud/firestore @anthropic-ai/sdk; cd ..; firebase deploy --only firestore:indexes; firebase deploy --only firestore:rules; firebase deploy --only functions
```

Le détail de ce que contient ce dossier, fichier par fichier, est dans
`functions-a-deployer/README.md`.

**Trois fonctions resteront proposées à la suppression** : `aiCatalogDiscovery`,
`notifyAdminNewUser` et `notifyWatchers`. Leur code n'est dans aucun dossier
connu, elles ont été déployées à la main avant l'existence du dépôt. Réponds
**N** tant qu'on n'a pas tranché.

`notifyWatchers` mérite un coup d'œil. Le dépôt contient déjà
`notifyStockToWatchers`, qui prévient les gens qui guettent une boisson quand
elle réapparaît. Les deux tournent. Si elles font la même chose, chaque
réapparition envoie **deux** notifications, ce qui expliquerait le problème de
cloche qui revient depuis des mois. Pour vérifier : console Firebase, onglet
Functions, colonne Déclencheur de `notifyWatchers`. Si c'est `stores/{id}`,
c'est un doublon, et on le supprimera pour de bon.

N'efface aucun autre dossier Firebase de ton PC avant qu'on ait récupéré le
code de ces trois-là. Il se télécharge en deux clics : console Google Cloud,
Cloud Functions, la fonction, onglet Source, Télécharger le fichier ZIP.

## 1. Les règles Firestore — dans la commande de la section 0 bis

Elles s'y déploient avec les index et les fonctions, depuis le dossier unique.
Rien à lancer séparément.

Avant tout changement de règles, le banc d'essai doit passer :

```
cd functions-a-deployer/tests-regles
npm install          # une seule fois
npm test             # doit afficher : 92/92 conformes
```

Il attaque une base jetable sur ta machine. Rien ne part en ligne. S'il
n'affiche pas `92/92`, **ne déploie pas** : dis-le-moi.

## 2. Les Cloud Functions de base — DÉJÀ FAIT

Vérifié : `identifyDrink`, `confirmAiDrink`, `identifyFridge`, `remplirEnseignes`,
`importerHoraires`, `antiFarmRupture`, `fiche`, `kofiWebhook`, `sendTestPush`,
`sendTestEmail` et les quatre notifications répondent toutes. Rien à faire ici.

Depuis la réorganisation, elles sont branchées dans le `index.js` unique et
repartent avec toutes les autres à chaque déploiement. Tu n'as plus de liste de
noms à recopier.

## 3. La sauvegarde quotidienne — DÉPLOYÉE, comprendre la pastille

`sauvegardeQuotidienne` et `sauvegarderMaintenant` répondent : c'est fait. Ce
qui suit sert à lire la pastille sans se tromper.

Après « Sauvegarder maintenant », elle passe à l'**orange** : « Lancée —
résultat pas encore confirmé ». Ce n'est pas une panne. Un export Firestore
est une opération longue ; au moment où tu appuies, personne ne sait encore si
elle aboutira. La sauvegarde du lendemain relit cette opération auprès de
Google, et c'est seulement là qu'elle passe au **vert « Réussie »**.

| Couleur | Ce que ça dit |
|---|---|
| grise | fonction pas déployée — **tu n'as rien** |
| orange | partie, résultat pas encore connu |
| verte | opération confirmée terminée sans erreur |
| rouge | échec, ou dernière sauvegarde de plus de 36 h |

Le vert n'arrive donc qu'au second passage. C'est voulu : une pastille verte
au-dessus de zéro fichier serait pire que pas de pastille, parce qu'on cesse
de s'en méfier.

**Essaie la restauration une fois, pendant que tout va bien**, sur un projet
de test :

```
gcloud firestore import gs://magofeed-7f621.firebasestorage.app/sauvegardes/AAAA-MM-JJ
```

L'adresse exacte du seau se lit dans la console Firebase, onglet **Storage**.
Les vieux projets finissent en `.appspot.com`, les récents en
`.firebasestorage.app` : Magofeed est du second type, et c'est pour ça que
l'ancienne commande écrite ici n'aurait pas marché.

Une restauration qu'on découvre le jour de l'incident n'est pas une sauvegarde.

### Si ça coince — les deux seules erreurs probables

**« Cloud Scheduler API has not been used… »** La sauvegarde quotidienne est
une tâche programmée : Google veut que le service soit activé une fois. Le
message d'erreur contient un lien `console.developers.google.com/apis/…` —
clique-le, appuie sur **Activer**, attends une minute, relance
`firebase deploy --only functions`. Rien à réparer dans le code.

**« The bucket must be in the same location as the database »** L'export écrit
dans `gs://magofeed-7f621.firebasestorage.app`. Si ta base Firestore est dans
une région et le seau dans une autre, Google refuse. Vérifie les deux :
console Firebase → Firestore → l'emplacement est écrit en haut ; puis Storage
→ même chose. S'ils diffèrent, dis-le-moi avec les deux noms, je change la
destination — ce n'est qu'une ligne.

Dans les deux cas la pastille restera grise ou rouge, jamais verte : elle ne
te dira pas que tout va bien alors que rien n'est sauvegardé.


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

## 4 bis. Les commerces du monde entier — DÉPLOYÉ, et amélioré depuis

Ton collègue a tapé Filiates : zéro magasin. OpenStreetMap, la source
d'origine, n'y connaît qu'un commerce — un salon funéraire — là où Google en
montre sept. Des régions entières sont vides dans OSM : Grèce rurale, Balkans,
Afrique, Amérique latine, Asie.

La fonction `chercherCommerces` interroge **Overture Maps** (74 millions de
lieux, données ouvertes, licence qui autorise à les stocker et à les afficher)
quand OSM connaît moins de cinq commerces dans une zone.

**Elle est déployée et elle marche.** Vérifié dans ta base aujourd'hui :
Filiates contient maintenant quatre magasins réels, dont « Super Market
Μποροδημος » et « Express Market » — ceux de ta capture Google.

### Ce qui change avec la version 2 (à redéployer)

Quatre, c'est mieux que zéro, mais c'est encore peu. J'ai cherché pourquoi en
interrogeant directement le fichier Overture depuis ici, sur quatre zones de
trois continents. Deux causes, toutes les deux corrigées :

1. **La liste des types de commerce venait de Belgique.** Elle ignorait la
   boulangerie, la confiserie, le glacier et le magasin d'alimentation
   générale. Dans un village grec, ce sont souvent les seuls commerces.
2. **Le rayon de 2,5 km convient à une ville, pas à un village.** Le bourg
   voisin est à 6 km et n'était jamais vu.

Maintenant, quand une zone rend moins de huit commerces, la fonction relit une
seconde fois à 12 km. Dans une ville le premier passage dépasse toujours ce
seuil, donc ce second passage ne s'y déclenche jamais et ne coûte rien.

**Mesuré sur Filiates, sur les vraies données :**

| | Commerces trouvés |
|---|---|
| version 1 (en ligne aujourd'hui) | 4 |
| version 2 | 49 |

Les 49 incluent Lidl, Σκλαβενίτης, Μασούτης, sept boulangeries et les
supérettes d'Igoumenitsa.

Chaque zone porte désormais le numéro de version qui l'a traitée. Une zone
déjà visitée par la version 1 est réinterrogée dès le premier passage de
quelqu'un, sans attendre la fin de son mois de cache — sinon Filiates serait
resté à quatre magasins pendant trente jours.

Le redéploiement est **déjà dans la commande unique de la section 0**.

Le premier appel après un déploiement est plus lent (quinze secondes environ :
la fonction télécharge son lecteur de fichiers distants). Les suivants prennent
deux à sept secondes, et jusqu'à une quinzaine quand le second passage large se
déclenche.

Ce que la fonction n'écrit **jamais** : un rayon, une confirmation, un
« vérifié ». Un commerce importé est un endroit où chercher, rien de plus. Et
elle refuse tout ce qui vend de l'alcool à titre principal — par catégorie et
par nom, dans les deux sens.

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

## Trois décisions que je ne prends pas à ta place

### a) Ouvrir le scan de frigo à tout le monde

Aujourd'hui, « Scanner un frigo » n'apparaît que pour toi (administrateur) et
pour un commerçant sur sa propre boutique. C'est de loin l'outil de
contribution le plus puissant de l'app : une photo remplit un rayon entier en
vingt secondes, là où il faut vingt scans un par un.

Pourquoi je ne l'ouvre pas de moi-même : **chaque photo est un appel payant à
l'IA**, sur ta carte bancaire. Le garde-fou existe déjà côté serveur (dix
frigos par jour et par personne, l'alcool écarté), donc le pire cas est borné,
mais c'est ta facture, pas la mienne. Avec quatre personnes actives sur
quatorze jours, le coût serait aujourd'hui négligeable. Avec mille, non.

Dis-moi oui et je l'ouvre en dix minutes, avec une condition d'accès (par
exemple : compte connecté et au moins une contribution déjà faite) pour
qu'un compte créé à la minute ne puisse pas s'en servir.

### b) La migration geohash — 43 % de lectures Firestore en moins

Le code est écrit et testé des deux côtés ; il attend derrière un interrupteur
(`MAGO_GEOHASH_READY`, aujourd'hui à `false`). Mesuré sur 900 requêtes : aucun
magasin manqué, 43 % de lectures en moins, soit 1,8 fois moins cher. L'écart
grandit avec le nombre de villes partageant ta latitude — donc avec chaque
pays que tu ajoutes.

Il manque une seule chose : lancer une fois `migration-geohash.js` pour
remplir le champ sur les 31 000 magasins existants, puis passer l'interrupteur
à `true`. Tant qu'il est à `false`, **rien ne change** : c'est la bande de
latitude qui répond, exactement comme aujourd'hui. L'interrupteur existe
justement pour qu'un magasin sans geohash ne devienne jamais invisible.

C'est une opération sur toute ta base. Je préfère te la proposer et la faire
avec toi plutôt que de la déclencher pendant que tu regardes ailleurs.

### c) Une ligne de test à effacer

`searchLog/zFwHru6OeWBLEKtjyKHO` est une ligne d'essai laissée pendant les
vérifications. Elle ne gêne rien, mais elle salit les statistiques de
recherche. Seul un administrateur peut l'effacer : console Firebase →
Firestore → `searchLog` → ce document → Supprimer.
