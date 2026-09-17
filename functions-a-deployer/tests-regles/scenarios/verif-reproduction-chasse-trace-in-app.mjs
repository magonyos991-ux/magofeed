/* ============================================================================
   VERIFICATION : « Rien de la chasse ne laisse de trace dans l'application ;
   tout repose sur la poussee telephone » — est-ce vrai ?
   ----------------------------------------------------------------------------
   La trouvaille dit que, si la personne a refuse les notifications ou si le
   jeton FCM a expire, tout le parcours de la chasse est silencieux et l'app
   n'a rien a lui montrer en rouvrant. On ne teste donc PAS userNotifs : on
   teste s'il reste, dans la base, quelque chose que l'application relit et
   affiche au chercheur — sans qu'aucune poussee ne parte.

   Fonctions rejouees a l'identique :
     index.html:5129-5148   window.fbCoupsDeMain      (lue et recopiee)
     index.html:5149-5153   window.fbDireMerci
     index.html:5541-5552   window.fbLoadMyNotifs
     index.html:3301-3310   window.fbRafraichirPreuves (lecture pointsPreuves)
     index.html:21775-21800 renderCoupsDeMain (« On t'a aidé » / « X t'a donné
                            un coup de main ») — l'ecran alimente par fbCoupsDeMain
   Cote serveur (l'emulateur n'execute pas les Cloud Functions : Admin SDK) :
     points-et-parrainage.js:404-430  noterCoupDeMain
     points-et-parrainage.js:139-159  crediter
     points-et-parrainage.js:376-381  la fin de crediterEntraide (marque du rapport)
   ========================================================================== */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import {
  doc, setDoc, getDoc, getDocs, collection, query, where, orderBy, limit,
  serverTimestamp, updateDoc, increment,
} from "firebase/firestore";

const env = await banc("verif-chasse-trace-in-app");
const ALICE = "alice", BOB = "bob";
const alice = env.authenticatedContext(ALICE).firestore();
const bob = env.authenticatedContext(BOB).firestore();

const serveur = async (fn) => {
  let out;
  await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); });
  return out;
};
const verifier = (cond, quoi) => { if (!cond) throw new Error(quoi); };

const BOISSON = 7, MAGASIN = "st-delhaize-flagey";

/* ── index.html:5129-5148 — window.fbCoupsDeMain, recopiee ─────────────── */
async function fbCoupsDeMain(db, uid) {
  const q = query(collection(db, "coupsDeMain", uid, "recus"), orderBy("at", "desc"), limit(12));
  const snap = await getDocs(q);
  const out = [];
  snap.forEach((d) => {
    const x = d.data() || {};
    out.push({ id: d.id, aidantUid: x.aidantUid || null, aidantPseudo: x.aidantPseudo || null,
      drinkId: x.drinkId, storeId: x.storeId || "", at: x.at || 0, merci: x.merci === true });
  });
  return out;
}
/* ── index.html:5149-5153 — window.fbDireMerci ─────────────────────────── */
async function fbDireMerci(db, uid, id) {
  await updateDoc(doc(db, "coupsDeMain", uid, "recus", String(id)), { merci: true });
  return true;
}
/* ── index.html:5541-5552 — window.fbLoadMyNotifs ──────────────────────── */
async function fbLoadMyNotifs(db, uid) {
  const snap = await getDocs(query(collection(db, "userNotifs"), where("to", "==", uid), limit(20)));
  const rows = [];
  snap.forEach((d) => { const x = d.data(); x.docId = d.id; rows.push(x); });
  return rows;
}
/* ── points-et-parrainage.js:404-430 — noterCoupDeMain ─────────────────── */
async function noterCoupDeMain(db, uidChercheur, aide) {
  if (!uidChercheur || !aide || !aide.by) return null;
  let pseudo = null;
  const ua = await getDoc(doc(db, "users", aide.by));
  const da = ua.exists() ? (ua.data() || {}) : {};
  if (da.aideDiscrete !== true && typeof da.pseudo === "string") {
    pseudo = da.pseudo.slice(0, 24);
    if (pseudo === "Explorateur") pseudo = null;
  }
  const quand = Math.floor(Date.now() / 3600000) * 3600000;
  const payload = {
    aidantUid: pseudo ? String(aide.by) : null,
    aidantPseudo: pseudo,
    drinkId: Number(aide.drinkId),
    storeId: String(aide.storeId || ""),
    at: quand,
    merci: false,
  };
  await setDoc(doc(db, "coupsDeMain", uidChercheur, "recus", aide.id), payload, { merge: true });
  return payload;
}
/* ── points-et-parrainage.js:139-159 — crediter (part utile) ───────────── */
async function crediter(db, uid, montant, motif) {
  await setDoc(doc(db, "users", uid), {
    pointsPreuves: increment(montant), pointsMaj: serverTimestamp(),
    dernierMotif: String(motif).slice(0, 40),
  }, { merge: true });
  return montant;
}

/* ════ MISE EN PLACE : le parcours a deja eu lieu, AUCUNE poussee n'est
   partie (Alice a refuse les notifications ; pas de jeton FCM nulle part). */
await doit("Bob a un pseudo choisi (sinon le serveur l'efface, ligne 412)", async () => {
  await setDoc(doc(bob, "users", BOB), { pseudo: "Bob" }, { merge: true });
});
const REP = "rep-bob-1";
await serveur(async (db) => {
  await setDoc(doc(db, "reports", REP), {
    by: BOB, type: "stock", storeId: MAGASIN, drinkId: BOISSON, hunt: true,
    createdAt: serverTimestamp(),
  });
  // fin de crediterEntraide (points-et-parrainage.js:376-381)
  const verse = await crediter(db, BOB, 12, "entraide");
  await setDoc(doc(db, "reports", REP), {
    huntCredited: true, huntCreditedBy: ALICE, huntCreditedAt: serverTimestamp(), huntCreditedPts: verse,
  }, { merge: true });
  await noterCoupDeMain(db, ALICE, { id: REP, by: BOB, drinkId: BOISSON, storeId: MAGASIN });
});

/* ════ 1. COTE ALICE : que reste-t-il, sans aucune poussee ? ════════════ */
let recus = [];
await doit("SANS aucune poussee, Alice rouvre l'app et trouve la chasse dans la base (fbCoupsDeMain, index.html:5129)", async () => {
  recus = await fbCoupsDeMain(alice, ALICE);
  verifier(recus.length === 1, "Alice a " + recus.length + " coup(s) de main, attendu 1");
});
await doit("cette trace designe la BONNE boisson, le BON magasin et QUI a aide (renderCoupsDeMain, index.html:21775)", async () => {
  verifier(Number(recus[0].drinkId) === BOISSON, "mauvaise boisson : " + recus[0].drinkId);
  verifier(String(recus[0].storeId) === MAGASIN, "mauvais magasin : " + recus[0].storeId);
  verifier(recus[0].aidantPseudo === "Bob", "aidantPseudo : " + JSON.stringify(recus[0].aidantPseudo));
});
note("ce que l'ecran « On t'a aidé » affiche a Alice : " + JSON.stringify(recus[0] || null));
await doit("et elle peut agir dessus sans aucune poussee : le bouton Merci part (fbDireMerci, index.html:5149)", async () => {
  await fbDireMerci(alice, ALICE, recus[0].id);
  const r = await fbCoupsDeMain(alice, ALICE);
  verifier(r[0].merci === true, "le merci n'est pas enregistre");
});
await doit("la boite userNotifs, elle, reste vide pour une chasse (fbLoadMyNotifs, index.html:5541)", async () => {
  const rows = await fbLoadMyNotifs(alice, ALICE);
  verifier(rows.length === 0, "userNotifs contient " + rows.length + " ligne(s)");
});
note("userNotifs n'est PAS la boite de la chasse : son commentaire (index.html:5530-5531) la dit faite pour « prevenir l'auteur d'une decouverte quand elle entre au catalogue, ou quand sa photo doit etre refaite » — deux gestes d'administrateur.");

/* ════ 2. COTE BOB : que reste-t-il de son coup de main ? ═══════════════ */
await doit("Bob relit SON rapport et y voit que son coup de main a ete credite (regles 988)", async () => {
  const s = await getDoc(doc(bob, "reports", REP));
  verifier(s.exists(), "Bob ne peut pas lire son propre rapport");
  const d = s.data() || {};
  verifier(d.huntCredited === true && Number(d.huntCreditedPts) > 0,
    "le rapport ne porte pas la marque du credit : " + JSON.stringify(d.huntCredited) + "/" + JSON.stringify(d.huntCreditedPts));
});
await doit("Bob relit ses points et voit qu'ils ont bouge (fbRafraichirPreuves, index.html:3301)", async () => {
  const s = await getDoc(doc(bob, "users", BOB));
  verifier(Number((s.data() || {}).pointsPreuves) > 0, "pointsPreuves vaut " + JSON.stringify((s.data() || {}).pointsPreuves));
});
await doit("mais AUCUN document ne dit a Bob qu'on l'a REMERCIE (ni coupsDeMain, ni userNotifs)", async () => {
  const cdm = await getDocs(query(collection(bob, "coupsDeMain", BOB, "recus"), orderBy("at", "desc"), limit(12)));
  const nt = await fbLoadMyNotifs(bob, BOB);
  verifier(cdm.docs.length + nt.length === 0,
    "il existe " + (cdm.docs.length + nt.length) + " document(s) chez Bob — la trouvaille se trompe sur ce point");
});
note("Bob : le merci lui-meme ne voyage que par FCM (points-et-parrainage.js:450 pushToUser). Ce qui reste dans la base cote Bob, c'est le credit (huntCreditedPts, pointsPreuves), pas la gratitude.");

/* ════ 3. LE CHEMIN PUREMENT LOCAL, SANS SERVEUR NI POUSSEE ════════════ */
note("Troisieme trace, hors base : checkWatches (index.html:15073-15100) tourne a chaque retour a l'accueil (index.html:6465, 13323, 27109). Des que le magasin porte la boisson veillee, il appelle pushActivity({type:'found', title:'« X » reperee pres de toi'}), persiste dans localStorage par _saveActivity (index.html:14457) et compte dans la pastille de la cloche (refreshBell, 14460). Aucun FCM n'intervient.");

await bilan(env);
