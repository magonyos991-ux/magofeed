/* ============================================================================
   VERIFICATION INDEPENDANTE — « le nom du document /chasseCodes n'est pas
   force a etre le code-barre »

   Ce que je rejoue, a l'identique :
     - index.html:2503  window.fbProposerCodeChasse()  — l'ecriture du client
       (doc(db,"chasseCodes", String(barcode)) : le nom du document EST le code)
     - functions-a-deployer/chasse-codes.js:53  poserCodeChasse (Cloud Function)
       (le code pose vient de `d.barcode || event.params.barcode`, ligne 72)
     - functions-a-deployer/firestore.rules:1254  match /chasseCodes/{barcode}

   La question, et une seule : les regles obligent-elles le nom du document a
   etre le code ? Et si non, qu'est-ce que ca change vraiment ?
============================================================================ */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, getDocs, collection, query, where,
         serverTimestamp, increment } from "firebase/firestore";

const env  = await banc("verif-nom-document-chasse");
const alice = env.authenticatedContext("alice").firestore();
const bob   = env.authenticatedContext("bob").firestore();
const carl  = env.authenticatedContext("carl").firestore();
const dave  = env.authenticatedContext("dave").firestore();

const admin = async (fn) => { let s; await env.withSecurityRulesDisabled(async (c) => { s = await fn(c.firestore()); }); return s; };

const ID_A = 1700000000001;   // orpheline : « Cusa Cola Zero »
const ID_B = 1700000000002;   // orpheline : « Cusa Cola Cherry »
const CODE = "5449000054197"; // un code GS1 valide, celui de la trouvaille

await admin(async (db) => {
  await setDoc(doc(db, "catalog", String(ID_A)), { id: ID_A, name: "Cusa Cola Zero",   brand: "Cusa", cat: "Soda", createdAt: serverTimestamp() });
  await setDoc(doc(db, "catalog", String(ID_B)), { id: ID_B, name: "Cusa Cola Cherry", brand: "Cusa", cat: "Soda", createdAt: serverTimestamp() });
});

/* ── window.fbProposerCodeChasse, index.html:2503, recopiee mot pour mot ──── */
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

/* La MEME ecriture, au caractere pres, mais sous un nom de document choisi.
   Rien d'autre ne change : memes champs, memes valeurs, meme ordre. */
async function proposerSousLeNom(db, uid, nomDoc, drinkId, drinkName, barcode) {
  const ref = doc(db, "chasseCodes", String(nomDoc));
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      drinkId: Number(drinkId) || drinkId,
      drinkName: String(drinkName).slice(0, 60),
      barcode: String(barcode),
      par: [uid],
      etat: "attente",
      createdAt: serverTimestamp()
    });
    return { nb: 1 };
  }
  const d = snap.data() || {};
  const par = Array.isArray(d.par) ? d.par : [];
  await updateDoc(ref, { par: par.concat([uid]) });
  return { nb: par.length + 1 };
}

/* ── fbChargerChasseCodes, index.html:2530, recopiee a l'identique ───────── */
async function fbChargerChasseCodes(db) {
  const snap = await getDocs(query(collection(db, "chasseCodes"), where("etat", "==", "attente")));
  const out = {};
  snap.forEach(function (d) {
    const v = d.data() || {};
    out[String(v.barcode || d.id)] = { drinkId: v.drinkId, nb: (v.par || []).length };
  });
  return out;
}

/* ── chasse-codes.js:53 poserCodeChasse, recopiee a l'identique ──────────── */
const CONFIRMATIONS_REQUISES = 2;
const POINTS_PAR_CONFIRMANT  = 5;
async function poserCodeChasse(nomDoc) {
  return admin(async (db) => {
    const ref = doc(db, "chasseCodes", String(nomDoc));
    const s = await getDoc(ref);
    if (!s.exists()) return "supprime";
    const d = s.data() || {};
    if (d.etat !== "attente") return "deja-traite";
    const par = Array.isArray(d.par) ? d.par : [];
    if (par.length < CONFIRMATIONS_REQUISES) return "pas-assez";
    const code = String(d.barcode || nomDoc || "");      // chasse-codes.js:72
    const drinkId = String(d.drinkId || "");
    if (!code || !drinkId) return "document-incomplet";
    await updateDoc(ref, { etat: "pose", poseLe: serverTimestamp() });
    const fiche = await getDoc(doc(db, "catalog", drinkId));
    if (!fiche.exists()) { await updateDoc(ref, { etat: "sans-suite", raison: "fiche-absente" }); return "sans-suite"; }
    const codes = (fiche.data() || {}).barcodes || [];
    if (codes.indexOf(code) === -1) {
      await setDoc(doc(db, "catalog", drinkId), { barcodes: codes.concat([code]), updatedAt: serverTimestamp() }, { merge: true });
    }
    for (const uid of par) await setDoc(doc(db, "users", String(uid)), { pts: increment(POINTS_PAR_CONFIRMANT) }, { merge: true });
    return "pose";
  });
}

const docsPortant = (code) => admin(async (db) => {
  const snap = await getDocs(collection(db, "chasseCodes"));
  const out = [];
  snap.forEach((d) => { if ((d.data() || {}).barcode === code) out.push(d.id + " -> " + (d.data() || {}).drinkName + " [" + (d.data() || {}).etat + "]"); });
  return out.sort();
});
const fichesPortant = (code) => admin(async (db) => {
  const snap = await getDocs(collection(db, "catalog"));
  const out = [];
  snap.forEach((d) => { if (((d.data() || {}).barcodes || []).includes(code)) out.push((d.data() || {}).name); });
  return out.sort();
});

/* ═══ A. LE CHEMIN NORMAL, CELUI DE L'APP ════════════════════════════════ */
await doit("A. Bob puis Alice proposent le code pour la Zero, par l'app (nom du document = le code)", async () => {
  await fbProposerCodeChasse(bob,   "bob",   ID_A, "Cusa Cola Zero", CODE);
  const r = await fbProposerCodeChasse(alice, "alice", ID_A, "Cusa Cola Zero", CODE);
  if (r.nb !== 2) throw new Error("nb attendu 2, recu " + r.nb);
});

/* ═══ B. LA CONVENTION EST-ELLE UNE REGLE ? ══════════════════════════════ */
/* /discoveries l'impose (rules:689 : request.resource.data.barcode == id).
   /chasseCodes (rules:1256-1261) liste les champs autorises mais ne relie
   jamais 'barcode' au nom du document. */
await doitEchouer("B. les regles doivent refuser un document dont le nom n'est pas le code (comme rules:689 pour /discoveries)", async () => {
  await proposerSousLeNom(carl, "carl", "un-nom-libre", ID_B, "Cusa Cola Cherry", CODE);
});

await doit("B. combien de documents portent alors le meme code ?", async () => {
  const vus = await docsPortant(CODE);
  note("B. -> documents /chasseCodes portant " + CODE + " : " + JSON.stringify(vus));
  if (vus.length !== 1) throw new Error(vus.length + " documents visent le meme code");
});

/* ═══ C. COMBIEN DE FOIS PEUT-ON RECOMMENCER ? ═══════════════════════════ */
await doit("C. un seul compte ne peut pas creer 20 documents de plus pour le meme code", async () => {
  for (let i = 0; i < 20; i++) {
    await proposerSousLeNom(carl, "carl", "spam-" + i, ID_B, "Cusa Cola Cherry", CODE).catch(() => {});
  }
  const vus = await docsPortant(CODE);
  note("C. -> total de documents portant " + CODE + " apres 20 essais d'un SEUL compte : " + vus.length);
  if (vus.length > 2) throw new Error(vus.length + " documents portent le meme code");
});

/* ═══ D. CE QUE LA CLOUD FUNCTION EN FAIT ════════════════════════════════ */
await doit("D. les deux documents atteignent 2 confirmations et partent au catalogue", async () => {
  await proposerSousLeNom(dave, "dave", "un-nom-libre", ID_B, "Cusa Cola Cherry", CODE);
  const r1 = await poserCodeChasse(CODE);
  const r2 = await poserCodeChasse("un-nom-libre");
  note("D. -> poserCodeChasse(\"" + CODE + "\") = " + r1 + " ; poserCodeChasse(\"un-nom-libre\") = " + r2);
  if (r1 !== "pose" || r2 !== "pose") throw new Error("les deux n'ont pas ete posees : " + r1 + " / " + r2);
});
await doit("D. apres la pose, UN SEUL produit du catalogue porte ce code (sinon le scan est un tirage au sort)", async () => {
  const p = await fichesPortant(CODE);
  note("D. -> fiches du catalogue portant " + CODE + " : " + JSON.stringify(p));
  if (p.length !== 1) throw new Error(p.length + " fiches portent le meme code : " + JSON.stringify(p));
});

/* ═══ E. LE VERROU « DEJA POSE » TIENT-IL ? ══════════════════════════════ */
/* Par le chemin de l'app, une fois etat='pose', plus personne ne peut rouvrir
   la chasse pour ce code : le document existe, et l'update n'autorise que
   'par' sur un document en 'attente'. C'est ce verrou que le nom libre
   contourne : il suffit d'un autre nom. */
await doitEchouer("E. par le chemin de l'app, on ne peut pas rouvrir une chasse deja posee", async () => {
  await fbProposerCodeChasse(carl, "carl", ID_B, "Cusa Cola Cherry", CODE);
  const d = await admin(async (db) => (await getDoc(doc(db, "chasseCodes", CODE))).data() || {});
  if (d.etat !== "attente") throw new Error("le document reste en etat '" + d.etat + "' : la chasse n'a pas ete rouverte");
});
await doitEchouer("E. avec un nom libre, on ne peut pas non plus rouvrir une chasse deja posee", async () => {
  await proposerSousLeNom(carl, "carl", "deuxieme-tour", ID_B, "Cusa Cola Cherry", CODE);
});

/* ═══ F. CE QUE L'ECRAN LIRAIT ══════════════════════════════════════════ */
await doit("F. fbChargerChasseCodes ne perd aucune proposition en route", async () => {
  await proposerSousLeNom(bob,  "bob",  "troisieme-tour", ID_A, "Cusa Cola Zero",   CODE);
  await proposerSousLeNom(dave, "dave", "quatrieme-tour", ID_B, "Cusa Cola Cherry", CODE);
  const liste = await fbChargerChasseCodes(alice);
  const enAttente = await admin(async (db) => {
    const snap = await getDocs(query(collection(db, "chasseCodes"), where("etat", "==", "attente")));
    return snap.size;
  });
  note("F. -> " + enAttente + " propositions en attente dans la base ; fbChargerChasseCodes en affiche " + Object.keys(liste).length +
       " (elle indexe par v.barcode, index.html:2535) ; la ligne montree pour " + CODE + " : " + JSON.stringify(liste[CODE] || null));
  if (Object.keys(liste).length !== enAttente) throw new Error(enAttente + " propositions en base, " + Object.keys(liste).length + " affichees");
});

await bilan(env);
