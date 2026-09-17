/* ============================================================================
   VERIFICATION D'IMPACT — « qu'est-ce que ca change pour quelqu'un ? »
   ----------------------------------------------------------------------------
   La trouvaille dit : crediterEntraide sort ligne 344 quand le compte du
   chercheur qui confirme a moins de 2 jours, et cette sortie est muette.

   Ce scenario ne remesure pas la sortie (chasse-bout-en-bout.mjs et
   verif-reproduction-entraide-compte-neuf.mjs l'ont deja faite). Il pose UNE
   question : PENDANT CE TEMPS-LA, QU'EST-CE QUE L'APPLICATION DIT A BOB ?

   Parce que le client, lui, ne sait rien de la ligne 344. Il a sa propre
   comptabilite locale (magoPending, index.html:14870-14895) et son propre
   detecteur de confirmation (_verifierAides, index.html:15035-15066) qui lit
   les champs PUBLICS du magasin (confirmedBy/confirmedAt, ecrits par
   fbConfirmStock, index.html:2311-2336). Ces deux-la vont annoncer a Bob que
   sa trouvaille a ete confirmee et que ses 15 points « attendent le serveur ».

   Fonctions rejouees a l'identique :
     index.html:1699-1702   creation du profil (createdAt: serverTimestamp)
     index.html:4545-4592   window.fbJoinHunt
     index.html:3316-3350   window.fbAddReport
     index.html:3301-3315   window.fbRafraichirPreuves (la relance des points)
     index.html:2311-2336   window.fbConfirmStock
     index.html:6746-6778   confirmWithPrice (le geste « Oui, je l'ai vue »)
     index.html:6821-6845   maybeRewardHuntHelp  -> pendingAdd(..., 15, ...)
     index.html:14875-14895 pendingAdd / pendingTotal / majLignePending
     index.html:14938-14966 repondreIndication (« Je l'ai trouvee », cote Alice)
     index.html:15035-15066 _verifierAides (cote Bob)
     index.html:21978-21990 le journal « Confirmee par {p} · +15 en attente »
     points-et-parrainage.js:320-385 crediterEntraide (rejoue avec l'Admin SDK,
       qui ignore les regles exactement comme une Cloud Function)

   Textes exacts montres a l'ecran (data/i18n.js) :
     huntHelped      "Tu as aide une chasse ! {n} personne{s} cherchai{v} ca
                      · +5 pts · +15 si quelqu'un confirme"
     pendingPts      "en attente"
     pendingSub      "Ils seront credites quand quelqu'un confirme sur place
                      (ou quand le serveur de points verifie). Rien n'est
                      promis d'avance."
     helpOkToast     "{p} a confirme « {d} » chez {s} grace a toi
                      · +15 pts en attente"
     pendingConfirmed "confirmee par {p} · attend le serveur"
     helpOkShort     "Confirmee par {p}"
   ========================================================================== */
import { banc, doit, note, bilan } from "../banc.mjs";
import {
  doc, setDoc, updateDoc, getDoc, getDocs, addDoc,
  collection, query, where, limit, serverTimestamp, increment,
} from "firebase/firestore";

const env = await banc("verif-impact-entraide-neuf");

const ALICE = "alice", BOB = "bob";
const alice = env.authenticatedContext(ALICE).firestore();
const bob = env.authenticatedContext(BOB).firestore();
const anon = env.unauthenticatedContext().firestore();

const serveur = async (fn) => {
  let out;
  await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); });
  return out;
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const verifier = (cond, quoi) => { if (!cond) throw new Error(quoi); };

const BOISSON = 7, NOM_BOISSON = "Mountain Dew Spark";
const MAGASIN = { id: "st-delhaize-flagey", name: "Delhaize Flagey", lat: 50.8281, lng: 4.3720 };
const STORES = [MAGASIN];

/* ══ L'ECRAN DE BOB : sa memoire locale (localStorage), rejouee telle quelle ══
   index.html:14870-14895. Rien de tout cela ne vit dans Firestore : c'est le
   telephone de Bob qui se souvient, et c'est lui qui affiche la ligne. */
const ECRAN_BOB = { pending: {}, scanHist: [], toasts: [], activites: [], sons: [] };
function pendingAdd(key, pts, label) {                    /* index.html:14875 */
  if (ECRAN_BOB.pending[key]) return false;
  ECRAN_BOB.pending[key] = { pts: Number(pts) || 0, label: String(label || "").slice(0, 80), ts: Date.now() };
  return true;
}
function pendingResolve(key) {                            /* index.html:14880 */
  const e = ECRAN_BOB.pending[key]; if (!e) return null;
  delete ECRAN_BOB.pending[key]; return e;
}
function pendingSetStatus(key, status, by) {              /* index.html:14884 */
  const o = ECRAN_BOB.pending[key]; if (!o) return;
  o.status = status; if (by) o.by = String(by).slice(0, 24);
}
function pendingTotal() {                                 /* index.html:14885 */
  return Object.keys(ECRAN_BOB.pending).reduce((t, k) => t + (Number(ECRAN_BOB.pending[k].pts) || 0), 0);
}
/* index.html:14886-14895 — la ligne du profil, mot pour mot. */
function ligneProfilBob() {
  const t = pendingTotal();
  if (!t) return null;
  return "+" + t + " pts en attente (" + Object.keys(ECRAN_BOB.pending).length + " ›)";
}
/* index.html:21978-21990 — la ligne du journal « Mes trouvailles ». */
function journalBob() {
  return ECRAN_BOB.scanHist
    .filter((e) => e.hunt && e.helpStatus === "ok" && e.taggedAt)
    .map((e) => e.name + " · Confirmée par " + (e.helpBy || "") + " · +15 en attente");
}

/* ══ COPIES CONFORMES DE index.html ══════════════════════════════════════ */

function _coarse(x) { return Math.round(x * 10) / 10; }   /* index.html:4505 */

/* index.html:4545-4592 — window.fbJoinHunt */
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

/* index.html:4606-4616 — window.fbHuntSeekers (les AUTRES chercheurs) */
async function fbHuntSeekers(db, uid, drinkId) {
  const s = await getDoc(doc(db, "hunts", String(drinkId)));
  if (!s.exists()) return 0;
  const seekers = s.data().seekers || {};
  const fresh = Date.now() - 30 * 86400000;
  let n = 0;
  Object.keys(seekers).forEach((u) => { const x = seekers[u]; if (x && x.at && x.at >= fresh && u !== uid) n++; });
  return n;
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

/* index.html:2311-2336 — window.fbConfirmStock. C'est CE document que le
   telephone de Bob relira pour savoir qu'on l'a confirme. */
async function fbConfirmStock(db, storeId, drinkId, value, pseudo) {
  const updates = {};
  updates["confirmations." + drinkId] = increment(value);
  const heure = Math.floor(Date.now() / 3600000) * 3600000;
  const qui = String(pseudo || "Explorateur").slice(0, 24);
  if (value > 0) {
    updates["seenAt." + drinkId] = heure;
    updates["confirmedBy." + drinkId] = qui;
    updates["confirmedAt." + drinkId] = heure;
  } else {
    updates["absentBy." + drinkId] = qui;
    updates["absentAt." + drinkId] = heure;
  }
  await updateDoc(doc(db, "stores", String(storeId)), updates);
}

/* index.html:6821-6845 — maybeRewardHuntHelp. Le geste de Bob. */
async function maybeRewardHuntHelp(db, uid, drinkId, store) {
  const n = await fbHuntSeekers(db, uid, drinkId);
  if (!(n > 0)) return { promis: false };
  const sid = String((store && store.id) || "");
  ECRAN_BOB.sons.push("win");
  ECRAN_BOB.toasts.push("Tu as aidé une chasse ! " + n + " personne"
    + (n > 1 ? "s" : "") + " cherchai" + (n > 1 ? "ent" : "t")
    + " ça · +5 pts · +15 si quelqu'un confirme");
  /* « +15 de plus quand un chercheur confirme sur place : en attente, pas
     promis. » — index.html:6837-6838 */
  pendingAdd("hunt:" + drinkId + ":" + sid, 15,
    "« " + NOM_BOISSON + " » chez " + ((store && store.name) || ""));
  return { promis: true, chercheurs: n };
}

/* index.html:3301-3315 — window.fbRafraichirPreuves. Le telephone de Bob
   revient VOIR ses points a 5 s, 12 s, 24 s, 44 s. */
async function fbRafraichirPreuves(db, uid, essais) {
  const lus = [];
  for (let i = 0; i < essais; i++) {
    const d = (await getDoc(doc(db, "users", uid))).data() || {};
    lus.push(Number(d.pointsPreuves) || 0);
  }
  return lus;
}

/* index.html:15035-15066 — _verifierAides, cote Bob. Il ne lit QUE les champs
   publics du magasin : rien du serveur de points n'entre ici. */
async function _verifierAides(db, monPseudo) {
  for (const e of ECRAN_BOB.scanHist) {
    if (!e.hunt || e.helpStatus || !e.taggedAt) continue;
    const did = e.drinkId; if (did == null) continue;
    const s = (await getDoc(doc(db, "stores", String(e.storeId)))).data();
    if (!s) continue;
    const heure = Math.floor(e.taggedAt / 3600000) * 3600000;
    const cAt = Number((s.confirmedAt || {})[did]) || 0, cBy = (s.confirmedBy || {})[did];
    const aAt = Number((s.absentAt || {})[did]) || 0, aBy = (s.absentBy || {})[did];
    const key = "hunt:" + did + ":" + String(e.storeId);
    if (cAt >= heure && cBy && cBy !== monPseudo && cAt >= aAt) {
      e.helpStatus = "ok"; e.helpBy = String(cBy).slice(0, 24);
      pendingSetStatus(key, "confirmee", e.helpBy);
      ECRAN_BOB.sons.push("win");
      const txt = e.helpBy + " a confirmé « " + e.name + " » chez "
        + (e.storeName || "") + " grâce à toi · +15 pts en attente";
      ECRAN_BOB.toasts.push(txt);
      ECRAN_BOB.activites.push({ type: "tipOk", title: "« " + e.name + " » confirmée grâce à toi", body: txt });
    } else if (aAt >= heure && aBy && aBy !== monPseudo) {
      e.helpStatus = "ko"; e.helpBy = String(aBy).slice(0, 24); pendingResolve(key);
    } else if (Date.now() - e.taggedAt > 14 * 86400000) {
      e.helpStatus = "none"; pendingResolve(key);
    }
  }
}

/* ══ COPIE CONFORME DU SERVEUR ═══════════════════════════════════════════ */
const POINTS_ENTRAIDE = 15, POINTS_ENTRAIDE_LOIN = 5;
const ENTRAIDE_FENETRE_J = 14, ENTRAIDE_MAX_PAIRE_30J = 3;
const CHERCHEUR_AGE_MIN_J = 2, DIST_MAX_M = 500, MAX_POINTS_JOUR = 60;
function surPlace(rep) { const m = /\|(\d+)$/.exec(String(rep.note || "")); const d = m ? Number(m[1]) : null; return d != null && d <= DIST_MAX_M; }

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
    pointsPreuves: (d.pointsPreuves || 0) + verse, pointsJour: j,
    pointsJourTotal: dejaJour + verse, pointsMaj: serverTimestamp(),
    dernierMotif: String(motif || "").slice(0, 40),
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
  return { id: aide.id };
}

/* points-et-parrainage.js:320-385 — crediterEntraide. `sortie` n'existe pas
   dans la vraie fonction : elle fait `return;`. On la nomme pour dire OU. */
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
  if (!moi || typeof moi.at !== "number") return { sortie: "l'auteur n'est pas chercheur", ligne: 339 };
  /* LA LIGNE EN CAUSE — points-et-parrainage.js:344 */
  const u = await getDoc(doc(db, "users", rep.by));
  const cree = (u.exists() && u.data().createdAt && u.data().createdAt.toMillis) ? u.data().createdAt.toMillis() : 0;
  if (cree && Date.now() - cree < CHERCHEUR_AGE_MIN_J * 86400000) {
    return { sortie: "compte du chercheur trop neuf (< " + CHERCHEUR_AGE_MIN_J + " jours)", ligne: 344 };
  }
  const depuis = creeA - ENTRAIDE_FENETRE_J * 86400000;
  const q = await getDocs(query(collection(db, "reports"), where("storeId", "==", rep.storeId), limit(60)));
  const aides = q.docs.map((d) => Object.assign({ id: d.id }, d.data()))
    .filter((o) => o.type === "stock" && o.hunt === true && o.by !== rep.by
      && String(o.drinkId) === String(rep.drinkId) && !o.huntCredited
      && o.createdAt && o.createdAt.toMillis() >= depuis
      && o.createdAt.toMillis() < creeA && moi.at < o.createdAt.toMillis())
    .sort((x, y) => x.createdAt.toMillis() - y.createdAt.toMillis());
  if (!aides.length) return { sortie: "aucune aide a crediter", ligne: 352 };
  const aide = aides[0];
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
  await noterCoupDeMain(db, rep.by, aide);
  return { sortie: "credite", ligne: 385, pts: verse };
}

const compter = async (db, chemin) => (await getDocs(collection(db, chemin))).size;

/* ════════════════════════════════════════════════════════════════════════ */
/* LE PARCOURS : Bob aide Alice, le jour ou tous deux ont installe l'app     */
/* ════════════════════════════════════════════════════════════════════════ */

await doit("le decor : Alice et Bob installent l'app aujourd'hui, le magasin existe", async () => {
  /* index.html:1699-1702 */
  await setDoc(doc(alice, "users", ALICE), { pseudo: "Alice", signals: 0, confirms: 0, createdAt: serverTimestamp() }, { merge: true });
  await setDoc(doc(bob, "users", BOB), { pseudo: "Bob", signals: 0, confirms: 0, createdAt: serverTimestamp() }, { merge: true });
  await setDoc(doc(bob, "stores", MAGASIN.id), {
    name: MAGASIN.name, lat: MAGASIN.lat, lng: MAGASIN.lng, drinks: [BOISSON], confirmations: {},
  });
});

await doit("Alice lance sa chasse (fbJoinHunt, index.html:4545)", async () => {
  await fbJoinHunt(alice, ALICE, BOISSON, NOM_BOISSON, "", 50.8676, 4.3436);
  const h = (await getDoc(doc(anon, "hunts", String(BOISSON)))).data() || {};
  verifier(h.seekers && h.seekers[ALICE], "Alice n'est pas inscrite comme chercheuse");
});

await pause(60);
let repBob = null;
await doit("Bob la voit en rayon et le dit (confirmWithPrice, index.html:6746-6778)", async () => {
  /* L'ordre exact du code : fbAddReport (6769), fbConfirmStock (6773),
     puis maybeRewardHuntHelp (6777). */
  repBob = await fbAddReport(bob, BOB, MAGASIN.id, BOISSON, "stock", { note: "fiche|120" });
  await fbConfirmStock(bob, MAGASIN.id, BOISSON, 1, "Bob");
  ECRAN_BOB.scanHist.push({
    code: "5449000000996", name: NOM_BOISSON, drinkId: BOISSON,
    storeId: MAGASIN.id, storeName: MAGASIN.name, taggedAt: Date.now(), hunt: true,
  });
  const r = await maybeRewardHuntHelp(bob, BOB, BOISSON, MAGASIN);
  verifier(r.promis, "maybeRewardHuntHelp n'a rien annonce (aucun autre chercheur vu)");
  await serveur((db) => crediterEntraide(db, repBob.id));
});

note("ECRAN DE BOB, juste apres son geste — toast : « " + ECRAN_BOB.toasts[0] + " »");
note("ECRAN DE BOB, ligne du profil : « " + ligneProfilBob() + " »"
  + " (la fiche dit : « Ils seront credites quand quelqu'un confirme sur place »)");

/* ── Alice passe au magasin et repond « Je l'ai trouvee » ───────────────── */
await pause(60);
let verdictServeur = null;
await doit("Alice repond « Je l'ai trouvee » (repondreIndication, index.html:14938-14966)", async () => {
  /* L'ordre exact du code : fbConfirmStock (14949), fbAddReport (14950). */
  await fbConfirmStock(alice, MAGASIN.id, BOISSON, 1, "Alice");
  const repAlice = await fbAddReport(alice, ALICE, MAGASIN.id, BOISSON, "stock", { note: "reponse|80" });
  verdictServeur = await serveur((db) => crediterEntraide(db, repAlice.id));
  const s = (await getDoc(doc(anon, "stores", MAGASIN.id))).data() || {};
  verifier((s.confirmedBy || {})[BOISSON] === "Alice", "la confirmation d'Alice n'est pas publiee sur le magasin");
});
note("verdict du serveur : " + JSON.stringify(verdictServeur));

/* ── Le telephone de Bob se reveille ───────────────────────────────────── */
await doit("le telephone de Bob relit le magasin (_verifierAides, index.html:15035)", async () => {
  await _verifierAides(anon, "Bob");
  const e = ECRAN_BOB.scanHist[0];
  verifier(e.helpStatus === "ok" && e.helpBy === "Alice",
    "le client n'a pas vu la confirmation d'Alice (helpStatus=" + e.helpStatus + ")");
});

const toastBob = ECRAN_BOB.toasts[ECRAN_BOB.toasts.length - 1];
const pendingBob = ECRAN_BOB.pending["hunt:" + BOISSON + ":" + MAGASIN.id];
note("ECRAN DE BOB, toast + son « win » : « " + toastBob + " »");
note("ECRAN DE BOB, fiche des points en attente : « " + pendingBob.label
  + " · +15 » puis en vert : « confirmee par " + pendingBob.by + " · attend le serveur »");
note("ECRAN DE BOB, journal Mes trouvailles : « " + journalBob()[0] + " »");
note("ECRAN DE BOB, notification in-app : « " + ECRAN_BOB.activites[0].title + " »");

/* ── LE POINT DE L'AUDIT : ce que l'ecran annonce vs ce que la base contient ── */
await doit("A. l'ecran de Bob annonce « confirmee par Alice · attend le serveur » "
  + "ET le serveur a bien quelque chose a lui donner", async () => {
  const d = await serveur(async (db) => (await getDoc(doc(db, "users", BOB))).data() || {});
  verifier(pendingBob.status === "confirmee", "le decor n'est pas bon");
  verifier((d.pointsPreuves || 0) > 0,
    "l'application annonce a Bob « " + toastBob + " » alors que users/bob.pointsPreuves vaut "
    + (d.pointsPreuves || 0) + ". Le serveur est sorti a la ligne " + verdictServeur.ligne
    + " (" + verdictServeur.sortie + ") et n'ecrira plus jamais rien pour ce rapport : "
    + "la ligne « +15 pts en attente » restera a l'ecran de Bob sans jamais etre creditee");
});

/* HONNETETE DU CHIFFRE : ce scenario ne rejoue QUE crediterEntraide. Dans la
   vraie base, crediterContribution (points-et-parrainage.js:267-290) credite en
   plus a Bob le bareme de son propre rapport `stock` fait a 120 m. Le profil de
   Bob ne reste donc pas a zero : il gagne ces points-la. Ce qui ne vient jamais,
   c'est le +15 que l'ecran vient de lui annoncer comme CONFIRME. */
note("a comparer : crediterContribution (ligne 267) ecrit `raison: \"trop loin\"` ou "
  + "`raison: \"rejeu\"` SUR LE RAPPORT quand il refuse de crediter (lignes 278 et 282). "
  + "La sortie ligne 344 de crediterEntraide, elle, n'ecrit rien du tout.");

await doit("B. Bob insiste : fbRafraichirPreuves revient 4 fois (index.html:3301-3315)", async () => {
  const lus = await serveur((db) => fbRafraichirPreuves(db, BOB, 4));
  note("ECRAN DE BOB, les 4 relances de points automatiques lisent : " + JSON.stringify(lus));
  verifier(lus.some((x) => x > 0),
    "les 4 relances lisent " + JSON.stringify(lus) + " : le client a ete concu pour attendre "
    + "un credit qui ne viendra pas (il abandonne apres la 4e, sans rien dire)");
});

await doit("C. Alice peut remercier Bob (le bouton « Merci », index.html:21806)", async () => {
  const n = await serveur((db) => compter(db, "coupsDeMain/" + ALICE + "/recus"));
  verifier(n > 0, "aucun coup de main chez Alice : la carte « On t'a aide » reste vide, "
    + "donc aucun bouton « Merci ». Bob a rendu service, Alice ne peut pas le lui dire");
});

await doit("D. quelque chose, quelque part, dit pourquoi", async () => {
  const etat = await serveur(async (db) => ({
    alertesAdmin: await compter(db, "alertesAdmin"),
    userNotifs: await compter(db, "userNotifs"),
    rep: (await getDoc(doc(db, "reports", repBob.id))).data() || {},
  }));
  note("apres la sortie ligne 344 — alertesAdmin:" + etat.alertesAdmin
    + " userNotifs:" + etat.userNotifs
    + " reports/bob.hunt:" + String(etat.rep.hunt)
    + " reports/bob.huntCredited:" + String(etat.rep.huntCredited)
    + " reports/bob.raison:" + String(etat.rep.raison));
  verifier(etat.alertesAdmin > 0 || etat.userNotifs > 0 || etat.rep.raison,
    "rien nulle part : le fondateur qui teste a deux telephones voit « +15 en attente, "
    + "confirmee par Alice » chez Bob, zero point sur le serveur, et aucune ligne a lire "
    + "pour comprendre (le plafond par paire, lui, pose bien un champ `raison`, ligne 369)");
});

/* ── LA LIGNE RESTE-T-ELLE POUR TOUJOURS ? ─────────────────────────────── */
await doit("E. la ligne « +15 en attente » finit par disparaitre d'elle-meme", async () => {
  /* index.html:15038 — une entree qui a deja un helpStatus est ignoree pour
     toujours ; la purge a 14 jours (15062) est dans le MEME si/sinon, donc
     elle ne s'applique jamais a une aide deja marquee « ok ». */
  ECRAN_BOB.scanHist[0].taggedAt = Date.now() - 400 * 86400000;   // 13 mois plus tard
  await _verifierAides(anon, "Bob");
  verifier(pendingTotal() === 0,
    "13 mois apres, la ligne du profil de Bob affiche toujours « " + ligneProfilBob()
    + " » : _verifierAides ignore une entree deja marquee helpStatus=ok (index.html:15038), "
    + "donc la purge a 14 jours (index.html:15062) ne la voit jamais. Aucun code ne relit "
    + "pointsPreuves pour resoudre un pending : la ligne est permanente");
});

/* ── LE MEME PARCOURS, AVEC UN COMPTE DE 3 JOURS ───────────────────────── */
await doit("F. le meme parcours, compte d'Alice age de 3 jours : tout arrive", async () => {
  const D2 = 42;
  await serveur(async (db) => {
    await setDoc(doc(db, "users", ALICE), { createdAt: new Date(Date.now() - 3 * 86400000) }, { merge: true });
    await setDoc(doc(db, "hunts", String(D2)), {
      drinkId: D2, drinkName: "Ramune Original",
      seekers: { [ALICE]: { lat: 50.9, lng: 4.3, at: Date.now() - 5000 } },
    });
  });
  const rb = await fbAddReport(bob, BOB, MAGASIN.id, D2, "stock", { note: "fiche|120" });
  await serveur((db) => crediterEntraide(db, rb.id));
  await pause(40);
  const ra = await fbAddReport(alice, ALICE, MAGASIN.id, D2, "stock", { note: "reponse|80" });
  const v = await serveur((db) => crediterEntraide(db, ra.id));
  const d = await serveur(async (db) => (await getDoc(doc(db, "users", BOB))).data() || {});
  const n = await serveur((db) => compter(db, "coupsDeMain/" + ALICE + "/recus"));
  verifier(v.sortie === "credite", "ligne " + v.ligne + " : " + v.sortie);
  verifier((d.pointsPreuves || 0) === 15, "Bob a " + (d.pointsPreuves || 0) + " point(s)");
  verifier(n > 0, "toujours aucun coup de main chez Alice");
  note("compte de 3 jours : " + JSON.stringify(v) + " — coupsDeMain chez Alice : " + n);
});

/* ── COMBIEN DE TEMPS DURE LA FENETRE AVEUGLE ? ────────────────────────── */
for (const heures of [1, 12, 24, 47, 49]) {
  const D = 200 + heures;
  await serveur(async (db) => {
    await setDoc(doc(db, "users", ALICE), { createdAt: new Date(Date.now() - heures * 3600000) }, { merge: true });
    await setDoc(doc(db, "hunts", String(D)), {
      drinkId: D, drinkName: "Test " + heures,
      seekers: { [ALICE]: { lat: 50.9, lng: 4.3, at: Date.now() - 5000 } },
    });
  });
  const rb = await fbAddReport(bob, BOB, MAGASIN.id, D, "stock", { note: "fiche|120" });
  await serveur((db) => crediterEntraide(db, rb.id));
  await pause(30);
  const ra = await fbAddReport(alice, ALICE, MAGASIN.id, D, "stock", { note: "reponse|80" });
  const v = await serveur((db) => crediterEntraide(db, ra.id));
  note("compte d'Alice age de " + heures + " h -> " + v.sortie + " (ligne " + v.ligne + ")");
}

await bilan(env);
