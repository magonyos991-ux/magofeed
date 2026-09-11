/**
 * Magofeed — La notification PUSH d'un nouveau message (téléphone, même app
 * fermée). Firebase Functions v2 (Node 18+), région europe-west1.
 *
 * L'app affiche déjà la pastille et le message quand elle est ouverte. Ce que
 * seul le serveur peut faire : prévenir l'AUTRE membre quand l'app est fermée.
 *
 * Règles du jeu, alignées sur les règles Firestore de la messagerie :
 *  - une demande (state == "request") se présente comme « X veut t'écrire »,
 *    sans le texte : tant que la personne n'a pas accepté, l'inconnu n'a pas
 *    la parole sur son écran de verrouillage ;
 *  - un fil ouvert montre le pseudo et un aperçu (texte, ou « Photo »,
 *    « Position », « Emplacement : … ») ;
 *  - le tap ouvre l'app directement sur le fil (#thread=<cid>).
 * Aucun point, aucune écriture : la fonction ne fait que prévenir.
 *
 * Déploiement : firebase deploy --only functions:notifierNouveauMessage
 */
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = "europe-west1";
const APP_URL = "https://magonyos991-ux.github.io/magofeed/";

/* Même mécanique que notifications-push.js : un token par utilisateur dans
   pushTokens/{uid}, silence si absent, suppression si périmé. */
async function pushToUser(uid, title, body, data, link) {
  if (!uid) return;
  try {
    const snap = await db.collection("pushTokens").doc(String(uid)).get();
    const token = snap.exists && snap.data().token;
    if (!token) return;
    await getMessaging().send({
      token: token,
      notification: { title: title, body: body },
      data: data || {},
      webpush: {
        notification: { icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: "msg-" + (data && data.cid || "x") },
        fcmOptions: { link: link || APP_URL }
      }
    });
  } catch (e) {
    if (e && (e.code === "messaging/registration-token-not-registered" ||
              e.code === "messaging/invalid-registration-token")) {
      try { await db.collection("pushTokens").doc(String(uid)).delete(); } catch (_) {}
    } else {
      console.warn("push message error:", e && e.message);
    }
  }
}

function apercu(m) {
  const t = String(m.type || "text");
  if (t === "image") return "Photo";
  if (t === "pos") return "Position partagée";
  if (t === "spot") return "Emplacement : " + String(m.drinkName || "une boisson").slice(0, 40) + " chez " + String(m.storeName || "un magasin").slice(0, 40);
  return String(m.text || "").replace(/\s+/g, " ").trim().slice(0, 90);
}

exports.notifierNouveauMessage = onDocumentCreated(
  { document: "conversations/{cid}/messages/{mid}", region: REGION },
  async (event) => {
    const m = event.data && event.data.data();
    if (!m || !m.by) return;
    const cid = event.params.cid;
    const convSnap = await db.collection("conversations").doc(cid).get();
    if (!convSnap.exists) return;
    const conv = convSnap.data() || {};
    const membres = Array.isArray(conv.members) ? conv.members : [];
    const dest = membres.find((u) => u !== m.by);
    if (!dest) return;
    /* Bloqué : les règles refusent déjà l'écriture, mais si un jour elles
       changent, on ne réveillera jamais le téléphone d'une personne qui a
       bloqué l'expéditeur. */
    try {
      const b = await db.collection("blocks").doc(dest).get();
      if (b.exists && Array.isArray(b.data().list) && b.data().list.includes(m.by)) return;
    } catch (_) {}
    let pseudo = "Quelqu'un";
    try {
      const u = await db.collection("users").doc(m.by).get();
      if (u.exists && u.data().pseudo) pseudo = String(u.data().pseudo).slice(0, 24);
    } catch (_) {}
    const demande = conv.state === "request";
    const title = demande ? (pseudo + " veut t'écrire") : pseudo;
    const body = demande ? "Ouvre Magofeed pour lire sa demande et décider." : apercu(m);
    await pushToUser(dest, title, body, { type: "msg", cid: cid }, APP_URL + "#thread=" + encodeURIComponent(cid));
  }
);
