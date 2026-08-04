/**
 * Magofeed — Récap quotidien du fondateur (notification PUSH sur le téléphone).
 *
 * Chaque soir, envoie au(x) admin(s) un résumé HONNÊTE de la journée, même app
 * fermée : nouveaux, actifs, découvertes, et "en ligne maintenant". Aucune
 * donnée inventée — tout vient de comptages Firestore réels (getCount).
 *
 * ⚠️ Je (Claude) n'ai pas accès à ton projet Firebase : teste à l'émulateur puis
 *    en prod. Les Cloud Functions demandent le plan Blaze (paiement à l'usage) ;
 *    ce job = 1 exécution/jour + quelques lectures agrégées = quasi gratuit.
 *
 * L'app affiche DÉJÀ ce récap in-app à ta première ouverture du jour (sans
 * serveur). Cette fonction ajoute seulement le PUSH téléphone (app fermée).
 *
 * Firebase Functions v2 (Node 18+). Déploiement en bas du fichier.
 */
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = "europe-west1";              // ADAPTE si ton projet est ailleurs
const APP_URL = "https://magonyos991-ux.github.io/magofeed/";

// Comptage agrégé (≈1 lecture par tranche de 1000 docs) — silencieux si erreur.
async function count(q) {
  try { const s = await q.count().get(); return s.data().count; }
  catch (e) { console.warn("count:", e && e.message); return null; }
}

/**
 * Tous les jours à 20:00 (heure de Bruxelles). Change "0 20 * * *" pour l'heure
 * qui te va (ex. "0 9 * * *" = 9h du matin). Cron = minute heure * * *.
 */
exports.dailyFounderRecap = onSchedule(
  { schedule: "0 20 * * *", timeZone: "Europe/Brussels", region: REGION },
  async () => {
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    const t0 = Timestamp.fromDate(midnight);
    const online2min = Timestamp.fromMillis(Date.now() - 120000); // "en ligne" = <2 min

    const [newToday, activeToday, discToday, onlineNow, totalUsers] = await Promise.all([
      count(db.collection("users").where("createdAt", ">=", t0)),      // nouveaux aujourd'hui
      count(db.collection("users").where("updatedAt", ">=", t0)),      // actifs aujourd'hui
      count(db.collection("discoveries").where("createdAt", ">=", t0)),// découvertes du jour
      count(db.collection("presence").where("lastSeen", ">=", online2min)), // en ligne là
      count(db.collection("users")),                                   // total joueurs
    ]);

    const n = (v) => (v == null ? "?" : v);
    const title = "📊 Ton récap Magofeed";
    const body =
      n(newToday) + " nouveaux · " + n(activeToday) + " actifs · " +
      n(discToday) + " découvertes · " + n(onlineNow) + " en ligne · " +
      n(totalUsers) + " au total";

    // Destinataires = tous les admins (collection "admins") qui ont un token push.
    const admins = await db.collection("admins").get();
    const tokens = [];
    for (const a of admins.docs) {
      try {
        const tk = await db.collection("pushTokens").doc(a.id).get();
        const token = tk.exists && tk.data().token;
        if (token) tokens.push(token);
      } catch (e) { /* admin sans token push : on saute */ }
    }
    if (!tokens.length) {
      console.log("Récap : aucun admin avec token push (active les notifs dans l'app).");
      return;
    }

    const messages = tokens.map((token) => ({
      token: token,
      notification: { title: title, body: body },
      data: { type: "founderRecap" },
      webpush: {
        notification: { icon: "icons/icon-192.png", badge: "icons/icon-192.png" },
        fcmOptions: { link: APP_URL },
      },
    }));

    try {
      const res = await getMessaging().sendEach(messages);
      console.log("Récap fondateur envoyé : " + res.successCount + "/" + tokens.length + ".");
    } catch (e) {
      console.warn("recap send:", e && e.message);
    }
  }
);

/* ────────────────────────────────────────────────────────────────────────────
 * DÉPLOIEMENT (~5 min)
 * 1. Copie cet `exports.dailyFounderRecap` dans ton `functions/index.js`
 *    (garde tes autres fonctions).
 * 2. `package.json` : Node 18+, `firebase-admin` et `firebase-functions` v2.
 *    Le scheduler v2 est inclus dans firebase-functions v2 (aucune install en
 *    plus). À la 1re fois, Firebase active Cloud Scheduler tout seul.
 * 3. Assure-toi d'être ADMIN (ton uid dans la collection `admins`) ET d'avoir
 *    activé les notifications dans l'app (ton token est alors dans `pushTokens`).
 * 4. Déploie : firebase deploy --only functions:dailyFounderRecap
 * 5. Test immédiat sans attendre 20h : Console → Functions → dailyFounderRecap
 *    → "Tester la fonction" (ou attends le prochain déclenchement planifié).
 *
 * Astuce : pour changer l'heure, édite le cron "0 20 * * *" et redéploie.
 * ──────────────────────────────────────────────────────────────────────────── */
