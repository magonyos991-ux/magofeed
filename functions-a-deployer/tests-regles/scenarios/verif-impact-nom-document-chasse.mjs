/* ============================================================================
   VERIFICATION D'IMPACT — « le nom du document n'est pas force a etre le code »
   ----------------------------------------------------------------------------
   Trouvaille a verifier : firestore.rules:1256 (match /chasseCodes/{barcode})
   n'exige pas request.resource.data.barcode == id, contrairement a
   /discoveries (rules:689).

   UNE SEULE QUESTION : QU'EST-CE QUE CA CHANGE POUR QUELQU'UN ?
   Donc on ne se contente pas de montrer que la regle manque : on mesure ce que
   le trou AJOUTE, en rejouant a cote le meme abus SANS nom libre (c'est-a-dire
   dans le monde ou le correctif est deja pose).

   CE QUE CE SCENARIO REJOUE, LIGNE PAR LIGNE :
     - index.html:2503   window.fbProposerCodeChasse()  la seule ecriture de l'app
     - index.html:2529   window.fbChargerChasseCodes()  la seule lecture de l'app
     - index.html:23456  proposerChasse()               l'ecran « Oui, c'est bien elle »
     - index.html:9600   drinkForBarcode()              ce que le scan repond
     - index.html:10903  mergeCatalog()                 l'ordre de DRINKS (premier arrive)
     - functions-a-deployer/chasse-codes.js:78          const code = d.barcode || params.barcode
============================================================================ */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, getDocs, collection, query, where,
         serverTimestamp, increment } from "firebase/firestore";

const env = await banc("verif-impact-nom-document-chasse");
const bob     = env.authenticatedContext("bob").firestore();
const carl    = env.authenticatedContext("carl").firestore();
/* Deux comptes ANONYMES : c'est ce que l'app cree toute seule a la premiere
   ouverture. Aucun e-mail, aucun mot de passe, aucun cout. */
const fant1 = env.authenticatedContext("fant1", { firebase: { sign_in_provider: "anonymous", identities: {} } }).firestore();
const fant2 = env.authenticatedContext("fant2", { firebase: { sign_in_provider: "anonymous", identities: {} } }).firestore();

const admin = async (fn) => { let s; await env.withSecurityRulesDisabled(async (c) => { s = await fn(c.firestore()); }); return s; };

const ID_ZERO   = 1700000000001;  // orpheline (proposition PHOTO) : « Cusa Cola Zero »
const ID_CHERRY = 1700000000002;  // orpheline : « Cusa Cola Cherry »
const ID_FRITZ  = 1700000000003;  // fiche complete, code deja pose

const CODE_ZERO  = "5449000000996";  // le vrai code de la Zero
const CODE_FRITZ = "3068320123264";  // deja dans catalog/FRITZ.barcodes
const CODE_NEUF  = "5000112637922";  // jamais propose, nulle part

await admin(async (db) => {
  await setDoc(doc(db, "catalog", String(ID_ZERO)),   { id: ID_ZERO,   name: "Cusa Cola Zero",   brand: "Cusa",  cat: "Soda", createdAt: serverTimestamp() });
  await setDoc(doc(db, "catalog", String(ID_CHERRY)), { id: ID_CHERRY, name: "Cusa Cola Cherry", brand: "Cusa",  cat: "Soda", createdAt: serverTimestamp() });
  await setDoc(doc(db, "catalog", String(ID_FRITZ)),  { id: ID_FRITZ,  name: "Fritz-Kola",       brand: "Fritz", cat: "Soda", barcodes: [CODE_FRITZ], createdAt: serverTimestamp() });
});

/* ── window.fbProposerCodeChasse — index.html:2503, a l'identique ────────── */
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

/* ── window.fbChargerChasseCodes — index.html:2529, a l'identique ────────── */
async function fbChargerChasseCodes(db) {
  var snap = await getDocs(query(collection(db, "chasseCodes"), where("etat", "==", "attente")));
  var out = {};
  snap.forEach(function (d) {
    var v = d.data() || {};
    out[String(v.barcode || d.id)] = { drinkId: v.drinkId, nb: (v.par || []).length };
  });
  return out;
}

/* ── chasse-codes.js — poserCodeChasse, a l'identique (le banc n'execute pas
      les Cloud Functions). Elle se declenche sur chasseCodes/{barcode}, donc
      sur N'IMPORTE QUEL nom de document. ─────────────────────────────────── */
const CONFIRMATIONS_REQUISES = 2, POINTS_PAR_CONFIRMANT = 5;
async function poserCodeChasse(docId) {
  return admin(async (db) => {
    const ref = doc(db, "chasseCodes", String(docId));
    const s = await getDoc(ref);
    if (!s.exists()) return "supprime";
    const d = s.data() || {};
    if (d.etat !== "attente") return "deja-traite";
    const par = Array.isArray(d.par) ? d.par : [];
    if (par.length < CONFIRMATIONS_REQUISES) return "pas-assez";
    const code = String(d.barcode || docId || "");       // chasse-codes.js:78
    const drinkId = String(d.drinkId || "");
    if (!code || !drinkId) return "document-incomplet";
    await updateDoc(ref, { etat: "pose", poseLe: serverTimestamp() });
    const fiche = await getDoc(doc(db, "catalog", drinkId));
    if (!fiche.exists()) { await updateDoc(ref, { etat: "sans-suite", raison: "fiche-absente" }); return "sans-suite"; }
    const codes = (fiche.data() || {}).barcodes || [];
    if (codes.indexOf(code) === -1)
      await setDoc(doc(db, "catalog", drinkId), { barcodes: codes.concat([code]), updatedAt: serverTimestamp() }, { merge: true });
    for (const uid of par)
      await setDoc(doc(db, "users", String(uid)), { pts: increment(POINTS_PAR_CONFIRMANT) }, { merge: true });
    return "pose";
  });
}

/* Ce que le scan repondra : mergeCatalog (index.html:10903) empile les fiches
   dans l'ordre du catalogue, drinkForBarcode (index.html:9600) prend la
   PREMIERE qui porte le code. */
const porteursDuCode = (code) => admin(async (db) => {
  const snap = await getDocs(collection(db, "catalog"));
  const out = [];
  snap.forEach((d) => { const v = d.data() || {}; if ((v.barcodes || []).includes(code)) out.push(v.name); });
  return out;
});
const lireCatalogue = (id) => admin(async (db) => (await getDoc(doc(db, "catalog", String(id)))).data() || {});

/* ═══ A. LA TROUVAILLE, TELLE QUELLE ══════════════════════════════════════ */

await doit("A1. Bob et Carl font la chasse par l'app : le code de la Zero est pose pour tout le monde", async () => {
  await fbProposerCodeChasse(bob, "bob", ID_ZERO, "Cusa Cola Zero", CODE_ZERO);
  const r = await fbProposerCodeChasse(carl, "carl", ID_ZERO, "Cusa Cola Zero", CODE_ZERO);
  if (r.nb !== 2) throw new Error("nb attendu 2, recu " + r.nb);
  const etat = await poserCodeChasse(CODE_ZERO);
  const fiche = await lireCatalogue(ID_ZERO);
  if (etat !== "pose" || !(fiche.barcodes || []).includes(CODE_ZERO)) throw new Error("la chasse n'a pas abouti : " + etat);
});
note("A1. l'app ecrit TOUJOURS sous doc(db,'chasseCodes',String(barcode)) — index.html:2506. Aucun utilisateur de l'app ne peut creer un document au nom different.");

await doitEchouer("A2. les regles refusent un document dont le nom n'est pas le code (comme /discoveries, rules:689)", async () => {
  await setDoc(doc(fant1, "chasseCodes", "cadeau-2026"), {
    drinkId: ID_CHERRY, drinkName: "Cusa Cola Cherry", barcode: CODE_ZERO,
    par: ["fant1"], etat: "attente", createdAt: serverTimestamp() });
});
await doit("A3. un deuxieme compte anonyme du meme telephone confirme ce document", async () => {
  await updateDoc(doc(fant2, "chasseCodes", "cadeau-2026"), { par: ["fant1", "fant2"] });
});
await doit("A4. apres la pose, UN SEUL produit du catalogue porte le code de la Zero", async () => {
  const etat = await poserCodeChasse("cadeau-2026");
  const porteurs = await porteursDuCode(CODE_ZERO);
  note("A4. -> poserCodeChasse(« cadeau-2026 ») a repondu « " + etat + " » ; fiches portant " + CODE_ZERO + " : " + JSON.stringify(porteurs));
  note("A4. -> ce que voit la personne qui scanne sa Zero : drinkForBarcode (index.html:9600) rend la PREMIERE fiche du catalogue qui porte le code — « " + (porteurs[0] || "?") + " ».");
  if (porteurs.length !== 1) throw new Error(porteurs.length + " fiches portent le meme code : " + JSON.stringify(porteurs));
});

/* ═══ B. CE QUE LE CORRECTIF APPORTERAIT VRAIMENT ═════════════════════════
   Le monde d'apres le correctif = on ne peut ecrire que sous doc-id == code.
   On rejoue les memes abus dans ce monde-la. */

await doitEchouer("B1. sous le nom = le code, le verrou tient : on ne peut pas re-proposer un code DEJA POSE (rules:1249 le promet)", async () => {
  await setDoc(doc(fant1, "chasseCodes", CODE_ZERO), {
    drinkId: ID_CHERRY, drinkName: "Cusa Cola Cherry", barcode: CODE_ZERO,
    par: ["fant1"], etat: "attente", createdAt: serverTimestamp() });
});
note("B1. c'est donc bien ce que le nom libre contourne : le verrou « une fois pose, ce code ne bouge plus ».");

await doit("B2. MAIS sans nom libre, deux comptes anonymes posent quand meme n'importe quel code JAMAIS propose sur la boisson de leur choix", async () => {
  await fbProposerCodeChasse(fant1, "fant1", ID_CHERRY, "Cusa Cola Cherry", CODE_NEUF);
  await fbProposerCodeChasse(fant2, "fant2", ID_CHERRY, "Cusa Cola Cherry", CODE_NEUF);
  const etat = await poserCodeChasse(CODE_NEUF);
  const fiche = await lireCatalogue(ID_CHERRY);
  note("B2. -> « " + etat + " » ; catalog/" + ID_CHERRY + " (Cherry).barcodes = " + JSON.stringify(fiche.barcodes || []) + " — doc-id == code, correctif applique ou non, meme resultat.");
  if (!(fiche.barcodes || []).includes(CODE_NEUF)) throw new Error("le code n'a pas ete pose");
});

await doit("B3. et sans nom libre non plus, un code DEJA PORTE par une autre fiche part sur une deuxieme boisson", async () => {
  await fbProposerCodeChasse(bob, "bob", ID_ZERO, "Cusa Cola Zero", CODE_FRITZ);
  await fbProposerCodeChasse(carl, "carl", ID_ZERO, "Cusa Cola Zero", CODE_FRITZ);
  const etat = await poserCodeChasse(CODE_FRITZ);
  const porteurs = await porteursDuCode(CODE_FRITZ);
  note("B3. -> « " + etat + " » ; fiches portant " + CODE_FRITZ + " : " + JSON.stringify(porteurs) + " — obtenu par le chemin ORDINAIRE, nom = code.");
  if (porteurs.length < 2) throw new Error("attendu : deux fiches portent le meme code");
});
note("B3. « le meme code sur deux boissons » ne demande donc PAS le nom libre : il suffit que le code n'ait pas encore de document de chasse.");

/* ═══ C. LE NOMBRE DE DOCUMENTS ═══════════════════════════════════════════ */

await doit("C1. un nom invente passe tout aussi bien quand il EST le barcode (aucune contrainte de format, rules:1259)", async () => {
  await setDoc(doc(fant1, "chasseCodes", "NOM-INVENTE-0001"), {
    drinkId: ID_CHERRY, drinkName: "Cusa Cola Cherry", barcode: "NOM-INVENTE-0001",
    par: ["fant1"], etat: "attente", createdAt: serverTimestamp() });
});
note("C1. -> avec barcode == id, « autant de documents que de noms inventes » reste vrai a l'identique : le correctif ne borne pas le nombre.");

/* ═══ D. QUEL ECRAN MONTRE LE CONFLIT ? ══════════════════════════════════ */

const vue = await fbChargerChasseCodes(bob);
note("D1. fbChargerChasseCodes (index.html:2529) indexe par String(v.barcode || d.id) : " + Object.keys(vue).length + " entree(s) pour " +
     (await admin(async (db) => (await getDocs(collection(db, "chasseCodes"))).size)) + " document(s) — deux documents sur un meme code se recouvrent.");
note("D2. grep -n \"fbChargerChasseCodes\" index.html  ->  2529 (la definition) et rien d'autre. Aucun ecran, ni utilisateur ni admin, n'affiche l'etat partage de la chasse : le conflit n'apparait nulle part.");
note("D3. grep -rn \"chasseCodes\" functions-a-deployer/*.js  ->  chasse-codes.js seulement ; et require(\"./chasse-codes\") est ABSENT de functions-a-deployer/index.js (la fonction n'est pas branchee au deploiement).");

await bilan(env);
