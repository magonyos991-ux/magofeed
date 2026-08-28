# Magofeed — code serveur à déployer (règles + Cloud Functions)

Ce dossier contient le code **serveur** que l'app ne peut pas exécuter toute seule.
Tout est **testable/déployable par toi**, jamais mis en prod sans essai.

> ⚠️ Je (Claude) **n'ai pas accès à ton projet Firebase** : je n'ai rien pu exécuter.
> Teste chaque morceau à l'émulateur (`firebase emulators:start`) puis en prod.

## Ce qu'il y a dans le dossier

| Fichier | Rôle | Risque | Quand |
|---|---|---|---|
| `firestore.rules` | **Règles de sécurité** : verrouille qui peut écrire quoi (inclut désormais `presence` = temps réel, et `hunts` = chasses de zone) | Faible | **Maintenant (à re-publier)** |
| `notifications-push.js` | **Push réel** sur le téléphone (découverte promue / photo à refaire / **chasse près de toi**), même app fermée | Faible (n'ajoute aucun point) | **Maintenant** |
| `locate-stores.js` | Remplace le faux « +0 magasins » : localise de vrais commerces via OSM, sans stock inventé | Faible | Quand tu veux |
| `points-serveur-PHASE2.js` | Points **validés côté serveur** (infalsifiables) + bases de la réputation | Moyen (change qui crédite les points) | Plus tard, en suivant la « Bascule Phase 2 » |
| `anti-farm.js` | **Les faux stocks font perdre des points** : une annonce contredite par 2 personnes sur place est sanctionnée, et la sanction est ineffaçable | Faible (ne crédite rien, ne fait que retirer) | **Maintenant**, avec les règles |
| `migration-geohash.js` | **Recherche de magasins par geohash** : arrête de lire les magasins de Cologne à chaque recherche faite à Bruxelles | Faible (n'écrit qu'un champ, relançable) | Quand tu veux |
| `partage.js` | **Aperçu des liens partagés** : une vraie vignette (titre + photo) pour les boissons de la communauté et les magasins, qui n'ont pas de page pré-générée | Faible (ne lit que des données publiques) | Quand tu veux |
| `sauvegarde.js` | **Sauvegarde automatique** de toute la base, chaque nuit à 3 h, plus un bouton « Sauvegarder maintenant » dans l'administration | Faible (ne fait que lire et copier) | **Maintenant** |
| `tests-regles/` | **Banc d'essai des règles** : 34 épreuves qui attaquent la base pour vérifier qu'elle tient, et que les usages normaux passent toujours | Aucun (tourne chez toi, sur une base jetable) | Avant chaque déploiement de règles |

---

## 1) Déployer les RÈGLES (le plus important, ~5 min)

Les règles empêchent, par exemple, qu'un utilisateur se déclare admin, promeuve
sa propre découverte, ou écrive une notification à quelqu'un d'autre.

1. Copie `firestore.rules` dans ton projet (fichier `firestore.rules` à la racine,
   référencé par `firebase.json`).
2. **Vérifie 2 choses** marquées `ADAPTE` dans le fichier :
   - la **casse de la collection magasins** que ton app utilise (`stores` vs `Stores`) ;
   - la **région** si besoin.
3. Teste : Console Firebase → **Firestore → Règles → Terrain de jeu**, ou l'émulateur.
4. Déploie : `firebase deploy --only firestore:rules`

> 🔸 **Limite honnête (Phase 1)** : le solde de points reste écrit par le client.
> Pour le rendre infalsifiable, il faut la **Phase 2** (plus bas), puis activer la
> « VERSION STRICTE » indiquée en bas de `firestore.rules`.

## 1 bis) Vérifier les règles AVANT de les déployer (~3 min la première fois)

Une règle Firestore ne prévient jamais quand elle laisse passer quelque chose.
Le banc d'essai pose la question à l'envers : il **essaie d'attaquer** la base
et échoue si l'attaque réussit. Il vérifie aussi que les usages normaux passent
toujours — une règle trop serrée casse l'app aussi sûrement qu'une règle trop
lâche la met en danger.

C'est ce banc d'essai qui a trouvé que `match /{doc=**}` sous `users/{uid}`
couvrait le document lui-même et annulait en silence **toutes** les protections
du profil, y compris la ligne censée rendre ineffaçable la sanction anti-triche.
À la lecture, la règle paraissait juste.

```
cd functions-a-deployer/tests-regles
npm install          # une seule fois
npm test
```

Il faut Java installé (l'émulateur Firestore tourne dessus). Rien ne part en
ligne : tout se passe sur ta machine, sur une base jetable.

Tu dois lire `34/34 conformes`. Si une ligne passe de `ok` à `ECHEC`,
**ne déploie pas** : soit la règle est trop lâche (une attaque passe), soit elle
est trop serrée (un usage normal est bloqué). Les deux se réparent avant, pas
après.

## 1 ter) Déployer la SAUVEGARDE automatique (~10 min)

Sans sauvegarde, une fausse manœuvre est définitive. La fonction exporte toute
la base chaque nuit à 3 h (heure de Bruxelles) vers ton propre stockage Firebase,
dans un dossier daté.

1. Copie `sauvegarde.js` dans ton dossier `functions`.
2. Dans ce dossier : `npm install @google-cloud/firestore`
3. Ajoute au bout de `functions/index.js` :
   ```js
   Object.assign(exports, require("./sauvegarde"));
   ```
4. Déploie :
   ```
   firebase deploy --only functions:sauvegardeQuotidienne,functions:sauvegarderMaintenant
   ```
5. Ouvre l'app, va dans **Administration**. Une carte « Sécurité » apparaît en
   bas. Appuie sur **Sauvegarder maintenant** : la pastille doit passer au vert
   avec la date du jour.

La pastille devient **rouge** si la dernière sauvegarde date de plus de 36 h, et
reste **grise** tant que la fonction n'est pas déployée. Une sauvegarde dont on
ignore l'état est pire que pas de sauvegarde : on cesse de s'en méfier.

**Restaurer**, le jour où il le faut :
```
gcloud firestore import gs://TON-PROJET.appspot.com/sauvegardes/AAAA-MM-JJ
```
Fais-le une fois pour de faux, sur un projet de test, pendant que tout va bien.
Une restauration qu'on découvre le jour de l'incident n'est pas une sauvegarde.

## 2) Déployer le PUSH réel (~10 min)

C'est la pièce que l'app ne peut pas faire seule : notifier le téléphone même
app fermée. L'app écrit déjà le message in-app et crédite les points ; ces
fonctions **ajoutent seulement le push** (aucun point → zéro risque de doublon).

1. Copie **tous** les `exports` de `notifications-push.js` dans ton `functions/index.js`
   (ou importe le fichier). Garde tes autres fonctions.
2. `package.json` : Node 18+, `firebase-admin` et `firebase-functions` **v2**.
3. Vérifie que **Cloud Messaging** est activé et que la clé VAPID est bien celle
   déjà dans l'app (`window.MAGO_VAPID_KEY`). Les utilisateurs doivent avoir
   activé les notifications (l'app enregistre alors leur token dans `pushTokens`).
4. Déploie : `firebase deploy --only functions:notifyDiscoveryPromoted,functions:notifyPhotoRejected,functions:notifyHuntNearby,functions:notifyStockToWatchers,functions:sendTestPush`
   (ou plus simplement `firebase deploy --only functions` pour tout redéployer.)
5. Teste : promeus une découverte de test → l'auteur doit recevoir le push.

> 🧪 **sendTestPush** (nouveau) : fonction *callable* déclenchée par le bouton
> « Tester la notification » dans **Réglages → Notifications** de l'app. Elle
> renvoie un vrai push FCM sur le téléphone de l'utilisateur (uniquement son
> propre token). Idéal pour prouver, en 1 tap, que les notifs arrivent **même
> app fermée** : tape le bouton, ferme l'app, la notif « 🎉 Ça marche ! » arrive.
> Tant qu'elle n'est pas déployée, le bouton l'indique poliment sans planter.

> 🎯 **notifyHuntNearby** : quand quelqu'un met une boisson en veille (= lance une
> « chasse »), les gens à moins de ~15 km reçoivent « Chasse près de toi ». Le
> tableau in-app « Chasses près de toi » marche DÉJÀ sans serveur (il lit la
> collection `hunts`) ; cette fonction ajoute seulement le push téléphone.
>
> ✅ **notifyStockToWatchers** : l'autre moitié de la chasse — quand un chasseur
> ajoute la boisson à un magasin, ceux qui la guettaient (veille) et sont à
> proximité reçoivent « Trouvée près de toi, voilà où l'acheter ». (En attendant
> le déploiement, ils sont déjà prévenus dans l'app à leur prochaine ouverture.)

## 3) (Optionnel) Localiser les magasins — `locate-stores.js`

Voir les commentaires en tête du fichier. Ajoute de vrais commerces (OSM) **sans
stock inventé** (`drinks: []`) ; la communauté remplit le stock. Coupe d'abord
l'ancien job « +0 » dans Console → Functions.

---

## 4) Anti-farm : les faux stocks coûtent des points — `anti-farm.js` (~10 min)

Le problème : annoncer « en stock » rapporte +10 points, et rien n'empêchait
quelqu'un d'en inventer depuis son canapé. Les points montaient, la carte
devenait fausse, et les vraies personnes se déplaçaient pour rien.

**Ce que fait la fonction** — à chaque signalement de rupture, elle regarde qui
avait annoncé cette boisson en stock dans ce magasin. Si **2 personnes
différentes** (ni l'auteur, ni deux fois la même) ont signalé l'absence dans les
**10 jours**, l'auteur perd **10 points** — exactement ce que l'annonce lui avait
rapporté.

**Ce qui protège les honnêtes :**

- il faut deux témoins, donc un seul râleur ne peut sanctionner personne ;
- ses propres corrections ne comptent jamais contre lui ;
- au-delà de 10 jours, plus de sanction : une boisson vue puis vendue, c'est la
  vie d'un rayon, pas un mensonge ;
- une même annonce n'est sanctionnée qu'**une fois** (verrou `penalties/{clé}`).

**Ce qui la rend ineffaçable :** la sanction ne touche pas `users/{uid}.points`
(que l'app réécrit à chaque synchronisation), mais un champ séparé
`users/{uid}.penalty`. Les règles de ce dossier **interdisent au client d'y
toucher**. L'app affiche partout `points − penalty` : profil, niveau, classement.
Vider le cache du navigateur ne rend pas les points.

1. Copie les `exports` de `anti-farm.js` dans ton `functions/index.js`.
2. **Re-publie les règles d'abord** (`firestore.rules` de ce dossier) : sans la
   ligne qui protège `penalty`, la fonction ne sert à rien.
3. Déploie : `firebase deploy --only functions:antiFarmRupture`
4. **Attends-toi à une erreur au premier déclenchement** : Firestore réclamera un
   **index composite** sur `reports` (`storeId` + `drinkId` + `type` +
   `createdAt`). Le lien de création est dans le message d'erreur
   (Console → Functions → Journaux) : un clic, deux minutes, c'est fait. Tant
   que l'index n'existe pas, la fonction se contente d'écrire un avertissement
   dans les logs — elle ne casse rien.

**Pour vérifier que ça marche** : depuis deux comptes différents, signale une
rupture sur une boisson qu'un troisième compte avait annoncée en stock. Le
troisième compte doit voir `-10 points` dans sa cloche, et son total baisser.
Côté console, un document apparaît dans `penalties`.

**Pour lever une sanction** (erreur, faux signalements coordonnés) : Console
Firestore → `users/{uid}` → mets `penalty` à la valeur voulue. Le client la
relit au prochain lancement.

## 5) Aperçu des liens partagés — `partage.js` (~10 min)

Quand tu colles un lien dans WhatsApp, Instagram ou TikTok, l'application va lire
la page en coulisses et fabrique la vignette (titre, description, photo) à partir
de balises cachées. Magofeed étant une application en **une seule page**, tous les
liens donnaient la même vignette générique. D'où le dossier `f/` : **571 pages
pré-générées**, une par boisson du catalogue, chacune avec son vrai titre et sa
vraie photo.

Deux choses n'ont pas de page — et ce sont les plus partageables :

- **les boissons ajoutées par la communauté**, qui vivent dans Firestore et ne
  peuvent donc pas être pré-générées ;
- **les magasins** — un commerçant qui partage sa propre fiche est le meilleur
  ambassadeur possible.

Cette fonction fabrique leur page **à la demande**. Les robots des réseaux
sociaux lisent les balises et s'arrêtent là ; l'humain, lui, est redirigé vers
l'app en une fraction de seconde. C'est exactement la technique des pages `f/`.

1. Copie `partage.js` dans ton dossier `functions/`.
2. Ajoute dans `index.js` : `exports.fiche = require("./partage").fiche;`
3. Déploie : `firebase deploy --only functions:fiche`
4. **Note l'adresse affichée à la fin du déploiement**, du genre
   `Function URL (fiche(europe-west1)): https://fiche-xxxxxxxx-ew.a.run.app`
5. Colle-la dans `index.html`, ligne `var MAGO_FICHE_URL="";` (cherche
   `MAGO_FICHE_URL`), puis redéploie l'app.

> **Tant que `MAGO_FICHE_URL` est vide, rien ne change** : l'app partage les liens
> d'avant. Tu peux donc déployer la fonction sans toucher à l'app, ou l'inverse,
> sans jamais rien casser.

**Pour vérifier :** ouvre l'adresse de la fonction dans ton navigateur avec
`?s=` suivi de l'identifiant d'un magasin — tu dois atterrir dans l'app. Puis
colle ce même lien dans une conversation WhatsApp avec toi-même : la vignette
doit afficher le nom du magasin.

Un lien inconnu (boisson supprimée, identifiant bidon) ne renvoie jamais d'erreur :
il affiche une vignette Magofeed générique et ouvre l'accueil. Un lien partagé qui
affiche « erreur 404 » dans une conversation, c'est pire que pas de lien du tout.

## 6) Recherche par geohash — `migration-geohash.js` (~10 min)

**Le problème.** L'app cherche les magasins par **bande de latitude** : elle
demande à Firestore tous les magasins entre deux latitudes, puis filtre la
longitude dans le téléphone. Or une bande de latitude fait le tour de la Terre.
À Bruxelles (50,85°N), une bande de ±10 km contient aussi Cologne, Prague,
Cracovie et Kiev.

Mesuré sur une Europe simulée à densité réaliste : **236 magasins de Cologne lus
à chaque recherche faite à Bruxelles**. Firestore facture les documents **lus**,
pas ceux qu'on garde. Aujourd'hui ça reste supportable parce que presque tous
tes magasins sont belges. Le jour où une deuxième ville étrangère se remplit à
ta latitude, la facture double sans qu'une seule recherche de plus soit faite.

**La solution.** Un geohash encode une position en une chaîne dont le **préfixe**
désigne un carré : deux points proches partagent un préfixe. La recherche
circulaire devient alors 4 à 9 requêtes sur des plages de chaînes triées, au
lieu d'une bande planétaire. C'est l'algorithme de GeoFire, réécrit directement
dans `index.html` pour ne pas ajouter de dépendance à une app sans bundler.

**Mesuré** (900 requêtes simulées, comparées à un calcul de distance exhaustif) :
**0 magasin manqué**, **43 % de lectures en moins**, soit 1,8× moins cher. Et
l'écart grandit avec le nombre de villes partageant ta latitude — donc avec
l'internationalisation.

**Pourquoi rien ne peut casser.** L'app écrit **déjà** le champ `geohash` sur
tout magasin créé, importé ou déplacé, mais ne s'en sert pas encore : le drapeau
`MAGO_GEOHASH_READY` est à `false` dans `index.html`. Tant qu'il y est, c'est la
bande de latitude qui répond, exactement comme avant. Et même une fois levé, si
la requête par geohash échoue, l'app **retombe toute seule** sur l'ancienne
méthode plutôt que d'afficher une carte vide.

1. Récupère une clé de compte de service (Console → Paramètres → Comptes de
   service → Générer une nouvelle clé privée), enregistre-la en
   `serviceAccount.json` à côté du script. **Ne la commite jamais.**
2. `npm install firebase-admin`
3. Simulation d'abord : `node migration-geohash.js --dry-run`
4. Pour de vrai : `node migration-geohash.js`
5. **Seulement une fois la migration passée** : dans `index.html`, mets
   `MAGO_GEOHASH_READY = true`, puis redéploie.

> ⚠️ **L'ordre compte.** Lever le drapeau AVANT de migrer rendrait invisibles
> tous les magasins sans geohash — donc une carte vide. Migrer sans lever le
> drapeau, à l'inverse, ne fait rigoureusement rien : le champ est écrit et pas
> encore lu. Migre d'abord, toujours.

Le script est relançable autant de fois que tu veux : il saute les magasins déjà
migrés, donc une coupure au milieu n'est pas un problème — relance, il reprend.
Aucun index composite à créer : la requête ne trie que sur `geohash`, et
Firestore indexe seuls les champs simples.

---

## Bascule PHASE 2 — points infalsifiables (à faire quand tu es prêt)

Objectif : que les points ne puissent plus être trafiqués depuis la console.

**Ordre impératif (sinon double crédit de +50) :**

1. Déploie `awardPromotionPoints` de `points-serveur-PHASE2.js`
   (`firebase deploy --only functions:awardPromotionPoints`).
2. Dans **index.html**, retire le crédit **client** de la promotion pour ne pas
   compter deux fois. Dans le gestionnaire `fbNotifsReady`, remplace le bloc qui
   fait `userStats.pts+=PROMO_REWARD` par : garder l'affichage de la bannière,
   mais **ne plus incrémenter les points** (le serveur s'en charge ; ils
   arrivent au prochain chargement du profil). Le reste (confettis, badge) reste.
3. Quand tu auras basculé **tous** les crédits de points côté serveur, active la
   **« VERSION STRICTE »** de `users/{uid}` (en bas de `firestore.rules`) :
   le client ne pourra plus écrire `points/discAccepted/trust/...`.

> 📋 **Avant de te lancer : lis `POINTS-PHASE2-plan.md`.** L'app crédite des
> points à **28** endroits ; ce fichier n'en couvre qu'**un**. Activer la
> version stricte des règles aujourd'hui gèlerait les 27 autres. Le plan
> donne l'inventaire et l'ordre par valeur du point.

**Réputation (couche 1 anti-triche)** : le squelette est fourni en commentaire
dans `points-serveur-PHASE2.js`. Il demande d'abord d'enregistrer les
confirmations **par utilisateur** (aujourd'hui elles sont agrégées sans trace
de qui confirme). Dis-moi quand tu veux t'y attaquer, je te guide pas à pas.

---

## Récap' honnête

- **Maintenant, sans risque** : règles + push réel → +sécurité, +vraies notifs.
- **Plus tard** : points serveur + réputation → points **infalsifiables**.
- **Jamais** : de fausses données, de faux stock, de fausses récompenses.

---

## E-mails de chasse (Brevo) — mise à jour du 16/08

Le fichier `emails-brevo.js` contient maintenant **trois** fonctions :

| Fonction | Quand elle part | Pourquoi elle existe |
|---|---|---|
| `emailHuntStarted` | dès que tu appuies sur le bouton de chasse | confirmation immédiate : la preuve visible que la chaîne marche |
| `emailHuntFound` | quand un membre ajoute la boisson au stock d'un magasin de ton rayon | le vrai but |
| `sendTestEmail` | bouton « Envoyer un e-mail de test » dans les réglages | renvoie l'erreur **exacte** de Brevo dans l'app, au lieu de te laisser deviner |

### Ce qu'il faut faire une fois

1. Recopier `emails-brevo.js` dans ton dossier `functions/` (il remplace l'ancien).
2. Dans `functions/index.js`, avoir les **trois** lignes :

   ```js
   exports.emailHuntFound   = require("./emails-brevo").emailHuntFound;
   exports.emailHuntStarted = require("./emails-brevo").emailHuntStarted;
   exports.sendTestEmail    = require("./emails-brevo").sendTestEmail;
   ```

3. Déployer les trois d'un coup :

   ```
   firebase deploy --only functions:emailHuntFound,functions:emailHuntStarted,functions:sendTestEmail
   ```

4. Publier les **règles Firestore** mises à jour (nouvelle collection `userPrivate`) :

   ```
   firebase deploy --only firestore:rules
   ```

### Où vit l'adresse e-mail (et pourquoi ça compte)

`users/{uid}` est **lisible par tout le monde** — c'est ce qui fait marcher le
classement. Y stocker une adresse revenait à publier l'annuaire des membres.
Pire : puisque le téléphone écrit lui-même ce document, n'importe qui pouvait y
mettre l'adresse de quelqu'un d'autre et faire partir du courrier Magofeed vers
cette personne. C'est ce qu'on appelle un relais de courrier ouvert, et ça fait
blacklister un domaine en une journée.

L'adresse ne va donc dans **aucun** document : les Cloud Functions la lisent
directement dans **Firebase Auth** (`getAuth().getUser(uid).email`), là où
Google l'a posée et où personne ne peut la falsifier. Firestore ne conserve que
le consentement (`emailOptIn`), qui n'a rien de sensible. L'app efface au
passage les adresses laissées par les anciennes versions — rien à faire.

### Si un e-mail n'arrive toujours pas

Réglages → **Vérifier mes e-mails**. L'écran teste, dans l'ordre : compte
connecté, adresse enregistrée côté serveur, consentement, puis envoi réel.
La cause la plus fréquente d'un échec Brevo est l'**expéditeur non vérifié**
(Brevo → Expéditeurs & IP → `magofeed@outlook.com` doit être au vert) ;
le message d'erreur s'affiche mot pour mot dans l'app.
