/* ============================================================================
   VERIFICATION D'INTENTION — « les regles ne verifient pas le format du code »
   ----------------------------------------------------------------------------
   Trouvaille a verifier : match /chasseCodes/{barcode} (firestore.rules:1255)
   n'exige du champ barcode que « is string && size() <= 20 ». Ni chiffres, ni
   longueur GS1, ni cle de controle.

   LA QUESTION N'EST PAS « est-ce que ca passe » (c'est deja reproduit), mais
   « est-ce voulu, et qu'est-ce que ca coute vraiment ? ». Ce scenario mesure
   donc TROIS choses, dans cet ordre :

     A. le trou existe-t-il tel qu'annonce  (rejeu fidele de l'ecriture reelle)
     B. une regle de format l'aurait-elle bouche  (le meme degat avec un code
        PARFAITEMENT valide : si oui, le format n'est pas le verrou manquant)
     C. que voit l'utilisateur apres coup  (boissonsOrphelines, offreLienCode,
        validGTIN : la fiche est-elle declaree « a son code » alors qu'aucun
        scan ne la retrouvera ?)

   CE QUI EST REJOUE, LIGNE PAR LIGNE :
     - index.html:2504   window.fbProposerCodeChasse()  l'ecriture, telle quelle
     - index.html:9501   validGTIN()                    le seul juge de l'app
     - index.html:23491  boissonsOrphelines()           qui entre dans la chasse
     - index.html:18603  offreLienCode()                l'offre « relier un code »
     - index.html:5459   window.fbRemoveBarcode()       la reparation
     - functions-a-deployer/chasse-codes.js:60          poserCodeChasse (Admin SDK)
     - functions-a-deployer/firestore.rules:1255        match /chasseCodes/{barcode}
============================================================================ */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, collection, getDocs,
         serverTimestamp, increment, arrayRemove } from "firebase/firestore";

const env   = await banc("verif-intention-codebarres-format");
const alice = env.authenticatedContext("alice").firestore();
const bob   = env.authenticatedContext("bob").firestore();
const carl  = env.authenticatedContext("carl").firestore();

const admin = async (fn) => {
  let sortie;
  await env.withSecurityRulesDisabled(async (c) => { sortie = await fn(c.firestore()); });
  return sortie;
};

/* ── index.html:9501, recopiee a l'identique ─────────────────────────────── */
function validGTIN(code){
  if(!/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(code))return false;
  var digits=code.split("").map(Number);
  var check=digits.pop();
  var sum=0,w=3;
  for(var i=digits.length-1;i>=0;i--){sum+=digits[i]*w;w=(w===3)?1:3;}
  return (10-(sum%10))%10===check;
}
/* ── index.html:23491, recopiee a l'identique ────────────────────────────── */
function boissonsOrphelines(DRINKS){
  return (DRINKS||[]).filter(function(d){
    return Number(d.id)>=1e12&&!(d.barcodes&&d.barcodes.length);
  });
}
/* ── index.html:18603, la condition d'affichage de l'offre ───────────────── */
function offreLienCode(drink){
  if(!drink||(drink.barcodes&&drink.barcodes.length))return "";
  return "Scanner son code-barre pour le relier";
}

/* ── window.fbProposerCodeChasse — index.html:2504, a l'identique ─────────── */
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

/* ── chasse-codes.js:60 — poserCodeChasse, meme ordre, meme verrou ────────── */
const CONFIRMATIONS_REQUISES = 2;
const POINTS_PAR_CONFIRMANT  = 5;
async function poserCodeChasse(barcodeDocId) {
  return admin(async (db) => {
    const ref = doc(db, "chasseCodes", String(barcodeDocId));
    const s = await getDoc(ref);
    if (!s.exists()) return "supprime";
    const d = s.data() || {};
    if (d.etat !== "attente") return "deja-traite";
    const par = Array.isArray(d.par) ? d.par : [];
    if (par.length < CONFIRMATIONS_REQUISES) return "pas-assez";
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
      await setDoc(doc(db, "users", String(uid)), { pts: increment(POINTS_PAR_CONFIRMANT) }, { merge: true });
    }
    return "pose";
  });
}

const lireCatalogue = (id) => admin(async (db) => (await getDoc(doc(db, "catalog", String(id)))).data() || {});

/* Le catalogue de depart : deux fiches nees d'une proposition PHOTO (id >= 1e12,
   pas de barcodes) — ce sont exactement celles que la chasse vise. */
const ID_PHOTO  = 1700000000011;   // « Cusa Cola Zero »   (orpheline)
const ID_PHOTO2 = 1700000000012;   // « Cusa Cola Cherry » (orpheline)
const ID_PLEINE = 1700000000013;   // « Fritz-Kola », son code est deja pose
const CODE_VRAI = "3068320123264"; // GS1 valide, deja sur Fritz-Kola
const CODE_TEXTE = "PAS-UN-CODE";  // pas des chiffres
const CODE_CLE_FAUSSE = "5449000000997";

await admin(async (db) => {
  await setDoc(doc(db, "catalog", String(ID_PHOTO)),  { id: ID_PHOTO,  name: "Cusa Cola Zero",   brand: "Cusa",  cat: "Soda", createdAt: serverTimestamp() });
  await setDoc(doc(db, "catalog", String(ID_PHOTO2)), { id: ID_PHOTO2, name: "Cusa Cola Cherry", brand: "Cusa",  cat: "Soda", createdAt: serverTimestamp() });
  await setDoc(doc(db, "catalog", String(ID_PLEINE)), { id: ID_PLEINE, name: "Fritz-Kola",       brand: "Fritz", cat: "Soda", barcodes: [CODE_VRAI], createdAt: serverTimestamp() });
});

/* ═══ A. LE TROU EXISTE-T-IL TEL QU'ANNONCE ? ═════════════════════════════ */

note("A. validGTIN(\"" + CODE_TEXTE + "\") = " + validGTIN(CODE_TEXTE) + " ; validGTIN(\"" + CODE_CLE_FAUSSE + "\") = " + validGTIN(CODE_CLE_FAUSSE) + "  (index.html:9501)");

await doitEchouer("A. les regles refusent un « code » qui n'est pas une suite de chiffres (rules:1259-1261)", async () => {
  await fbProposerCodeChasse(bob, "bob", ID_PHOTO, "Cusa Cola Zero", CODE_TEXTE);
});
await doit("A. deux confirmations plus tard, ce qui a ete accepte part au catalogue partage", async () => {
  await fbProposerCodeChasse(alice, "alice", ID_PHOTO, "Cusa Cola Zero", CODE_TEXTE).catch(() => {});
  const etat  = await poserCodeChasse(CODE_TEXTE);
  const fiche = await lireCatalogue(ID_PHOTO);
  note("A. -> poserCodeChasse : « " + etat + " » ; catalog/" + ID_PHOTO + ".barcodes = " + JSON.stringify(fiche.barcodes || []));
});

/* ═══ B. UNE REGLE DE FORMAT AURAIT-ELLE BOUCHE LE TROU ? ═════════════════
   Le meme parcours, avec un code PARFAITEMENT valide au sens GS1 — mais qui
   appartient a une AUTRE boisson. Si le degat est le meme, alors le format
   n'est pas le verrou manquant : c'est la verification humaine qui porte tout. */

await doit("B. deux comptes posent un code GS1 VALIDE sur la mauvaise boisson", async () => {
  await fbProposerCodeChasse(bob,  "bob",  ID_PHOTO2, "Cusa Cola Cherry", CODE_VRAI);
  await fbProposerCodeChasse(carl, "carl", ID_PHOTO2, "Cusa Cola Cherry", CODE_VRAI);
  const etat = await poserCodeChasse(CODE_VRAI);
  const porteurs = await admin(async (db) => {
    const snap = await getDocs(collection(db, "catalog"));
    const out = [];
    snap.forEach((d) => { if (((d.data() || {}).barcodes || []).includes(CODE_VRAI)) out.push((d.data() || {}).name); });
    return out;
  });
  note("B. -> validGTIN(\"" + CODE_VRAI + "\") = " + validGTIN(CODE_VRAI) + " ; poserCodeChasse : « " + etat + " »");
  note("B. -> fiches portant " + CODE_VRAI + " : " + JSON.stringify(porteurs) + "  (une regle de format n'aurait rien change ici)");
});

/* ═══ C. CE QUE VOIT L'UTILISATEUR APRES COUP ════════════════════════════ */

await doit("C. la fiche polluee reste INTROUVABLE AU SCAN mais quitte la chasse", async () => {
  const fiche = await lireCatalogue(ID_PHOTO);
  const drink = { id: ID_PHOTO, name: fiche.name, barcodes: (fiche.barcodes || []).map(String) };
  const encoreDansLaChasse = boissonsOrphelines([drink]).length === 1;
  const offre = offreLienCode(drink);
  const scannable = (drink.barcodes || []).some(validGTIN);
  note("C. -> boissonsOrphelines() la garde ? " + encoreDansLaChasse
     + " · offreLienCode() affiche ? " + (offre ? "oui" : "non")
     + " · un scan peut-il la retrouver ? " + scannable + " (aucun code de la fiche ne passe validGTIN)");
  if (!encoreDansLaChasse && !scannable)
    throw new Error("la fiche est sortie de la chasse ET reste introuvable au scan : elle est declaree « a son code » sans en avoir un");
});

/* ═══ D. QUI PEUT REPARER, ET QUI LE VERRAIT ? ═══════════════════════════ */

await doitEchouer("D. un utilisateur ordinaire peut retirer le faux code (fbRemoveBarcode, index.html:5459)", async () => {
  await updateDoc(doc(bob, "catalog", String(ID_PHOTO)), { barcodes: arrayRemove(CODE_TEXTE) });
});
await doit("D. l'admin, lui, le peut (catalog = isAdmin, adminManageBarcodes index.html:13667)", async () => {
  await admin(async (db) => { await updateDoc(doc(db, "catalog", String(ID_PHOTO)), { barcodes: arrayRemove(CODE_TEXTE) }); });
  const fiche = await lireCatalogue(ID_PHOTO);
  if ((fiche.barcodes || []).includes(CODE_TEXTE)) throw new Error("code toujours la");
});
note("D. outils/controle-catalogue.mjs:61 (cleOk) recalcule bien la cle GS1 — mais sur data/drinks.js, le fichier livre avec l'app, pas sur la collection Firestore « catalog » ou la chasse ecrit. Ce filet ne couvre pas ce chemin.");

await bilan(env);
