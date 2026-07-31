# Remplacer le faux « +0 magasins » par une vraie localisation OSM

Ce dossier contient la **Cloud Function de remplacement** (`locate-stores.js`) : elle
**localise les magasins** via OpenStreetMap et les ajoute dans Firestore (localisation
seule, **aucun stock inventé**). Elle remplace le job qui envoyait « Pays fouillé (+0) ».

## ⚠️ Important
- Je (Claude) **n'ai pas accès à ton projet Firebase** → je n'ai pas pu la tester.
- **À déployer et tester par toi / ton dev.** Ne la mets pas en prod sans un essai.

## Étape 0 — d'abord, couper le faux job (2 min)
Firebase Console → **Functions** → trouve la fonction planifiée qui envoie les notifs
« Pays fouillé / +0 magasins » → **Supprime-la ou désactive-la**. Le spam s'arrête.

## Étape 1 — adapter le code
Ouvre `locate-stores.js` et corrige les 2 endroits marqués **ADAPTE** :
1. `STORES_COLLECTION` = le **vrai nom** de ta collection de magasins dans Firestore.
2. La **forme du document** magasin (champs) selon ton schéma réel.
Ajuste aussi la liste `CITIES` (tes villes) et le `region` (ex. `europe-west1`).

## Étape 2 — déployer
Si tu as déjà un dossier `functions/` dans ton projet Firebase :
1. Copie l'export `locateStores` de `locate-stores.js` dans ton `functions/index.js`
   (ou importe le fichier), garde tes autres fonctions.
2. Vérifie `package.json` (Node 18+, `firebase-admin`, `firebase-functions` v2).
3. Déploie :
   ```bash
   firebase deploy --only functions:locateStores
   ```
4. Teste : regarde les logs (`firebase functions:log`), vérifie que des magasins
   apparaissent bien dans Firestore **sans stock** (`drinks: []`).

## Ce que ça change pour l'utilisateur
- ✅ La carte se remplit de **vrais commerces** (localisation).
- ✅ **Zéro stock inventé** → aucune fausse info, ta crédibilité est protégée.
- ✅ Plus de notif absurde « +0 ». (Option : une notif honnête « N magasins ajoutés ».)
- Le **stock** reste communautaire (les gens confirment sur place).

## Si tu veux que je la finalise à ta place
Ajoute ton dossier **`functions/`** au repo (ou colle-moi : le nom de ta collection
magasins + les champs d'un document magasin existant). Je l'adapte pile à ton schéma.
