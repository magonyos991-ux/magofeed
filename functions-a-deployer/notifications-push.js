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
const { onDocumentUpdated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = "europe-west1"; // ADAPTE si ton projet est ailleurs

/* Envoi d'un push à un utilisateur via le token stocké dans pushTokens/{uid}
   (écrit par l'app quand l'utilisateur active les notifications). Silencieux
   si l'utilisateur n'a pas de token : on ne casse jamais le flux. */
const APP_URL = "https://magonyos991-ux.github.io/magofeed/";

async function pushToUser(uid, title, body, data, link) {
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
        // Le tap ouvre l'app SUR la bonne fiche (ex: #store=ID -> magasin + carte)
        fcmOptions: { link: link || APP_URL }
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

/* TEST — l'utilisateur appuie sur "Tester la notification" dans les réglages.
   On lui envoie un VRAI push FCM sur son propre téléphone : s'il ferme l'app
   juste après et voit quand même la notif, il a la preuve que tout marche
   (app fermée incluse). N'envoie qu'à SON propre token (req.auth.uid) : aucun
   risque d'abus. Renvoie une raison claire si le token manque, pour guider. */
exports.sendTestPush = onCall({ region: REGION }, async (req) => {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Connecte-toi d'abord.");
  const snap = await db.collection("pushTokens").doc(String(uid)).get();
  const token = snap.exists && snap.data().token;
  if (!token) return { ok: false, reason: "no-token" };
  try {
    await getMessaging().send({
      token: token,
      notification: {
        title: "🎉 Ça marche !",
        body: "Tu reçois bien les notifications Magofeed, même app fermée. Bonne chasse 🎯"
      },
      data: { type: "test" },
      webpush: {
        notification: { icon: "icons/icon-192.png", badge: "icons/icon-192.png" },
        fcmOptions: { link: APP_URL }
      }
    });
    return { ok: true };
  } catch (e) {
    if (e && (e.code === "messaging/registration-token-not-registered" ||
              e.code === "messaging/invalid-registration-token")) {
      try { await db.collection("pushTokens").doc(String(uid)).delete(); } catch (_) {}
      return { ok: false, reason: "stale-token" };
    }
    throw new HttpsError("internal", (e && e.message) || "push failed");
  }
});

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

/* CHASSE DE ZONE — push temps réel « à la chasse ! ».
   Quand un NOUVEAU chercheur rejoint une chasse (hunts/{drinkId}.seekers gagne
   un uid), on prévient les gens autour (pushTokens à moins de ~15 km) qu'une
   boisson est activement recherchée près d'eux : « 🎯 Quelqu'un cherche X — si
   tu la vois, signale-la et gagne des points ». On ne notifie pas le chercheur
   lui-même, ni au-delà du rayon. Distance = pushTokens.lat/lng (déjà stockés).
   ⚠️ Sur une grosse base, filtre par geohash au lieu de tout charger. */
function _dist(aLat, aLng, bLat, bLng) {
  if (aLat == null || bLat == null) return Infinity;
  const dLa = (aLat - bLat) * 111, dLo = (aLng - bLng) * 111 * Math.cos(aLat * Math.PI / 180);
  return Math.sqrt(dLa * dLa + dLo * dLo);
}
exports.notifyHuntNearby = onDocumentWritten(
  { document: "hunts/{drinkId}", region: REGION },
  async (event) => {
    const before = (event.data.before.exists && event.data.before.data()) || {};
    const after = (event.data.after.exists && event.data.after.data()) || {};
    if (!after || !after.seekers) return;
    const bSeek = before.seekers || {}, aSeek = after.seekers || {};
    // Nouveaux chercheurs (uid présent maintenant, absent ou nul avant)
    const newSeekers = Object.keys(aSeek).filter(function(u){ return aSeek[u] && !bSeek[u]; });
    if (!newSeekers.length) return;
    // Centre = position (arrondie) du nouveau chercheur le plus récent.
    // Peut rester null si le chercheur n'avait pas de GPS -> on notifie alors
    // TOUT LE MONDE (petite base : mieux vaut prévenir que rater la chasse).
    let center = null;
    newSeekers.forEach(function(u){ const s = aSeek[u]; if (s && s.lat != null && (!center || s.at > center.at)) center = s; });
    const seekerUids = new Set(Object.keys(aSeek).filter(function(u){ return aSeek[u]; }));
    const name = String(after.drinkName || "une boisson").slice(0, 40);
    // Anti-spam : au plus un push "chasse" par tranche de 6 h par boisson
    const now = Date.now();
    if (before._lastPush && now - before._lastPush < 6 * 3600 * 1000) return;
    try { await event.data.after.ref.set({ _lastPush: now }, { merge: true }); } catch (e) {}
    // Diffusion aux tokens proches (hors chercheurs)
    const tokensSnap = await db.collection("pushTokens").get();
    const msgs = [];
    tokensSnap.forEach(function(d){
      if (seekerUids.has(d.id)) return;         // pas le(s) chercheur(s)
      const t = d.data();
      if (!t.token) return;
      // On EXCLUT seulement quand on est SÛR que c'est trop loin (centre connu ET
      // position du destinataire connue ET distance > 15 km). Sinon on notifie
      // quand même (position manquante d'un côté = on ne cache pas la chasse).
      if (center && t.lat != null && _dist(center.lat, center.lng, t.lat, t.lng) > 15) return;
      msgs.push({
        token: t.token,
        notification: { title: "🎯 Chasse près de toi", body: "Quelqu'un cherche « " + name + " ». Si tu la vois en magasin, signale-la et gagne des points !" },
        data: { type: "hunt", drinkId: String(after.drinkId || "") },
        webpush: { fcmOptions: { link: "https://magonyos991-ux.github.io/magofeed/" } }
      });
    });
    // Envoi (par lots de 500 max côté FCM)
    for (let i = 0; i < msgs.length; i += 500) {
      try { await getMessaging().sendEach(msgs.slice(i, i + 500)); } catch (e) { console.warn("hunt push batch:", e && e.message); }
    }
    console.log("Chasse « " + name + " » : " + msgs.length + " notifiés.");
  }
);

/* CHASSE TROUVÉE — l'autre moitié : quand un chasseur AJOUTE une boisson à un
   magasin (le tableau `drinks` du magasin gagne un id), on prévient ceux qui la
   guettaient (collection `watches`) et qui sont à proximité : « ✅ Trouvée près
   de toi — voilà où l'acheter ». Le chasseur, lui, a déjà son bonus in-app.
   ⚠️ ADAPTE : casse de la collection magasins ("stores" vs "Stores"). */
exports.notifyStockToWatchers = onDocumentUpdated(
  { document: "stores/{id}", region: REGION },
  async (event) => {
    const before = event.data.before.data() || {};
    const after = event.data.after.data() || {};
    const bd = new Set((before.drinks || []).map(String));
    const added = (after.drinks || []).map(String).filter(function(x){ return !bd.has(x); });
    if (!added.length) return;
    const sLat = after.lat, sLng = after.lng, sName = String(after.name || "un magasin");
    for (const drinkId of added) {
      let watchSnap;
      try {
        watchSnap = await db.collection("watches").where("drinkId", "==", Number(drinkId) || drinkId).get();
      } catch (e) { console.warn("watches query:", e && e.message); continue; }
      for (const w of watchSnap.docs) {
        const wd = w.data();
        // Rayon choisi par la personne (curseur 1 → 20 km) ; 10 par défaut.
        const radius = (typeof wd.radius === "number" && wd.radius >= 1 && wd.radius <= 20) ? wd.radius : 10;
        if (sLat != null && wd.lat != null && _dist(sLat, sLng, wd.lat, wd.lng) > radius) continue;
        const dName = String(wd.drinkName || "Ta boisson").slice(0, 40);
        const storeId = String(event.params.id);
        await pushToUser(
          wd.uid,
          "✅ Trouvée près de toi !",
          "« " + dName + " » vient d'être repérée chez " + sName + ". Fonce l'acheter avant qu'elle parte !",
          { type: "found", drinkId: String(drinkId), storeId: storeId },
          // Tap sur la notif -> ouvre directement la fiche du magasin (+ carte) :
          APP_URL + "#store=" + encodeURIComponent(storeId)
        );
      }
    }
  }
);
