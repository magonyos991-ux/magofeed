# Ce qu'il te reste à faire — 10 minutes

Tout ce qui est dans l'app est **déjà en ligne**. Ce fichier ne concerne que le
serveur, qui ne se déploie pas tout seul.

## 0. URGENT — le crédit des points (10 min)

**Mesuré, pas supposé.** Voici ce que répondent tes fonctions maintenant.

| Fonction | Réponse | Traduction |
|---|---|---|
| `sauvegarderMaintenant` | 401 | déployée, elle marche |
| `sauvegardeQuotidienne` | 403 | déployée, elle marche |
| `chercherCommerces` | 401 | déployée |
| `identifyFridge` | 401 | déployée |
| `remplirEnseignes` | 401 | déployée, mais ancien code |
| `figerPointsExistants` | 404 | **absente** |
| `monCodeParrain` | 404 | **absente** |
| `utiliserCodeParrain` | 404 | **absente** |

Les sauvegardes sont réglées. Il reste le plus important.

**Plus personne ne gagne un seul point.** La règle qui interdit à un téléphone
de s'écrire 999 999 points est publiée, mais la fonction serveur qui devait
prendre le relais n'existe pas. Le score monte pendant la session, puis revient
en arrière au rechargement. Sur 115 profils, aucun ne porte `pointsHerites` :
la bascule n'a jamais eu lieu.

Il faut aussi redéployer deux fonctions dont la version en ligne est
périmée. `remplirEnseignes` marque encore des rayons « vérifiés » sans que
personne y soit entré, et `chercherCommerces` en est restée à la version qui
trouvait quatre commerces à Filiates au lieu de quarante-neuf.

### La commande

Même format que celle que tu viens de lancer. Copie tout, colle, Entrée.

```powershell
cd C:\Users\ilias\magofeed-functions\functions; Invoke-WebRequest -UseBasicParsing -Uri "https://raw.githubusercontent.com/magonyos991-ux/magofeed/main/functions-a-deployer/points-et-parrainage.js" -OutFile "points-et-parrainage.js"; Invoke-WebRequest -UseBasicParsing -Uri "https://raw.githubusercontent.com/magonyos991-ux/magofeed/main/functions-a-deployer/remplir-enseignes.js" -OutFile "remplir-enseignes.js"; Invoke-WebRequest -UseBasicParsing -Uri "https://raw.githubusercontent.com/magonyos991-ux/magofeed/main/functions-a-deployer/commerces-monde.js" -OutFile "commerces-monde.js"; if ((Get-Content index.js -Raw) -notmatch "points-et-parrainage") { Add-Content index.js "`nObject.assign(exports, require(`"./points-et-parrainage`"));" }; cd ..; firebase deploy --only functions
```

### Puis, dans l'app

**Administration → Sécurité → « Figer les soldes maintenant »**. C'est cette
étape, et elle seule, qui fait que personne ne perd ses points : elle recopie
le solde actuel de chacun dans `pointsHerites`, et le serveur repart de là.

### Les index composites, et pourquoi tu n'as plus à t'en occuper

Cinq requêtes anti-triche de ces fonctions filtrent sur deux champs à la fois.
Firestore fabrique un index par champ tout seul, jamais les combinaisons. Sans
elles, la requête ne rend pas une liste vide : elle **plante**. Le crédit des
points s'arrêterait net, la contribution serait quand même enregistrée, et
rien ne le dirait à personne.

C'était le dernier moyen que cette étape avait de rater en silence. Il est
fermé : chaque requête concernée rattrape maintenant ce cas précis, écrit ce
qui s'est passé, et **le panneau Administration → Sécurité affiche une pastille
rouge « Le crédit des points est bloqué » avec un bouton qui crée l'index
manquant en un clic.** Rien ne s'affiche tant que tout va bien.

Le repli est toujours choisi du côté prudent : aucun point n'est distribué sur
une vérification anti-triche qui n'a pas pu s'exécuter. Mieux vaut un point non
crédité qu'un point volé, et dans les deux cas tu le sais.

Tu peux donc aussi déployer les index d'avance, si tu retrouves le dossier qui
contient ton `firestore.rules` :

```
firebase deploy --only firestore:indexes
```

S'il répond qu'il ne trouve rien, copie `firestore.indexes.json` du dépôt à
côté de ton `firestore.rules`. Et si tu ne le fais pas, ce n'est plus grave :
la pastille te préviendra.

### Vérifier que ça a marché

Confirme un stock quelque part, recharge la page : le score doit avoir monté
**et rester**. Va ensuite voir Administration → Sécurité. Pas de pastille
rouge, tout va bien.

**Ce que cette commande ne déploie volontairement PAS :**
`verification-commercant.js`, le paiement commerçant. Il réclame deux secrets
Stripe et le paquet `stripe`. Sans eux, le déploiement **échouerait pour tout
le lot** — y compris les points. Il se déploie séparément, le jour où tu as un
compte Stripe : section 5.

Ce que je ne peux pas réparer : les contributions faites depuis la publication
des règles ne seront pas rattrapées. Les fonctions se déclenchent sur les
nouveaux documents, pas sur ceux déjà écrits.

## 1. Les règles Firestore (le plus important, 2 min)

Tant que tu ne lances pas cette commande, la base reste ouverte : toutes les
corrections de règles décrites plus bas ne s'appliquent pas.

```
cd functions-a-deployer/tests-regles
npm install          # une seule fois
npm test             # doit afficher : 92/92 conformes
cd ../..
firebase deploy --only firestore:rules
```

Le banc d'essai attaque une base jetable sur ta machine. Rien ne part en ligne.
S'il n'affiche pas `92/92`, **ne déploie pas** : dis-le-moi.

## 2. Les Cloud Functions de base — DÉJÀ FAIT

Vérifié aujourd'hui : `identifyDrink`, `identifyFridge`, `remplirEnseignes` et
les notifications répondent. Rien à faire ici. La commande d'origine est
gardée seulement au cas où il faudrait les réinstaller un jour :

```
firebase deploy --only functions:notifyHuntNearby,functions:notifyStockToWatchers,functions:notifyDiscoveryPromoted,functions:notifyPhotoRejected,functions:emailHuntStarted,functions:emailHuntFound,functions:sendTestEmail,functions:identifyDrink,functions:confirmAiDrink,functions:identifyFridge,functions:antiFarmRupture
```

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
