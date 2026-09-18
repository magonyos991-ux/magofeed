/* Même projet Firebase que l'app web : mêmes boissons, mêmes magasins,
   mêmes confirmations. La config ci-dessous est la config PUBLIQUE web
   (index.html) — la sécurité est dans les règles Firestore, pas ici. */
import { initializeApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";
import { initializeAuth, getReactNativePersistence, signInAnonymously } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: "AIzaSyCjeQJcdpDJJdlqGX6Eb3MLKPCMP1YsNRM",
  authDomain: "magofeed-7f621.firebaseapp.com",
  projectId: "magofeed-7f621",
  storageBucket: "magofeed-7f621.firebasestorage.app",
  messagingSenderId: "227802468654",
  appId: "1:227802468654:web:25e03050520d0bdced6abf",
};

const app = initializeApp(firebaseConfig);

/* Long polling auto-détecté : certains réseaux mobiles coupent le streaming
   Firestore ; sans ça, l'app resterait muette sans erreur visible. */
export const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });

/* Session anonyme persistée sur l'appareil : le même utilisateur d'une
   ouverture à l'autre, comme le localStorage du web. */
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export function connecterAnonyme() {
  return signInAnonymously(auth).catch((e) => {
    console.warn("Auth anonyme:", e && e.message);
    return null;
  });
}
