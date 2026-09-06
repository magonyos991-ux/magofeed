# Magofeed — Guide de soumission stores mobiles

Checklist pour publier Magofeed sur Google Play et l'App Store.
Généré le 27/07/2026. Coche au fur et à mesure.

---

## Déjà fait (dans le code)

- [x] **Politique de confidentialité (URL publique)** → `https://magonyos991-ux.github.io/magofeed/privacy.html`
- [x] **Conditions d'utilisation (URL publique)** → `https://magonyos991-ux.github.io/magofeed/terms.html`
- [x] **Suppression de compte in-app** → Réglages → « Supprimer mon compte » (exigé par Apple ET Google dès qu'un login existe)
- [x] **Avatar sécurisé** (plus d'injection `innerHTML`)
- [x] **Projet Capacitor généré** (`package.json`, `capacitor.config.json`, `android/`, `ios/`) — appId `com.magofeed.app`
- [x] **Permissions déclarées** : `android/app/src/main/AndroidManifest.xml` (bloc de la section 1) et `ios/App/App/Info.plist` (textes d'usage localisation + caméra)
- [x] **Icônes et écrans de démarrage natifs** générés depuis `icons/icon-1024.png` (fond crème #F2EDE4, sombre #17110a) via `npx @capacitor/assets generate`
- [x] **Web embarqué en liste blanche** : `npm run build:web` assemble `www/` (app seule, sans notes internes ni code serveur), copié dans le natif par `npx cap sync`

---

## 1. Permissions — à ajouter APRÈS `npx cap add android`

L'app utilise 3 permissions sensibles : **localisation** (trier les magasins), **caméra** (scan code-barres), **notifications** (veille produit). Sans les déclarer → **rejet automatique**.

### Android — `android/app/src/main/AndroidManifest.xml`

À coller juste avant la balise `<application>` :

```xml
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
<uses-permission android:name="android.permission.CAMERA"/>
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
<uses-feature android:name="android.hardware.camera" android:required="false"/>
<uses-feature android:name="android.hardware.location" android:required="false"/>
```

> L'app utilise les API web du WebView (`navigator.geolocation`, `getUserMedia`) et non les plugins natifs Capacitor. Capacitor 6 relaie automatiquement les demandes de permission du WebView **à condition** que ces permissions soient dans le manifeste.

### iOS — `ios/App/App/Info.plist` (quand tu feras `npx cap add ios`)

Chaque permission iOS DOIT avoir un texte d'usage, sinon rejet immédiat :

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Magofeed utilise ta position pour trouver les magasins les plus proches qui ont ta boisson.</string>
<key>NSCameraUsageDescription</key>
<string>Magofeed utilise la caméra pour scanner le code-barres des boissons et les ajouter à la carte.</string>
```

> Notifications push iOS : elles ne passent pas par Info.plist mais par la capability **Push Notifications** (Xcode → Signing & Capabilities) + un certificat APNs relié à Firebase. À configurer seulement si tu veux les notifs sur iOS.

---

## 2. Play Store — Déclaration de confidentialité (Data Safety)

Dans la Play Console → « Sécurité des données », déclare :

| Donnée | Collectée ? | Partagée ? | Raison |
|---|---|---|---|
| Position (approx. + précise) | Oui | Non | Fonctionnalité de l'app |
| Nom / photo / e-mail (si login Google) | Oui | Non | Gestion du compte |
| ID utilisateur (anonyme) | Oui | Non | Fonctionnalité |
| Interactions in-app (contributions) | Oui | Non | Fonctionnalité |

- Chiffrement en transit : **Oui** (HTTPS)
- L'utilisateur peut demander la suppression : **Oui** (in-app + e-mail)

## 3. App Store — Confidentialité (App Privacy)

Dans App Store Connect → « Confidentialité de l'app » : déclare Localisation, Identifiants,
Coordonnées (e-mail si login Google), Contenu utilisateur. Aucune n'est utilisée pour le suivi publicitaire.

---

## 4. Reste à préparer (hors code)

- [x] **Icône** 512×512 (Play, `icons/icon-512.png`) et 1024×1024 (App Store, `icons/icon-1024.png`)
- [x] **Feature graphic** Google Play 1024×500 (`icons/feature-graphic.png`)
- [x] **Description** courte + longue (voir `STORE-LISTING.md`)
- [x] **Captures d'écran** — générées dans `promo/stores/` (voir section 5)
- [ ] **Catégorie** : Shopping ou Style de vie · **Classification d'âge** : Tout public
- [ ] **Compte développeur** : Google Play (25 $ une fois) · Apple Developer (99 $/an)
- [ ] **Signature de l'app** : keystore Android (`keytool`) · certificat de distribution iOS
- [ ] Vérifier que `magonyos991-ux.github.io` **et** le schéma Capacitor sont dans
      Firebase → Authentication → Authorized domains (sinon login Google KO en prod)

---

## 5. Captures d'écran — mode d'emploi

Les captures sont **déjà générées** dans `promo/stores/`, aux dimensions exactes
exigées par chaque magasin. Rien à refaire à la main.

| Fichier | Format | Écran |
|---|---|---|
| `play-1-accueil.png` · `appstore-1-accueil.png` | 1080x1920 · 1290x2796 | Accueil, « Autour de toi » et « À découvrir » |
| `play-2-recherche.png` · `appstore-2-recherche.png` | idem | Recherche « mountain dew », la gamme entière |
| `play-3-carte.png` · `appstore-3-carte.png` | idem | Carte, pins verts vérifiés et gris non confirmés |
| `play-4-fiche-magasin.png` · `appstore-4-fiche-magasin.png` | idem | Fiche magasin, « Y aller », boissons référencées |
| `play-5-scan.png` · `appstore-5-scan.png` | idem | Écran du scanner |

Play en accepte 2 à 8, l'App Store 3 à 10 : les quatre premières suffisent, la
cinquième est facultative — elle montre l'état vide du journal de trouvailles,
ce qui est honnête mais moins parlant que les autres.

### Comment elles sont produites

    node promo/captures-stores.mjs

Le script sert l'app en local, coupe Firestore et l'authentification, sert le
SDK Firebase et Leaflet depuis un cache disque, et récupère les tuiles
OpenStreetMap par curl. Chaque format est rendu dans sa propre fenêtre au bon
rapport : aucune image n'est agrandie, car un agrandissement se voit et les
magasins refusent les captures floues.

### Ce que les captures montrent, et ne montrent pas

Les cinq magasins sont **fictifs** et ne servent qu'à montrer la mise en page.
Aucune capture ne prétend qu'une boisson est réellement disponible quelque part.
L'écran de scan est pris **avant** l'allumage de la caméra : plutôt qu'un faux
rayon de supermarché, on montre l'écran d'accueil réel du scanner avec ses
vraies instructions.

### Dimensions exigées, pour mémoire

| Store | Format | Nombre |
|---|---|---|
| Google Play (téléphone) | min. 320 px côté court, ratio 16:9 ou 9:16 — ici **1080x1920** | 2 à 8 |
| App Store (iPhone 6.7") | **1290x2796** | 3 à 10 |
| App Store (iPhone 6.5") | 1242x2688 | facultatif si 6.7" fourni |

### Si tu préfères capturer depuis ton propre téléphone

Ouvre l'app, mets-toi sur chaque écran et fais une capture native (Android :
Volume bas + Power ; iPhone : Volume haut + Power). Mets le téléphone en mode
« ne pas déranger » avant, pour qu'aucune notification personnelle ne traîne
sur l'image.

## 6. Commandes Capacitor de référence

Le projet est déjà généré et committé. Sur ton PC :

```bash
git pull
npm install
npm run android        # assemble www/, synchronise, ouvre Android Studio
```

Pour iOS (nécessite un Mac avec Xcode, ou un service de build type Codemagic) :

```bash
npm install
npm run ios            # assemble www/, synchronise, ouvre Xcode
```

Commandes unitaires si besoin :

```bash
npm run build:web      # assemble www/ (liste blanche)
npx cap sync android   # copie www/ dans le projet natif
npx cap open android   # ouvre Android Studio pour build/signer
```

> Attention — avant chaque build : `npx cap sync` pour copier le web (`index.html`) dans le natif.
