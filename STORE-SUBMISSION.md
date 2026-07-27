# Magofeed — Guide de soumission stores mobiles

Checklist pour publier Magofeed sur Google Play et l'App Store.
Généré le 27/07/2026. Coche au fur et à mesure.

---

## ✅ Déjà fait (dans le code)

- [x] **Politique de confidentialité (URL publique)** → `https://magonyos991-ux.github.io/magofeed/privacy.html`
- [x] **Conditions d'utilisation (URL publique)** → `https://magonyos991-ux.github.io/magofeed/terms.html`
- [x] **Suppression de compte in-app** → Réglages → « Supprimer mon compte » (exigé par Apple ET Google dès qu'un login existe)
- [x] **Avatar sécurisé** (plus d'injection `innerHTML`)

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
- [ ] **Captures d'écran** (voir section 5 ci-dessous)
- [ ] **Catégorie** : Shopping ou Style de vie · **Classification d'âge** : Tout public
- [ ] **Compte développeur** : Google Play (25 $ une fois) · Apple Developer (99 $/an)
- [ ] **Signature de l'app** : keystore Android (`keytool`) · certificat de distribution iOS
- [ ] Vérifier que `magonyos991-ux.github.io` **et** le schéma Capacitor sont dans
      Firebase → Authentication → Authorized domains (sinon login Google KO en prod)

---

## 5. Captures d'écran — mode d'emploi

### Dimensions exigées
| Store | Format | Nombre |
|---|---|---|
| Google Play (téléphone) | min. 320 px côté court, ratio 16:9 ou 9:16 (ex. **1080×1920**) | 2 à 8 |
| App Store (iPhone 6.7") | **1290×2796** | 3 à 10 |
| App Store (iPhone 6.5") | **1242×2688** | facultatif si 6.7" fourni |

### Les 4 écrans à capturer (dans cet ordre)
1. **Accueil** — « Bonjour 👋 Que boit-on ? » + barre de recherche
2. **Résultat de recherche** — une boisson + les magasins triés par distance
3. **Carte** — magasins autour de toi avec les pins
4. **Scan** — l'écran caméra de scan code-barres

### Comment les prendre (le plus simple)
1. Ouvre l'app **en vrai sur ton téléphone** (le login/la géoloc marchent, contrairement au PC).
2. Mets-toi dans chaque écran ci-dessus et fais une capture native :
   - **Android** : Volume bas + Power
   - **iPhone** : Volume haut + Power
3. Les captures du téléphone sont déjà aux bonnes dimensions natives → utilisables directement.

> Astuce cadrage : évite d'avoir une barre de statut avec ton % de batterie à 12 % ou des notifs perso visibles. Mets le téléphone en mode « ne pas déranger » avant.

### Alternative sans téléphone (émulateur)
Après `npx cap open android`, lance l'app dans l'émulateur Android Studio (Pixel 6) et capture via l'icône appareil photo de la barre latérale de l'émulateur.

---

## 6. Commandes Capacitor de référence

```bash
npm install
npx cap add android
npx cap sync android
npx cap open android   # ouvre Android Studio pour build/signer
```

> ⚠️ Avant chaque build : `npx cap sync` pour copier le web (`index.html`) dans le natif.
