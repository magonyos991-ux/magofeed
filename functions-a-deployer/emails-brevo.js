/**
 * Magofeed — E-mails automatiques (chasse trouvée) via Brevo.
 *
 * CE QUE ÇA FAIT : quand une boisson est ajoutée au stock d'un magasin, les
 * personnes qui la CHASSENT (collection `watches`), qui sont dans leur rayon,
 * ET qui ont explicitement accepté les e-mails (emailOptIn = true sur leur
 * profil) reçoivent un e-mail : « Ton Mountain Dew vient d'être repérée ».
 *
 * C'est le pendant e-mail de notifyStockToWatchers (notifications-push.js) :
 * même déclencheur, même rayon, mais pour ceux qui n'ont pas activé les
 * notifications téléphone — ou en plus.
 *
 * RGPD / anti-spam, non négociable :
 *  - Envoi UNIQUEMENT si emailOptIn === true (case cochée par la personne).
 *  - Lien de désabonnement en un clic dans chaque e-mail (page /stop-mails).
 *  - Jamais deux fois le même e-mail (boisson + magasin + personne) : la
 *    collection `emailSent` sert de mémoire.
 *  - Maximum 3 e-mails par personne et par jour, tous sujets confondus.
 *
 * ── DÉPLOIEMENT (dans ton dossier functions/) ──
 *  1. Copier ce fichier dans functions/
 *  2. Enregistrer la clé Brevo :  firebase functions:secrets:set BREVO_API_KEY
 *     (Brevo → Paramètres SMTP & API → Clés API → Générer une nouvelle clé)
 *  3. Ajouter dans functions/index.js :
 *        exports.emailHuntFound = require("./emails-brevo").emailHuntFound;
 *  4. Déployer :  firebase deploy --only functions:emailHuntFound
 *
 * ⚠️ EXPÉDITEUR : Brevo n'envoie que depuis une adresse VÉRIFIÉE.
 *    Brevo → Expéditeurs & IP → Ajouter un expéditeur → magofeed@outlook.com
 *    → clique le lien de confirmation reçu sur cette boîte. Sans ça, l'API
 *    répond 400 et rien ne part (l'erreur est écrite dans les logs Firebase).
 */
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = "europe-west1";
const BREVO_API_KEY = defineSecret("BREVO_API_KEY");

const APP_URL = "https://magonyos991-ux.github.io/magofeed/";
const SENDER = { name: "Magofeed", email: "magofeed@outlook.com" };
const MAX_PER_DAY = 3;

function _dist(lat1, lng1, lat2, lng2) {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* Gabarit HTML : sobre, lisible sur mobile, aux couleurs de Magofeed.
   Pas d'image distante (les clients mail les bloquent souvent). */
function huntFoundHtml(drinkName, storeName, storeUrl, stopUrl) {
  return '<!doctype html><html><body style="margin:0;padding:0;background:#f4f1ea;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:28px 12px">' +
    '<tr><td align="center">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fffdf9;border-radius:18px;overflow:hidden;border:1px solid #e6dfd2">' +
        '<tr><td style="padding:26px 26px 8px">' +
          '<div style="font-size:13px;font-weight:700;letter-spacing:3px;color:#c69a57">MAGOFEED</div>' +
        '</td></tr>' +
        '<tr><td style="padding:6px 26px 0">' +
          '<div style="font-size:24px;font-weight:800;color:#1a140d;line-height:1.25">Ta boisson vient d\'être repérée</div>' +
          '<div style="font-size:16px;color:#3b332a;line-height:1.6;margin-top:14px">' +
            '<b>' + esc(drinkName) + '</b> a été confirmée en stock chez <b>' + esc(storeName) + '</b> par un membre de la communauté.' +
          '</div>' +
        '</td></tr>' +
        '<tr><td style="padding:22px 26px 6px">' +
          '<a href="' + esc(storeUrl) + '" style="display:inline-block;background:#1a140d;color:#fffdf9;text-decoration:none;padding:14px 26px;border-radius:12px;font-size:15px;font-weight:700">Voir le magasin</a>' +
        '</td></tr>' +
        '<tr><td style="padding:16px 26px 26px">' +
          '<div style="font-size:13px;color:#8a7f70;line-height:1.55">Les stocks bougent vite : si tu y vas, pense à confirmer dans l\'app pour aider les suivants.</div>' +
        '</td></tr>' +
      '</table>' +
      '<div style="max-width:520px;margin:14px auto 0;font-size:12px;color:#8a7f70;line-height:1.6;text-align:center">' +
        'Tu reçois cet e-mail parce que tu as activé les alertes de chasse dans Magofeed.<br>' +
        '<a href="' + esc(stopUrl) + '" style="color:#8a7f70">Ne plus recevoir ces e-mails</a>' +
      '</div>' +
    '</td></tr></table></body></html>';
}

async function sendBrevo(apiKey, to, subject, html) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "content-type": "application/json", "accept": "application/json" },
    body: JSON.stringify({
      sender: SENDER,
      to: [{ email: to }],
      subject: subject,
      htmlContent: html,
      tags: ["hunt-found"]
    })
  });
  if (!res.ok) {
    const txt = await res.text().catch(function () { return ""; });
    throw new Error("Brevo " + res.status + " " + txt.slice(0, 300));
  }
  return true;
}

/* Quota journalier par personne : la mémoire vit sur le profil (emailDay /
   emailCount), incrémentée en transaction pour éviter les doublons quand
   plusieurs boissons sont ajoutées en même temps (scan de frigo !). */
async function takeDailySlot(uid) {
  const day = new Date().toISOString().slice(0, 10);
  const ref = db.collection("users").doc(String(uid));
  return db.runTransaction(async function (t) {
    const snap = await t.get(ref);
    const d = snap.exists ? snap.data() : {};
    const count = d.emailDay === day ? (d.emailCount || 0) : 0;
    if (count >= MAX_PER_DAY) return false;
    t.set(ref, { emailDay: day, emailCount: count + 1 }, { merge: true });
    return true;
  });
}

exports.emailHuntFound = onDocumentUpdated(
  { document: "stores/{id}", region: REGION, secrets: [BREVO_API_KEY] },
  async (event) => {
    const before = event.data.before.data() || {};
    const after = event.data.after.data() || {};
    const bd = new Set((before.drinks || []).map(String));
    const added = (after.drinks || []).map(String).filter(function (x) { return !bd.has(x); });
    if (!added.length) return;

    const storeId = String(event.params.id);
    const sLat = after.lat, sLng = after.lng;
    const storeName = String(after.name || "un magasin");
    const storeUrl = APP_URL + "#store=" + encodeURIComponent(storeId);
    const apiKey = BREVO_API_KEY.value();

    for (const drinkId of added) {
      let watchSnap;
      try {
        watchSnap = await db.collection("watches").where("drinkId", "==", Number(drinkId) || drinkId).get();
      } catch (e) { console.warn("watches query:", e && e.message); continue; }

      for (const w of watchSnap.docs) {
        const wd = w.data();
        if (!wd.uid) continue;
        const radius = (typeof wd.radius === "number" && wd.radius >= 1 && wd.radius <= 20) ? wd.radius : 10;
        if (sLat != null && wd.lat != null && _dist(sLat, sLng, wd.lat, wd.lng) > radius) continue;

        // Consentement explicite + adresse : sans les deux, on n'envoie rien.
        let profile = null;
        try {
          const uSnap = await db.collection("users").doc(String(wd.uid)).get();
          profile = uSnap.exists ? uSnap.data() : null;
        } catch (e) { continue; }
        if (!profile || profile.emailOptIn !== true) continue;
        const to = String(profile.email || "").trim();
        if (!to || to.indexOf("@") === -1) continue;

        // Déjà envoyé pour ce trio (personne + boisson + magasin) ? on passe.
        const key = String(wd.uid) + "_" + String(drinkId) + "_" + storeId;
        const sentRef = db.collection("emailSent").doc(key);
        try {
          const already = await sentRef.get();
          if (already.exists) continue;
        } catch (e) { /* lecture impossible : on continue prudemment */ }

        if (!(await takeDailySlot(wd.uid))) continue;

        const dName = String(wd.drinkName || "Ta boisson").slice(0, 60);
        const stopUrl = APP_URL + "#stopmails=" + encodeURIComponent(String(wd.uid));
        try {
          await sendBrevo(
            apiKey, to,
            dName + " a été trouvée près de chez toi",
            huntFoundHtml(dName, storeName, storeUrl, stopUrl)
          );
          await sentRef.set({ uid: String(wd.uid), drinkId: String(drinkId), storeId: storeId, at: FieldValue.serverTimestamp() });
        } catch (e) {
          console.warn("Brevo send error:", e && e.message);
        }
      }
    }
  }
);
