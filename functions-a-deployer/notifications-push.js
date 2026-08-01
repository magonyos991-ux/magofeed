/**
 * Magofeed — Notifications PUSH réelles (téléphone, même app fermée).
 *
 * Ce que l'app fait déjà TOUTE SEULE (sans serveur) :
 *  - À la promotion d'une découverte, elle écrit un message in-app (userNotifs)
 *    et crédite +50 points à l'auteur à sa prochaine ouverture.
 *  - Au rejet d'une photo, elle prévient l'auteur in-app.
 *
 * Ce que SEUL un serveur peut faire (et que ces fonctions ajoutent) :
 *  - Envoyer une vraie notification PUSH sur le téléphone de l'auteur, même
 *    quand l'app est fermée (FCM). C'est la pièce manquante.
 *
 * ⚠️ Ces fonctions n'ajoutent AUCUN point : les points restent gérés par
 *    l'app (Phase 1). Pour des points infalsifiables côté serveur, voir
 *    points-serveur-PHASE2.js. Déployer les deux ensemble = double crédit :
 *    ne bascule sur la Phase 2 qu'en suivant son README.
 *
 * Firebase Functions v2 (Node 18+). Déploiement : voir README.md.
 */
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = "europe-west1"; // ADAPTE si ton projet est ailleurs

/* Envoi d'un push à un utilisateur via le token stocké dans pushTokens/{uid}
   (écrit par l'app quand l'utilisateur active les notifications). Silencieux
   si l'utilisateur n'a pas de token : on ne casse jamais le flux. */
async function pushToUser(uid, title, body, data) {
  if (!uid) return;
  try {
    const snap = await db.collection("pushTokens").doc(String(uid)).get();
    const token = snap.exists && snap.data().token;
    if (!token) return; // pas de token = pas de push, tant pis, l'in-app suffit
    await getMessaging().send({
      token: token,
      notification: { title: title, body: body },
      data: data || {},
      webpush: {
        notification: { icon: "icons/icon-192.png", badge: "icons/icon-192.png" },
        fcmOptions: { link: "https://magonyos991-ux.github.io/magofeed/" }
      }
    });
  } catch (e) {
    // Token périmé -> on le supprime pour ne pas ré-essayer indéfiniment
    if (e && (e.code === "messaging/registration-token-not-registered" ||
              e.code === "messaging/invalid-registration-token")) {
      try { await db.collection("pushTokens").doc(String(uid)).delete(); } catch (_) {}
    } else {
      console.warn("push error:", e && e.message);
    }
  }
}

/* Découverte promue au catalogue -> push "🎉 Ta découverte est dans Magofeed".
   Se déclenche quand le champ `promoted` passe à true. On lit l'auteur dans
   `by` (l'app l'enregistre à la création de la découverte). */
exports.notifyDiscoveryPromoted = onDocumentUpdated(
  { document: "discoveries/{id}", region: REGION },
  async (event) => {
    const before = event.data.before.data() || {};
    const after = event.data.after.data() || {};
    if (before.promoted === true || after.promoted !== true) return; // déjà traité / pas une promotion
    const by = after.by;
    if (!by) { console.log("Découverte sans auteur (by) — pas de push"); return; }
    const name = String(after.name || "Ta boisson").slice(0, 40);
    await pushToUser(
      by,
      "🎉 Ta découverte est dans Magofeed !",
      "« " + name + " » fait maintenant partie du catalogue. +50 points de découvreur 🏆",
      { type: "promoted", barcode: String(after.barcode || "") }
    );
  }
);

/* Photo rejetée par l'admin -> push "📸 Photo à refaire".
   Se déclenche quand `photoRejected` passe à true. */
exports.notifyPhotoRejected = onDocumentUpdated(
  { document: "discoveries/{id}", region: REGION },
  async (event) => {
    const before = event.data.before.data() || {};
    const after = event.data.after.data() || {};
    if (before.photoRejected === true || after.photoRejected !== true) return;
    const by = after.by;
    if (!by) return;
    const name = String(after.name || "ta découverte").slice(0, 40);
    await pushToUser(
      by,
      "📸 Photo à refaire",
      "Ta photo de « " + name + " » ne correspondait pas au produit. Peux-tu en reprendre une bien nette ?",
      { type: "photoRejected", barcode: String(after.barcode || "") }
    );
  }
);
