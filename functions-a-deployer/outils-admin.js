/**
 * Magofeed — petit outil partage : prevenir les administrateurs.
 *
 * CE FICHIER N'EST PAS UNE CLOUD FUNCTION et ne doit JAMAIS etre branche dans
 * index.js. Il ne contient qu'une fonction utilitaire, utilisee par
 * notif-admin.js et catalogue-ia.js. Le brancher ferait croire a Firebase
 * qu'il y a une fonction a deployer ici.
 *
 * Origine : recupere le 4 septembre 2026 depuis le code deploye d'une
 * fonction ecrite en juillet, dont la source n'existait plus nulle part.
 */
const admin = require("firebase-admin");
const { getApps, initializeApp } = require("firebase-admin/app");
if (!getApps().length) initializeApp();
const db = admin.firestore();

/* Envoie une push a chaque administrateur qui a un jeton enregistre.
   Un jeton refuse par Google est efface : sans ca, la liste se remplit de
   jetons morts et chaque envoi echoue un peu plus. */
async function sendToAdmins(title, body) {
  try {
    const admins = await db.collection("admins").get();
    if (admins.empty) return;
    const sends = [];
    for (const a of admins.docs) {
      const tokDoc = await db.collection("pushTokens").doc(a.id).get();
      const token = tokDoc.exists ? (tokDoc.data() || {}).token : null;
      if (!token) continue;
      sends.push(
        admin.messaging().send({
          token,
          webpush: { notification: { title: title, body: body, icon: "icons/icon-192.png" } }
        }).catch((e) => {
          if (e && e.code === "messaging/registration-token-not-registered") {
            return db.collection("pushTokens").doc(a.id).delete();
          }
        })
      );
    }
    await Promise.all(sends);
  } catch (e) {
    console.warn("sendToAdmins:", e && e.message);
  }
}

module.exports = { sendToAdmins };
