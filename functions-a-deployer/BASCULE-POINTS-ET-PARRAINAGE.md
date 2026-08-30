# Bascule : points infalsifiables + parrainage

> À faire dans **cet ordre**. Chaque étape est sûre à elle seule ; c'est
> l'inversion de deux d'entre elles qui casserait quelque chose, et je dis
> laquelle à chaque fois.

## Pourquoi on fait ça

Aujourd'hui ton application écrit elle-même `users/{uid}.points`, et la règle
l'autorise. **N'importe qui peut ouvrir la console de son navigateur et
s'écrire 999 999 points.** Ton classement est falsifiable sans effort
particulier, et tant que c'est vrai, toute récompense — parrainage compris —
est décorative.

Après cette bascule, le score n'est plus *déclaré* par le téléphone : il est
*calculé* par le serveur à partir des documents que les contributions laissent
réellement dans Firestore. Il n'y a plus rien à falsifier, parce qu'il n'y a
plus rien à déclarer.

---

## Étape 1 — Déployer les fonctions (5 min)

```bash
cd magofeed-functions
# copie points-et-parrainage.js dans le dossier des fonctions,
# puis ajoute la ligne d'export dans index.js :
#   Object.assign(exports, require("./points-et-parrainage"));
firebase deploy --only functions
```

**⚠️ Un seul crédit pour la promotion d'une découverte.** Si
`awardPromotionPoints` (fichier `points-serveur-PHASE2.js`) est déjà déployé,
**supprime `crediterPromotion`** de `points-et-parrainage.js` avant de
déployer — sinon l'auteur recevrait +50 deux fois. Pour savoir :

```bash
firebase functions:list | grep -i promotion
```

**Rien ne change encore pour personne** à cette étape : les fonctions
créditent `pointsPreuves`, mais `points` reste écrit par le client. C'est
voulu — on veut vérifier que les fonctions tournent avant de couper le client.

---

## Étape 2 — Figer les soldes actuels (1 min) — **NE PAS SAUTER**

C'est cette étape qui fait que **personne ne perd ses points**. Elle recopie le
solde de chacun dans `pointsHerites`, et le score final vaudra toujours
`hérité + preuves + parrainage − sanctions`.

Depuis l'application, connecté avec ton compte admin, ouvre la console du
navigateur et lance :

```js
const f = firebase.functions().httpsCallable('figerPointsExistants');
await f({});
```

Ou plus simple si tu préfères : depuis la page, tape dans la console
`await window.fbFigerPoints?.()` — si la fonction n'est pas exposée, utilise la
forme ci-dessus.

Elle répond `{ok:true, traites:N}`. Elle est **rejouable sans risque** : un
compte déjà figé est ignoré.

**Si tu sautes cette étape et que tu passes à l'étape 3, tout le monde retombe
à ce que les preuves rapportent — donc beaucoup perdent des points.** C'est le
seul vrai piège de cette bascule.

---

## Étape 3 — Publier les règles (2 min)

Console Firebase → **Firestore Database → Règles** → colle le contenu de
`firestore.rules` → **Publier**.

À partir de là :
- le client ne peut plus écrire `points`, `refPoints`, `refCode` ni les
  compteurs de preuves ;
- il ne peut plus marquer ses propres contributions comme « déjà payées » ;
- `refCodes` et `referrals` sont fermés en écriture au client — seul le
  serveur y touche.

**Ne fais pas l'étape 3 avant l'étape 1.** Sinon les fonctions n'existent pas
encore, le client ne peut plus écrire, et plus rien ne crédite : les compteurs
gèleraient jusqu'au déploiement.

---

## Étape 4 — Vérifier (5 min)

1. Ouvre l'app, confirme un stock quelque part.
2. Console Firebase → Firestore → `reports` → le document doit recevoir
   `counted:true` et `credited:3` en quelques secondes.
3. `users/{ton uid}` → `pointsPreuves` a augmenté, et `points` vaut
   `pointsHerites + pointsPreuves`.
4. Refais **la même** confirmation, même magasin, même boisson : le second
   document doit recevoir `credited:0` et `raison:"rejeu"`. C'est l'anti-rejeu.
5. Dans la console du navigateur, essaie de tricher :
   ```js
   // doit échouer avec « Missing or insufficient permissions »
   firebase.firestore().doc('users/'+firebase.auth().currentUser.uid)
     .set({points: 999999}, {merge:true});
   ```
   Si ça passe, l'étape 3 n'a pas été publiée.

---

## Le parrainage

Rien à faire de plus : il est dans le même fichier de fonctions.

**Comment ça marche pour la personne.** Elle touche « Inviter un ami » : le
serveur lui fabrique un code court (5 caractères, sans I/L/O/U pour qu'on
puisse le dicter au téléphone) et le glisse dans le lien partagé. Son ami
arrive, le code est retenu, et une intention de parrainage est enregistrée.

**Quand la récompense tombe.** Pas à l'inscription — créer un compte ne coûte
rien ici, la connexion anonyme est automatique, donc payer l'arrivée
reviendrait à installer une imprimante à points. On paie quand le filleul est
devenu **réellement actif** :

| Condition | Valeur |
|---|---|
| Contributions comptées | 3 minimum |
| Magasins différents | 2 minimum |
| Journées différentes | 2 minimum |
| Délai après l'arrivée | 7 jours minimum |
| Parrain | +20 points |
| Filleul | +10 points |
| Plafond | 3 par semaine, 10 à vie |

**Exposition maximale si tout va mal : 200 points par compte, à vie.** C'est le
seul chiffre à retenir. À ce prix-là, farmer demande plus de travail que de
contribuer honnêtement — et c'est exactement ce qu'on cherche.

**Le lien ne contient jamais ton identifiant.** `users/{uid}` est lisible par
tout le monde (c'est ce qui fait marcher le classement), donc un identifiant
collé dans un groupe WhatsApp serait une clé de lecture permanente vers ton
profil. Un code court, lui, se révoque : il suffit de supprimer le document
`refCodes/{code}`.

---

## Ce qui n'est PAS protégé, et qu'il faut savoir

**Deux amis réels qui s'entraident.** Rien n'empêche quelqu'un de faire
réellement 3 contributions honnêtes pour débloquer le parrainage d'un ami. Ce
n'est d'ailleurs pas de la triche : les contributions sont vraies, l'app y
gagne. Le plafond de 10 filleuls borne le tout.

**Les récompenses locales ne comptent plus au classement.** Série de jours,
missions quotidiennes, note d'une boisson, partage : elles ne laissent aucune
trace côté serveur, donc personne ne peut les vérifier. Elles restent affichées
pour l'encouragement, mais elles ne pèsent plus. Un score qui mélange du
vérifiable et du déclaratif n'est pas un score.

**Le plafond quotidien est de 60 points de preuves par jour.** Au-delà, les
contributions sont toujours enregistrées — elles servent à la communauté — mais
elles ne rapportent plus rien ce jour-là.
