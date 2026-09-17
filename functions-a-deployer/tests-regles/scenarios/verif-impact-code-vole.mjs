/* VERIFICATION « IMPACT » — un code deja porte par une autre fiche est pose
   quand meme par la chasse.

   Ce scenario ne cherche pas a savoir si la Cloud Function « peut » etre
   abusee : il cherche le CHEMIN CONCRET par lequel une personne reelle finit
   devant un ecran qui lui ment, et ce qu'elle voit exactement.

   CE QUI EST REJOUE, A L'IDENTIQUE
     - index.html:2503   window.fbProposerCodeChasse   (l'ecriture du client)
     - index.html:2492   window.fbSetCatalogBarcodes   (le chemin ADMIN)
     - index.html:23522  « Coller le code » + son garde-fou `prise` (23532)
     - chasse-codes.js:104  poserCodeChasse (le verrou, la fiche, les points)
     - index.html:9598   drinkForBarcode  (+ porteCode 9548, codeNu 9541)
     - index.html:10887  mergeCatalog : les fiches communautaires sont POUSSEES
                         a la fin de DRINKS, dans l'ordre des doc-id Firestore.

   LE CATALOGUE DE DEPART EST CELUI DE LA PRODUCTION (lu le 2026-09-16 via
   l'API REST publique, collection catalog, 71 fiches) :
     1783615414484  « Golden Power Energy drink »  barcodes: []   <- en chasse
     1788296526849  « Wasser »                     barcodes: ["8437019462024"]
   Les deux existent vraiment. La premiere est l'une des 7 fiches que la
   chasse affiche aujourd'hui sur l'accueil.
*/
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, getDocs, collection, query, where,
         serverTimestamp, increment } from "firebase/firestore";

const env   = await banc("verif-impact-code-vole");
const alice = env.authenticatedContext("alice").firestore();
const bob   = env.authenticatedContext("bob").firestore();
/* withSecurityRulesDisabled ne renvoie pas ce que la fonction retourne : on
   passe par une variable (meme helper que scenarios/chasse-codes-barres.mjs:42). */
const admin = async (fn) => {
  let sortie;
  await env.withSecurityRulesDisabled(async (c) => { sortie = await fn(c.firestore()); });
  return sortie;
};

/* Fiches reelles de la production. */
const ID_GOLDEN = "1783615414484", NOM_GOLDEN = "Golden Power Energy drink";
const ID_WASSER = "1788296526849", NOM_WASSER = "Wasser";
const CODE_WASSER = "8437019462024";
/* Deux orphelines reelles, pour le calendrier honnete de l'acte 4. */
const ID_COLA = "1789574913421", NOM_COLA = "Cola Ice";
const ID_HELL = "1787410113505", NOM_HELL = "Hell Energy Carnival Edition";
const CODE_HELL = "5999860497370";

await admin(async (db) => {
  await setDoc(doc(db, "catalog", ID_GOLDEN), { name: NOM_GOLDEN, brand: "Autre",  barcodes: [] });
  await setDoc(doc(db, "catalog", ID_WASSER), { name: NOM_WASSER, brand: "Wasser", barcodes: [CODE_WASSER] });
  await setDoc(doc(db, "catalog", ID_COLA),   { name: NOM_COLA,   brand: "Cold River", barcodes: [] });
  await setDoc(doc(db, "catalog", ID_HELL),   { name: NOM_HELL,   brand: "Hell",   barcodes: [] });
});

/* ── index.html:2503, recopiee a l'identique ─────────────────────────────── */
async function fbProposerCodeChasse(db, uid, drinkId, drinkName, barcode) {
  var ref = doc(db, "chasseCodes", String(barcode));
  var snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      drinkId: Number(drinkId) || drinkId,
      drinkName: String(drinkName).slice(0, 60),
      barcode: String(barcode),
      par: [uid], etat: "attente", createdAt: serverTimestamp()
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

/* ── chasse-codes.js:104, recopiee a l'identique ─────────────────────────── */
async function poserCodeChasse(barcodeDocId) {
  return admin(async (db) => {
    const ref = doc(db, "chasseCodes", String(barcodeDocId));
    const s = await getDoc(ref);
    if (!s.exists()) return "supprime";
    const d = s.data() || {};
    if (d.etat !== "attente") return "deja-traite";
    const par = Array.isArray(d.par) ? d.par : [];
    if (par.length < 2) return "pas-assez";
    const code = String(d.barcode || barcodeDocId || "");
    const drinkId = String(d.drinkId || "");
    if (!code || !drinkId) return "document-incomplet";
    await updateDoc(ref, { etat: "pose", poseLe: serverTimestamp() });
    const fiche = await getDoc(doc(db, "catalog", drinkId));
    if (!fiche.exists()) { await updateDoc(ref, { etat: "sans-suite", raison: "fiche-absente" }); return "sans-suite"; }
    const codes = (fiche.data() || {}).barcodes || [];
    if (codes.indexOf(code) === -1) {
      await setDoc(doc(db, "catalog", drinkId),
        { barcodes: codes.concat([code]), updatedAt: serverTimestamp() }, { merge: true });
    }
    for (const uid of par) {
      await setDoc(doc(db, "users", String(uid)), { pts: increment(5) }, { merge: true });
    }
    return "pose";
  });
}

/* ── LE TELEPHONE : DRINKS tel que mergeCatalog le construit ──────────────
   index.html:10887 — les fiches communautaires sont PUSH-ees a la suite du
   catalogue embarque, dans l'ordre ou Firestore les rend, c'est-a-dire par
   doc-id croissant. Cet ordre n'est pas un detail : drinkForBarcode s'arrete
   au PREMIER porteur trouve. */
async function chargerDRINKS() {
  return admin(async (db) => {
    const snap = await getDocs(collection(db, "catalog"));
    const rows = [];
    snap.forEach((d) => rows.push(Object.assign({ id: d.id }, d.data())));
    rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));   // ordre Firestore
    return rows;
  });
}
/* index.html:9541 / 9548 / 9598 */
const codeNu = (c) => String(c == null ? "" : c).replace(/\D/g, "").replace(/^0+/, "");
const porteCode = (liste, code) => (liste || []).some((x) => codeNu(x) === codeNu(code));
const drinkForBarcode = (DRINKS, code) => DRINKS.find((x) => porteCode(x.barcodes, code));
/* index.html:23491 */
const boissonsOrphelines = (DRINKS) => DRINKS.filter((d) => Number(d.id) >= 1e12 && !(d.barcodes && d.barcodes.length));

/* ── LE CHEMIN ADMIN : « Coller le code » (index.html:23522), avec son
   garde-fou `prise` (23532). C'est la reference : ce que le projet a DEJA
   decide de refuser. */
async function collerLeCode(DRINKS, fiche, code) {
  const prise = DRINKS.find((x) => x !== fiche && x.barcodes && x.barcodes.indexOf(code) !== -1);
  if (prise) throw new Error("Ce code est deja sur « " + prise.name + " »");
  const barcodes = (fiche.barcodes || []).concat([code]);
  await admin(async (db) => {            // fbSetCatalogBarcodes, index.html:2492
    await setDoc(doc(db, "catalog", String(fiche.id)),
      { barcodes: barcodes.map(String), updatedAt: serverTimestamp() }, { merge: true });
  });
  fiche.barcodes = barcodes;
}

/* ═══ 1. LA REFERENCE : LE MEME GESTE, PAR L'ADMIN, EST REFUSE ════════════ */

await doitEchouer("1. l'admin ne peut PAS coller le code de « Wasser » sur « Golden Power » (index.html:23535)", async () => {
  const DRINKS = await chargerDRINKS();
  const golden = DRINKS.find((d) => d.id === ID_GOLDEN);
  await collerLeCode(DRINKS, golden, CODE_WASSER);
});
note("1. ce que l'admin voit : « Ce code est deja sur « Wasser » » — et rien n'est ecrit.");

/* ═══ 2. LE MEME GESTE, PAR DEUX PERSONNES, PASSE ═════════════════════════ */

await doit("2. Alice puis Bob repondent « Oui, c'est bien elle » pour Golden Power avec le code de Wasser", async () => {
  await fbProposerCodeChasse(alice, "alice", ID_GOLDEN, NOM_GOLDEN, CODE_WASSER);
  const r = await fbProposerCodeChasse(bob, "bob", ID_GOLDEN, NOM_GOLDEN, CODE_WASSER);
  if (r.nb !== 2) throw new Error("nb attendu 2, recu " + r.nb);
});
note("2. ce que Bob voit : « Une deuxieme personne l'avait deja vue : le code va etre pose pour tout le monde. » (index.html:23465)");

await doit("2. apres la pose, UN SEUL produit du catalogue porte le code de Wasser", async () => {
  const etat = await poserCodeChasse(CODE_WASSER);
  const DRINKS = await chargerDRINKS();
  const porteurs = DRINKS.filter((d) => porteCode(d.barcodes, CODE_WASSER)).map((d) => d.name);
  note("2. -> poserCodeChasse a repondu « " + etat + " » ; fiches portant " + CODE_WASSER + " : " + JSON.stringify(porteurs));
  if (porteurs.length !== 1) throw new Error(porteurs.length + " fiches portent le meme code : " + JSON.stringify(porteurs));
});

/* ═══ 3. CE QUE LA PERSONNE VOIT, UNE BOUTEILLE DE WASSER A LA MAIN ═══════ */

await doit("3. scanner une bouteille de Wasser affiche « Wasser »", async () => {
  const DRINKS = await chargerDRINKS();
  const vu = drinkForBarcode(DRINKS, CODE_WASSER);
  note("3. -> drinkForBarcode(" + CODE_WASSER + ") renvoie « " + (vu ? vu.name : "rien") + " » (fiche " + (vu ? vu.id : "-") + ")");
  note("3.    ordre de DRINKS apres mergeCatalog : " + JSON.stringify(DRINKS.map((d) => d.id + " " + d.name)));
  if (!vu || vu.name !== NOM_WASSER)
    throw new Error("l'app annonce « " + (vu ? vu.name : "rien") + " » alors que la personne tient une " + NOM_WASSER);
});

await doit("3. « Golden Power » reste dans la chasse tant que son VRAI code n'est pas trouve", async () => {
  const DRINKS = await chargerDRINKS();
  const noms = boissonsOrphelines(DRINKS).map((d) => d.name);
  note("3. -> la carte d'accueil « ... boissons cherchent leur code-barre » liste : " + JSON.stringify(noms));
  if (noms.indexOf(NOM_GOLDEN) === -1)
    throw new Error("« " + NOM_GOLDEN + " » a quitte la chasse en portant le code d'un autre produit : son vrai code ne sera plus jamais demande");
});

/* ═══ 4. LE CALENDRIER HONNETE : PERSONNE NE MENT, ET LE CODE EST QUAND
       MEME POSE DEUX FOIS ═══════════════════════════════════════════════════
   Aucune mauvaise volonte ici. Deux fiches orphelines, un code, et le seul
   ecran qui pourrait prevenir n'existe pas : fbChargerChasseCodes
   (index.html:2529) n'est appelee NULLE PART dans index.html — l'etat partage
   de la chasse n'est jamais affiche, ni a l'admin, ni au deuxieme confirmant.
   Le garde-fou `prise` (23532) ne regarde que les codes DEJA POSES. */

await doit("4. (jour 1) Alice confirme CODE_HELL pour « Cola Ice » — a cet instant, personne ne porte ce code : elle a raison", async () => {
  const DRINKS = await chargerDRINKS();
  if (drinkForBarcode(DRINKS, CODE_HELL)) throw new Error("le code est deja pris au depart, le scenario ne serait pas honnete");
  const r = await fbProposerCodeChasse(alice, "alice", ID_COLA, NOM_COLA, CODE_HELL);
  if (r.nb !== 1) throw new Error("nb attendu 1");
});
note("4. ce qu'Alice voit : « Il manque encore une confirmation d'une autre personne. » (index.html:23466)");

await doit("4. (jour 5) l'admin colle CODE_HELL sur la BONNE fiche, « Hell Energy » — le garde-fou le laisse passer", async () => {
  const DRINKS = await chargerDRINKS();
  const hell = DRINKS.find((d) => d.id === ID_HELL);
  await collerLeCode(DRINKS, hell, CODE_HELL);       // aucune erreur : rien ne porte encore ce code
});
note("4. l'admin ne peut pas savoir qu'une chasse vise deja ce code : aucun ecran ne lit chasseCodes (fbChargerChasseCodes n'est appelee nulle part).");

await doit("4. (jour 12) Bob confirme a son tour, et le catalogue ne doit toujours porter CODE_HELL qu'une fois", async () => {
  await fbProposerCodeChasse(bob, "bob", ID_COLA, NOM_COLA, CODE_HELL);
  const etat = await poserCodeChasse(CODE_HELL);
  const DRINKS = await chargerDRINKS();
  const porteurs = DRINKS.filter((d) => porteCode(d.barcodes, CODE_HELL)).map((d) => d.name);
  note("4. -> poserCodeChasse : « " + etat + " » ; fiches portant " + CODE_HELL + " : " + JSON.stringify(porteurs));
  const vu = drinkForBarcode(DRINKS, CODE_HELL);
  note("4. -> une canette de Hell Energy scannee affiche desormais : « " + (vu ? vu.name : "rien") + " »");
  if (porteurs.length !== 1) throw new Error(porteurs.length + " fiches portent le meme code : " + JSON.stringify(porteurs));
});

/* ═══ 5. LA REPARATION : LE FAUX LIEN SE PROTEGE LUI-MEME ═════════════════ */

await doit("5. l'admin peut encore coller le VRAI code de « Golden Power » ailleurs qu'a l'aveugle", async () => {
  const DRINKS = await chargerDRINKS();
  const wasser = DRINKS.find((d) => d.id === ID_WASSER);
  const golden = DRINKS.find((d) => d.id === ID_GOLDEN);
  note("5. -> etat final : " + JSON.stringify(DRINKS.map((d) => d.name + " " + JSON.stringify(d.barcodes || []))));
  /* L'admin, qui a fini par s'apercevoir du probleme, veut remettre le code de
     Wasser la ou il doit etre : sur Wasser seule. Le seul outil qui « colle »
     un code, c'est « Coller le code » — et il refuse, parce que Golden Power
     porte maintenant ce code. */
  let refus = "";
  try { await collerLeCode(DRINKS, wasser, CODE_WASSER); } catch (e) { refus = e.message; }
  note("5. -> l'admin qui veut reparer voit : « " + (refus || "(aucun refus)") + " »");
  if (!(golden.barcodes || []).length) throw new Error("golden n'a pas ete pollue, le reste du test n'a pas de sens");
});

await bilan(env);
