# Où va l'argent, et comment on s'y prend

> **Mise à jour importante — par défaut, il n'y a PAS d'argent.**
> La vérification se fait maintenant par **empreinte de carte** : le commerçant
> entre sa carte, sa banque confirme qu'elle est bien à lui, et **rien n'est
> prélevé**. Zéro euro encaissé, donc zéro revenu, zéro TVA, zéro
> remboursement à gérer, et zéro commission Stripe. Tu obtiens la même preuve
> d'identité sans jamais toucher à de l'argent.
> Tout ce qui suit ne te concerne que le jour où tu voudras vraiment encaisser
> quelque chose. Une seule constante à changer dans le fichier
> `verification-commercant.js` : `MODE_VERIF`.

---


Rien de ce qui suit n'est urgent. Tant que tu n'as pas de numéro d'entreprise,
la certification manuelle marche et l'app tourne. Ce fichier est là pour le
jour où tu voudras t'y mettre.

---

## 1. Le chemin de l'argent, étape par étape

```
Le commerçant paie
        ↓
     Stripe        ← encaisse et garde l'argent quelques jours
        ↓
  Ton compte en banque   ← virement automatique
```

**L'argent ne passe jamais par Magofeed.** Ni par l'app, ni par Firebase, ni
par moi. Le commerçant tape sa carte sur une page hébergée par Stripe, pas sur
ton site. Tu ne vois jamais son numéro de carte, et c'est voulu : ne jamais
toucher aux données bancaires, c'est ce qui t'évite toute la réglementation qui
va avec.

Stripe garde l'argent quelques jours (c'est leur délai anti-fraude, plus long
pour un compte tout neuf), puis le vire **automatiquement** sur ton compte
bancaire. Tu n'as rien à réclamer. Tu vois tout dans ton tableau de bord
Stripe : chaque paiement, chaque virement, chaque commission.

### Ce que Stripe prélève

Stripe prend **une part fixe plus un pourcentage** sur chaque paiement. Sur un
petit montant, la part fixe pèse lourd : sur 1 €, il te reste autour de
70 centimes.

Ce n'est pas un problème — ce paiement ne sert pas à gagner de l'argent, il
sert à vérifier une identité. Une trentaine de centimes pour savoir avec
certitude qui tient une boutique, c'est donné.

Mais retiens ceci : **ce n'est pas un revenu.** Ne construis jamais un plan
là-dessus. Les revenus viendront plus tard, de la mise en avant et des
partenariats — quand tu auras du trafic à montrer.

Les tarifs exacts sont sur **stripe.com/be/pricing**. Va les lire toi-même
plutôt que de me croire : ils changent, et c'est ton argent.

---

## 2. Quels moyens de paiement

Tu n'es pas obligé de choisir. Dans Stripe → Réglages → Moyens de paiement, tu
coches ce que tu veux, et la page de paiement s'adapte toute seule. Mon code ne
fige rien exprès, pour que tu n'aies jamais à me redemander de le modifier.

**À activer en priorité, dans cet ordre :**

| Moyen | Pourquoi |
|---|---|
| **Bancontact** | C'est LE moyen de paiement belge. Beaucoup de petits commerçants n'ont pas de carte de crédit, mais tout le monde a Bancontact. Sans lui, tu perds la moitié de tes candidats. |
| **Cartes** (Visa, Mastercard) | Le standard. Indispensable pour les enseignes et les non-Belges. |
| **Apple Pay / Google Pay** | Rien à faire de plus, ça se pose par-dessus les cartes. Deux fois moins d'abandons sur téléphone, et ton app est un téléphone. |

Bancontact est même **meilleur** que la carte pour ton usage : il est rattaché à
un compte bancaire belge, donc à une identité vérifiée par une banque belge.
C'est exactement la preuve que tu cherches.

**Ce qu'il ne faut PAS faire :** virement bancaire classique. Il n'y a aucune
confirmation automatique, tu devrais vérifier chaque virement à la main — tu
reviendrais au problème que le paiement était censé résoudre.

---

## 3. Comment s'y prendre, dans l'ordre

### Étape A — Le numéro d'entreprise (BCE)

Sans lui, tu ne peux encaisser aucun euro, même 1 €. Stripe le demandera.

Tu vas dans un **guichet d'entreprises** : Xerius, Acerta, Partena, Securex,
UCM. Ils sont là pour ça, tu prends rendez-vous et ils font les démarches.

Deux ou trois choses à leur demander toi-même, parce que ce sont elles qui
coûtent, et je ne suis pas comptable :

1. **« Puis-je m'inscrire en indépendant complémentaire ? »** Si tu as un job,
   des études ou un autre statut principal, les cotisations sociales sont
   nettement plus basses qu'en indépendant à titre principal. C'est la
   question qui change le plus ton budget.
2. **« Puis-je bénéficier de la franchise de TVA ? »** En dessous d'un certain
   chiffre d'affaires annuel, tu peux être dispensé de facturer et de déclarer
   la TVA. Pour un produit à 1 €, ça change tout : sinon tu ajoutes de la
   paperasse trimestrielle pour presque rien.
3. **« Combien ça me coûte la première année, tout compris ? »** Inscription,
   cotisations sociales, comptable éventuel. Fais-toi donner un chiffre écrit
   avant de signer.

Le premier rendez-vous d'information est en général gratuit. Va en voir deux,
compare.

### Étape B — Le compte Stripe

Tu vas sur **stripe.com** — tape l'adresse toi-même dans la barre du
navigateur, jamais depuis un lien reçu par mail. Tu crées le compte avec :

- ton numéro d'entreprise BCE
- ton IBAN (le compte où l'argent arrivera)
- une pièce d'identité (ils la vérifient, c'est normal)

Active la **double authentification** tout de suite.

Commence en **mode test** : Stripe fournit des numéros de carte factices pour
tout essayer sans un centime réel. Tu vérifies que la boutique passe bien en
« tenu par son gérant » dans l'app, et seulement ensuite tu passes en mode réel.

### Étape C — Brancher l'app

Tout est écrit et testé. Les commandes exactes sont dans
`DEPLOIEMENT-SECURITE.md`, section 5. En résumé : installer la librairie,
poser tes deux clés Stripe, déployer deux fonctions, brancher le webhook, et
passer **une seule ligne** de `false` à `true` dans l'app.

---

## 3 bis. « Est-ce que je peux laisser l'argent quelque part et me le virer moi-même ? »

Oui, techniquement. Stripe lui-même le fait : tu peux passer les virements en
manuel et l'argent reste sur ton solde Stripe jusqu'à ce que tu le réclames.
PayPal, Payoneer, Revolut Business font pareil. Ça existe, c'est légitime, et
ça sert quand on veut regrouper les virements pour payer moins de frais.

**Mais ça ne fait pas ce que tu espères.** Un euro encaissé est un euro
encaissé, qu'il dorme chez Stripe ou qu'il soit sur ton compte belge. Le laisser
sur la plateforme ne le rend ni invisible ni non imposable : les plateformes de
paiement européennes déclarent aux administrations fiscales. C'est leur
obligation, pas une option. Tu ne gagnerais rien et tu prendrais un vrai risque
pour quelques dizaines de centimes.

**La bonne réponse à ton inquiétude, c'est de ne rien encaisser du tout.**
C'est exactement ce que fait le mode « empreinte » : la carte est vérifiée,
rien n'est prélevé, il n'y a aucun revenu — donc rien à déclarer, parce qu'il
n'y a rien.

Et le jour où l'app te rapportera vraiment, tu ne voudras plus cacher quoi que
ce soit : tu voudras une structure propre, parce que c'est elle qui te permet
de déduire tes frais, de facturer des marques, et de dormir tranquille.

Le seul point à ne pas oublier : **même sans encaisser un centime, ouvrir un
compte Stripe pour une activité demande un numéro d'entreprise.** Le mode
empreinte t'évite la fiscalité, pas l'inscription.

## 3 ter. Le don — recevoir un coup de main

C'est la seule chose ici qui encaisse vraiment de l'argent, et volontairement.
Un don, ce n'est pas une vente : personne ne reçoit rien en échange.

### Ce qu'il y a dans l'app

Deux endroits, et pas un de plus :

- **Une petite carte dans le profil**, sous « Donne ton avis ». Une ligne, une
  phrase, une croix. La croix la ferme **pour toujours** — pas « pour trois
  jours », pas « jusqu'à la prochaine mise à jour ». Pour toujours.
- **Une ligne discrète dans Réglages › Communauté**, qui elle ne se ferme
  jamais. C'est le point de repère : sans elle, fermer la carte reviendrait à
  supprimer la fonction, et quelqu'un qui change d'avis dans six mois ne
  saurait plus où aller.

Les deux disparaissent aussi tout seuls dès que la personne a donné. On ne
redemande pas à quelqu'un qui vient de dire oui.

### Ce qu'un don ne donne PAS, et pourquoi c'est important

Aucun point, aucun badge, aucune fonction réservée, aucune publicité retirée.
Ce n'est pas de la modestie : **dès qu'un paiement débloque quelque chose, ce
n'est plus un don, c'est un achat.** Et un achat dans une application obéit aux
règles d'Apple et de Google — qui exigent alors de passer par LEUR système de
paiement, et prennent leur commission. Un don pur, qui ne débloque rien,
échappe à ça et peut passer par une page web. C'est écrit noir sur blanc dans
la feuille de don, avant qu'on demande l'argent, pas après.

### Deux façons de l'allumer

**Voie 1 — cinq minutes, aucun déploiement, tu peux le faire aujourd'hui.**
Crée une page de don chez qui tu veux : Stripe Payment Link, Ko-fi, Liberapay,
Buy Me a Coffee. Colle son adresse dans `index.html`, à la ligne :

```js
var DON_LIEN="";
```

C'est tout. La carte et la ligne apparaissent, le bouton ouvre ta page. Aucune
Cloud Function, aucun secret, rien à déployer.

**Voie 2 — plus tard : le paiement dans l'app, avec le choix du montant.**
Elle demande `functions-a-deployer/dons.js` déployé et un compte Stripe à ton
nom (donc un numéro d'entreprise). Le mode d'emploi est en haut de ce fichier.
Une fois fait, passe `DON_FONCTION` à `true` — et **laisse `DON_LIEN` rempli** :
il sert de secours si la fonction ne répond pas.

Tant que les deux sont vides/à `false`, **rien ne s'affiche**. Pas de bouton
mort, pas de promesse en l'air. Même règle que la vérification des commerçants.

### Aucun montant n'est écrit dans le texte, et c'est voulu

Le texte de la feuille ne cite **aucun chiffre**. Pas de « même 0,50 € », pas
de « à partir de 1 € », pas de « le prix d'un café ».

Pourquoi : dès que tu écris un montant dans une phrase, tu poses un tarif. Et
un tarif, ça se compare, ça se juge, ça se refuse. « Même 0,50 € » a l'air
modeste, mais ça dit deux choses que tu ne veux pas dire — que tu chiffres ce
que tu vaux, et que tu vises bas.

Ce que le texte raconte à la place, c'est **qui** est derrière l'app : une
seule personne, pas d'entreprise, pas d'équipe, pas d'investisseur, qui paie
l'hébergement de sa poche. C'est vrai, ça ne demande rien, et ça touche
beaucoup plus qu'un chiffre.

Les montants ne vivent que sur les boutons, pour répondre à « combien, alors ? »
une fois la question déjà posée. Et **aucun des quatre n'est mis en avant** :
en colorer un, c'est désigner le bon choix, donc pousser.

### Ce que Stripe prend sur les petits montants

Stripe prend une part **fixe** plus un pourcentage. Sur un très petit montant,
la part fixe mange une grosse moitié : quatre petits dons te laissent nettement
moins qu'un seul don moyen.

Ce n'est pas une raison pour retirer le plus petit montant. Il reste proposé
parce que c'est le minimum que Stripe accepte en euros, et surtout parce que
**personne ne doit avoir honte de son montant**. Quelqu'un qui donne peu ne te
finance pas : il te dit que ce que tu construis sert à quelqu'un. Ça, aucune
commission ne te le prend. Ce que tu ne dois pas faire, c'est bâtir un budget
là-dessus.

Tarifs exacts : **stripe.com/be/pricing**, à lire toi-même.

### Ce que ça change pour tes impôts

Tout. Un don encaissé est de l'argent reçu, point. Ce n'est pas comparable au
mode « empreinte » de la vérification des commerçants, où rien n'est prélevé et
où il n'y a donc rien à déclarer. Ici, il y a quelque chose.

Ce n'est pas un problème — c'est juste une décision à prendre les yeux ouverts.
Les plateformes de paiement déclarent aux administrations fiscales
européennes : laisser l'argent dormir sur ton solde Stripe ne le rend ni
invisible ni non imposable. Avant d'allumer les dons, va poser la question à un
comptable ou à un guichet d'entreprises, avec ta situation à toi (étudiant,
salarié, demandeur d'emploi — ça change la réponse). Une demi-heure de
conseil t'évitera des années d'inquiétude.

Et note bien : **même sans encaisser un centime, ouvrir un compte Stripe pour
une activité demande un numéro d'entreprise.** Ko-fi et Buy Me a Coffee sont
plus souples à l'inscription — ça ne veut pas dire que l'argent reçu n'existe
pas aux yeux du fisc.

---

## 4. Comment on essaie d'arnaquer les gens là-dessus

Tu as dit que tu te sentais manipulable. Alors voilà les règles. Elles sont
courtes et elles suffisent.

**Ta clé secrète Stripe (`sk_...`) donne accès à ton argent.** Elle se tape
dans une seule chose : ta propre fenêtre PowerShell, dans la commande
`firebase functions:secrets:set`. Jamais dans un fichier. Jamais dans un
message. Jamais dans une conversation avec moi — **je n'en ai pas besoin et je
ne te la demanderai jamais.**

**Personne de légitime ne te demandera jamais :**
- ta clé Stripe, ton mot de passe, ou un code reçu par SMS
- un accès à ton compte Firebase ou Google « pour t'aider »
- de l'argent pour « débloquer », « activer » ou « vérifier » ton compte

**Stripe ne t'écrira jamais** pour te demander de cliquer en urgence sous peine
de blocage. En cas de doute : tu fermes le mail, tu tapes stripe.com toi-même,
tu regardes ton tableau de bord. S'il n'y a rien dedans, le mail était faux.

**Si quelqu'un te contacte en disant qu'il va « t'aider à monétiser ton app »
contre un pourcentage ou un accès** — c'est non. Tu n'as besoin de personne.

Et pour ce qui me concerne : je te dis toujours quoi taper et **où** le taper.
Si un jour une consigne te demande de me confier une clé, un mot de passe ou un
code, c'est que quelque chose ne va pas. Ne le fais pas, et dis-le-moi.
