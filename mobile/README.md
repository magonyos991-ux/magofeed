# Magofeed — application mobile (React Native / Expo)

La vraie app native. Même Firebase que le site : mêmes boissons, mêmes
magasins, mêmes confirmations — l'interface est native (React Native),
plus aucun HTML.

## La tester CE SOIR sur ton téléphone (sans Android Studio, sans Mac)

1. Installe **Expo Go** depuis le Play Store / App Store.
2. Sur ton PC :
   ```
   git pull
   cd mobile
   npm install
   npx expo start
   ```
3. Scanne le QR code affiché avec Expo Go (Android) ou l'appareil photo
   (iPhone). L'app s'ouvre sur ton téléphone, branchée à ta vraie base.

## Publier sur les stores (EAS Build — l'iOS se compile SANS Mac)

```
npm install -g eas-cli
eas login              # compte Expo gratuit
eas build -p android   # produit l'AAB à déposer dans la Play Console
eas build -p ios       # compile dans le cloud Expo — pas besoin de Mac,
                       # il faut juste ton compte Apple Developer (99 $/an)
eas submit             # envoie directement aux stores si tu veux
```

Identité : `com.magofeed.app` (Android et iOS). Textes des fiches store :
`../STORE-LISTING.md`. Checklist complète : `../STORE-SUBMISSION.md`
(sections comptes, captures, confidentialité — tout reste valable).

Note Android : en production, la carte Google Maps demande une clé API
(gratuite) à déclarer dans `app.json` → `android.config.googleMaps.apiKey`.
Dans Expo Go, rien à faire.

## Ce que contient la v1 (le cœur du produit)

- Recherche dans le catalogue (~700 boissons, collection `catalog`)
- Fiche boisson : carte + magasins qui l'ont dans les 10 km, triés par
  distance — pin vert = rayon confirmé par la communauté, gris = à
  confirmer (jamais rien d'inventé, comme sur le web)
- Carte générale « Autour de toi »
- « Y ALLER » : itinéraire dans l'app de cartes du téléphone
- Géolocalisation (repli : Bruxelles), session anonyme persistante,
  charte Magofeed (crème, encre, or, Space Grotesk)

## Pas encore porté (l'app web reste la référence en attendant)

Dans l'ordre conseillé : confirmer / signaler une rupture · scanner de
code-barres (expo-camera) · points, streak et classement · chasses et
veilles · notifications push (expo-notifications) · propositions de
découvertes · admin. Le site continue de vivre tel quel : c'est le lien
Instagram, et les deux parlent à la même base.
