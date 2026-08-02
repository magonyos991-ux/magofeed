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

## 2) Déployer le PUSH réel (~10 min)

C'est la pièce que l'app ne peut pas faire seule : notifier le téléphone même
app fermée. L'app écrit déjà le message in-app et crédite les points ; ces
fonctions **ajoutent seulement le push** (aucun point → zéro risque de doublon).

1. Copie les deux `exports` de `notifications-push.js` dans ton `functions/index.js`
   (ou importe le fichier). Garde tes autres fonctions.
2. `package.json` : Node 18+, `firebase-admin` et `firebase-functions` **v2**.
3. Vérifie que **Cloud Messaging** est activé et que la clé VAPID est bien celle
   déjà dans l'app (`window.MAGO_VAPID_KEY`). Les utilisateurs doivent avoir
   activé les notifications (l'app enregistre alors leur token dans `pushTokens`).
4. Déploie : `firebase deploy --only functions:notifyDiscoveryPromoted,functions:notifyPhotoRejected,functions:notifyHuntNearby,functions:notifyStockToWatchers`
5. Teste : promeus une découverte de test → l'auteur doit recevoir le push.

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

**Réputation (couche 1 anti-triche)** : le squelette est fourni en commentaire
dans `points-serveur-PHASE2.js`. Il demande d'abord d'enregistrer les
confirmations **par utilisateur** (aujourd'hui elles sont agrégées sans trace
de qui confirme). Dis-moi quand tu veux t'y attaquer, je te guide pas à pas.

---

## Récap' honnête

- **Maintenant, sans risque** : règles + push réel → +sécurité, +vraies notifs.
- **Plus tard** : points serveur + réputation → points **infalsifiables**.
- **Jamais** : de fausses données, de faux stock, de fausses récompenses.
