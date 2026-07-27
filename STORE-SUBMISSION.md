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

- [ ] **Icône** 512×512 (Play) et 1024×1024 (App Store) — tu as déjà `icons/`
- [ ] **Captures d'écran** (min. 2 par plateforme, format téléphone)
- [ ] **Description** courte + longue de la fiche
- [ ] **Catégorie** : Shopping ou Style de vie · **Classification d'âge** : Tout public
- [ ] **Compte développeur** : Google Play (25 $ une fois) · Apple Developer (99 $/an)
- [ ] **Signature de l'app** : keystore Android (`keytool`) · certificat de distribution iOS
- [ ] Vérifier que `magonyos991-ux.github.io` **et** le schéma Capacitor sont dans
      Firebase → Authentication → Authorized domains (sinon login Google KO en prod)

---

## 5. Commandes Capacitor de référence

```bash
npm install
npx cap add android
npx cap sync android
npx cap open android   # ouvre Android Studio pour build/signer
```

> ⚠️ Avant chaque build : `npx cap sync` pour copier le web (`index.html`) dans le natif.
