/* ============================================================================
   VERIFICATION INDEPENDANTE — « deux comptes neufs : rien ne se passe »
   ----------------------------------------------------------------------------
   On rejoue le test a deux telephones neufs du fondateur :
     - Alice ouvre l'app (profil cree : index.html:1699-1702)
     - Bob ouvre l'app (meme chose, le meme jour)
     - Alice lance une chasse (fbJoinHunt, index.html:4545-4593)
     - Bob trouve la boisson et la signale (fbAddReport, index.html:3316-3350)
     - Alice passe au magasin et confirme a son tour (fbAddReport)
     - le serveur devrait crediter Bob de 15 points et deposer un coup de main
       chez Alice (crediterEntraide, points-et-parrainage.js:320-385)

   CE FICHIER EST PLUS COMPLET QUE chasse-bout-en-bout.mjs sur un point : il
   recopie AUSSI le plafond par paire (points-et-parrainage.js:358-372) et le
   VRAI versement de points (crediter, points-et-parrainage.js:139-159), que
   l'autre scenario avait simplifies. Le but est de verifier que ce qui bloque
   est bien le garde-fou d'age, et rien d'autre.

   Cote serveur, l'emulateur n'execute pas les Cloud Functions : on rejoue leur
   decision avec l'Admin SDK (withSecurityRulesDisabled), qui ignore les regles
   exactement comme le fait une Cloud Function.
   ========================================================================== */
import { banc, doit, note, bilan } from "../banc.mjs";
import {
  doc, setDoc, updateDoc, getDoc, getDocs, addDoc,
  collection, query, where, orderBy, limit, serverTimestamp,
} from "firebase/firestore";

const env = await banc("verif-entraide-compte-neuf");

const ALICE = "alice", BOB = "bob";
const alice = env.authenticatedContext(ALICE).firestore();
const bob = env.authenticatedContext(BOB).firestore();

const serveur = async (fn) => {
  let out;
  await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); });
  return out;
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const verifier = (cond, quoi) => { if (!cond) throw new Error(quoi); };

const BOISSON = 7, NOM = "Mountain Dew Spark";
const MAGASIN = { id: "st-delhaize-flagey", name: "Delhaize Flagey", lat: 50.8281, lng: 4.3720 };
const STORES = [MAGASIN];

/* ══ COPIES CONFORMES DE index.html ══════════════════════════════════════ */

/* index.html:4505 */
function _coarse(x) { return Math.round(x * 10) / 10; }

/* index.html:4545-4593 — window.fbJoinHunt */
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
  try { await updateDoc(ref, maj); return; } catch (e) {}
  try {
    const bouge = Object.assign({}, commun);
    bouge["seekers." + uid + ".lat"] = pos.lat;
    bouge["seekers." + uid + ".lng"] = pos.lng;
    await updateDoc(ref, bouge); return;
  } catch (e2) {}
  await setDoc(ref, Object.assign({
    drinkId: Number(drinkId) || drinkId,
    seekers: (function () { const o = {}; o[uid] = moi; return o; })(),
  }, commun));
}

/* index.html:3316-3350 — window.fbAddReport */
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

/* ══ COPIES CONFORMES DU SERVEUR ═════════════════════════════════════════ */

/* points-et-parrainage.js:304-308 */
const POINTS_ENTRAIDE = 15, POINTS_ENTRAIDE_LOIN = 5;
const ENTRAIDE_FENETRE_J = 14, ENTRAIDE_MAX_PAIRE_30J = 3;
const CHERCHEUR_AGE_MIN_J = 2;
const DIST_MAX_M = 500, MAX_POINTS_JOUR = 60;

/* points-et-parrainage.js:314-319 */
function distanceRapport(rep) { const m = /\|(\d+)$/.exec(String(rep.note || "")); return m ? Number(m[1]) : null; }
function surPlace(rep) { const d = distanceRapport(rep); return d != null && d <= DIST_MAX_M; }

/* points-et-parrainage.js:139-159 — crediter, reduit a ce qu'il ECRIT. */
async function crediter(db, uid, montant, motif) {
  if (!uid || !(montant > 0)) return 0;
  const ref = doc(db, "users", uid);
  const j = new Date().toISOString().slice(0, 10);
  const d = (await getDoc(ref)).data() || {};
  const dejaJour = (d.pointsJour === j) ? (d.pointsJourTotal || 0) : 0;
  const verse = Math.min(montant, Math.max(0, MAX_POINTS_JOUR - dejaJour));
  if (verse <= 0) return 0;
  await setDoc(ref, {
    pointsPreuves: (d.pointsPreuves || 0) + verse,
    pointsJour: j, pointsJourTotal: dejaJour + verse,
    pointsMaj: serverTimestamp(), dernierMotif: String(motif || "").slice(0, 40),
  }, { merge: true });
  return verse;
}

/* points-et-parrainage.js:404-430 — noterCoupDeMain */
async function noterCoupDeMain(db, uidChercheur, aide) {
  if (!uidChercheur || !aide || !aide.by) return null;
  let pseudo = null;
  const da = (await getDoc(doc(db, "users", aide.by))).data() || {};
  if (da.aideDiscrete !== true && typeof da.pseudo === "string") {
    pseudo = da.pseudo.slice(0, 24);
    if (pseudo === "Explorateur") pseudo = null;
  }
  const quand = aide.createdAt && aide.createdAt.toMillis
    ? Math.floor(aide.createdAt.toMillis() / 3600000) * 3600000
    : Math.floor(Date.now() / 3600000) * 3600000;
  await setDoc(doc(db, "coupsDeMain", uidChercheur, "recus", aide.id), {
    aidantUid: pseudo ? String(aide.by) : null, aidantPseudo: pseudo,
    drinkId: Number(aide.drinkId), storeId: String(aide.storeId || ""),
    at: quand, merci: false,
  }, { merge: true });
  return { id: aide.id, aidantPseudo: pseudo };
}

/* points-et-parrainage.js:320-385 — crediterEntraide.
   `sortie` n'existe pas dans la fonction reelle : la vraie fait `return;`.
   On nomme chaque sortie pour pouvoir dire OU elle s'arrete — c'est
   precisement ce que l'application ne dit nulle part. */
async function crediterEntraide(db, repId) {
  const repRef = doc(db, "reports", repId);
  const rep = (await getDoc(repRef)).data() || {};
  if (rep.type !== "stock" || !rep.by || !rep.storeId || rep.drinkId == null) return { sortie: "champs manquants", ligne: 326 };
  const creeA = rep.createdAt ? rep.createdAt.toMillis() : Date.now();
  const hs = await getDoc(doc(db, "hunts", String(rep.drinkId)));
  const seekers = hs.exists() ? ((hs.data() || {}).seekers || {}) : {};

  const autres = Object.keys(seekers).filter((u) =>
    seekers[u] && u !== rep.by && typeof seekers[u].at === "number" && seekers[u].at < creeA);
  if (autres.length) await setDoc(repRef, { hunt: true }, { merge: true });

  const moi = seekers[rep.by];
  if (!moi || typeof moi.at !== "number") return { sortie: "l'auteur du rapport n'est pas chercheur", ligne: 339, hunt: autres.length > 0 };

  /* LA LIGNE EN CAUSE — points-et-parrainage.js:344 */
  const u = await getDoc(doc(db, "users", rep.by));
  const cree = (u.exists() && u.data().createdAt && u.data().createdAt.toMillis) ? u.data().createdAt.toMillis() : 0;
  if (cree && Date.now() - cree < CHERCHEUR_AGE_MIN_J * 86400000) {
    return { sortie: "compte du chercheur trop neuf (< " + CHERCHEUR_AGE_MIN_J + " jours)", ligne: 344, hunt: autres.length > 0 };
  }

  const depuis = creeA - ENTRAIDE_FENETRE_J * 86400000;
  const q = await getDocs(query(collection(db, "reports"), where("storeId", "==", rep.storeId), limit(60)));
  const aides = q.docs.map((d) => Object.assign({ id: d.id }, d.data()))
    .filter((o) => o.type === "stock" && o.hunt === true && o.by !== rep.by
      && String(o.drinkId) === String(rep.drinkId) && !o.huntCredited
      && o.createdAt && o.createdAt.toMillis() >= depuis
      && o.createdAt.toMillis() < creeA && moi.at < o.createdAt.toMillis())
    .sort((x, y) => x.createdAt.toMillis() - y.createdAt.toMillis());
  if (!aides.length) return { sortie: "aucune aide a crediter", ligne: 352, hunt: autres.length > 0 };
  const aide = aides[0];

  /* Plafond par paire — points-et-parrainage.js:358-372 (absent de
     chasse-bout-en-bout.mjs : on le remet pour ne rien laisser au hasard). */
  const paire = await getDocs(query(collection(db, "reports"),
    where("by", "==", aide.by), where("huntCreditedBy", "==", rep.by), limit(ENTRAIDE_MAX_PAIRE_30J + 2)));
  const recents = paire.docs.filter((d) => {
    const t = (d.data() || {}).huntCreditedAt;
    return t && t.toMillis() > Date.now() - 30 * 86400000;
  }).length;
  const marque = { huntCredited: true, huntCreditedBy: rep.by, huntCreditedAt: serverTimestamp() };
  if (recents >= ENTRAIDE_MAX_PAIRE_30J) {
    await setDoc(doc(db, "reports", aide.id), Object.assign(marque, { huntCreditedPts: 0, raison: "paire" }), { merge: true });
    return { sortie: "plafond par paire", ligne: 368 };
  }
  const montant = surPlace(rep) ? POINTS_ENTRAIDE : POINTS_ENTRAIDE_LOIN;
  const verse = await crediter(db, aide.by, montant, "entraide");
  await setDoc(doc(db, "reports", aide.id), Object.assign(marque, { huntCreditedPts: verse }), { merge: true });
  const coup = await noterCoupDeMain(db, rep.by, aide);
  return { sortie: "credite", ligne: 385, pts: verse, aide: aide.id, coup: coup };
}

/* ══ COMPTEURS D'OBSERVATION ═════════════════════════════════════════════ */
async function compter(db, chemin) {
  const s = await getDocs(collection(db, chemin));
  return s.size;
}

/* ════════════════════════════════════════════════════════════════════════ */
/* LE TEST A DEUX TELEPHONES NEUFS                                          */
/* ════════════════════════════════════════════════════════════════════════ */

/* index.html:1699-1702 — le profil cree a la premiere connexion, avec
   createdAt: serverTimestamp(). C'est CE champ que lit la ligne 344. */
await doit("Alice et Bob creent leur compte aujourd'hui (index.html:1699-1702)", async () => {
  await setDoc(doc(alice, "users", ALICE), { pseudo: "Explorateur", signals: 0, confirms: 0, createdAt: serverTimestamp() }, { merge: true });
  await setDoc(doc(bob, "users", BOB), { pseudo: "Explorateur", signals: 0, confirms: 0, createdAt: serverTimestamp() }, { merge: true });
});

await doit("l'application ecrit bien un createdAt (sans lui, la ligne 344 ne se declenche jamais)", async () => {
  const d = (await serveur((db) => getDoc(doc(db, "users", ALICE)))).data() || {};
  verifier(d.createdAt && d.createdAt.toMillis, "users/alice n'a pas de createdAt lisible");
  const age = Date.now() - d.createdAt.toMillis();
  note("age du compte d'Alice au moment du test : " + Math.round(age / 1000) + " s (seuil de la ligne 344 : 2 jours)");
});

await doit("Alice lance une chasse (fbJoinHunt, index.html:4545)", async () => {
  await fbJoinHunt(alice, ALICE, BOISSON, NOM, "", 50.8676, 4.3436);
  const h = (await getDoc(doc(alice, "hunts", String(BOISSON)))).data() || {};
  verifier(h.seekers && h.seekers[ALICE], "Alice n'est pas inscrite comme chercheuse");
});

await pause(60);
let repBob = null, v1 = null;
await doit("Bob trouve la boisson et la signale (fbAddReport, index.html:3316)", async () => {
  repBob = await fbAddReport(bob, BOB, MAGASIN.id, BOISSON, "stock", { note: "fiche|120" });
  v1 = await serveur((db) => crediterEntraide(db, repBob.id));
  const r = (await serveur((db) => getDoc(doc(db, "reports", repBob.id)))).data() || {};
  verifier(r.hunt === true, "le rapport de Bob n'est pas marque hunt:true : " + JSON.stringify(v1));
});

/* Alice doit etre chercheuse AVANT le rapport de Bob (elle l'est) et confirmer
   APRES : c'est exactement le parcours attendu. */
await pause(60);
let repAlice = null, v2 = null;
await doit("Alice confirme a son tour : Bob touche ses 15 points", async () => {
  repAlice = await fbAddReport(alice, ALICE, MAGASIN.id, BOISSON, "stock", { note: "fiche|80" });
  v2 = await serveur((db) => crediterEntraide(db, repAlice.id));
  const bobDoc = (await serveur((db) => getDoc(doc(db, "users", BOB)))).data() || {};
  verifier(v2.sortie === "credite" && (bobDoc.pointsPreuves || 0) === 15,
    "Bob a " + (bobDoc.pointsPreuves || 0) + " point(s). Le serveur est sorti a la ligne "
    + v2.ligne + " : " + v2.sortie);
});

await doit("Alice voit « on t'a aide » (un coup de main depose chez elle)", async () => {
  const n = await serveur((db) => compter(db, "coupsDeMain/" + ALICE + "/recus"));
  verifier(n > 0, "aucun coup de main chez Alice (" + n + ")");
});

/* ══ LA SORTIE EST-ELLE VRAIMENT MUETTE ? ════════════════════════════════ */
await doit("quelque chose, quelque part, dit pourquoi rien n'est arrive", async () => {
  const etat = await serveur(async (db) => ({
    alertesAdmin: await compter(db, "alertesAdmin"),
    userNotifsAlice: await compter(db, "userNotifs"),
    coupsAlice: await compter(db, "coupsDeMain/" + ALICE + "/recus"),
    repBob: (await getDoc(doc(db, "reports", repBob.id))).data() || {},
  }));
  note("apres la sortie ligne 344 — alertesAdmin:" + etat.alertesAdmin
    + " userNotifs:" + etat.userNotifsAlice + " coupsDeMain(alice):" + etat.coupsAlice
    + " reports/bob.huntCredited:" + String(etat.repBob.huntCredited)
    + " reports/bob.raison:" + String(etat.repBob.raison));
  verifier(etat.alertesAdmin > 0 || etat.userNotifsAlice > 0 || etat.repBob.raison,
    "rien n'est ecrit nulle part : ni alertesAdmin (le journal que notifyHuntNearby "
    + "alimente a chacune de ses sorties, notifications-push.js:176/229), ni userNotifs, "
    + "ni meme un champ `raison` sur le rapport (le plafond par paire, lui, en pose un, ligne 369)");
});

/* ══ MEME PARCOURS, COMPTES PLUS AGES ════════════════════════════════════ */
await serveur(async (db) => {
  const vieux = new Date(Date.now() - 30 * 86400000);
  await setDoc(doc(db, "users", ALICE), { createdAt: vieux }, { merge: true });
  await setDoc(doc(db, "users", BOB), { createdAt: vieux }, { merge: true });
  await setDoc(doc(db, "reports", repBob.id), { huntCredited: false }, { merge: true });
});
await pause(60);
let v3 = null;
await doit("avec des comptes de 30 jours, le MEME parcours credite Bob et previent Alice", async () => {
  const rep2 = await fbAddReport(alice, ALICE, MAGASIN.id, BOISSON, "stock", { note: "fiche|80" });
  v3 = await serveur((db) => crediterEntraide(db, rep2.id));
  const bobDoc = (await serveur((db) => getDoc(doc(db, "users", BOB)))).data() || {};
  const n = await serveur((db) => compter(db, "coupsDeMain/" + ALICE + "/recus"));
  verifier(v3.sortie === "credite", "toujours rien : ligne " + v3.ligne + " — " + v3.sortie);
  verifier((bobDoc.pointsPreuves || 0) === 15, "Bob a " + (bobDoc.pointsPreuves || 0) + " point(s) au lieu de 15");
  verifier(n > 0, "toujours aucun coup de main chez Alice");
});
note("verdict comptes du jour : " + JSON.stringify(v2));
note("verdict comptes de 30 jours : " + JSON.stringify(v3));

/* ══ OU EST EXACTEMENT LA FRONTIERE ? ════════════════════════════════════ */
for (const jours of [0, 1, 1.9, 2.1, 3]) {
  const drink = 100 + Math.round(jours * 10);
  await serveur(async (db) => {
    await setDoc(doc(db, "users", ALICE), { createdAt: new Date(Date.now() - jours * 86400000) }, { merge: true });
    await setDoc(doc(db, "hunts", String(drink)), {
      drinkId: drink, drinkName: "Test " + jours,
      seekers: { [ALICE]: { lat: 50.9, lng: 4.3, at: Date.now() - 5000 } },
    });
  });
  const rb = await fbAddReport(bob, BOB, MAGASIN.id, drink, "stock", { note: "fiche|120" });
  await serveur((db) => crediterEntraide(db, rb.id));
  await pause(30);
  const ra = await fbAddReport(alice, ALICE, MAGASIN.id, drink, "stock", { note: "fiche|80" });
  const v = await serveur((db) => crediterEntraide(db, ra.id));
  note("compte d'Alice age de " + jours + " jour(s) -> " + v.sortie + " (ligne " + v.ligne + ")");
}

await bilan(env);
