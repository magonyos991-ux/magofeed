/* ============================================================================
   VERIFICATION D'INTENTION — « rien de la chasse ne laisse de trace in-app »
   ----------------------------------------------------------------------------
   La trouvaille affirme que TOUT le parcours de la chasse repose sur la poussee
   telephone (FCM), et s'appuie sur un seul chiffre : fbLoadMyNotifs (userNotifs)
   renvoie 0 pour Alice.

   Question posee ici : userNotifs est-il VRAIMENT la boite in-app de la chasse,
   ou bien la chasse a-t-elle sa propre trace ailleurs ?

   Fonctions rejouees a l'identique :
     window.fbJoinHunt        index.html:4545
     window.fbAddReport       index.html:3316
     window.fbCoupsDeMain     index.html:5129
     window.fbDireMerci       index.html:5149
     window.fbLoadMyNotifs    index.html:5541
     window.fbNotifyUser      index.html:5534
   Cote serveur (Admin SDK, l'emulateur n'execute pas les Cloud Functions) :
     crediter                 points-et-parrainage.js:139
     noterCoupDeMain          points-et-parrainage.js:404
     exports.direMerci        points-et-parrainage.js:438

   AUCUN document pushTokens n'est cree dans ce scenario : Alice et Bob ont
   refuse les notifications. Tout ce qui apparait ici apparait SANS push.
   ========================================================================== */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import {
  doc, setDoc, updateDoc, getDoc, getDocs, addDoc, collection, query, where,
  orderBy, limit, serverTimestamp,
} from "firebase/firestore";

const env = await banc("verif-intention-chasse-trace-in-app");

const ALICE = "alice", BOB = "bob";
const alice = env.authenticatedContext(ALICE).firestore();
const bob = env.authenticatedContext(BOB).firestore();

const serveur = async (fn) => {
  let out;
  await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); });
  return out;
};
const verifier = (cond, quoi) => { if (!cond) throw new Error(quoi); };

const BXL = { lat: 50.8676, lng: 4.3436 };
const BOISSON = 7, NOM = "Mountain Dew Spark";
const MAGASIN = { id: "st-delhaize-flagey", name: "Delhaize Flagey", lat: 50.8281, lng: 4.3720 };

/* ══ COPIES CONFORMES DE index.html ══════════════════════════════════════ */

/* index.html:4505 */
function _coarse(x) { return Math.round(x * 10) / 10; }

/* index.html:4545-4593 — window.fbJoinHunt (chemin de creation) */
async function fbJoinHunt(db, uid, drinkId, drinkName, emoji, lat, lng) {
  const pos = { lat: lat != null ? _coarse(lat) : null, lng: lng != null ? _coarse(lng) : null };
  const moi = { lat: pos.lat, lng: pos.lng, at: Date.now() };
  const ref = doc(db, "hunts", String(drinkId));
  const commun = {
    drinkName: String(drinkName || "").slice(0, 60),
    emoji: String(emoji || "").slice(0, 4), updatedAt: serverTimestamp(),
  };
  const maj = Object.assign({}, commun);
  maj["seekers." + uid] = moi;
  try { await updateDoc(ref, maj); return; } catch (e) { /* la chasse n'existe pas encore */ }
  await setDoc(ref, Object.assign({
    drinkId: Number(drinkId) || drinkId,
    seekers: (function () { const o = {}; o[uid] = moi; return o; })(),
  }, commun));
}

/* index.html:3316-3350 — window.fbAddReport */
async function fbAddReport(db, uid, storeId, drinkId, type, note0) {
  return await addDoc(collection(db, "reports"), Object.assign({
    storeId: storeId, drinkId: drinkId, type: type, by: uid || null,
    byPseudo: "Explorateur", createdAt: serverTimestamp(),
    storeName: String(MAGASIN.name).slice(0, 60),
    lat: Math.round(MAGASIN.lat * 100) / 100, lng: Math.round(MAGASIN.lng * 100) / 100,
    tz: "Europe/Brussels",
  }, note0 != null ? { note: String(note0).slice(0, 300) } : {}));
}

/* index.html:5129-5147 — window.fbCoupsDeMain */
async function fbCoupsDeMain(db, uid) {
  const snap = await getDocs(query(collection(db, "coupsDeMain", uid, "recus"), orderBy("at", "desc"), limit(12)));
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
}

/* index.html:5541-5551 — window.fbLoadMyNotifs */
async function fbLoadMyNotifs(db, uid) {
  const snap = await getDocs(query(collection(db, "userNotifs"), where("to", "==", uid), limit(20)));
  const rows = []; snap.forEach((d) => rows.push(d.data()));
  return rows;
}

/* index.html:5534-5539 — window.fbNotifyUser (le try/catch d'origine est retire
   pour que le refus des regles soit visible) */
async function fbNotifyUser(db, uid, notif) {
  await addDoc(collection(db, "userNotifs"), Object.assign(
    { to: String(uid), read: false, createdAt: serverTimestamp() }, notif || {}));
}

/* ══ COPIES CONFORMES DU SERVEUR ═════════════════════════════════════════ */

/* points-et-parrainage.js:139-159 — crediter (plafond du jour) */
const MAX_POINTS_JOUR = 60;
async function crediter(db, uid, montant, motif) {
  const ref = doc(db, "users", uid);
  const j = new Date().toISOString().slice(0, 10);
  const snap = await getDoc(ref);
  const d = snap.exists() ? snap.data() : {};
  const dejaJour = (d.pointsJour === j) ? (d.pointsJourTotal || 0) : 0;
  const verse = Math.min(montant, Math.max(0, MAX_POINTS_JOUR - dejaJour));
  if (verse <= 0) return 0;
  await setDoc(ref, {
    pointsPreuves: (Number(d.pointsPreuves) || 0) + verse,
    pointsJour: j, pointsJourTotal: dejaJour + verse,
    pointsMaj: serverTimestamp(), dernierMotif: String(motif || "").slice(0, 40),
  }, { merge: true });
  return verse;
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
  const quand = Math.floor(aide.createdAtMs / 3600000) * 3600000;
  const corps = {
    aidantUid: pseudo ? String(aide.by) : null,
    aidantPseudo: pseudo,
    drinkId: Number(aide.drinkId),
    storeId: String(aide.storeId || ""),
    at: quand, merci: false,
  };
  await setDoc(doc(db, "coupsDeMain", uidChercheur, "recus", aide.id), corps, { merge: true });
  return corps;
}

/* points-et-parrainage.js:438-460 — exports.direMerci (decision seule) */
function direMerci(av, ap) {
  if (av.merci === true || ap.merci !== true) return { envoi: false, pourquoi: "pas une bascule false->true" };
  if (!ap.aidantUid) return { envoi: false, pourquoi: "aide en discret : rien a envoyer" };
  return { envoi: true, pourquoi: "push « Quelqu'un te remercie » vers " + ap.aidantUid };
}

/* ══════════════════════════════════════════════════════════════════════════
   LE PARCOURS, SANS AUCUN PUSH
   ══════════════════════════════════════════════════════════════════════════ */

// Bob a choisi un pseudo (sans quoi le serveur l'efface : points-et-parrainage.js:411)
await setDoc(doc(bob, "users", BOB), { pseudo: "Bob", pseudoLower: "bob" }, { merge: true });
await setDoc(doc(alice, "users", ALICE), { pseudo: "Alice", pseudoLower: "alice" }, { merge: true });

await doit("Alice lance sa chasse (index.html:4545)", async () => {
  await fbJoinHunt(alice, ALICE, BOISSON, NOM, "", BXL.lat, BXL.lng);
  const h = await getDoc(doc(alice, "hunts", String(BOISSON)));
  verifier(h.exists() && h.data().seekers[ALICE], "la chasse n'existe pas");
});

let repBob;
await doit("Bob la repere en rayon (index.html:3316)", async () => {
  repBob = await fbAddReport(bob, BOB, MAGASIN.id, BOISSON, "stock", "gps|120");
});

await doit("le serveur depose le coup de main chez Alice (points-et-parrainage.js:404)", async () => {
  await serveur(async (db) => {
    await setDoc(doc(db, "reports", repBob.id), { hunt: true, huntCredited: true, huntCreditedBy: ALICE, huntCreditedPts: 15 }, { merge: true });
    await crediter(db, BOB, 15, "entraide");
    await noterCoupDeMain(db, ALICE, { id: repBob.id, by: BOB, drinkId: BOISSON, storeId: MAGASIN.id, createdAtMs: Date.now() });
  });
});

/* ── LA QUESTION ────────────────────────────────────────────────────────── */

await doit("SANS AUCUN PUSH, Alice rouvre l'app et y trouve une trace de sa chasse (fbCoupsDeMain, index.html:5129 -> #coups-card, index.html:499)", async () => {
  const jetons = await serveur(async (db) => (await getDocs(collection(db, "pushTokens"))).size);
  verifier(jetons === 0, "ce scenario n'est plus concluant : " + jetons + " jeton(s) FCM existent");
  const recus = await fbCoupsDeMain(alice, ALICE);
  verifier(recus.length === 1, recus.length + " coup(s) de main, attendu 1");
  verifier(Number(recus[0].drinkId) === BOISSON && String(recus[0].storeId) === MAGASIN.id,
    "la ligne ne designe pas la bonne boisson/magasin : " + JSON.stringify(recus[0]));
  verifier(recus[0].aidantPseudo === "Bob", "le nom de l'aidant manque : " + JSON.stringify(recus[0]));
  note("la ligne qu'Alice voit dans « On t'a aide » : " + JSON.stringify(recus[0]));
});

await doit("cette trace est PERSISTANTE : elle est toujours la a l'ouverture suivante (relecture)", async () => {
  const recus = await fbCoupsDeMain(alice, ALICE);
  verifier(recus.length === 1 && recus[0].merci === false, "la ligne a disparu ou change : " + JSON.stringify(recus));
});

await doit("Alice remercie depuis cette ligne, et l'etat reste ecrit dans la base (index.html:5149)", async () => {
  const recus = await fbCoupsDeMain(alice, ALICE);
  await fbDireMerci(alice, ALICE, recus[0].id);
  const apres = await fbCoupsDeMain(alice, ALICE);
  verifier(apres[0].merci === true, "le merci n'est pas enregistre");
});

/* ── userNotifs : est-ce la boite de la chasse ? ─────────────────────────── */

await doit("userNotifs reste vide pour Alice apres toute la chasse (ce que la trouvaille mesure)", async () => {
  const rows = await fbLoadMyNotifs(alice, ALICE);
  verifier(rows.length === 0, "attendu 0, obtenu " + rows.length);
});
await doitEchouer("Bob ne peut pas ecrire dans userNotifs (regles 309 : create reserve a l'admin)", async () => {
  await fbNotifyUser(bob, ALICE, { type: "hunt", title: "coucou", body: "je l'ai vue" });
});
note("index.html:5526-5533 dit que userNotifs sert « a prevenir l'auteur d'une decouverte quand elle entre au catalogue, ou quand sa photo doit etre refaite », et ajoute : « autorise dans tes regles la creation d'un doc userNotifs par un ADMIN ». Les regles 309 font exactement cela. userNotifs est le canal admin -> membre, pas la boite de la chasse.");

/* ── Ce qui reste vrai : le merci, cote Bob ──────────────────────────────── */

await doit("cote Bob, le coup de main lui-meme laisse bien des traces qu'il peut relire (regles 988 et 140)", async () => {
  const r = await getDoc(doc(bob, "reports", repBob.id));
  verifier(r.exists() && r.data().huntCredited === true && r.data().huntCreditedPts === 15,
    "le rapport de Bob ne porte pas son credit : " + JSON.stringify(r.exists() ? r.data() : null));
  const u = await getDoc(doc(bob, "users", BOB));
  verifier(Number(u.data().pointsPreuves) === 15, "les points d'entraide ne sont pas au profil : " + JSON.stringify(u.data()));
  note("Bob relit : reports/" + repBob.id + " -> huntCredited=true, huntCreditedPts=15 ; users/bob -> pointsPreuves=15, dernierMotif=\"" + u.data().dernierMotif + "\"");
});

await doit("mais le MERCI, lui, ne laisse aucun document chez Bob : il ne part qu'en push", async () => {
  const cdm = await getDocs(query(collection(bob, "coupsDeMain", BOB, "recus"), orderBy("at", "desc"), limit(12)));
  const nt = await fbLoadMyNotifs(bob, BOB);
  const d = direMerci({ merci: false, aidantUid: BOB }, { merci: true, aidantUid: BOB });
  note("decision du serveur sur le merci : " + (d.envoi ? "ENVOI" : "RIEN") + " — " + d.pourquoi);
  verifier(cdm.docs.length === 0 && nt.length === 0,
    "ce scenario n'est plus a jour : Bob a " + (cdm.docs.length + nt.length) + " document(s)");
  note("confirme : 0 document cote Bob pour le merci. Sans jeton FCM, Bob ne saura jamais qu'Alice l'a remercie — alors que son coup de main, lui, reste visible (points + rapport credite).");
});

await bilan(env);
