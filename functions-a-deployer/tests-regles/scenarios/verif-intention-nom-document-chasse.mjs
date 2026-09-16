/* ============================================================================
   VERIFICATION « INTENTION » — /chasseCodes : le nom du document n'est pas
   force a etre le code-barre (firestore.rules:1254-1267).

   La trouvaille a verifier dit : « toute l'unicite de la chasse repose sur
   cette convention ». Ma seule question : qu'est-ce que la contrainte
   `barcode == id` empecherait VRAIMENT, qui ne soit pas deja possible en la
   respectant ? Autrement dit : quelle est la puissance MARGINALE du trou ?

   Ce que je rejoue, a l'identique :
     - index.html:2503  window.fbProposerCodeChasse()  (doc id = String(barcode))
     - chasse-codes.js:59 poserCodeChasse()            (code = d.barcode || id)
     - firestore.rules:1254 match /chasseCodes/{barcode}
============================================================================ */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, getDocs, collection, query, where,
         serverTimestamp, increment } from "firebase/firestore";

const env   = await banc("verif-intention-nom-document-chasse");
const alice = env.authenticatedContext("alice").firestore();
const bob   = env.authenticatedContext("bob").firestore();
const carl  = env.authenticatedContext("carl").firestore();
const dave  = env.authenticatedContext("dave").firestore();

const admin = async (fn) => { let s; await env.withSecurityRulesDisabled(async (c) => { s = await fn(c.firestore()); }); return s; };

const ID_A = 1700000000001;   // orpheline : « Cusa Cola Zero »
const ID_B = 1700000000002;   // orpheline : « Cusa Cola Cherry »
const ID_C = 1700000000003;   // fiche COMPLETE : « Fritz-Kola », code deja pose
const CODE   = "5449000054197";
const CODE_C = "3068320123264";   // le code deja porte par Fritz-Kola

await admin(async (db) => {
  await setDoc(doc(db, "catalog", String(ID_A)), { id: ID_A, name: "Cusa Cola Zero",   brand: "Cusa",  cat: "Soda", createdAt: serverTimestamp() });
  await setDoc(doc(db, "catalog", String(ID_B)), { id: ID_B, name: "Cusa Cola Cherry", brand: "Cusa",  cat: "Soda", createdAt: serverTimestamp() });
  await setDoc(doc(db, "catalog", String(ID_C)), { id: ID_C, name: "Fritz-Kola",       brand: "Fritz", cat: "Soda", barcodes: [CODE_C], createdAt: serverTimestamp() });
});

/* ── window.fbProposerCodeChasse — index.html:2503, mot pour mot ─────────── */
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

/* La MEME ecriture, sous un nom de document choisi. Rien d'autre ne change. */
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

/* ── chasse-codes.js:59 poserCodeChasse, a l'identique ──────────────────── */
const CONFIRMATIONS_REQUISES = 2, POINTS_PAR_CONFIRMANT = 5;
async function poserCodeChasse(nomDoc) {
  return admin(async (db) => {
    const ref = doc(db, "chasseCodes", String(nomDoc));
    const s = await getDoc(ref);
    if (!s.exists()) return "supprime";
    const d = s.data() || {};
    if (d.etat !== "attente") return "deja-traite";
    const par = Array.isArray(d.par) ? d.par : [];
    if (par.length < CONFIRMATIONS_REQUISES) return "pas-assez";
    const code = String(d.barcode || nomDoc || "");     // chasse-codes.js:72
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

const fichesPortant = (code) => admin(async (db) => {
  const snap = await getDocs(collection(db, "catalog"));
  const out = []; snap.forEach((d) => { if (((d.data() || {}).barcodes || []).includes(code)) out.push((d.data() || {}).name); });
  return out.sort();
});
const nbDocs = () => admin(async (db) => (await getDocs(collection(db, "chasseCodes"))).size);

/* ═══ 1. LE MAL EST-IL DEJA ATTEIGNABLE EN RESPECTANT LA CONVENTION ? ══════
   Deux comptes complices, chemin canonique (nom du document = le code),
   visent volontairement la MAUVAISE boisson. Si ceci passe, la contrainte
   `barcode == id` n'aurait rien empeche du tout. */
await doitEchouer("1. un code POSE sur une boisson qui n'est pas la sienne, par le chemin canonique (nom du doc = le code)", async () => {
  await fbProposerCodeChasse(carl, "carl", ID_B, "Cusa Cola Cherry", CODE);
  await fbProposerCodeChasse(dave, "dave", ID_B, "Cusa Cola Cherry", CODE);
  const r = await poserCodeChasse(CODE);
  if (r !== "pose") throw new Error("pas pose : " + r);
});
note("1. -> fiches portant " + CODE + " apres ce seul chemin canonique : " + JSON.stringify(await fichesPortant(CODE)));

/* ═══ 2. LE CODE D'UNE AUTRE FICHE, VOLE PAR LE CHEMIN CANONIQUE ══════════
   Fritz-Kola porte deja CODE_C. Rien dans les regles ni dans la Cloud
   Function ne verifie qu'un code est libre : deux complices le recollent sur
   la Cherry — sans jamais sortir de la convention. */
await doit("2. le code de Fritz-Kola doit rester porte par la seule Fritz-Kola (vol par le chemin canonique)", async () => {
  await fbProposerCodeChasse(carl, "carl", ID_B, "Cusa Cola Cherry", CODE_C);
  await fbProposerCodeChasse(dave, "dave", ID_B, "Cusa Cola Cherry", CODE_C);
  await poserCodeChasse(CODE_C);
  const p = await fichesPortant(CODE_C);
  note("2. -> fiches portant " + CODE_C + " : " + JSON.stringify(p));
  if (p.length > 1) throw new Error(p.length + " fiches portent le meme code");
});

/* ═══ 3. LE NOMBRE DE DOCUMENTS ══════════════════════════════════════════
   La trouvaille dit : « le meme trou permet de creer autant de documents que
   de noms inventes ». Mais la contrainte `barcode == id` ne bornerait pas le
   nombre : le nom du document serait simplement force d'etre egal a un champ
   libre de 20 caracteres. On verifie en respectant la convention. */
await doit("3. 30 documents crees par un seul compte EN RESPECTANT la convention (nom = barcode)", async () => {
  const avant = await nbDocs();
  for (let i = 0; i < 30; i++) {
    const faux = "z" + String(i).padStart(3, "0");   // barcode bidon, nom du doc = ce meme barcode
    await fbProposerCodeChasse(carl, "carl", ID_B, "Cusa Cola Cherry", faux);
  }
  const apres = await nbDocs();
  note("3. -> documents /chasseCodes : " + avant + " avant, " + apres + " apres (tous conformes a `barcode == id`)");
  if (apres - avant !== 30) throw new Error("seulement " + (apres - avant) + " crees");
});

/* ═══ 4. CE QUE LA CONTRAINTE PROTEGERAIT VRAIMENT ═══════════════════════
   Le seul verrou que le nom libre contourne : « un code, une proposition ».
   Une fois chasseCodes/CODE cree (ou pose), le chemin canonique ne permet
   plus de viser une autre boisson (update n'autorise que 'par'). */
await doitEchouer("4a. chemin canonique : re-viser une AUTRE boisson sur un code deja propose", async () => {
  await updateDoc(doc(alice, "chasseCodes", CODE), { drinkId: ID_A, drinkName: "Cusa Cola Zero" });
});
await doitEchouer("4b. nom libre : la meme chose, sous un autre nom de document (c'est la puissance marginale du trou)", async () => {
  await proposerSousLeNom(alice, "alice", "nom-libre-1", ID_A, "Cusa Cola Zero", CODE);
  await proposerSousLeNom(bob,   "bob",   "nom-libre-1", ID_A, "Cusa Cola Zero", CODE);
  const r = await poserCodeChasse("nom-libre-1");
  if (r !== "pose") throw new Error("pas pose : " + r);
});
note("4. -> fiches portant " + CODE + " a la fin : " + JSON.stringify(await fichesPortant(CODE)));

/* ═══ 5. LE NOM LIBRE ARRIVE-T-IL JUSQU'A UN ECRAN ? ═════════════════════
   Chez /discoveries, le nom du document finissait dans un attribut HTML
   (rules:672). Ici, la seule lecture est fbChargerChasseCodes (index.html:2529)
   qui indexe par v.barcode — et 'barcode' est obligatoire a la creation
   (rules:1259 : `barcode is string`). Le nom du document n'est donc jamais
   affiche. On verifie que d.id ne peut pas prendre la place de v.barcode. */
await doitEchouer("5. creer une proposition SANS champ barcode (le seul cas ou le nom du document serait affiche)", async () => {
  await setDoc(doc(carl, "chasseCodes", '"><img src=x onerror=alert(1)>'), {
    drinkId: ID_B, drinkName: "Cusa Cola Cherry", par: ["carl"], etat: "attente", createdAt: serverTimestamp()
  });
});

await bilan(env);
