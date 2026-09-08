# Monetisation : ce qui est decide, ce qui est reporte

Date : 2026-09-06. Ecrit apres la question d'Ilias sur les paliers commercants.

## Etat reel du code (verifie, pas suppose)

Tout ce qu'un commercant paierait existe deja et tourne en production :

- `shopClaims/{storeId}` : le commercant demande la pastille bleue
- `window.fbApproveShopClaim` (index.html) : l'admin approuve, ecrit
  `stores/{id}.certified` puis `merchants/{uid}.stores`, et notifie
- tableau de bord commercant : en ligne
- `scan-frigo.js` : deploye
- `verification-commercant.js` (308 lignes, `ouvrirVerificationCommercant`
  + `stripeWebhook`) : ECRIT mais DEBRANCHE, ligne 94 de `index.js`

Il ne manque que la caisse. Le produit, lui, est deja livre.

## Les paliers imagines par Ilias (a garder, pas a coder)

- 10 EUR : "demi-certifie". Le commercant signe ses boissons dans son
  magasin et scanne ses frigos. Rien de plus.
- 20 EUR : tout le precedent, plus la mise en avant de son commerce et un
  encart promotionnel quand quelqu'un consulte un magasin proche.

Le decoupage est bon. On ne le construit pas maintenant.

## Pourquoi c'est reporte

1. Sans societe ni statut d'independant, on ne peut pas encaisser
   legalement un abonnement recurrent. Stripe exige un numero d'entreprise.
   Le blocage n'est pas technique.
2. L'app n'est pas dans les stores. Zero utilisateur, donc zero commercant,
   donc aucun signal sur le prix ni sur ce qui a de la valeur pour eux.
3. Le systeme complet peut deja etre donne GRATUITEMENT a quelques
   commercants. S'ils ne s'en servent pas gratuitement, ils ne paieront pas.
   Ce test coute zero ligne de code et repond a la seule vraie question.

## Abonnement utilisateur : pas encore d'offre honnete

Les points ne donnent aujourd'hui que des titres (LEVELS : Curieux,
Explorateur, Chasseur, Connaisseur, Expert...). Ils n'achetent rien.
Vendre "plus de missions pour gagner plus de points" revient donc a vendre
le droit d'atteindre un mot plus vite. Ce n'est pas une offre.

Les cheques cadeaux sont la bonne piste, mais ils supposent des
partenariats qui n'existent pas encore. On ne vend pas l'acces a des
promotions inexistantes.

Ordre correct : d'abord les points achetent quelque chose de reel, ensuite
seulement on peut vendre d'en avoir plus.

## Ligne rouge, non negociable

Un paiement ne doit JAMAIS acheter un signal de confiance sur la carte.

- La pastille bleue signifie "on a verifie qui il est". Elle se gagne.
- Un encart promotionnel signifie "ceci est une publicite". Il s'achete,
  et il doit etre visiblement identifiable comme tel.

Melanger les deux ferait mentir la carte. C'est la regle fondatrice de
l'application et elle prime sur toute recette.

## CE QUI A ETE CONSTRUIT DEPUIS (6 septembre 2026)

Ilias a redemande les paliers. Ils sont faits, cote PRODUIT. La caisse, non.

- `merchants/{uid}.pass` : trois niveaux, `aucun` / `frigo` / `complet`.
  Ecrit par l'administrateur seul. Dix-neuf epreuves au banc le prouvent :
  personne ne peut s'accorder un pass, ni s'attribuer la boutique d'un autre,
  ni ecrire un niveau invente — l'administrateur pas plus que les autres.
- Le scan de frigo est retranche par le pass, cote serveur.
- Un commercant tout juste certifie recoit le pass `frigo` OFFERT
  (`passOrigine: 'lancement'`). On ne retire rien, et on apprend gratuitement
  si un commercant s'en sert avant de lui demander dix euros.
- `annonces/{storeId}` : le contenu du pass complet. Une phrase de 90
  caracteres maximum, ecrite par le gerant, affichee sur sa fiche sous
  l'etiquette « Annonce du commercant », signalable, effacable par
  l'administrateur. Barriere anti-alcool a l'ecriture.

Un bug trouve au passage, et il portait sur la fonction meme qu'on voulait
vendre : le lien gerant-magasin avait ete deplace de `stores/{id}.owner` vers
`merchants/{uid}` pour une raison de securite, mais deux controles n'avaient
pas suivi. Aucun commercant certifie depuis ce changement ne voyait son
tableau de bord ni ne pouvait scanner son frigo.

## Ce qui manque encore, et qui ne depend pas du code

1. Une structure juridique permettant d'encaisser un abonnement recurrent.
2. L'app dans les stores.
3. Des commercants qui se servent de la version gratuite.

Le canal d'encaissement le plus court est Ko-fi : `kofiWebhook` est deja
deploye et vivant pour les dons ponctuels, et Ko-fi gere aussi les
abonnements mensuels. `verification-commercant.js` (Stripe) reste debranche,
ligne 94 de `index.js`.

## Declencheur de reprise

Reprendre ce chantier quand les trois conditions sont reunies :

1. l'app est publiee dans les stores,
2. au moins trois commercants utilisent la version gratuite chaque semaine,
3. une structure juridique permet d'encaisser.

Tant qu'une seule manque, ce fichier reste une note et rien de plus.
