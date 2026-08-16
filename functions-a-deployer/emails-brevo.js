/**
 * Magofeed — E-mails automatiques via Brevo.
 *
 * TROIS fonctions dans ce fichier :
 *
 *  1. emailHuntStarted  — « Ta chasse est lancée » (confirmation immédiate,
 *     envoyée quand quelqu'un appuie sur le bouton de chasse). C'est la preuve
 *     visible que la chaîne d'envoi marche, et ça rassure : la personne sait
 *     qu'elle sera prévenue.
 *  2. emailHuntFound    — « Ta boisson vient d'être repérée » (le vrai but).
 *     ⚠️ Se déclenche quand une boisson est AJOUTÉE au stock d'un magasin.
 *     Lancer une chasse ne déclenche PAS cet e-mail : tant que personne n'a
 *     signalé la boisson quelque part, il n'y a rien à annoncer.
 *  3. sendTestEmail     — bouton « Envoyer un e-mail de test » dans les
 *     réglages. Renvoie à l'app l'erreur EXACTE de Brevo en cas d'échec, pour
 *     ne plus jamais deviner pourquoi rien n'arrive.
 *
 * RGPD / anti-spam, non négociable :
 *  - Envoi UNIQUEMENT si emailOptIn === true (case cochée par la personne).
 *  - Lien de désabonnement en un clic dans chaque e-mail.
 *  - Jamais deux fois le même e-mail « trouvée » (personne + boisson +
 *    magasin) : la collection `emailSent` sert de mémoire ; `emailStarted`
 *    joue le même rôle pour la confirmation de chasse.
 *  - Compteurs journaliers SÉPARÉS par type, pour qu'une rafale de
 *    confirmations de chasse ne puisse jamais bloquer l'e-mail important.
 *  - Crédit remboursé quand l'envoi échoue : un quota ne doit pas être brûlé
 *    par des essais qui ne sont jamais partis.
 *
 * ── DÉPLOIEMENT (dans ton dossier functions/) ──
 *  1. Copier ce fichier dans functions/
 *  2. Enregistrer la clé Brevo :  firebase functions:secrets:set BREVO_API_KEY
 *     (Brevo → Paramètres SMTP & API → Clés API → Générer une nouvelle clé)
 *  3. Ajouter dans functions/index.js les TROIS lignes :
 *        exports.emailHuntFound   = require("./emails-brevo").emailHuntFound;
 *        exports.emailHuntStarted = require("./emails-brevo").emailHuntStarted;
 *        exports.sendTestEmail    = require("./emails-brevo").sendTestEmail;
 *  4. Déployer :
 *        firebase deploy --only functions:emailHuntFound,functions:emailHuntStarted,functions:sendTestEmail
 *  5. Publier aussi les règles :  firebase deploy --only firestore:rules
 *
 * ⚠️ EXPÉDITEUR : Brevo n'envoie que depuis une adresse VÉRIFIÉE.
 *    Brevo → Expéditeurs & IP → l'adresse ci-dessous doit être au vert.
 *    Sinon l'API répond 400 — et le bouton de test te montrera ce message
 *    mot pour mot dans l'app.
 */
const { onDocumentUpdated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = "europe-west1";
const BREVO_API_KEY = defineSecret("BREVO_API_KEY");

const APP_URL = "https://magonyos991-ux.github.io/magofeed/";
const SENDER = { name: "Magofeed", email: "magofeed@outlook.com" };

// Quotas journaliers, un compteur par type : une avalanche de confirmations
// ne doit JAMAIS empêcher l'e-mail « trouvée », qui est le seul qui compte.
const LIMITS = {
  found:   { max: 5, day: "emailDay",      count: "emailCount" },
  started: { max: 5, day: "emailStartDay", count: "emailStartCount" },
  test:    { max: 5, day: "emailTestDay",  count: "emailTestCount" }
};

function _dist(lat1, lng1, lat2, lng2) {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* Gabarit HTML commun : sobre, lisible sur mobile, aux couleurs de Magofeed.
   Pas d'image distante (les clients mail les bloquent souvent). */
function shell(title, bodyHtml, ctaLabel, ctaUrl, footNote, stopUrl) {
  return '<!doctype html><html><body style="margin:0;padding:0;background:#f4f1ea;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:28px 12px">' +
    '<tr><td align="center">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fffdf9;border-radius:18px;overflow:hidden;border:1px solid #e6dfd2">' +
        '<tr><td style="padding:26px 26px 8px">' +
          '<div style="font-size:13px;font-weight:700;letter-spacing:3px;color:#c69a57">MAGOFEED</div>' +
        '</td></tr>' +
        '<tr><td style="padding:6px 26px 0">' +
          '<div style="font-size:24px;font-weight:800;color:#1a140d;line-height:1.25">' + title + '</div>' +
          '<div style="font-size:16px;color:#3b332a;line-height:1.6;margin-top:14px">' + bodyHtml + '</div>' +
        '</td></tr>' +
        (ctaUrl ? ('<tr><td style="padding:22px 26px 6px">' +
          '<a href="' + esc(ctaUrl) + '" style="display:inline-block;background:#1a140d;color:#fffdf9;text-decoration:none;padding:14px 26px;border-radius:12px;font-size:15px;font-weight:700">' + ctaLabel + '</a>' +
        '</td></tr>') : '') +
        (footNote ? ('<tr><td style="padding:16px 26px 26px">' +
          '<div style="font-size:13px;color:#8a7f70;line-height:1.55">' + footNote + '</div>' +
        '</td></tr>') : '<tr><td style="padding:10px"></td></tr>') +
      '</table>' +
      '<div style="max-width:520px;margin:14px auto 0;font-size:12px;color:#8a7f70;line-height:1.6;text-align:center">' +
        'Tu reçois cet e-mail parce que tu as activé les alertes de chasse dans Magofeed.<br>' +
        '<a href="' + esc(stopUrl) + '" style="color:#8a7f70">Ne plus recevoir ces e-mails</a>' +
      '</div>' +
    '</td></tr></table></body></html>';
}

function stopUrlFor(uid) {
  return APP_URL + "#stopmails=" + encodeURIComponent(String(uid));
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
      tags: ["magofeed"]
    })
  });
  if (!res.ok) {
    const txt = await res.text().catch(function () { return ""; });
    throw new Error("Brevo " + res.status + " " + txt.slice(0, 300));
  }
  return true;
}

/* Quota journalier par personne ET par type, incrémenté en transaction pour
   éviter les doublons quand plusieurs boissons arrivent en même temps
   (scan de frigo !). */
async function takeDailySlot(uid, kind) {
  const cfg = LIMITS[kind] || LIMITS.found;
  const day = new Date().toISOString().slice(0, 10);
  const ref = db.collection("users").doc(String(uid));
  return db.runTransaction(async function (t) {
    const snap = await t.get(ref);
    const d = snap.exists ? snap.data() : {};
    const count = d[cfg.day] === day ? (d[cfg.count] || 0) : 0;
    if (count >= cfg.max) {
      console.log("Quota e-mail atteint:", kind, uid, count + "/" + cfg.max);
      return false;
    }
    const patch = {};
    patch[cfg.day] = day;
    patch[cfg.count] = count + 1;
    t.set(ref, patch, { merge: true });
    return true;
  });
}

/* Remboursement du crédit quand l'envoi échoue. Sans ça, cinq essais ratés
   (expéditeur non vérifié, par exemple) épuisaient le quota du bouton de test
   — et le bouton se mettait à répondre « quota atteint » au lieu d'afficher
   l'erreur de Brevo, c'est-à-dire exactement l'information qu'on cherchait. */
async function refundDailySlot(uid, kind) {
  const cfg = LIMITS[kind] || LIMITS.found;
  const ref = db.collection("users").doc(String(uid));
  try {
    await db.runTransaction(async function (t) {
      const snap = await t.get(ref);
      const d = snap.exists ? snap.data() : {};
      const c = d[cfg.count] || 0;
      if (c > 0) {
        const patch = {};
        patch[cfg.count] = c - 1;
        t.set(ref, patch, { merge: true });
      }
    });
  } catch (e) { /* sans importance : le compteur se remet à zéro demain */ }
}

/* ⚠️ D'OÙ VIENT L'ADRESSE — le point le plus important de ce fichier.
   Elle vient de FIREBASE AUTH, jamais de Firestore.

   Pourquoi : tout ce qui est dans Firestore est écrit par le téléphone. Si on
   lisait l'adresse dans un document, n'importe qui pourrait y écrire
   « victime@exemple.com », cocher le consentement, et faire partir du courrier
   depuis l'expéditeur vérifié de Magofeed. C'est très exactement la définition
   d'un relais de courrier ouvert — le genre de chose qui fait blacklister un
   domaine en une journée.

   L'adresse du compte, elle, est posée par Google (ou par l'inscription
   e-mail) et n'est modifiable que via Auth. C'est la seule source de vérité.
   Bonus : plus aucune adresse ne traîne dans la base, donc plus rien à
   récolter, et le classement peut rester lisible par tous. */
async function readEmail(uid) {
  try {
    const u = await getAuth().getUser(String(uid));
    return String((u && u.email) || "").trim();
  } catch (e) {
    console.warn("readEmail:", e && e.message);
    return "";
  }
}

/* Il faut une adresse ET un consentement explicite.
   Sans les deux, on n'envoie rien — jamais. */
async function recipient(uid) {
  try {
    const snap = await db.collection("users").doc(String(uid)).get();
    if (!snap.exists) return null;
    if ((snap.data() || {}).emailOptIn !== true) return null;
    const to = await readEmail(uid);
    if (!to || to.indexOf("@") === -1) return null;
    return to;
  } catch (e) { return null; }
}

/* ═══════════ 1. CHASSE LANCÉE — confirmation immédiate ═══════════ */
exports.emailHuntStarted = onDocumentWritten(
  { document: "watches/{id}", region: REGION, secrets: [BREVO_API_KEY] },
  async (event) => {
    const watchId = String(event.params.id);
    const after = event.data && event.data.after;
    const memoRef = db.collection("emailStarted").doc(watchId);

    // Chasse arrêtée : on oublie, pour qu'une future relance renvoie bien
    // une confirmation.
    if (!after || !after.exists) {
      try { await memoRef.delete(); } catch (e) {}
      return;
    }

    const w = after.data() || {};
    if (!w.uid) return;

    /* ⚠️ POURQUOI onDocumentWritten ET PAS onDocumentCreated.
       L'app écrit la veille sous un identifiant fixe (uid_boisson) avec un
       setDoc. Si le document existait déjà — chasse relancée, réglage du
       rayon, autre appareil — c'est une MISE À JOUR, et onDocumentCreated ne
       se déclencherait jamais. Résultat : on relance sa chasse et on ne
       reçoit plus rien, à vie, pour cette boisson. On écoute donc toutes les
       écritures, et c'est `emailStarted` qui garantit un seul envoi. */
    try {
      const already = await memoRef.get();
      if (already.exists) return;
    } catch (e) { return; } // lecture impossible : mieux vaut ne rien envoyer

    const to = await recipient(w.uid);
    if (!to) return;
    if (!(await takeDailySlot(w.uid, "started"))) return;

    const dName = String(w.drinkName || "Ta boisson").slice(0, 60);
    const radius = (typeof w.radius === "number" && w.radius >= 1 && w.radius <= 20) ? w.radius : 10;
    try {
      await sendBrevo(
        BREVO_API_KEY.value(), to,
        "Chasse lancée : " + dName,
        shell(
          "Ta chasse est lancée",
          "Tu chasses <b>" + esc(dName) + "</b>. Dès qu'un membre de la communauté la repère " +
            "dans un magasin à moins de <b>" + radius + " km</b> de toi, tu reçois un e-mail avec l'adresse.",
          "Ouvrir Magofeed", APP_URL,
          "Rien à faire de plus : on te prévient. Et si c'est toi qui la trouves en premier, signale-la — ça fait gagner des points.",
          stopUrlFor(w.uid)
        )
      );
      await memoRef.set({ uid: String(w.uid), at: FieldValue.serverTimestamp() });
    } catch (e) {
      console.warn("Brevo (chasse lancée):", e && e.message);
      await refundDailySlot(w.uid, "started");
    }
  }
);

/* ═══════════ 2. CHASSE TROUVÉE — le vrai but ═══════════
   Pendant e-mail de notifyStockToWatchers : même déclencheur (une boisson
   entre au stock d'un magasin), même rayon. */
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
        const asNum = Number(drinkId);
        watchSnap = await db.collection("watches")
          .where("drinkId", "==", Number.isFinite(asNum) ? asNum : drinkId).get();
      } catch (e) { console.warn("watches query:", e && e.message); continue; }

      for (const w of watchSnap.docs) {
        const wd = w.data();
        if (!wd.uid) continue;
        const radius = (typeof wd.radius === "number" && wd.radius >= 1 && wd.radius <= 20) ? wd.radius : 10;
        if (sLat != null && wd.lat != null && _dist(sLat, sLng, wd.lat, wd.lng) > radius) continue;

        const to = await recipient(wd.uid);
        if (!to) continue;

        // Déjà envoyé pour ce trio (personne + boisson + magasin) ? on passe.
        const key = String(wd.uid) + "_" + String(drinkId) + "_" + storeId;
        const sentRef = db.collection("emailSent").doc(key);
        try {
          const already = await sentRef.get();
          if (already.exists) continue;
        } catch (e) { /* lecture impossible : on continue prudemment */ }

        if (!(await takeDailySlot(wd.uid, "found"))) continue;

        const dName = String(wd.drinkName || "Ta boisson").slice(0, 60);
        try {
          await sendBrevo(
            apiKey, to,
            dName + " a été trouvée près de chez toi",
            shell(
              "Ta boisson vient d'être repérée",
              "<b>" + esc(dName) + "</b> a été confirmée en stock chez <b>" + esc(storeName) +
                "</b> par un membre de la communauté.",
              "Voir le magasin", storeUrl,
              "Les stocks bougent vite : si tu y vas, pense à confirmer dans l'app pour aider les suivants.",
              stopUrlFor(wd.uid)
            )
          );
          await sentRef.set({ uid: String(wd.uid), drinkId: String(drinkId), storeId: storeId, at: FieldValue.serverTimestamp() });
        } catch (e) {
          console.warn("Brevo (trouvée):", e && e.message);
          await refundDailySlot(wd.uid, "found");
        }
      }
    }
  }
);

/* ═══════════ 3. E-MAIL DE TEST — le diagnostic ═══════════
   Appelé par le bouton « Envoyer un e-mail de test » des réglages. On renvoie
   la raison EXACTE de l'échec (y compris le message brut de Brevo) pour que
   l'app puisse l'afficher, au lieu de laisser deviner. */
exports.sendTestEmail = onCall(
  { region: REGION, secrets: [BREVO_API_KEY] },
  async (req) => {
    const uid = req.auth && req.auth.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Connecte-toi d'abord.");

    let d = {};
    try {
      const snap = await db.collection("users").doc(String(uid)).get();
      d = snap.exists ? (snap.data() || {}) : {};
    } catch (e) {
      return { ok: false, reason: "profil-illisible", detail: String(e && e.message || e).slice(0, 200) };
    }

    // Adresse issue du jeton signé par Firebase (ou d'Auth) — jamais d'un
    // champ que le téléphone aurait pu écrire lui-même.
    const to = String((req.auth.token && req.auth.token.email) || "").trim() || (await readEmail(uid));
    if (!to || to.indexOf("@") === -1) return { ok: false, reason: "sans-adresse" };
    if (d.emailOptIn !== true) return { ok: false, reason: "sans-consentement" };
    if (!(await takeDailySlot(uid, "test"))) return { ok: false, reason: "quota-test" };

    try {
      await sendBrevo(
        BREVO_API_KEY.value(), to,
        "Test Magofeed — tes e-mails fonctionnent",
        shell(
          "Tes e-mails fonctionnent",
          "Si tu lis ceci, tout est branché correctement. Tu recevras désormais un e-mail " +
            "quand une boisson que tu chasses sera repérée près de chez toi.",
          "Ouvrir Magofeed", APP_URL,
          "E-mail envoyé depuis les réglages de l'app, à ta demande.",
          stopUrlFor(uid)
        )
      );
      return { ok: true, to: to };
    } catch (e) {
      await refundDailySlot(uid, "test");
      // Message brut de Brevo (ex. « sender not valid ») : c'est CE texte qui
      // dit quoi corriger. On le remonte tel quel à l'app.
      return { ok: false, reason: "brevo", detail: String(e && e.message || e).slice(0, 300) };
    }
  }
);
