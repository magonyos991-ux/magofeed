/* ============================================================================
   VERIFICATION INDEPENDANTE — « un code deja porte par une autre fiche est
   vole sans aucun controle ».

   CE QUI EST REJOUE, A L'IDENTIQUE :
     - index.html:2503   window.fbProposerCodeChasse()   (l'ecriture client)
     - index.html:2492   window.fbSetCatalogBarcodes()   (la pose ADMIN)
     - index.html:23532  le test « prise » du chemin ADMIN (renderFichesSansCode)
     - functions-a-deployer/chasse-codes.js:63-130  poserCodeChasse (la Cloud
       Function), verrou par TRANSACTION compris, ligne 104 comprise.
     - functions-a-deployer/firestore.rules:1254  match /chasseCodes/{barcode}

   Le banc n'execute pas les Cloud Functions : poserCodeChasse est recopiee ici
   et jouee avec l'Admin SDK (withSecurityRulesDisabled), comme en production.
============================================================================ */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, getDocs, collection,
         serverTimestamp, runTransaction } from "firebase/firestore";

const env  = await banc("verif-code-vole");
const alice = env.authenticatedContext("alice").firestore();
const bob   = env.authenticatedContext("bob").firestore();
const carl  = env.authenticatedContext("carl").firestore();
const dina  = env.authenticatedContext("dina").firestore();

const admin = async (fn) => { let s; await env.withSecurityRulesDisabled(async (c) => { s = await fn(c.firestore()); }); return s; };

/* Le catalogue : une fiche COMPLETE (Fritz-Kola, qui porte deja son code) et
   deux fiches orphelines nees d'une proposition photo (id >= 1e12, sans
   barcodes) — exactement ce que boissonsOrphelines() (index.html:23491)
   ramasse. */
const ID_FRITZ  = 1700000000010;   // complete, porte CODE_FRITZ
const ID_ZERO   = 1700000000011;   // orpheline
const ID_CHERRY = 1700000000012;   // orpheline
const CODE_FRITZ = "3068320123264";  // GS1 valide, DEJA sur Fritz-Kola
const CODE_TARD  = "5449000054197";  // GS1 valide, arrivera sur Fritz-Kola EN COURS DE ROUTE

await admin(async (db) => {
  await setDoc(doc(db, "catalog", String(ID_FRITZ)),  { id: ID_FRITZ,  name: "Fritz-Kola",       brand: "Fritz", cat: "Soda", barcodes: [CODE_FRITZ], createdAt: serverTimestamp() });
  await setDoc(doc(db, "catalog", String(ID_ZERO)),   { id: ID_ZERO,   name: "Cusa Cola Zero",   brand: "Cusa",  cat: "Soda", createdAt: serverTimestamp() });
  await setDoc(doc(db, "catalog", String(ID_CHERRY)), { id: ID_CHERRY, name: "Cusa Cola Cherry", brand: "Cusa",  cat: "Soda", createdAt: serverTimestamp() });
});

/* ── window.fbProposerCodeChasse — index.html:2503, recopiee mot pour mot ─── */
async function fbProposerCodeChasse(db, uid, drinkId, drinkName, barcode) {
  var ref = doc(db, "chasseCodes", String(barcode));
  var snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      drinkId: Number(drinkId) || drinkId,
      drinkName: String(drinkName).slice(0, 60),
      barcode: String(barcode),
      par: [uid],
      etat: "attente",
      createdAt: serverTimestamp()
    });
    return { nb: 1, deja: false };
  }
  var d = snap.data() || {};
  var par = Array.isArray(d.par) ? d.par : [];
  if (d.etat !== "attente") return { nb: par.length, deja: true, pose: true };
  if (par.indexOf(uid) !== -1) return { nb: par.length, deja: true };
  await updateDoc(ref, { par: par.concat([uid]) });
  return { nb: par.length + 1, deja: false };
}

/* ── chasse-codes.js — poserCodeChasse, verrou transactionnel compris ────── */
const CONFIRMATIONS_REQUISES = 2;
const POINTS_PAR_CONFIRMANT  = 5;
async function poserCodeChasse(barcodeDocId) {
  return admin(async (db) => {
    const ref = doc(db, "chasseCodes", String(barcodeDocId));
    const s0 = await getDoc(ref);
    if (!s0.exists()) return "supprime";
    const d = s0.data() || {};
    if (d.etat !== "attente") return "deja-traite";
    const par = Array.isArray(d.par) ? d.par : [];
    if (par.length < CONFIRMATIONS_REQUISES) return "pas-assez";
    const code = String(d.barcode || barcodeDocId || "");
    const drinkId = String(d.drinkId || "");
    if (!code || !drinkId) return "document-incomplet";
    /* le VERROU, chasse-codes.js:85-93 */
    const aPoser = await runTransaction(db, async (t) => {
      const s = await t.get(ref);
      const v = s.exists() ? (s.data() || {}) : {};
      if (v.etat !== "attente") return false;
      t.update(ref, { etat: "pose", poseLe: serverTimestamp() });
      return true;
    }).catch(() => false);
    if (!aPoser) return "verrou";
    const fiche = await getDoc(doc(db, "catalog", drinkId));
    if (!fiche.exists()) { await updateDoc(ref, { etat: "sans-suite", raison: "fiche-absente" }); return "sans-suite"; }
    /* chasse-codes.js:103-109 — LE SEUL CONTROLE : la fiche VISEE porte-t-elle
       deja ce code ? Rien sur les AUTRES fiches du catalogue. */
    const codes = (fiche.data() || {}).barcodes || [];
    if (codes.indexOf(code) === -1) {
      await setDoc(doc(db, "catalog", drinkId),
        { barcodes: codes.concat([code]), updatedAt: serverTimestamp() }, { merge: true });
    }
    return "pose";
  });
}

/* Qui, dans TOUT le catalogue, porte ce code ? C'est la seule question qui
   compte : au scan, l'app cherche la fiche par son code. */
const porteurs = (code) => admin(async (db) => {
  const snap = await getDocs(collection(db, "catalog"));
  const out = [];
  snap.forEach((d) => { const v = d.data() || {}; if ((v.barcodes || []).includes(code)) out.push(v.name); });
  return out.sort();
});
const lireCatalogue = (id) => admin(async (db) => (await getDoc(doc(db, "catalog", String(id)))).data() || {});

/* ═══ A. LE CHEMIN ADMIN : il REFUSE, et dit pourquoi ════════════════════ */
/* index.html:23532-23535, recopie :
     var prise=(window.DRINKS||[]).find(function(x){
       return x!==d && x.barcodes && x.barcodes.indexOf(c)!==-1; });
     if(prise){toast("Ce code est deja sur « "+prise.name+" »"); ... return;} */
await doit("A. le chemin ADMIN refuse de poser CODE_FRITZ sur la Zero : « Ce code est deja sur Fritz-Kola »", async () => {
  const DRINKS = await admin(async (db) => { const s = await getDocs(collection(db, "catalog")); const o = []; s.forEach((d) => o.push(d.data() || {})); return o; });
  const d = DRINKS.find((x) => Number(x.id) === ID_ZERO);
  const prise = DRINKS.find((x) => x !== d && x.barcodes && x.barcodes.indexOf(CODE_FRITZ) !== -1);
  if (!prise) throw new Error("le garde ADMIN n'a rien vu");
  note("A. -> l'admin voit : « Ce code est deja sur « " + prise.name + " » » ; fbSetCatalogBarcodes n'est jamais appelee.");
  const fiche = await lireCatalogue(ID_ZERO);
  if ((fiche.barcodes || []).length) throw new Error("la Zero a recu un code malgre le refus");
});

/* ═══ B. LE CHEMIN COMMUNAUTAIRE : personne ne pose la question ══════════ */
await doit("B. les regles acceptent une proposition visant une fiche qui porte DEJA ce code ailleurs (rules:1256)", async () => {
  const r = await fbProposerCodeChasse(bob, "bob", ID_ZERO, "Cusa Cola Zero", CODE_FRITZ);
  if (r.nb !== 1) throw new Error("nb attendu 1, recu " + r.nb);
});
await doit("B. une deuxieme personne confirme : l'app lui dit « le code va etre pose pour tout le monde »", async () => {
  const r = await fbProposerCodeChasse(carl, "carl", ID_ZERO, "Cusa Cola Zero", CODE_FRITZ);
  if (r.nb !== 2) throw new Error("nb attendu 2, recu " + r.nb);
});
await doit("B. apres la pose, UN SEUL produit du catalogue porte CODE_FRITZ", async () => {
  const etat = await poserCodeChasse(CODE_FRITZ);
  const p = await porteurs(CODE_FRITZ);
  note("B. -> poserCodeChasse : « " + etat + " » ; fiches portant " + CODE_FRITZ + " : " + JSON.stringify(p));
  if (p.length !== 1) throw new Error(p.length + " fiches portent le meme code : " + JSON.stringify(p));
});

/* ═══ C. SANS MALICE NI CATALOGUE PERIME : la simple course ══════════════
   Alice confirme CODE_TARD pour la Cherry a 10h. A 10h05, l'admin pose
   legitimement CODE_TARD sur Fritz-Kola (fbSetCatalogBarcodes, index.html:2492)
   — son garde ne voit rien, la Cherry ne porte encore aucun code. A 10h10,
   Dina confirme. Personne n'a menti, personne n'avait un catalogue perime au
   moment de son geste. */
await doit("C. 10h00 — Alice confirme CODE_TARD pour la Cherry (aucune fiche ne le porte encore)", async () => {
  const p = await porteurs(CODE_TARD);
  if (p.length !== 0) throw new Error("le code est deja pris : " + JSON.stringify(p));
  const r = await fbProposerCodeChasse(alice, "alice", ID_CHERRY, "Cusa Cola Cherry", CODE_TARD);
  if (r.nb !== 1) throw new Error("nb attendu 1, recu " + r.nb);
});
await doit("C. 10h05 — l'admin pose legitimement CODE_TARD sur Fritz-Kola (fbSetCatalogBarcodes)", async () => {
  await admin(async (db) => {
    const f = await getDoc(doc(db, "catalog", String(ID_FRITZ)));
    const codes = ((f.data() || {}).barcodes || []).concat([CODE_TARD]);
    await setDoc(doc(db, "catalog", String(ID_FRITZ)), { barcodes: codes.map(String), updatedAt: serverTimestamp() }, { merge: true });
  });
  const p = await porteurs(CODE_TARD);
  if (p.length !== 1) throw new Error("pose admin ratee : " + JSON.stringify(p));
});
await doit("C. 10h10 — Dina confirme ; la Cloud Function relit la fiche VISEE et ne voit rien venir", async () => {
  await fbProposerCodeChasse(dina, "dina", ID_CHERRY, "Cusa Cola Cherry", CODE_TARD);
  const etat = await poserCodeChasse(CODE_TARD);
  const p = await porteurs(CODE_TARD);
  note("C. -> poserCodeChasse : « " + etat + " » ; fiches portant " + CODE_TARD + " : " + JSON.stringify(p));
  if (p.length !== 1) throw new Error(p.length + " fiches portent le meme code : " + JSON.stringify(p));
});

/* ═══ D. CE QUE LE SCAN RENVOIE ENSUITE ═════════════════════════════════ */
note("D. au scan, l'app cherche la fiche par son code : avec deux fiches porteuses, la reponse depend de l'ordre du catalogue.");
await doit("D. chaque code du catalogue ne designe qu'un produit", async () => {
  const doublons = await admin(async (db) => {
    const snap = await getDocs(collection(db, "catalog"));
    const par = {};
    snap.forEach((d) => { const v = d.data() || {}; (v.barcodes || []).forEach((c) => { (par[c] = par[c] || []).push(v.name); }); });
    return Object.keys(par).filter((c) => par[c].length > 1).map((c) => c + " -> " + JSON.stringify(par[c].sort()));
  });
  note("D. -> codes portes par plusieurs fiches : " + JSON.stringify(doublons));
  if (doublons.length) throw new Error(doublons.length + " code(s) partage(s) : " + doublons.join(" ; "));
});

await bilan(env);
