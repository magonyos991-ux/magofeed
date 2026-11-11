# Le commerçant dans Magofeed — ce qui existe, et comment s'en servir

Ce document dit ce qu'un gérant de magasin obtient dans Magofeed, ce que tu
fais de ton côté dans l'Administration, et comment vérifier que tout marche
avant d'aller voir quelqu'un. Il a été écrit après la répétition générale du
8 novembre 2026 et la relecture par huit gérants fictifs du 11 novembre.

## Le chemin du gérant, en cinq minutes

1. **Il crée un compte par e-mail** (Profil → ⚙ → « Créer un compte
   Magofeed »). Pas besoin de Google. Le bouton « Afficher le mot de passe »
   évite la faute de frappe.
2. **Il trouve sa boutique.** Deux portes : Réglages → **Commerçant** →
   « Tu tiens un magasin ? » (un guide qui dit quoi préparer, puis la carte),
   ou directement la fiche du magasin. Si la boutique n'est pas sur la carte,
   le guide propose de l'ajouter.
3. **Tout en bas de la fiche : « Je tiens ce magasin ».** Trois preuves :
   le numéro d'entreprise (il est sur ses tickets de caisse, la clé est
   vérifiée), le téléphone de la boutique, et la photo d'un code à six
   chiffres écrit sur un papier, prise dans le magasin. S'il n'a pas encore de
   compte, la feuille le lui demande d'abord et se rouvre toute seule après.
4. **Tu certifies** depuis Administration → « Demandes de commerçants » : la
   carte montre les trois preuves, le lien vers la fiche officielle de
   l'entreprise, et le code attendu à comparer avec la photo. Certifier donne
   la pastille bleue, ouvre son compte commerçant avec le **pass complet
   offert au lancement**, et le prévient (cloche, et notification sur son
   téléphone si le serveur est déployé). La photo de preuve est effacée à la
   décision.
5. **Il rouvre l'app** : une carte de bienvenue lui donne trois gestes, puis
   il a sur sa fiche :
   - **Modifier ma fiche** : nom, adresse, téléphone, site ou page, horaires,
     un mot sur le magasin. Téléphone, site et mot apparaissent pour les
     clients avec la mention « Renseigné par le gérant ».
   - **Sa vitrine** : jusqu'à douze photos de son rayon, avec légende et prix.
   - **Son annonce** : une phrase de 90 caractères, signée « Annonce du
     commerçant ».
   - **Son tableau de bord** : combien de personnes ont vu sa fiche, ce que le
     quartier cherche et qu'il n'a pas, ce qu'il a mais n'a jamais confirmé.
   - **Son rayon** : ✓ / ✕ par boisson, et un bouton € pour le prix.
   - Réglages → Commerçant liste **ses magasins** (un franchisé en a trois).

## Ce que tu peux régler toi-même

- **Le pass** (aucun / frigo / complet) se change d'un tap sur la carte de la
  demande, dans l'Administration. Plus besoin de la console Firebase.
- **Retirer une certification** : même carte. La demande est effacée et la
  boutique redevient revendicable (changement de propriétaire).
- **Un client qui tape « Je tiens ce magasin »** sur une boutique déjà
  certifiée lit « déjà certifié au nom de son gérant, écris-nous si c'est une
  erreur » : rien à faire de ton côté sauf s'il t'écrit.

## Ce que le serveur fait pour le gérant (functions-a-deployer)

- `alertes-commercant.js` : une notification sur son téléphone quand sa
  demande est acceptée ou refusée, et quand un client signale une **rupture**
  chez lui (au plus une par magasin toutes les six heures). Une confirmation
  « en stock » par un client ne fait qu'une ligne dans sa cloche.
- `anti-farm.js` : le gérant certifié n'est **jamais sanctionné** par
  l'anti-triche pour une boisson qu'il a confirmée et qui s'est vendue.
- Les règles Firestore : le gérant peut corriger le nom, l'adresse, le
  téléphone, le site, la description et les horaires de son magasin ; il ne
  peut pas déplacer le pin, ni toucher à la pastille, au pass ou aux points.
  Téléphone, site et description ne sont écrits que par lui ou par toi.

Déploiement : bouton **Serveur** dans GitHub Actions (« tout »). Les règles
sont vérifiées par 314 épreuves avant chaque déploiement.

## Vérifier que tout marche, sans toucher à la production

    node outils/repetition-commercant.mjs

Le banc lance les émulateurs Firebase, sème un night shop à Flagey, et joue
cinq rôles dans un navigateur filmé : le commerçant qui crée son compte et
dépose sa demande, toi qui certifies, le commerçant qui revient (bienvenue,
fiche, vitrine, annonce, prix, tableau de bord), un client qui passe, et une
épicière qui lit l'app en turc. Il produit un dossier avec le film, une
capture par étape et `rapport.md`. S'il dit « RIEN NE CASSE », tu peux y
aller.

## Ce qui n'existe pas encore (et qu'on a choisi de ne pas faire tout de suite)

- Un second compte sur le même magasin (déléguer à un employé) : pour
  l'instant, un seul compte par boutique ; l'employé utilise le compte du
  magasin.
- Déplacer le pin d'un magasin depuis la fiche du gérant.
- Une alerte quand quelqu'un **cherche** une boisson près du magasin : elle
  est dans le tableau de bord, pas encore sur le téléphone.
- Le paiement d'un pass : tout est offert tant que l'app n'a pas de clients à
  vendre aux commerçants.
