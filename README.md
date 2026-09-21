# Magofeed

**Quels magasins près de toi ont la boisson que tu cherches — dit par les gens qui y sont passés.**

Application web progressive (PWA), en ligne sur
<https://magonyos991-ux.github.io/magofeed/>.

Ce fichier existe pour une raison précise : **permettre à quelqu'un d'autre que
son auteur de reprendre ce code**. Si tu arrives ici sans rien connaître du
projet, tout ce qu'il te faut pour t'y retrouver est en dessous.

Titulaire des droits : Ilias Benabdellah. © 2026 Magofeed, tous droits réservés.

---

## En une minute

| | |
|---|---|
| **Quoi** | Une carte des magasins, alimentée par les signalements de la communauté |
| **Technique** | HTML + CSS + JavaScript, sans framework · Firebase (Firestore, Auth, Cloud Functions, FCM) · Leaflet pour la carte · OpenStreetMap pour les magasins |
| **Hébergement** | GitHub Pages (le site) + Firebase europe-west1 (les données et le serveur) |
| **Déploiement** | Automatique à chaque `push` sur `main` |
| **Langues** | 10, tenues à jour par des outils de contrôle (voir « Traductions ») |

Il n'y a **aucune étape de compilation**. Les fichiers livrés sont les fichiers
écrits : on peut ouvrir `index.html` dans un navigateur et l'app fonctionne
(hors Firebase). C'est un choix — un `git clone` suffit à travailler, et rien ne
s'interpose entre le code lu et le code exécuté.

---

## Où est quoi

```
index.html            L'APPLICATION ENTIÈRE — écrans, logique, et le module Firebase.
                      ~27 000 lignes. Oui, c'est un seul fichier : voir plus bas.
app.css               Les styles.
sw.js                 Le service worker (cache hors ligne). Son nom de cache porte
                      le numéro du commit, substitué au déploiement.

data/
  drinks.js           Le catalogue des boissons (~4 600), avec codes-barres réels.
  textes.js           Les traductions : le TEXTE FRANÇAIS sert de clé. Contient
                      aussi tr(), trh() et la passe de traduction du DOM.
  i18n.js             Les libellés à clés courtes (LANGS), hérités.
  drinkart.js         Les visuels générés des canettes.
  enseignes.js        Les enseignes connues (Delhaize, Carrefour…).
  alcool.js           Les motifs qui écartent l'alcool du catalogue.
  state.js, ui.js     Fragments partagés.

functions-a-deployer/ Les Cloud Functions (Node, europe-west1) + firestore.rules.
                      ⚠ Ce dossier n'est PAS déployé par la CI : voir « Déployer ».
  tests-regles/       260 épreuves qui attaquent la base sur un émulateur.

outils/               Scripts de contrôle en ligne de commande (traductions,
                      catalogue, essais navigateur). Aucun n'est nécessaire pour
                      faire tourner l'app ; ils servent à vérifier avant livraison.

growth/               Pages de partage « Où trouver X », mesures OSM, notes de
                      stratégie.
promo/                Pages vitrines publiées avec le site.
.github/workflows/    La chaîne de publication.
```

### Pourquoi un seul fichier de 27 000 lignes

C'est la faiblesse la plus visible du projet, et elle est assumée plutôt
qu'ignorée : pas d'assemblage, pas d'outillage à installer, pas de décalage
entre ce qu'on lit et ce qui tourne. Le prix est réel — un nouveau venu met du
temps à s'orienter, et un éditeur de texte peine.

Pour s'y retrouver, le fichier est découpé par de grands en-têtes en
commentaires. Cherche-les :

```
grep -n "^/\* =\{10,\}" index.html
```

Les fonctions suivent des préfixes constants : `msg*` pour la messagerie,
`amis*` pour les amis, `explore*` pour la carte, `chasse*` pour la chasse,
`fb*` pour tout ce qui parle à Firebase (ces dernières vivent dans le
`<script type="module">` qui importe le SDK).

---

## Les concepts du produit

**Le signalement.** Quelqu'un dit « je l'ai vue en rayon ». Le serveur ne
crédite des points que si le rapport porte une distance de **moins de 500 m** :
personne ne voit un rayon depuis son canapé, et c'est ce qui protège le
classement. Au-delà, le signalement est enregistré comme « probable » — utile
aux autres, sans valeur en points.

**La chasse.** Une boisson que personne n'a localisée : on active une alerte,
et les gens autour sont prévenus. Chacun choisit **sa zone** (1 à 50 km, écrite
dans `pushTokens/{uid}.rayon`) : c'est celui qui *reçoit* qui décide jusqu'où on
a le droit de le déranger. Quand quelqu'un la trouve, il gagne des points, le
demandeur est prévenu, et la chasse disparaît. Une chasse n'est **pas** lancée
si la boisson est déjà trouvable dans la zone — réveiller une ville pour rien,
c'est le meilleur moyen de faire couper les notifications à tout le monde.

**La mission du jour.** Une boisson qu'aucun magasin connu n'a. Elle est revue
dès que les magasins sont chargés : elle ne doit jamais envoyer chercher ce qui
est déjà partout.

**Les points.** Le score officiel est calculé **par le serveur**, à partir des
documents que les contributions laissent (`reports`). Le client ne peut pas
l'écrire — sinon n'importe qui s'attribuerait 999 999 points depuis la console
de son navigateur. Le compteur local est un affichage optimiste, écrasé par le
score serveur à chaque ouverture du profil.

---

## Faire tourner le projet en local

```bash
git clone https://github.com/magonyos991-ux/magofeed.git
cd magofeed
python3 -m http.server 8080      # ou n'importe quel serveur statique
# puis http://localhost:8080
```

Ouvrir `index.html` directement par `file://` ne marche pas : le module Firebase
et le service worker exigent `http://`.

Sans identifiants Firebase, l'app s'affiche et le catalogue fonctionne ; tout ce
qui touche au compte, aux magasins distants et à la messagerie reste muet.

---

## Les contrôles avant de livrer

Aucun n'est facultatif si tu touches au code. Les deux premiers **bloquent la
publication** ; les autres se lancent à la main.

```bash
# 1. ESLint — attrape les vrais défauts (doublons, variable inexistante,
#    code inatteignable), jamais du style. Tourne aussi dans la CI.
npm install eslint@9.15.0 eslint-plugin-html@8.1.2 --no-save
npx eslint .

# 2. Les 260 épreuves des règles Firestore (il faut Java pour l'émulateur).
#    Tournent aussi dans la CI, et y bloquent le déploiement.
cd functions-a-deployer/tests-regles && npm install && npm test

# 3. Les traductions : aucun texte français ne doit rester dans une autre langue.
node outils/inventaire-textes.mjs     # combien de textes visibles non traduits
node outils/verifier-textes.mjs       # clés orphelines, échappées, tr() sans entrée
node outils/fusionner-textes.mjs x.json   # verser un lot de traductions
```

**Le principe des traductions** : le **texte français est la clé**. Écrire
`tr("Ta zone")` dans le code suffit, à condition que `"Ta zone"` existe dans
`data/textes.js` avec ses neuf traductions. `verifier-textes.mjs` signale toute
phrase confiée à `tr()` sans entrée dans la table — sans quoi elle s'afficherait
en français dans les dix langues, en silence.

---

## Déployer

**Le site** — automatique. `git push origin main` déclenche
`.github/workflows/pages.yml`, qui :
1. lance les 260 épreuves des règles (échec ⇒ rien n'est publié) ;
2. lance ESLint (échec ⇒ rien n'est publié) ;
3. régénère les pages de partage, tamponne le service worker, publie.

**Les règles Firestore et les Cloud Functions** — **manuel, et volontairement**.
Elles touchent aux données de vrais gens et à une facture ; elles ne partent pas
sur un `git push`. Depuis le dossier Firebase local :

```bash
firebase deploy --only firestore:rules
firebase deploy --only functions:<nom>       # une fonction précise
```

Toujours lancer `npm test` (contrôle n° 2) **avant** de déployer des règles.

---

## Ce qu'il faut savoir avant de toucher à quoi que ce soit

- **Firebase est en formule Blaze** (paiement à l'usage). Une boucle dans une
  Cloud Function, ou un déclencheur qui part sur des milliers de documents, coûte
  de l'argent réel. Une alerte de budget dans la console Google Cloud n'est pas
  un luxe.
- **`firestore.rules` est la seule vraie défense.** Le client est public : tout ce
  qu'il peut écrire, n'importe qui peut l'écrire. Toute modification de ce fichier
  passe par le banc d'essai.
- **Les positions partagées sont volontairement arrondies** au dixième de degré
  (~11 km) dans les documents publics : croisées avec un profil public, des
  coordonnées précises donneraient le quartier d'habitation d'une personne nommée.
- **Les données des magasins viennent d'OpenStreetMap** (licence ODbL, attribution
  requise et présente sur la carte). Ce qui appartient à Magofeed, c'est ce que la
  communauté y ajoute : les confirmations de stock.
- **Les commentaires du code sont en français et racontent le POURQUOI**, souvent
  le défaut réel qu'une ligne corrige. Ils valent autant que le code : ils évitent
  de refaire une erreur déjà payée.

---

## Structure Firestore (les collections qui comptent)

| Collection | Contenu | Lecture |
|---|---|---|
| `stores` | Les magasins, leurs boissons, les confirmations | publique |
| `catalog` | Les fiches boissons ajoutées après coup | publique |
| `users` | Profils publics (pseudo, score, badges) — **jamais d'e-mail** | publique |
| `reports` | La preuve d'une contribution ; c'est elle qui crédite les points | restreinte |
| `conversations` / `messages` | La messagerie. Identifiant `a_b`, les deux uid triés | membres |
| `amis` | Les liens d'amitié. Même forme : `a_b` | membres |
| `blocks` | La liste de blocage de chacun | soi seul |
| `hunts` | Les chasses en cours | publique |
| `watches` | Les alertes « préviens-moi quand on la trouve » | propriétaire |
| `pushTokens` | Le jeton de notification, la position et **le rayon choisi** | soi seul |
| `alertesAdmin` | Le journal : ce que le serveur a tenté, et pourquoi il s'est tu | admin |

Les règles complètes, avec le raisonnement derrière chacune, sont dans
`functions-a-deployer/firestore.rules`.

---

## Si tu reprends ce projet

Commence par là, dans cet ordre :

1. Lance les trois contrôles ci-dessus. S'ils passent, la base est saine.
2. Lis `functions-a-deployer/firestore.rules` en entier. C'est le document le
   plus dense du dépôt et celui qui protège tout le reste.
3. Cherche les grands en-têtes de `index.html` (`grep -n "^/\* =\{10,\}"`) pour
   avoir la carte du fichier.
4. Ouvre l'app avec la console du navigateur ouverte et clique partout. Les
   fonctions sont sur `window`, on peut les appeler à la main.

Le reste s'apprend en lisant les commentaires.
