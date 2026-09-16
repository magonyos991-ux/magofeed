/* ============================================================================
   LA CHASSE, DE BOUT EN BOUT, A DEUX PERSONNES
   ----------------------------------------------------------------------------
   Alice cherche une boisson introuvable et lance une chasse. Bob, a quelques
   kilometres, doit la voir, la reperer en magasin, et Alice doit etre prevenue
   puis pouvoir remercier. C'est le parcours principal de l'application.

   CE FICHIER NE DEVINE RIEN : il recopie les ecritures de index.html a
   l'identique (memes collections, memes champs, meme ordre, memes valeurs) et
   les passe aux VRAIES regles du depot via l'emulateur.

   Fonctions rejouees (numeros de ligne dans index.html) :
     _coarse                4505
     window.fbJoinHunt      4534-4567
     window.fbLeaveHunt     4568-4577
     window.fbHuntSeekers   4579-4588
     window.fbLoadNearbyHunts 4589-4634
     window.fbAddReport     3316-3350
     window.fbCoupsDeMain   5102-5120
     window.fbDireMerci     5122-5126
     window.fbAideDiscrete  5131-5137
     window.fbNotifyUser    5507-5513
     window.fbLoadMyNotifs  5514-5525
     window.fbSyncWatch     4980-4998
     lancerChasse (l'appelant) 14317-14340
     _hrClamp / HR_MIN / HR_MAX 14155-14158

   Cote serveur (l'emulateur n'execute PAS les Cloud Functions : on rejoue leur
   decision, avec l'Admin SDK qui ignore les regles, exactement comme elles) :
     notifyHuntNearby       functions-a-deployer/notifications-push.js:153-206
     crediterEntraide       functions-a-deployer/points-et-parrainage.js:320-385
     noterCoupDeMain        functions-a-deployer/points-et-parrainage.js:404-425
     direMerci              functions-a-deployer/points-et-parrainage.js:437-460
     notifyStockToWatchers  functions-a-deployer/notifications-push.js:314-360
   ========================================================================== */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import {
  doc, setDoc, updateDoc, getDoc, getDocs, deleteDoc, addDoc,
  collection, query, where, orderBy, limit, serverTimestamp, arrayUnion, increment,
} from "firebase/firestore";

const env = await banc("chasse-bout-en-bout");

const ALICE = "alice", BOB = "bob", ADMIN = "admin1";
const alice = env.authenticatedContext(ALICE).firestore();
const bob = env.authenticatedContext(BOB).firestore();
const anon = env.unauthenticatedContext().firestore();
const admin = env.authenticatedContext(ADMIN).firestore();

/* Le serveur (Cloud Functions) parle par l'Admin SDK : il ignore les regles.
   C'est ce que reproduit withSecurityRulesDisabled — qui ne rend pas la valeur
   de son rappel, d'ou le report par fermeture. */
const serveur = async (fn) => {
  let out;
  await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); });
  return out;
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const verifier = (cond, quoi) => { if (!cond) throw new Error(quoi); };

/* ── Le decor : Bruxelles, un Delhaize, une boisson du catalogue ─────────── */
const BXL = { lat: 50.8676, lng: 4.3436 };
const BOISSON = 7, NOM = "Mountain Dew Spark";
const MAGASIN = { id: "st-delhaize-flagey", name: "Delhaize Flagey", lat: 50.8281, lng: 4.3720 };
const STORES = [MAGASIN];

/* ══ COPIES CONFORMES DE index.html ══════════════════════════════════════ */

/* index.html:4505 */
function _coarse(x) { return Math.round(x * 10) / 10; }

/* index.html:14185 — HR_MIN=1, HR_MAX=50 */
function _hrClamp(km) { km = Math.round(Number(km)); if (!(km >= 1)) km = 1; if (km > 50) km = 50; return km; }

/* index.html:4545-4593 — window.fbJoinHunt.
   Seul ajout : on renvoie la trace des chemins essayes. La fonction reelle ne
   renvoie rien et avale l'erreur finale (console.warn). */
async function fbJoinHunt(db, uid, drinkId, drinkName, emoji, lat, lng) {
  const trace = [];
  const pos = { lat: lat != null ? _coarse(lat) : null, lng: lng != null ? _coarse(lng) : null };
  const moi = { lat: pos.lat, lng: pos.lng, at: Date.now() };
  const ref = doc(db, "hunts", String(drinkId));
  const commun = {
    drinkName: String(drinkName || "").slice(0, 60),
    emoji: String(emoji || "").slice(0, 4), updatedAt: serverTimestamp(),
  };
  const maj = Object.assign({}, commun);
  maj["seekers." + uid] = moi;
  try {
    await updateDoc(ref, maj); trace.push("updateDoc direct OK"); return trace;
  } catch (e) {
    trace.push("updateDoc direct -> " + (e.code || e.message));
    try {
      const bouge = Object.assign({}, commun);
      bouge["seekers." + uid + ".lat"] = pos.lat;
      bouge["seekers." + uid + ".lng"] = pos.lng;
      await updateDoc(ref, bouge); trace.push("updateDoc imbrique OK"); return trace;
    } catch (e2) {
      trace.push("updateDoc imbrique -> " + (e2.code || e2.message));
      await setDoc(ref, Object.assign({
        drinkId: Number(drinkId) || drinkId,
        seekers: (function () { const o = {}; o[uid] = moi; return o; })(),
      }, commun));
      trace.push("setDoc creation OK"); return trace;
    }
  }
}

/* index.html:4595-4604 — window.fbLeaveHunt */
async function fbLeaveHunt(db, uid, drinkId) {
  const patch = {}; patch["seekers." + uid] = null;
  await updateDoc(doc(db, "hunts", String(drinkId)), patch);
}

/* index.html:4606-4615 — window.fbHuntSeekers */
async function fbHuntSeekers(db, uid, drinkId) {
  const s = await getDoc(doc(db, "hunts", String(drinkId)));
  if (!s.exists()) return 0;
  const seekers = s.data().seekers || {};
  let n = 0; const fresh = Date.now() - 30 * 86400000;
  Object.keys(seekers).forEach(function (u) {
    const x = seekers[u]; if (x && x.at && x.at >= fresh && u !== uid) n++;
  });
  return n;
}

/* index.html:4616-4661 — window.fbLoadNearbyHunts.
   Le cache de 20 s est celui de l'application (window._huntsCache) : un objet
   par « telephone », vide par fbJoinHunt/fbLeaveHunt comme dans le code. */
const caches = {};
async function fbLoadNearbyHunts(db, appareil, myUid, lat, lng, radiusKm) {
  const cache = caches[appareil];
  let snap;
  if (cache && (Date.now() - cache.at) < 20000) snap = cache.snap;
  else { snap = await getDocs(query(collection(db, "hunts"), limit(200))); caches[appareil] = { at: Date.now(), snap: snap }; }
  const out = [];
  const R = (Number(radiusKm) > 0) ? Number(radiusKm) : 100, fresh = Date.now() - 365 * 86400000;
  snap.forEach(function (d) {
    const h = d.data(); const seekers = h.seekers || {};
    let near = 0, mine = false, distKm = null, lastAt = null;
    Object.keys(seekers).forEach(function (uid) {
      const s = seekers[uid]; if (!s) return;
      if (s.at && s.at < fresh) return;
      if (lat != null && s.lat != null) {
        const dLa = (lat - s.lat) * 111, dLo = (lng - s.lng) * 111 * Math.cos(lat * Math.PI / 180);
        const dk = Math.sqrt(dLa * dLa + dLo * dLo);
        if (dk > R) return;
        if (distKm == null || dk < distKm) distKm = dk;
      }
      if (s.at && (lastAt == null || s.at > lastAt)) lastAt = s.at;
      near++; if (uid === myUid) mine = true;
    });
    if (near > 0) out.push({ drinkId: h.drinkId, drinkName: h.drinkName, emoji: h.emoji, seekers: near, mine: mine, distKm: distKm, lastAt: lastAt });
  });
  out.sort(function (a, b) { return b.seekers - a.seekers; });
  return out;
}

/* index.html:3316-3350 — window.fbAddReport. `uid` vaut null quand
   ensureAuthed() a echoue : le code ecrit alors `by: null`. */
async function fbAddReport(db, uid, storeId, drinkId, type, plus) {
  const st = STORES.find((x) => String(x.id) === String(storeId));
  const extra = {};
  if (st) {
    if (st.name) extra.storeName = String(st.name).slice(0, 60);
    if (typeof st.lat === "number" && typeof st.lng === "number") {
      extra.lat = Math.round(st.lat * 100) / 100;
      extra.lng = Math.round(st.lng * 100) / 100;
    }
  }
  extra.tz = "Europe/Brussels";
  return await addDoc(collection(db, "reports"), Object.assign({
    storeId: storeId, drinkId: drinkId, type: type, by: uid || null,
    byPseudo: "Explorateur", createdAt: serverTimestamp(),
  }, extra, (plus && plus.note != null) ? { note: String(plus.note).slice(0, 300) } : {}));
}

/* index.html:5129-5147 — window.fbCoupsDeMain */
async function fbCoupsDeMain(db, uid) {
  const q = query(collection(db, "coupsDeMain", uid, "recus"), orderBy("at", "desc"), limit(12));
  const snap = await getDocs(q);
  const out = [];
  snap.forEach(function (d) {
    const x = d.data() || {};
    out.push({
      id: d.id, aidantUid: x.aidantUid || null, aidantPseudo: x.aidantPseudo || null,
      drinkId: x.drinkId, storeId: x.storeId || "", at: x.at || 0, merci: x.merci === true,
    });
  });
  return out;
}

/* index.html:5149-5153 — window.fbDireMerci */
async function fbDireMerci(db, uid, id) {
  await updateDoc(doc(db, "coupsDeMain", uid, "recus", String(id)), { merci: true });
  return true;
}

/* index.html:5158-5164 — window.fbAideDiscrete */
async function fbAideDiscrete(db, uid, actif) {
  await setDoc(doc(db, "users", uid), { aideDiscrete: !!actif }, { merge: true });
}

/* index.html:5534-5540 — window.fbNotifyUser */
async function fbNotifyUser(db, uid, notif) {
  await addDoc(collection(db, "userNotifs"), Object.assign(
    { to: String(uid), read: false, createdAt: serverTimestamp() }, notif || {}));
}

/* index.html:5541-5552 — window.fbLoadMyNotifs */
async function fbLoadMyNotifs(db, uid) {
  const snap = await getDocs(query(collection(db, "userNotifs"), where("to", "==", uid), limit(20)));
  const rows = []; snap.forEach((d) => { const x = d.data(); x.docId = d.id; rows.push(x); });
  return rows;
}

/* index.html:5007-5025 — window.fbSyncWatch */
async function fbSyncWatch(db, uid, add, drinkId, drinkName, lat, lng, rayon) {
  const wid = uid + "_" + drinkId;
  if (add) {
    await setDoc(doc(db, "watches", wid), {
      uid: uid, drinkId: Number(drinkId), drinkName: String(drinkName || "").slice(0, 60),
      lat: lat != null ? lat : null, lng: lng != null ? lng : null,
      radius: Number(rayon) || 10, createdAt: serverTimestamp(),
    });
  } else { await deleteDoc(doc(db, "watches", wid)); }
}

/* ══ COPIES CONFORMES DU SERVEUR ═════════════════════════════════════════ */

/* notifications-push.js:157-163 — la porte d'entree de notifyHuntNearby.
   On lui donne l'etat AVANT et APRES une ecriture et elle dit ce que la
   fonction ferait. Si elle renvoie 0 nouveau chercheur, la fonction sort :
   AUCUNE notification ne part. */
function notifyHuntNearby(before, after) {
  if (!after || !after.seekers) return { envoi: false, pourquoi: "pas de seekers", nouveaux: [] };
  const bSeek = (before && before.seekers) || {}, aSeek = after.seekers || {};
  const newSeekers = Object.keys(aSeek).filter(function (u) { return aSeek[u] && !bSeek[u]; });
  if (!newSeekers.length) return { envoi: false, pourquoi: "aucun NOUVEAU chercheur (ligne 160)", nouveaux: [] };
  let center = null;
  newSeekers.forEach(function (u) { const s = aSeek[u]; if (s && s.lat != null && (!center || s.at > center.at)) center = s; });
  if (!center) return { envoi: false, pourquoi: "pas de centre : chasse sans position (ligne 173)", nouveaux: newSeekers };
  return { envoi: true, pourquoi: "vague envoyee", nouveaux: newSeekers, centre: center };
}

/* notifications-push.js:346 — le rayon retenu pour CHAQUE destinataire
   d'une alerte « trouvee pres de toi ». */
function rayonRetenuParLeServeur(wd) {
  return (typeof wd.radius === "number" && wd.radius >= 1 && wd.radius <= 20) ? wd.radius : 10;
}

/* notifications-push.js:314-332 — la porte d'entree de notifyStockToWatchers.
   C'est ELLE qui envoie « Trouvee pres de toi » a celui qui chasse. Elle ne
   regarde qu'une chose : le tableau `drinks` du magasin a-t-il gagne un
   identifiant ? */
function notifyStockToWatchers(before, after) {
  const bd = new Set(((before && before.drinks) || []).map(String));
  const added = ((after && after.drinks) || []).map(String).filter((x) => !bd.has(x));
  if (added.length > 3) return { envoi: false, pourquoi: "plus de 3 boissons d'un coup (ligne 330)" };
  if (!added.length) return { envoi: false, pourquoi: "le tableau `drinks` du magasin n'a pas bouge (ligne 332)" };
  return { envoi: true, ajoutees: added, pourquoi: "alerte envoyee aux veilleurs" };
}

/* index.html:3889-3907 — window.fbAddDrinkToStore (« Ou l'as-tu trouvee ? ») */
async function fbAddDrinkToStore(db, storeId, drinkId, vu) {
  const updates = { drinks: arrayUnion(Number(drinkId) || drinkId) };
  if (vu !== false) {
    const heure = Math.floor(Date.now() / 3600000) * 3600000;
    updates["confirmations." + drinkId] = increment(1);
    updates["seenAt." + drinkId] = heure;
    updates["confirmedBy." + drinkId] = "Explorateur";
    updates["confirmedAt." + drinkId] = heure;
  }
  await updateDoc(doc(db, "stores", String(storeId)), updates);
}

/* index.html:2311-2336 — window.fbConfirmStock (« Oui, je l'ai vue » sur la
   fiche d'un magasin qui liste deja la boisson). */
async function fbConfirmStock(db, storeId, drinkId, value) {
  const updates = {};
  updates["confirmations." + drinkId] = increment(value);
  const heure = Math.floor(Date.now() / 3600000) * 3600000;
  if (value > 0) {
    updates["seenAt." + drinkId] = heure;
    updates["confirmedBy." + drinkId] = "Explorateur";
    updates["confirmedAt." + drinkId] = heure;
  } else {
    updates["absentBy." + drinkId] = "Explorateur";
    updates["absentAt." + drinkId] = heure;
  }
  await updateDoc(doc(db, "stores", String(storeId)), updates);
}

/* points-et-parrainage.js:320-385 — crediterEntraide, reduit a ce qu'il ECRIT
   dans la base, plus la raison de sortie (que l'application ne montre nulle
   part). Les constantes sont celles du fichier. */
const CHERCHEUR_AGE_MIN_J = 2, ENTRAIDE_FENETRE_J = 14, DIST_MAX_M = 500;
function surPlace(rep) { const m = /\|(\d+)$/.exec(String(rep.note || "")); const d = m ? Number(m[1]) : null; return d != null && d <= DIST_MAX_M; }
async function crediterEntraide(db, repId) {
  const repRef = doc(db, "reports", repId);
  const rep = (await getDoc(repRef)).data() || {};
  if (rep.type !== "stock" || !rep.by || !rep.storeId || rep.drinkId == null) return { sortie: "champs manquants" };
  const creeA = rep.createdAt ? rep.createdAt.toMillis() : Date.now();
  const hs = await getDoc(doc(db, "hunts", String(rep.drinkId)));
  const seekers = hs.exists() ? ((hs.data() || {}).seekers || {}) : {};
  const autres = Object.keys(seekers).filter((u) => seekers[u] && u !== rep.by && typeof seekers[u].at === "number" && seekers[u].at < creeA);
  if (autres.length) await setDoc(repRef, { hunt: true }, { merge: true });
  const moi = seekers[rep.by];
  if (!moi || typeof moi.at !== "number") return { sortie: "l'auteur du rapport n'est pas chercheur", hunt: autres.length > 0 };
  const u = await getDoc(doc(db, "users", rep.by));
  const cree = (u.exists() && u.data().createdAt && u.data().createdAt.toMillis) ? u.data().createdAt.toMillis() : 0;
  if (cree && Date.now() - cree < CHERCHEUR_AGE_MIN_J * 86400000) {
    return { sortie: "compte du chercheur trop neuf (< " + CHERCHEUR_AGE_MIN_J + " jours)", hunt: autres.length > 0 };
  }
  const depuis = creeA - ENTRAIDE_FENETRE_J * 86400000;
  const q = await getDocs(query(collection(db, "reports"), where("storeId", "==", rep.storeId), limit(60)));
  const aides = q.docs.map((d) => Object.assign({ id: d.id }, d.data()))
    .filter((o) => o.type === "stock" && o.hunt === true && o.by !== rep.by
      && String(o.drinkId) === String(rep.drinkId) && !o.huntCredited
      && o.createdAt && o.createdAt.toMillis() >= depuis
      && o.createdAt.toMillis() < creeA && moi.at < o.createdAt.toMillis())
    .sort((x, y) => x.createdAt.toMillis() - y.createdAt.toMillis());
  if (!aides.length) return { sortie: "aucune aide a crediter", hunt: autres.length > 0 };
  const aide = aides[0];
  const pts = surPlace(rep) ? 15 : 5;
  await setDoc(doc(db, "reports", aide.id), { huntCredited: true, huntCreditedBy: rep.by, huntCreditedPts: pts }, { merge: true });
  const coup = await noterCoupDeMain(db, rep.by, aide);
  return { sortie: "credite", pts: pts, aide: aide.id, coup: coup };
}

/* points-et-parrainage.js:404-425 — noterCoupDeMain */
async function noterCoupDeMain(db, uidChercheur, aide) {
  let pseudo = null;
  const ua = await getDoc(doc(db, "users", aide.by));
  const da = ua.exists() ? (ua.data() || {}) : {};
  if (da.aideDiscrete !== true && typeof da.pseudo === "string") {
    pseudo = da.pseudo.slice(0, 24);
    if (pseudo === "Explorateur") pseudo = null;
  }
  const quand = aide.createdAt && aide.createdAt.toMillis
    ? Math.floor(aide.createdAt.toMillis() / 3600000) * 3600000
    : Math.floor(Date.now() / 3600000) * 3600000;
  await setDoc(doc(db, "coupsDeMain", uidChercheur, "recus", aide.id), {
    aidantUid: pseudo ? String(aide.by) : null,
    aidantPseudo: pseudo,
    drinkId: Number(aide.drinkId),
    storeId: String(aide.storeId || ""),
    at: quand, merci: false,
  }, { merge: true });
  return { id: aide.id, aidantUid: pseudo ? String(aide.by) : null, aidantPseudo: pseudo };
}

/* points-et-parrainage.js:437-460 — direMerci : ce que le serveur fait quand
   `merci` passe de false a true. */
function direMerci(avant, apres) {
  if (avant.merci === true || apres.merci !== true) return { envoi: false, pourquoi: "pas une bascule false->true" };
  if (!apres.aidantUid) return { envoi: false, pourquoi: "aidantUid absent (ligne 446) : rien n'est envoye" };
  return { envoi: true, pourquoi: "poussee vers " + apres.aidantUid };
}

/* ════════════════════════════════════════════════════════════════════════ */
/* 0. LE DECOR                                                              */
/* ════════════════════════════════════════════════════════════════════════ */
await serveur(async (db) => { await setDoc(doc(db, "admins", ADMIN), { ok: true }); });

/* index.html:1699-1703 — le profil cree a la premiere connexion. */
await doit("Alice et Bob ont chacun leur profil (index.html:1699)", async () => {
  await setDoc(doc(alice, "users", ALICE), { pseudo: "Explorateur", signals: 0, confirms: 0, createdAt: serverTimestamp() }, { merge: true });
  await setDoc(doc(bob, "users", BOB), { pseudo: "Explorateur", signals: 0, confirms: 0, createdAt: serverTimestamp() }, { merge: true });
});

/* ════════════════════════════════════════════════════════════════════════ */
/* 1. ALICE LANCE UNE CHASSE                                                */
/* ════════════════════════════════════════════════════════════════════════ */

/* 1a. Le cas reel decrit par lancerChasse (index.html:14344-14367) : le GPS
   n'a pas encore repondu, la chasse part SANS position, puis l'app la
   repositionne dans le rappel de refreshLocation. */
let etat0 = null, etat1 = null, etat2 = null, traceA = [], traceB = [];
await doit("Alice lance la chasse sans GPS (index.html:14368), puis l'app la repositionne (14329)", async () => {
  traceA = await fbJoinHunt(alice, ALICE, BOISSON, NOM, "", null, null);
  etat1 = (await getDoc(doc(anon, "hunts", String(BOISSON)))).data();
  await pause(30);
  traceB = await fbJoinHunt(alice, ALICE, BOISSON, NOM, "", BXL.lat, BXL.lng);
  etat2 = (await getDoc(doc(anon, "hunts", String(BOISSON)))).data();
  verifier(etat2 && etat2.seekers && etat2.seekers[ALICE], "Alice n'est pas inscrite dans seekers");
});
note("1er appel (sans GPS)  : " + traceA.join(" | "));
note("2e appel (avec GPS)   : " + traceB.join(" | "));
note("position d'Alice ecrite : lat=" + etat2.seekers[ALICE].lat + " lng=" + etat2.seekers[ALICE].lng
  + "  (brute : " + BXL.lat + ", " + BXL.lng + ")");

await doit("la position partagee est arrondie a 1 decimale (~11 km), comme promis (index.html:4500-4505)", async () => {
  const s = etat2.seekers[ALICE];
  verifier(s.lat === _coarse(BXL.lat) && s.lng === _coarse(BXL.lng), "position non arrondie : " + JSON.stringify(s));
  verifier(String(s.lat).replace(/^-?\d+\.?/, "").length <= 1, "plus d'une decimale");
});

/* Ce que le serveur fait des deux ecritures. */
const push1 = notifyHuntNearby(null, etat1);
const push2 = notifyHuntNearby(etat1, etat2);
note("notifyHuntNearby sur l'ecriture 1 : " + (push1.envoi ? "VAGUE" : "RIEN") + " — " + push1.pourquoi);
note("notifyHuntNearby sur l'ecriture 2 : " + (push2.envoi ? "VAGUE" : "RIEN") + " — " + push2.pourquoi);

await doit("le repositionnement GPS declenche bien la vague de notifications (le commentaire index.html:14345-14353 le promet)", async () => {
  verifier(push1.envoi || push2.envoi,
    "AUCUNE des deux ecritures n'envoie de notification. 1re : " + push1.pourquoi + " / 2e : " + push2.pourquoi);
});

/* 1b. Le cas ou le GPS est deja pret : la chasse se cree du premier coup. */
let traceC = [];
await doit("une chasse lancee avec le GPS deja pret previent bien les gens autour", async () => {
  traceC = await fbJoinHunt(alice, ALICE, 42, "Ramune Original", "", BXL.lat, BXL.lng);
  const d = (await getDoc(doc(anon, "hunts", "42"))).data();
  const p = notifyHuntNearby(null, d);
  verifier(p.envoi, "aucune vague : " + p.pourquoi);
});
note("creation avec GPS pret : " + traceC.join(" | "));
note("=> une chasse se cree en " + traceC.length + " aller-retour(s) Firestore : les "
  + (traceC.length - 1) + " premiers sont REFUSES par les regles, c'est le repli prevu.");

/* 1c. Deux personnes sur la meme chasse. */
await doit("Bob rejoint la MEME chasse sans effacer Alice", async () => {
  const t = await fbJoinHunt(bob, BOB, 42, "Ramune Original", "", 50.8946, 4.3436);
  const d = (await getDoc(doc(anon, "hunts", "42"))).data();
  verifier(d.seekers[ALICE] && d.seekers[BOB], "un des deux chercheurs a disparu : " + JSON.stringify(d.seekers) + " (trace " + t.join(" | ") + ")");
  verifier(await fbHuntSeekers(anon, ALICE, 42) === 1, "fbHuntSeekers ne compte pas l'autre chercheur");
});
await doit("Alice se repositionne : sa date d'inscription `at` ne bouge pas (regles 1078-1085)", async () => {
  const avant = (await getDoc(doc(anon, "hunts", "42"))).data().seekers[ALICE].at;
  await pause(30);
  const t = await fbJoinHunt(alice, ALICE, 42, "Ramune Original", "", 50.9100, 4.4000);
  const apres = (await getDoc(doc(anon, "hunts", "42"))).data().seekers[ALICE];
  verifier(apres.at === avant, "la date d'inscription a bouge (" + avant + " -> " + apres.at + "), trace " + t.join(" | "));
  verifier(apres.lat === _coarse(50.9100), "la position ne s'est pas mise a jour : " + JSON.stringify(apres));
});
/* On remet Alice et Bob la ou l'histoire les attend. */
await fbLeaveHunt(bob, BOB, 42);
await fbLeaveHunt(alice, ALICE, 42);
delete caches.alice; delete caches.bob;

/* ════════════════════════════════════════════════════════════════════════ */
/* 2. BOB DOIT VOIR LA CHASSE                                               */
/* ════════════════════════════════════════════════════════════════════════ */
await doit("Bob, a 3 km, voit la chasse d'Alice avec le rayon par defaut (10 km)", async () => {
  delete caches.bob;
  const l = await fbLoadNearbyHunts(bob, "bob", BOB, 50.8946, 4.3436, _hrClamp(10));
  const h = l.find((x) => String(x.drinkId) === String(BOISSON));
  verifier(h, "la chasse d'Alice n'apparait pas : " + JSON.stringify(l));
  verifier(h.drinkName === NOM, "mauvais nom de boisson : " + h.drinkName);
  verifier(h.seekers === 1, "mauvais nombre de chercheurs : " + h.seekers);
});

/* Le rayon annonce a l'utilisateur (index.html:14186-14192) contre ce que la
   requete fait vraiment. On mesure, on ne suppose pas. */
const postes = [
  ["au meme endroit qu'Alice (0 km)", BXL.lat, BXL.lng],
  ["a 3 km", 50.8946, BXL.lng],
  ["a 30 km", 51.1379, BXL.lng],
  ["a 300 km", 53.5711, BXL.lng],
];
const rayons = [1, 3, 5, 10, 25, 50];
for (const [libelle, la, ln] of postes) {
  const vus = [];
  let mesure = null;
  for (const r of rayons) {
    delete caches.bob;
    const l = await fbLoadNearbyHunts(bob, "bob", BOB, la, ln, _hrClamp(r));
    const h = l.find((x) => String(x.drinkId) === String(BOISSON));
    if (h) { vus.push(r); if (mesure == null) mesure = h.distKm; }
  }
  const dLa = (la - etat2.seekers[ALICE].lat) * 111;
  const dLo = (ln - etat2.seekers[ALICE].lng) * 111 * Math.cos(la * Math.PI / 180);
  note("Bob " + libelle + " : distance CALCULEE par l'app = " + Math.sqrt(dLa * dLa + dLo * dLo).toFixed(2)
    + " km ; voit la chasse avec un rayon de [" + (vus.length ? vus.join(", ") : "aucun") + "] km");
}

await doit("Bob au MEME endroit qu'Alice la voit avec « Ton quartier et ceux d'a cote » (3 km, index.html:14188)", async () => {
  delete caches.bob;
  const l = await fbLoadNearbyHunts(bob, "bob", BOB, BXL.lat, BXL.lng, _hrClamp(3));
  verifier(l.find((x) => String(x.drinkId) === String(BOISSON)),
    "Bob est au pied d'Alice et ne voit rien : l'arrondi de position (~11 km) n'est pas compense dans le filtre de distance");
});
await doit("Bob a 30 km ne voit PAS la chasse avec un rayon de 10 km", async () => {
  delete caches.bob;
  const l = await fbLoadNearbyHunts(bob, "bob", BOB, 51.1379, BXL.lng, _hrClamp(10));
  verifier(!l.find((x) => String(x.drinkId) === String(BOISSON)), "chasse visible a 30 km avec un rayon de 10 km");
});
await doit("Bob a 300 km ne voit PAS la chasse, meme avec le rayon maximum (50 km)", async () => {
  delete caches.bob;
  const l = await fbLoadNearbyHunts(bob, "bob", BOB, 53.5711, BXL.lng, _hrClamp(50));
  verifier(!l.find((x) => String(x.drinkId) === String(BOISSON)), "chasse visible a 300 km");
});

/* Le cache de 20 s (index.html:4619-4629). */
await doit("le cache de 20 s : Bob ouvre l'onglet, Alice lance une chasse, Bob reouvre", async () => {
  delete caches.bob;
  await fbLoadNearbyHunts(bob, "bob", BOB, BXL.lat, BXL.lng, 50);       // Bob regarde
  await fbJoinHunt(alice, ALICE, 77, "Fanta Shokata", "", BXL.lat, BXL.lng); // Alice lance
  const l = await fbLoadNearbyHunts(bob, "bob", BOB, BXL.lat, BXL.lng, 50); // Bob regarde a nouveau
  verifier(l.find((x) => String(x.drinkId) === "77"),
    "la nouvelle chasse d'Alice n'apparait pas chez Bob : son cache local (20 s) ne se vide que sur SES propres ecritures");
});
await fbLeaveHunt(alice, ALICE, 77);
delete caches.bob;

/* Ce que n'importe qui peut lire. */
await doit("un visiteur NON CONNECTE lit la collection des chasses (regles 1086 : allow read: if true)", async () => {
  const s = await getDocs(query(collection(anon, "hunts"), limit(200)));
  verifier(s.docs.length > 0, "rien de lisible");
  const d = s.docs.find((x) => x.id === String(BOISSON)).data();
  note("lisible sans compte : " + JSON.stringify({ drinkId: d.drinkId, drinkName: d.drinkName, seekers: d.seekers }));
});

/* ════════════════════════════════════════════════════════════════════════ */
/* 3. BOB DONNE UN COUP DE MAIN                                             */
/* ════════════════════════════════════════════════════════════════════════ */
let repBob = null;
await doit("Bob signale « je l'ai vue en rayon » (confirmWithPrice, index.html:6769 -> fbAddReport)", async () => {
  repBob = await fbAddReport(bob, BOB, MAGASIN.id, BOISSON, "stock", { note: "fiche|120" });
});
await doitEchouer("Bob SANS COMPTE ne peut pas signaler (ensureAuthed a echoue, `by` vaut null)", async () => {
  await fbAddReport(anon, null, MAGASIN.id, BOISSON, "stock", { note: "fiche|120" });
});
note("index.html:3348 — fbAddReport avale l'echec (`console.warn`) : l'ecran ne dit rien a Bob.");
await doitEchouer("Bob ne peut pas signer un signalement du nom d'Alice (regles 993)", async () => {
  await fbAddReport(bob, ALICE, MAGASIN.id, BOISSON, "stock", { note: "fiche|120" });
});

/* L'autre moitie de l'aide : la boisson entre dans le magasin, ce qui declenche
   notifyStockToWatchers pour les gens qui la guettaient. */
await doit("Alice a bien une veille (fbSyncWatch, index.html:5007) avec SON rayon", async () => {
  await fbSyncWatch(alice, ALICE, true, BOISSON, NOM, BXL.lat, BXL.lng, 30);
  const w = (await getDoc(doc(alice, "watches", ALICE + "_" + BOISSON))).data();
  verifier(w.radius === 30, "le rayon choisi n'est pas ecrit : " + JSON.stringify(w));
});
await doit("le serveur honore le rayon qu'Alice a choisi dans « Ta zone » (jusqu'a 50 km, index.html:14179)", async () => {
  const w = (await getDoc(doc(alice, "watches", ALICE + "_" + BOISSON))).data();
  const retenu = rayonRetenuParLeServeur(w);
  verifier(retenu === w.radius,
    "Alice a choisi " + w.radius + " km, notifications-push.js:346 en retient " + retenu + " km");
});
note("la veille ecrit la position BRUTE d'Alice (lat=" + (await getDoc(doc(alice, "watches", ALICE + "_" + BOISSON))).data().lat
  + ") — c'est un document prive (regles 1019), contrairement a hunts.");

/* ── 3bis. CE QUI DECLENCHE VRAIMENT « TROUVEE PRES DE TOI » ──────────────
   Deux gestes differents dans l'application, un seul previent Alice. */
await doit("le magasin existe", async () => {
  await setDoc(doc(bob, "stores", MAGASIN.id), {
    name: MAGASIN.name, lat: MAGASIN.lat, lng: MAGASIN.lng, drinks: [], confirmations: {},
  });
});
await doit("CAS A — Bob rattache la boisson au magasin (« Ou l'as-tu trouvee ? », index.html:17496) : Alice est prevenue", async () => {
  const avant = (await getDoc(doc(anon, "stores", MAGASIN.id))).data();
  await fbAddDrinkToStore(bob, MAGASIN.id, BOISSON, true);
  const apres = (await getDoc(doc(anon, "stores", MAGASIN.id))).data();
  const r = notifyStockToWatchers(avant, apres);
  verifier(r.envoi, r.pourquoi);
});
await doit("CAS B — Bob confirme le stock d'une boisson DEJA listee (« Oui, je l'ai vue » : confirmWithPrice, index.html:6746-6772) : Alice est prevenue", async () => {
  /* On remet le magasin dans l'etat qui a fait naitre la chasse : la boisson
     est listee, mais plus personne ne l'a confirmee (magasinProcheAvec,
     index.html:14805, exige confirmations > 0 — c'est pour ca qu'Alice a pu
     lancer une chasse malgre la fiche existante). */
  await fbConfirmStock(bob, MAGASIN.id, BOISSON, -1);
  const avant = (await getDoc(doc(anon, "stores", MAGASIN.id))).data();
  verifier(Number((avant.confirmations || {})[BOISSON]) <= 0, "le decor n'est pas bon : " + JSON.stringify(avant.confirmations));
  verifier((avant.drinks || []).map(String).includes(String(BOISSON)), "la boisson devrait deja etre listee");
  await fbConfirmStock(bob, MAGASIN.id, BOISSON, 1);
  const apres = (await getDoc(doc(anon, "stores", MAGASIN.id))).data();
  verifier(Number((apres.confirmations || {})[BOISSON]) > 0, "la confirmation n'a pas ete enregistree");
  const r = notifyStockToWatchers(avant, apres);
  verifier(r.envoi, r.pourquoi + " — Bob a bien confirme (confirmations passe de "
    + Number((avant.confirmations || {})[BOISSON]) + " a " + Number((apres.confirmations || {})[BOISSON])
    + "), mais aucune alerte ne part vers Alice");
});

/* ════════════════════════════════════════════════════════════════════════ */
/* 4. ALICE DOIT ETRE PREVENUE                                              */
/* ════════════════════════════════════════════════════════════════════════ */
let verdict1 = null;
await doit("le serveur reconnait que le signalement de Bob repond a la chasse d'Alice (hunt:true)", async () => {
  verdict1 = await serveur((db) => crediterEntraide(db, repBob.id));
  const r = (await getDoc(doc(admin, "reports", repBob.id))).data();
  verifier(r.hunt === true, "le rapport n'est pas marque hunt:true : " + JSON.stringify(verdict1));
});

/* Alice passe au magasin et confirme a son tour : c'est ce geste qui declenche
   le credit de Bob et le depot du coup de main. */
await pause(60);
let repAlice = null, verdict2 = null;
await doit("Alice confirme a son tour, et Bob recoit son coup de main", async () => {
  repAlice = await fbAddReport(alice, ALICE, MAGASIN.id, BOISSON, "stock", { note: "fiche|80" });
  verdict2 = await serveur((db) => crediterEntraide(db, repAlice.id));
  verifier(verdict2.sortie === "credite", "le serveur n'a rien credite. Raison : " + verdict2.sortie);
});
note("verdict du serveur sur la confirmation d'Alice : " + JSON.stringify(verdict2));

/* On recommence avec deux comptes qui ne sont plus « du jour », pour voir la
   suite du parcours meme si le garde-fou anti-collusion l'a coupee. */
await serveur(async (db) => {
  const vieux = new Date(Date.now() - 30 * 86400000);
  await setDoc(doc(db, "users", ALICE), { createdAt: vieux }, { merge: true });
  await setDoc(doc(db, "users", BOB), { createdAt: vieux }, { merge: true });
  await setDoc(doc(db, "reports", repBob.id), { huntCredited: false }, { merge: true });
});
let verdict3 = null;
await doit("avec des comptes de plus de 2 jours, le coup de main arrive chez Alice", async () => {
  await pause(40);
  const rep2 = await fbAddReport(alice, ALICE, MAGASIN.id, BOISSON, "stock", { note: "fiche|80" });
  verdict3 = await serveur((db) => crediterEntraide(db, rep2.id));
  verifier(verdict3.sortie === "credite", "toujours rien : " + verdict3.sortie);
});

let recus = [];
await doit("Alice lit son coup de main, et il designe la BONNE boisson et le BON magasin", async () => {
  recus = await fbCoupsDeMain(alice, ALICE);
  verifier(recus.length === 1, "Alice a " + recus.length + " coup(s) de main, attendu 1");
  verifier(Number(recus[0].drinkId) === BOISSON, "mauvaise boisson : " + recus[0].drinkId);
  verifier(String(recus[0].storeId) === MAGASIN.id, "mauvais magasin : " + recus[0].storeId);
});
note("le coup de main recu par Alice : " + JSON.stringify(recus[0] || null));
await doitEchouer("Bob ne peut pas lire les coups de main d'Alice (regles 294)", async () => {
  await getDocs(query(collection(bob, "coupsDeMain", ALICE, "recus"), orderBy("at", "desc"), limit(12)));
});

await doit("le coup de main dit QUI a aide (index.html:21740 affiche « X t'a donne un coup de main »)", async () => {
  verifier(recus[0] && recus[0].aidantPseudo,
    "aidantPseudo est " + JSON.stringify(recus[0] && recus[0].aidantPseudo)
    + " : Bob n'a jamais change son pseudo, le serveur (points-et-parrainage.js:411) l'efface et l'ecran affichera « Quelqu'un »");
});

/* La boite de notifications in-app. */
await doit("Alice trouve une trace de la chasse dans sa boite in-app (fbLoadMyNotifs, index.html:5541)", async () => {
  const rows = await fbLoadMyNotifs(alice, ALICE);
  verifier(rows.length > 0,
    "0 notification : AUCUN chemin du code n'ecrit de userNotifs pour une chasse (les seuls appels a fbNotifyUser sont index.html:2452, 4207, 4226, 5570 — tous des gestes d'administrateur). Si le push telephone ne part pas, il ne reste rien dans l'app.");
});
await doitEchouer("Bob ne peut pas ecrire directement une notification a Alice (regles 309)", async () => {
  await fbNotifyUser(bob, ALICE, { type: "hunt", title: "coucou", body: "je l'ai vue" });
});

/* ════════════════════════════════════════════════════════════════════════ */
/* 5. ALICE REMERCIE, BOB DOIT LE VOIR                                      */
/* ════════════════════════════════════════════════════════════════════════ */
const avantMerci = recus[0] ? Object.assign({}, recus[0]) : null;
await doit("Alice dit merci (index.html:5149 fbDireMerci)", async () => {
  await fbDireMerci(alice, ALICE, recus[0].id);
  const r = await fbCoupsDeMain(alice, ALICE);
  verifier(r[0].merci === true, "le merci n'est pas enregistre");
});
await doitEchouer("Alice ne peut pas « de-remercier » (regles 302-304)", async () => {
  await updateDoc(doc(alice, "coupsDeMain", ALICE, "recus", recus[0].id), { merci: false });
});
await doitEchouer("Alice ne peut pas faire sonner Bob en boucle (re-remercier)", async () => {
  await fbDireMerci(alice, ALICE, recus[0].id);
});
await doitEchouer("Bob ne peut pas ecrire dans les coups de main d'Alice", async () => {
  await updateDoc(doc(bob, "coupsDeMain", ALICE, "recus", recus[0].id), { merci: true });
});

const envoiMerci = direMerci(avantMerci || {}, Object.assign({}, avantMerci, { merci: true }));
note("direMerci cote serveur : " + (envoiMerci.envoi ? "ENVOI" : "RIEN") + " — " + envoiMerci.pourquoi);
await doit("Bob apprend qu'on le remercie (points-et-parrainage.js:437)", async () => {
  verifier(envoiMerci.envoi, envoiMerci.pourquoi);
});
await doit("Bob garde une trace du merci dans la base (autre que la poussee, qu'il peut avoir refusee)", async () => {
  const cdm = await getDocs(query(collection(bob, "coupsDeMain", BOB, "recus"), orderBy("at", "desc"), limit(12)));
  const nt = await fbLoadMyNotifs(bob, BOB);
  verifier(cdm.docs.length + nt.length > 0,
    "aucun document ne dit a Bob qu'on l'a remercie : la gratitude ne voyage QUE par notification telephone (FCM), qui ne laisse rien derriere elle");
});

/* Le meme parcours avec un aidant qui a choisi un pseudo. */
await doit("avec un pseudo choisi, le merci part vraiment vers l'aidant", async () => {
  await setDoc(doc(bob, "users", BOB), { pseudo: "Bob" }, { merge: true });
  const coup = await serveur((db) => noterCoupDeMain(db, ALICE, {
    id: "aide-pseudo", by: BOB, drinkId: BOISSON, storeId: MAGASIN.id, createdAt: { toMillis: () => Date.now() },
  }));
  verifier(coup.aidantUid === BOB, "aidantUid toujours absent : " + JSON.stringify(coup));
  const e = direMerci({ merci: false, aidantUid: coup.aidantUid }, { merci: true, aidantUid: coup.aidantUid });
  verifier(e.envoi, e.pourquoi);
});
await doit("« aider en discret » (index.html:5158) efface bien le nom cote serveur", async () => {
  await fbAideDiscrete(bob, BOB, true);
  const coup = await serveur((db) => noterCoupDeMain(db, ALICE, {
    id: "aide-discrete", by: BOB, drinkId: BOISSON, storeId: MAGASIN.id, createdAt: { toMillis: () => Date.now() },
  }));
  verifier(coup.aidantPseudo === null && coup.aidantUid === null, "le nom passe quand meme : " + JSON.stringify(coup));
});
await fbAideDiscrete(bob, BOB, false);

/* ════════════════════════════════════════════════════════════════════════ */
/* 6. LA CHASSE DOIT POUVOIR SE TERMINER                                    */
/* ════════════════════════════════════════════════════════════════════════ */
await doit("une fois la boisson trouvee et confirmee, la chasse cesse d'annoncer « on la cherche »", async () => {
  delete caches.bob;
  const l = await fbLoadNearbyHunts(bob, "bob", BOB, 50.8946, 4.3436, 50);
  const h = l.find((x) => String(x.drinkId) === String(BOISSON));
  verifier(!h,
    "la chasse annonce encore « " + (h && h.seekers) + " personne cherche » alors que Bob ET Alice l'ont confirmee en magasin :"
    + " aucun chemin du code ne retire le chercheur quand sa veille se declenche (index.html:15073-15090 pose w.triggered mais n'appelle jamais fbLeaveHunt)");
});
await doit("Alice retire sa veille : fbLeaveHunt la sort de la liste de Bob (index.html:14312)", async () => {
  await fbLeaveHunt(alice, ALICE, BOISSON);
  delete caches.bob;
  const l = await fbLoadNearbyHunts(bob, "bob", BOB, 50.8946, 4.3436, 50);
  verifier(!l.find((x) => String(x.drinkId) === String(BOISSON)), "la chasse est encore visible apres fbLeaveHunt");
});
await doit("le document reste, avec l'uid d'Alice a null : rien ne l'efface jamais (regles 1097 : delete admin)", async () => {
  const d = (await getDoc(doc(anon, "hunts", String(BOISSON)))).data();
  verifier(ALICE in d.seekers && d.seekers[ALICE] === null, "etat inattendu : " + JSON.stringify(d.seekers));
});

/* ════════════════════════════════════════════════════════════════════════ */
/* 7. CE QUE LES AUTRES NE DOIVENT PAS POUVOIR FAIRE                        */
/* ════════════════════════════════════════════════════════════════════════ */
await fbJoinHunt(alice, ALICE, 42, "Ramune Original", "", BXL.lat, BXL.lng);

await doitEchouer("un visiteur NON CONNECTE ne rejoint pas une chasse", async () => {
  await fbJoinHunt(anon, "intrus", 42, "Ramune Original", "", BXL.lat, BXL.lng);
});
await doitEchouer("Bob ne retire pas Alice de sa chasse (regles 1092)", async () => {
  const p = {}; p["seekers." + ALICE] = null;
  await updateDoc(doc(bob, "hunts", "42"), p);
});
await doitEchouer("Bob n'efface pas la chasse d'Alice (regles 1097)", async () => {
  await deleteDoc(doc(bob, "hunts", "42"));
});
await doitEchouer("Bob n'ecrase pas la chasse entiere avec un setDoc", async () => {
  await setDoc(doc(bob, "hunts", "42"), { drinkId: 42, drinkName: "Ramune", seekers: { [BOB]: { at: Date.now(), lat: 50.9, lng: 4.3 } } });
});
await doitEchouer("personne ne touche au verrou anti-spam _lastPush (regles 1094)", async () => {
  await updateDoc(doc(bob, "hunts", "42"), { _lastPush: Date.now() + 10 * 86400000 });
});
await doitEchouer("Bob ne renomme pas la chasse d'Alice", async () => {
  await updateDoc(doc(bob, "hunts", "42"), { drinkName: "PIRATE — appelle le 0900" });
});
await doitEchouer("Bob ne fait pas pointer la chasse d'Alice sur une autre boisson", async () => {
  await updateDoc(doc(bob, "hunts", "42"), { drinkId: 999 });
});
{
  const d = (await getDoc(doc(anon, "hunts", "42"))).data();
  note("hunts/42 apres les tentatives de Bob : drinkName=" + JSON.stringify(d.drinkName) + " drinkId=" + JSON.stringify(d.drinkId)
    + " — Alice est toujours la seule chercheuse, mais sa chasse ne designe plus sa boisson.");
  delete caches.alice;
  const l = await fbLoadNearbyHunts(alice, "alice", ALICE, BXL.lat, BXL.lng, 50);
  const h = l.find((x) => x.mine);
  note("ce que fbLoadNearbyHunts rend a Alice pour SA chasse : " + JSON.stringify(h)
    + " — index.html:21898 (`if(!d)return false`) retire de la liste toute chasse dont le drinkId est inconnu du catalogue local.");
}

await doitEchouer("une chasse ne se cree pas avec un identifiant de boisson invente", async () => {
  await fbJoinHunt(bob, BOB, 999999999, "Aucune boisson n'a ce numero", "", BXL.lat, BXL.lng);
});
await doitEchouer("le nom d'une chasse est controle (il part tel quel dans la poussee de tout le quartier)", async () => {
  await fbJoinHunt(bob, BOB, 123456, "GAGNE 500 EUR : ouvre magofeed-cadeau.example maintenant", "", BXL.lat, BXL.lng);
});
{
  const d = (await getDoc(doc(anon, "hunts", "123456"))).data();
  const p = notifyHuntNearby(null, d);
  note("poussee que notifications-push.js:288 enverrait alors : « Quelqu'un cherche « "
    + String(d.drinkName || "").slice(0, 40) + " » » — " + (p.envoi ? "VAGUE ENVOYEE" : "rien"));
}
await doitEchouer("l'identifiant du document ne peut pas mentir sur la boisson (regles 1088)", async () => {
  await setDoc(doc(bob, "hunts", "abc"), { drinkId: 7, drinkName: NOM, emoji: "", seekers: { [BOB]: { at: Date.now(), lat: 50.9, lng: 4.3 } } });
});

await bilan(env);
