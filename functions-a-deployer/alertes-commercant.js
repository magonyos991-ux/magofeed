/**
 * Magofeed — LES ALERTES DU GÉRANT.
 *
 * Un commerçant certifié n'était prévenu de rien : ni de sa certification
 * (une ligne dans la cloche, qu'il ne voyait qu'en rouvrant l'app), ni d'un
 * client qui signale une rupture chez lui, c'est-à-dire exactement le moment
 * où sa fiche se met à mentir sur son rayon. Huit gérants fictifs ont relu
 * le parcours (table des gérants du 11/11) : « que l'app me parle » revenait
 * chez tous ceux qui ont un téléphone dans la poche toute la journée.
 *
 * TROIS DÉCLENCHEURS, ET CE QU'ILS NE FONT PAS.
 *
 *  1. shopClaims/{storeId} passe à « approved » → une POUSSÉE au gérant.
 *     La trace dans la cloche est déjà écrite par l'app de l'administrateur
 *     (fbApproveShopClaim → userNotifs) : ici on ne pousse que le téléphone,
 *     sans écrire une seconde ligne. Même chose pour un refus.
 *
 *  2. reports/{id} de type « rupture » sur un magasin qui a un gérant → une
 *     poussée ET une trace, parce que l'app n'écrit rien de son côté. Pas
 *     plus d'une alerte par magasin et par type toutes les SILENCE_H heures :
 *     un night shop qui vend vite n'a pas besoin de douze vibrations par
 *     soirée. Le gérant qui signale lui-même sa rupture n'est pas prévenu
 *     de sa propre action. Une confirmation « stock » par un client ne fait
 *     qu'une trace silencieuse : c'est une bonne nouvelle, pas une urgence.
 *
 *  3. AUCUN TEXTE ÉCRIT PAR UN CLIENT NE PART DANS UNE POUSSÉE. Le nom du
 *     magasin est lu dans stores/{id} (que son gérant protège désormais), le
 *     nom de la boisson dans catalog/{id} quand il y est, sinon on dit
 *     « une boisson de ton rayon » et la fiche fera le reste. C'est la même
 *     règle que notifyHuntNearby, pour la même raison : la poussée est le
 *     seul canal qui parle à voix haute sur un téléphone fermé.
 *
 * Firebase Functions v2, région europe-west1, Admin SDK modulaire.
 */
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = "europe-west1";
const APP_URL = "https://magonyos991-ux.github.io/magofeed/";
const SILENCE_H = 6;

/* Les gérants d'un magasin : ceux dont la fiche privée merchants/{uid} porte
   ce magasin — écrite par l'administrateur seul. Cinq au plus : un commerce
   n'a pas une armée de gérants, et un document mal formé ne doit pas faire
   partir cent poussées. */
async function gerantsDe(storeId) {
  try {
    const snap = await db.collection("merchants")
      .where("stores", "array-contains", String(storeId)).limit(5).get();
    return snap.docs.map((d) => d.id);
  } catch (e) {
    console.warn("alertes gérant : lecture merchants impossible :", e && e.message);
    return [];
  }
}

/* La poussée seule. Renvoie true si un téléphone a vraiment reçu quelque
   chose ; un jeton mort est effacé pour ne plus réessayer. */
async function pousser(uid, titre, corps, data, lien) {
  if (!uid) return false;
  try {
    const snap = await db.collection("pushTokens").doc(String(uid)).get();
    const token = snap.exists && snap.data().token;
    if (!token) return false;
    await getMessaging().send({
      token: token,
      notification: { title: titre, body: corps },
      data: data || {},
      webpush: {
        notification: { icon: "icons/icon-192.png", badge: "icons/icon-192.png" },
        fcmOptions: { link: lien || APP_URL }
      }
    });
    return true;
  } catch (e) {
    if (e && (e.code === "messaging/registration-token-not-registered" ||
              e.code === "messaging/invalid-registration-token")) {
      try { await db.collection("pushTokens").doc(String(uid)).delete(); } catch (_) {}
    } else {
      console.warn("alertes gérant : poussée :", e && e.message);
    }
    return false;
  }
}

/* La trace dans la cloche, à identifiant stable : une clé par magasin et par
   type, donc une ligne qui se met à jour au lieu d'une pile. `read` vaut
   true quand la poussée est partie (le téléphone l'a déjà montrée). */
async function tracer(uid, cle, titre, corps, data, lu) {
  try {
    await db.collection("userNotifs").doc(String(uid) + "__" + cle).set(Object.assign({
      to: String(uid), title: titre, body: corps, read: !!lu,
      createdAt: FieldValue.serverTimestamp()
    }, data || {}), { merge: true });
  } catch (e) { console.warn("alertes gérant : trace :", e && e.message); }
}

async function nomDuMagasin(storeId, repli) {
  try {
    const s = await db.collection("stores").doc(String(storeId)).get();
    const n = s.exists ? String((s.data() || {}).name || "").trim() : "";
    return (n || repli || "ta boutique").slice(0, 40);
  } catch (e) { return (repli || "ta boutique").slice(0, 40); }
}
async function nomDeLaBoisson(drinkId) {
  try {
    const f = await db.collection("catalog").doc(String(drinkId)).get();
    if (!f.exists) return null;
    const d = f.data() || {};
    const n = String((d.brand ? d.brand + " " : "") + (d.name || "")).trim();
    return n ? n.slice(0, 40) : null;
  } catch (e) { return null; }
}

/* 0. Une nouvelle demande réveille l'administrateur : jusqu'ici il ne la
      découvrait qu'en ouvrant l'Administration, et le gérant attendait. */
async function prevenirLesAdmins(storeId, nom) {
  let admins = [];
  try { admins = (await db.collection("admins").get()).docs.map((x) => x.id); } catch (e) { return; }
  const titre = "Nouvelle demande de commerçant";
  const corps = nom + " : un gérant demande sa certification. Ouvre l'Administration pour voir ses preuves.";
  const data = { type: "shopClaim", storeId: String(storeId) };
  for (const uid of admins) {
    const pousse = await pousser(uid, titre, corps, data, APP_URL + "#admin");
    await tracer(uid, "demande-" + storeId, titre, corps, data, pousse);
  }
}
exports.alerteNouvelleDemande = onDocumentCreated(
  { document: "shopClaims/{storeId}", region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const d = snap.data() || {};
    if (d.status !== "pending") return;
    await prevenirLesAdmins(event.params.storeId, await nomDuMagasin(event.params.storeId, d.storeName));
  }
);

/* 1. La certification — et le refus — arrivent sur le téléphone fermé. */
exports.alerteCertification = onDocumentUpdated(
  { document: "shopClaims/{storeId}", region: REGION },
  async (event) => {
    const before = (event.data && event.data.before.data()) || {};
    const after = (event.data && event.data.after.data()) || {};
    if (before.status === after.status) return;
    const by = after.by;
    if (!by) return;
    const storeId = event.params.storeId;
    const nom = await nomDuMagasin(storeId, after.storeName);
    /* Un redépôt après refus est une création qui ne dit pas son nom. */
    if (before.status === "rejected" && after.status === "pending") { await prevenirLesAdmins(storeId, nom); return; }
    if (after.status === "approved") {
      await pousser(by, "Ton magasin est certifié",
        nom + " porte maintenant la pastille bleue. Ouvre ta fiche : tableau de bord et vitrine t'attendent.",
        { type: "shopCertified", storeId: String(storeId) }, APP_URL + "#store=" + encodeURIComponent(storeId));
    } else if (after.status === "rejected") {
      await pousser(by, "Ta demande n'a pas été retenue",
        "Pour " + nom + ". Ouvre la cloche pour lire pourquoi, et redépose une demande si c'est une erreur.",
        { type: "shopRejected", storeId: String(storeId) }, APP_URL + "#store=" + encodeURIComponent(storeId));
    }
  }
);

/* 2. Un client parle du rayon d'un magasin tenu par son gérant. */
exports.alerteRayon = onDocumentCreated(
  { document: "reports/{reportId}", region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const r = snap.data() || {};
    if (r.type !== "rupture" && r.type !== "stock") return;
    if (r.storeId == null || r.drinkId == null) return;
    const storeId = String(r.storeId);
    const gerants = (await gerantsDe(storeId)).filter((uid) => uid !== String(r.by || ""));
    if (!gerants.length) return;

    const nomMagasin = await nomDuMagasin(storeId, null);
    const nomBoisson = await nomDeLaBoisson(r.drinkId);
    const quoi = nomBoisson ? "« " + nomBoisson + " »" : "une boisson de ton rayon";
    const cle = "rayon-" + storeId + "-" + r.type;
    const data = { type: r.type === "rupture" ? "ruptureChezToi" : "stockChezToi", storeId: storeId, drinkId: String(r.drinkId) };
    const lien = APP_URL + "#store=" + encodeURIComponent(storeId);

    for (const uid of gerants) {
      /* Le silence entre deux alertes du même type sur le même magasin. */
      let recente = false;
      try {
        const prev = await db.collection("userNotifs").doc(uid + "__" + cle).get();
        const t = prev.exists && prev.data().createdAt && prev.data().createdAt.toMillis ? prev.data().createdAt.toMillis() : 0;
        recente = t && (Date.now() - t) < SILENCE_H * 3600 * 1000;
      } catch (e) { recente = false; }
      if (recente) continue;

      if (r.type === "rupture") {
        const titre = "Un client signale une rupture chez toi";
        const corps = quoi + " serait épuisée à " + nomMagasin + ". Si c'est faux, remets-la en stock d'un ✓ sur ta fiche.";
        const pousse = await pousser(uid, titre, corps, data, lien);
        await tracer(uid, cle, titre, corps, data, pousse);
      } else {
        const titre = "Un client a vu une boisson dans ton rayon";
        const corps = quoi + " vient d'être confirmée à " + nomMagasin + ". Tes clients la voient comme sûre.";
        await tracer(uid, cle, titre, corps, data, false);
      }
    }
  }
);
