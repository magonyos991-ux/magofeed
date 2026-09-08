# Bascule : points infalsifiables + parrainage

> Compte **une heure**, pas quinze minutes. La création des index Firestore
> demande à elle seule 5 à 15 minutes d'attente, et tu ne peux pas l'accélérer.

## Pourquoi on fait ça

Le score était *déclaré* par le téléphone : n'importe qui pouvait ouvrir la
console de son navigateur et s'écrire 999 999 points. Après cette bascule il
est *calculé* par le serveur à partir des documents que les contributions
laissent réellement dans Firestore. Il n'y a plus rien à falsifier, parce qu'il
n'y a plus rien à déclarer.

---

## Avant de commencer — ce qu'il te faut

**Le projet Cloud Functions n'est pas dans ce dépôt.** Ce dossier
(`functions-a-deployer/`) ne contient que les fichiers à copier ; il n'y a ici
ni `firebase.json`, ni `.firebaserc`, ni dossier `functions/`. `firebase deploy`
ne peut donc pas être lancé depuis ce dépôt. Repère d'abord le dossier où vit
ton projet Firebase (celui qui contient `firebase.json`), et travaille là-bas.

**Vérifie les versions.** `points-et-parrainage.js` importe
`firebase-functions/v2/...` et `firebase-admin/firestore`, donc :

- Node 18 minimum (`"engines": {"node": "20"}` dans `functions/package.json`)
- `firebase-functions` v4 ou plus
- `firebase-admin` v11 ou plus

Sur un projet resté en v1 / Node 16, le déploiement échoue à l'import.

**Il te faut un document `admins/{ton uid}`.** L'étape 3 en dépend et répondra
`permission-denied` sinon. Pour connaître ton uid, ouvre l'app puis, dans la
console du navigateur :

```js
window.fbAuth.currentUser.uid
```

Crée ensuite à la main, dans la console Firebase, le document
`admins/<cet uid>` avec un champ quelconque (`{ok: true}`).

---

## Étape 1 — Les index Firestore d'abord (5 à 15 min d'attente)

**C'est la seule étape qu'il faut vraiment faire en premier**, parce qu'elle
attend. `dejaCompteAujourdhui` interroge `reports` avec `where('by','==',…)` et
`where('createdAt','>=',…)` : Firestore exige un index composite, et sans lui
`crediterContribution` lève une exception à chaque contribution — plus rien
n'est crédité.

```bash
firebase deploy --only firestore:indexes
```

Le fichier `firestore.indexes.json` de ce dossier les déclare déjà. Attends que
la console Firebase affiche « Activé » pour chacun avant de continuer.

---

## Étape 2 — Déployer les fonctions

Copie `points-et-parrainage.js` dans le dossier `functions/` de ton projet, puis
ajoute la ligne d'export dans `functions/index.js` :

```js
Object.assign(exports, require("./points-et-parrainage"));
```

⚠️ **`firebase deploy --only functions` supprime en production toute fonction
absente du code source.** Si ton `index.js` n'exporte pas aussi
`notifications-push.js`, `emails-brevo.js`, `partage.js`, `anti-farm.js`, ces
fonctions-là seront effacées. Vérifie d'abord ce qui tourne :

```bash
firebase functions:list
```

Puis déploie, de préférence fonction par fonction la première fois :

```bash
firebase deploy --only functions:crediterContribution,functions:crediterDecouverte,functions:crediterEntraide,functions:crediterPromotion,functions:scoreApresSanction,functions:monCodeParrain,functions:utiliserCodeParrain,functions:figerPointsExistants
```

**Le double crédit de promotion n'est plus possible.** L'ancien
`awardPromotionPoints` versait lui aussi +50 ; il n'a jamais été déployé et le
fichier a été supprimé du dépôt. `crediterPromotion` est le seul chemin.

**L'ordre entre cette étape et la suivante n'a plus d'importance.**
`recalculerScore` fige `pointsHerites` dans sa propre transaction dès la
première contribution d'une personne : même si tu oublies l'étape 3, personne
ne perd ses points. C'était le vrai piège de cette bascule ; il est désarmé
dans le code, pas dans la procédure.

---

## Étape 3 — Figer les soldes de tout le monde

L'étape 2 protège les gens un par un, à leur première contribution. Celle-ci
traite tout le monde d'un coup, y compris ceux qui ne contribuent jamais.

Ouvre l'app, connecté avec ton compte admin, et dans la console du navigateur :

```js
await window.fbFigerPoints()
```

C'est la **seule** forme qui marche. L'app charge le SDK Firebase *modulaire*
10.12.2 : `firebase.functions()` n'existe pas et répondrait
`ReferenceError: firebase is not defined`. Le helper, lui, vise déjà la bonne
région (`europe-west1`) et pose un timeout de 9 minutes.

Elle répond `{ok:true, traites:N}`. Elle traite par lots de 300 :
**relance-la jusqu'à obtenir `traites:0`.**

Elle est rejouable sans risque **pendant la migration** — un compte déjà figé
est ignoré. Après, ne la relance plus : un compte créé depuis la bascule n'a
pas de `pointsHerites`, et la relancer recopierait son `points` (qui contient
déjà le parrainage) dans `pointsHerites`, comptant le parrainage deux fois.

---

## Étape 4 — Publier les règles

Console Firebase → **Firestore Database → Règles** → colle le contenu de
`firestore.rules` → **Publier**.

⚠️ **Lis d'abord les marqueurs `ADAPTE` en haut du fichier** : il faut choisir
la casse de la collection magasins (`stores` ou `Stores`) et vérifier la région.

⚠️ **Ce fichier ne touche pas que les points.** Il restreint aussi la lecture de
`reports`, ferme `refCodes`, `referrals` et `penalties`, et modifie `presence`,
`hunts`, `userNotifs`, `discoveries`. **Copie tes règles actuelles dans un
fichier avant de publier** — la console Firebase garde un historique, mais
autant ne pas en dépendre.

Avant de publier, fais tourner le banc d'essai :

```bash
cd functions-a-deployer/tests-regles
npm install          # une seule fois
npm test
```

Il attaque une base jetable locale et échoue si une attaque réussit. Si une
ligne passe de `ok` à `ECHEC`, **ne publie pas**.

---

## Étape 5 — Vérifier

1. Ouvre l'app, confirme un stock quelque part.
2. Console Firebase → `reports` → le document reçoit `counted:true` et
   `credited:3` en quelques secondes. *S'il ne reçoit rien, l'index de
   l'étape 1 n'est pas actif.*
3. `users/{ton uid}` → `pointsPreuves` a augmenté, et `points` vaut
   **`pointsHerites + pointsPreuves + refPoints − penalty`**. (La formule
   complète : sur un compte sanctionné ou parrainé, `hérité + preuves` seul ne
   tombera pas juste.)
4. Essaie de tricher, dans la console du navigateur. L'app expose déjà ce
   qu'il faut (`window.db`, `fbDoc`, `fbUpdateDoc`, `fbAuth`) — le SDK est
   modulaire 10.12.2, donc **pas** de `firebase.firestore()`, qui n'existe pas
   et répondrait `ReferenceError` : tu conclurais à tort que les règles ne sont
   pas publiées.

   ```js
   // Doit échouer : « Missing or insufficient permissions »
   await window.fbUpdateDoc(
     window.fbDoc(window.db, 'users', window.fbAuth.currentUser.uid),
     { points: 999999 }
   );
   ```

   Si ça passe, l'étape 4 n'a pas été publiée.

5. La seconde attaque — **effacer son profil pour le recréer avec des points** —
   ne se teste pas depuis la console sans détruire ton propre profil. Elle est
   couverte par le banc d'essai de l'étape 4, qui la rejoue sur une base
   jetable. Elle passait encore récemment : `allow create` n'interdisait pas
   `points` alors que `allow update` le faisait.

---

## Le parrainage

Rien à déployer de plus : il est dans le même fichier.

**Comment ça marche.** La personne touche « Inviter un ami » : le serveur lui
fabrique un code court (5 caractères, sans I/L/O/U pour qu'on puisse le dicter
au téléphone) et le glisse dans le lien partagé, sous la forme `#p=CODE`.

⚠️ **Le code n'est créé qu'au premier appui sur « Inviter un ami ».** Et si
`monCodeParrain` n'est pas déployée, l'app partage silencieusement un lien
**sans code**. Vérifie que la fonction répond avant d'annoncer le parrainage à
qui que ce soit.

**Quand la récompense tombe.**

| Condition | Valeur |
|---|---|
| Contributions comptées | 3 minimum |
| Magasins différents | 2 minimum |
| Journées différentes | 2 minimum |
| Délai après l'arrivée | 7 jours minimum |
| Parrain | +20 points |
| Filleul | +10 points |
| Plafond | 3 par semaine, 10 à vie |

⚠️ **Le délai de 7 jours n'est pas un minuteur.** `evaluerParrainage` n'est
appelée que depuis `crediterContribution` et `crediterDecouverte` : la
récompense tombe à la **prochaine contribution du filleul après le 7e jour**,
pas toute seule le 7e jour. Un filleul qui remplit ses trois conditions puis
disparaît ne rapporte jamais rien.

**Exposition maximale : 210 points par compte** — 200 comme parrain (10 × 20)
et 10 comme filleul. Et c'est un plafond **par compte**, pas par personne :
rien ne borne le nombre de comptes qu'on peut créer. À ce prix-là, farmer
demande plus de travail que contribuer honnêtement, ce qui est exactement le
but.

**Le lien ne contient jamais ton identifiant.** `users/{uid}` est lisible par
tout le monde (c'est ce qui fait marcher le classement), donc un identifiant
collé dans un groupe WhatsApp serait une clé de lecture permanente vers ton
profil. Un code court, lui, se révoque : supprime le document
`refCodes/{code}`, et `monCodeParrain` en fabriquera un neuf au prochain appel.

---

## Ce qui n'est PAS protégé, et qu'il faut savoir

**Deux amis réels qui s'entraident.** Rien n'empêche quelqu'un de faire
réellement 3 contributions honnêtes pour débloquer le parrainage d'un ami. Ce
n'est d'ailleurs pas de la triche : les contributions sont vraies, l'app y
gagne. Le plafond de 10 filleuls borne le tout.

**Effacer son profil n'efface plus sa sanction.** `allow delete` autorise
toujours chacun à supprimer son propre document — c'est voulu, on doit pouvoir
partir. Mais `users/{uid}.penalty` n'est plus qu'une copie d'affichage : la
source de vérité est la collection `penalties`, écrite par l'anti-farm, que le
client ne peut pas supprimer. `recalculerScore` la relit et remet le champ à
jour. Supprimer son profil fait donc perdre ses points sans effacer sa
sanction.

Si la lecture de `penalties` échoue (panne), la valeur déjà inscrite au profil
est conservée : une panne ne doit blanchir personne.

**Le barème et la sanction ne sont plus cohérents.** `anti-farm.js` retire 10
points avec le commentaire « exactement ce que rapportait l'annonce stock », or
une annonce de stock rapporte désormais 3 (`BAREME_REPORT.stock`). La sanction
vaut plus de trois fois le gain. À trancher — ce n'est pas forcément un défaut,
mais ce n'est plus ce qui était écrit.

**Les récompenses locales ne comptent plus au classement.** Série de jours,
missions quotidiennes, note d'une boisson, partage : elles ne laissent aucune
trace côté serveur, donc personne ne peut les vérifier. Elles restent affichées
pour l'encouragement, mais elles ne pèsent plus. Un score qui mélange du
vérifiable et du déclaratif n'est pas un score.

**Le plafond quotidien est de 60 points de preuves par jour.** Au-delà, les
contributions sont toujours enregistrées — elles servent à la communauté — mais
elles ne rapportent plus rien ce jour-là.
