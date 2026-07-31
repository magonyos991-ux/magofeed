# Magofeed — Anti-triche & fiabilité des données

> Le problème (bien vu) : n'importe qui peut ajouter une fausse boisson dans un magasin depuis chez lui, s'auto-confirmer et **farmer des points**. C'est LE défi de toute app communautaire. On ne l'élimine pas à 100%, on le **rend non-rentable et détectable**.

## ⚠️ La règle d'or : valider CÔTÉ SERVEUR, pas dans l'app
Aujourd'hui tes points sont calculés **dans le JavaScript** (`userStats.pts+=…` puis `fbSyncUserStats`). → **N'importe qui peut ouvrir la console et se donner 1M de points**, ou appeler ton Firebase directement en contournant l'app.
**Tout contrôle anti-triche DOIT être appliqué par le serveur (Firebase Security Rules + Cloud Functions).** Le client peut tricher ; le serveur, non. C'est la faille la plus importante à corriger.

---

## Les 6 couches (par ordre d'impact / effort)

### 1. Découpler « contribution » et « points » ⭐ (le plus efficace)
Ne récompense pas **l'action**, récompense la **donnée validée**.
- Une confirmation/ajout donne des points **« en attente »**.
- Les points ne sont **crédités que si un 2ᵉ utilisateur indépendant confirme** (ou après X temps sans contradiction).
- Résultat : **tu ne peux pas valider tes propres données** → le farming solo meurt.

### 2. Géofence GPS ⭐ (tue le « depuis chez toi »)
Autoriser « confirmer en stock » / « ajouter ici » **uniquement si le GPS est réellement au magasin** (< ~80–120 m).
- Ton scénario (ajouter à Lidl depuis chez toi) devient **impossible**.
- À vérifier **côté serveur** (envoie la position + timestamp ; le serveur compare aux coordonnées du magasin).
- (Le GPS se spoofe, mais ça élève énormément la barre + se combine avec les autres couches.)

### 3. Consensus & fraîcheur (pas « vrai », mais « fiable »)
- 1 signalement = **« à confirmer »** (faible confiance) — PAS « en stock ».
- Devient **« en stock »** seulement à **N confirmations indépendantes** (comptes/appareils différents).
- **Décroissance dans le temps** : au bout de X jours sans reconfirmation, ça repasse en « à confirmer ».
- Affiche « confirmé il y a 2 h par 3 personnes » → honnête, et dilue un seul tricheur.
- ✅ Tu as déjà l'état « À confirmer » (qu'on a ajouté au design) — il suffit de le brancher à ce seuil.

### 4. Score de réputation par utilisateur
- Chaque user a un **taux de fiabilité** (ses contributions confirmées vs contredites).
- Contributions d'un **nouveau compte** = **faible poids** (ne rendent pas une info « fiable » à elles seules).
- Contributions souvent contredites → **poids qui chute + points repris (clawback)**.

### 5. Anti-multicomptes (Sybil) + limites
- **Plafonds serveur** : X points/jour, 1 seule confirmation par (user × boisson × magasin × 24 h).
- **Vérif téléphone (SMS)** pour débloquer les points/récompenses (1 humain = 1 compte de confiance).
- Rate-limit par appareil/IP.

### 6. Preuve & signalement
- **Ajouter une NOUVELLE boisson dans un magasin = photo obligatoire** (tu as déjà le flux photo pour les découvertes !). Une photo se vérifie et se modère.
- Bouton **« pas vu ici / info fausse »** → une contradiction baisse la fiabilité et peut **auto-masquer** l'info.
- **File de modération** admin pour les cas suspects (ex. boisson d'import rare ajoutée dans un hard-discount → improbable → à revoir).

---

## Ce qui rend le farming inutile (résumé)
- Points **seulement après validation par un tiers** (couche 1) → seul, tu ne gagnes rien.
- **Sur place uniquement** (couche 2) → plus de triche « depuis le canapé ».
- **Récompenses** (si un jour tu en donnes) réservées aux **comptes vérifiés à bonne réputation** → pas rentable de tricher.

## Plan concret (ordre)
1. **MVP anti-triche (avant d'ouvrir aux gens)** :
   - Points calculés **côté serveur** (Cloud Function), plus jamais crédités par le client.
   - Points **en attente → crédités à la 2ᵉ confirmation** (couche 1).
   - **Géofence** sur confirmer/ajouter (couche 2).
   - Ajout de boisson **= photo** (couche 6).
2. **V2** : réputation utilisateur + décroissance + plafonds (couches 3-5).
3. **Firebase Security Rules** strictes : un client ne peut écrire que des contributions « en attente », jamais son solde de points ni le statut « fiable » d'une info.

## Honnêteté
- Aucun système n'est parfait — on vise **« tricher ne rapporte rien et se voit »**.
- Ces règles **doivent être testées** (Firebase + GPS réels) — impossible depuis l'environnement Claude. À faire avec un vrai cycle de test / ton dev.
- Je peux **rédiger les Security Rules Firebase + la Cloud Function « points validés »** prêtes à tester, si tu me donnes accès au projet Firebase (ou au dossier `functions/`).
