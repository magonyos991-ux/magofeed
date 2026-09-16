/* ============================================================================
   VERIFICATION D'INTENTION — « un code deja porte par une autre fiche est vole »
   ----------------------------------------------------------------------------
   La preuve d'origine (scenarios/chasse-codes-barres.mjs, etape 5) propose
   directement CODE_C pour une autre fiche. Or dans la vraie app, proposerChasse
   (index.html:23431) n'est appelee QUE quand drinkForBarcode(code) n'a rien
   trouve (index.html:9795 -> 9292 / 9968). On peut donc objecter : « l'app ne
   propose jamais un code deja porte, la garde existe deja cote client ».

   CE SCENARIO LEVE L'OBJECTION. Il ne contourne AUCUNE garde : il rejoue le
   parcours de REPARATION que le depot a lui-meme concu, pas a pas —
     index.html:9600   drinkForBarcode()        ignore les liens desavoues
     index.html:9641   openBarcodeDispute()     « Ce n'est pas ce produit ? »
     index.html:9612   disavowBarcode()         retire le code de DRINKS en memoire
     index.html:23431  proposerChasse()         « Oui, c'est bien elle »
     index.html:2503   window.fbProposerCodeChasse()
     functions-a-deployer/chasse-codes.js:104   la pose, sans controle d'unicite
   A chaque etape, la garde client est HONNETEMENT satisfaite sur l'appareil qui
   agit. Le desaveu vit dans localStorage (index.html:9622) : il est PROPRE A
   L'APPAREIL. Le catalogue partage, lui, ne bouge pas.

   L'INVARIANT TESTE est celui que le depot enonce trois fois a l'utilisateur :
     index.html:9652   « Un code-barres = UNE boisson precise. »
     index.html:9779   « un code = UNE boisson precise. »
     index.html:23526  « Verifie la variante — un code = UNE boisson precise. »
   et qu'il fait respecter a UN seul endroit, le chemin admin :
     index.html:23532  var prise = DRINKS.find(... x.barcodes.indexOf(c) !== -1)
     index.html:23535  toast("Ce code est deja sur « " + prise.name + " »")
============================================================================ */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, getDocs, collection,
         serverTimestamp, increment } from "firebase/firestore";

const env  = await banc("verif-intention-code-vole");
const bob  = env.authenticatedContext("bob").firestore();
const carl = env.authenticatedContext("carl").firestore();

const admin = async (fn) => {
  let sortie;
  await env.withSecurityRulesDisabled(async (c) => { sortie = await fn(c.firestore()); });
  return sortie;
};

/* ── Le catalogue de depart ────────────────────────────────────────────────
   Exactement la situation que index.html:9827 decrit et pour laquelle il a
   ajoute la sortie de secours : « un code colle a la mauvaise boisson l'etait
   pour toujours ». CODE_X est sur « Fritz-Kola » ; le produit qui le porte
   vraiment est « Golden Power Energy drink », fiche nee d'une proposition
   PHOTO, donc orpheline (l'histoire racontee en index.html:23340). */
const ID_ORPHELINE = 1700000000001;   // Golden Power Energy drink — aucun code
const ID_FAUTIVE   = 1700000000002;   // Fritz-Kola — porte CODE_X a tort
const CODE_X       = "3068320123264"; // cle GS1 valide

await admin(async (db) => {
  await setDoc(doc(db, "catalog", String(ID_ORPHELINE)), {
    id: ID_ORPHELINE, name: "Golden Power Energy drink", brand: "Golden Power",
    cat: "Energy", createdAt: serverTimestamp() });
  await setDoc(doc(db, "catalog", String(ID_FAUTIVE)), {
    id: ID_FAUTIVE, name: "Fritz-Kola", brand: "Fritz", cat: "Soda",
    barcodes: [CODE_X], createdAt: serverTimestamp() });
});

/* ── UN APPAREIL ──────────────────────────────────────────────────────────
   localStorage est propre a l'appareil : on en donne un a chacun. Les
   fonctions ci-dessous sont recopiees de index.html, sans changement autre que
   le remplacement de localStorage par ce magasin local et de window.DRINKS par
   le catalogue charge par CET appareil. */
function appareil(catalogue) {
  const ls = {};                                   // le localStorage de ce telephone
  const DRINKS = JSON.parse(JSON.stringify(catalogue));  // le catalogue charge en memoire

  // index.html:9541
  const codeNu = (c) => String(c == null ? "" : c).replace(/\D/g, "").replace(/^0+/, "");
  // index.html:9542
  function indexCode(liste, code) {
    const x = codeNu(code);
    if (!liste || !liste.length || !x) return -1;
    for (let i = 0; i < liste.length; i++) if (codeNu(liste[i]) === x) return i;
    return -1;
  }
  // index.html:9548
  const porteCode = (liste, code) => indexCode(liste, code) !== -1;
  // index.html:9532 / 9569
  const badLinks = () => { try { return JSON.parse(ls["magoBadLinks"] || "{}") || {}; } catch (e) { return {}; } };
  const ownLinks = () => { try { return JSON.parse(ls["magoLiensCode"] || "{}") || {}; } catch (e) { return {}; } };
  // index.html:9576 (cleCode)
  function cleCode(obj, code) {
    const x = codeNu(code);
    if (!obj || !x) return null;
    if (Object.prototype.hasOwnProperty.call(obj, String(code))) return String(code);
    for (const k in obj) if (Object.prototype.hasOwnProperty.call(obj, k) && codeNu(k) === x) return k;
    return null;
  }
  // index.html:9549
  function barcodeDisavowed(code, drinkId) {
    const all = badLinks(), x = codeNu(code);
    for (const k in all) {
      if (!Object.prototype.hasOwnProperty.call(all, k)) continue;
      if (codeNu(k) !== x) continue;
      if (all[k] && all[k].indexOf(Number(drinkId)) !== -1) return true;
    }
    return false;
  }
  // index.html:9598 — « quelle boisson porte ce code ? », en un seul endroit
  function drinkForBarcode(code) {
    const c = String(code);
    const d = DRINKS.find((x) => porteCode(x.barcodes, c) && !barcodeDisavowed(c, x.id));
    if (d) return d;
    const liens = ownLinks(), k = cleCode(liens, c);
    const id = k == null ? null : liens[k];
    if (id == null || barcodeDisavowed(c, id)) return undefined;
    const perso = DRINKS.find((x) => Number(x.id) === Number(id));
    if (perso) { if (!perso.barcodes) perso.barcodes = []; if (indexCode(perso.barcodes, c) === -1) perso.barcodes.push(c); }
    return perso;
  }
  // index.html:9612 — le desaveu, tel quel (y compris le retrait en memoire)
  function disavowBarcode(code, drinkId) {
    try {
      const l = ownLinks(), cle = cleCode(l, code);
      if (cle != null && Number(l[cle]) === Number(drinkId)) { delete l[cle]; ls["magoLiensCode"] = JSON.stringify(l); }
    } catch (e) {}
    const all = badLinks(), k = String(code);
    if (!all[k]) all[k] = [];
    if (all[k].indexOf(Number(drinkId)) === -1) all[k].push(Number(drinkId));
    ls["magoBadLinks"] = JSON.stringify(all);
    try {
      const d = DRINKS.find((x) => Number(x.id) === Number(drinkId));
      if (d && d.barcodes) { const i = indexCode(d.barcodes, code); if (i !== -1) d.barcodes.splice(i, 1); }
    } catch (e) {}
  }
  // index.html:23491 — qui entre dans la chasse
  const boissonsOrphelines = () => DRINKS.filter((d) => Number(d.id) >= 1e12 && !(d.barcodes && d.barcodes.length));

  return { DRINKS, drinkForBarcode, disavowBarcode, boissonsOrphelines };
}

/* ── window.fbProposerCodeChasse — index.html:2503, recopiee a l'identique ── */
async function fbProposerCodeChasse(db, uid, drinkId, drinkName, barcode) {
  const ref = doc(db, "chasseCodes", String(barcode));
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
    return { nb: 1, deja: false };
  }
  const d = snap.data() || {};
  const par = Array.isArray(d.par) ? d.par : [];
  if (d.etat !== "attente") return { nb: par.length, deja: true, pose: true };
  if (par.indexOf(uid) !== -1) return { nb: par.length, deja: true };
  await updateDoc(ref, { par: par.concat([uid]) });
  return { nb: par.length + 1, deja: false };
}

/* ── functions-a-deployer/chasse-codes.js — poserCodeChasse, a l'identique ──
   Le seul controle de duplication est la ligne 104 : « ce code est-il deja sur
   CETTE fiche-ci ? ». Recopiee telle quelle. */
const CONFIRMATIONS_REQUISES = 2;
const POINTS_PAR_CONFIRMANT  = 5;
async function poserCodeChasse(barcodeDocId) {
  return admin(async (db) => {
    const ref = doc(db, "chasseCodes", String(barcodeDocId));
    const s = await getDoc(ref);
    if (!s.exists()) return "supprime";
    const d = s.data() || {};
    if (d.etat !== "attente") return "deja-traite";                  // chasse-codes.js:68
    const par = Array.isArray(d.par) ? d.par : [];
    if (par.length < CONFIRMATIONS_REQUISES) return "pas-assez";     // chasse-codes.js:70
    const code = String(d.barcode || barcodeDocId || "");
    const drinkId = String(d.drinkId || "");
    if (!code || !drinkId) return "document-incomplet";              // chasse-codes.js:74
    await updateDoc(ref, { etat: "pose", poseLe: serverTimestamp() });  // le verrou, :88
    const fiche = await getDoc(doc(db, "catalog", drinkId));         // chasse-codes.js:94
    if (!fiche.exists()) { await updateDoc(ref, { etat: "sans-suite", raison: "fiche-absente" }); return "sans-suite"; }
    const codes = (fiche.data() || {}).barcodes || [];               // chasse-codes.js:103
    if (codes.indexOf(code) === -1) {                                // chasse-codes.js:104
      await setDoc(doc(db, "catalog", drinkId),
        { barcodes: codes.concat([code]), updatedAt: serverTimestamp() }, { merge: true });
    }
    for (const uid of par) {                                          // chasse-codes.js:122
      await setDoc(doc(db, "users", String(uid)), { pts: increment(POINTS_PAR_CONFIRMANT) }, { merge: true });
    }
    return "pose";
  });
}

const catalogue = () => admin(async (db) => {
  const snap = await getDocs(collection(db, "catalog"));
  const out = []; snap.forEach((d) => out.push(d.data() || {})); return out;
});
const porteurs = (cat, code) => cat.filter((d) => (d.barcodes || []).includes(code)).map((d) => d.name);
const lirePoints = (uid) => admin(async (db) => { const s = await getDoc(doc(db, "users", String(uid))); return s.exists() ? (s.data().pts || 0) : 0; });

/* ═══ 0. LE POINT DE DEPART ═══════════════════════════════════════════════ */

const cat0 = await catalogue();
note("0. catalogue partage au depart : " + CODE_X + " est porte par " + JSON.stringify(porteurs(cat0, CODE_X)));

/* ═══ 1. LE CHEMIN ADMIN, POUR MESURER CE QUI EST ATTENDU ════════════════ */

/* index.html:23525-23535, recopie : ce que fait l'administrateur quand il colle
   un code sur une fiche orpheline. */
function collerCodeAdmin(dev, d, c) {
  const prise = dev.DRINKS.find((x) => x !== d && x.barcodes && x.barcodes.indexOf(c) !== -1);
  if (prise) throw new Error("Ce code est deja sur « " + prise.name + " »");   // index.html:23535
  return true;
}
await doitEchouer("1. l'ADMIN qui colle CODE_X sur l'orpheline est refuse net (index.html:23535)", async () => {
  const dev = appareil(cat0);
  const cible = dev.DRINKS.find((x) => Number(x.id) === ID_ORPHELINE);
  collerCodeAdmin(dev, cible, CODE_X);
});
note("1. -> l'invariant « un code = UNE boisson » EXISTE dans le depot, et le chemin admin le fait respecter.");

/* ═══ 2. LE PARCOURS DE REPARATION, SANS AUCUN CONTOURNEMENT ═════════════ */

/* Bob a le Golden Power en main. Il scanne. */
const devBob = appareil(cat0);
await doit("2. Bob scanne CODE_X : l'app lui affirme « ✓ Deja au catalogue : Fritz-Kola »", async () => {
  const trouve = devBob.drinkForBarcode(CODE_X);
  if (!trouve || trouve.name !== "Fritz-Kola") throw new Error("attendu Fritz-Kola, recu " + (trouve && trouve.name));
});
await doit("2. Bob repond « Ce n'est pas ce produit ? » — c'est la sortie de secours prevue (index.html:9834)", async () => {
  devBob.disavowBarcode(CODE_X, ID_FAUTIVE);                       // index.html:9660, via valider()
  if (devBob.drinkForBarcode(CODE_X)) throw new Error("le desaveu n'a pas pris");
});
await doit("2. Bob rescanne : plus rien ne porte CODE_X sur SON appareil — la garde client est honnetement satisfaite", async () => {
  if (devBob.drinkForBarcode(CODE_X) !== undefined) throw new Error("drinkForBarcode devrait etre vide");
  const liste = devBob.boissonsOrphelines();
  if (!liste.some((d) => Number(d.id) === ID_ORPHELINE)) throw new Error("l'orpheline n'est pas dans la chasse");
});
await doit("2. proposerChasse lui propose « Golden Power Energy drink », il repond « Oui, c'est bien elle »", async () => {
  const r = await fbProposerCodeChasse(bob, "bob", ID_ORPHELINE, "Golden Power Energy drink", CODE_X);
  if (r.nb !== 1) throw new Error("nb attendu 1, recu " + r.nb);
});

/* Carl, autre personne, autre telephone, meme produit en main, meme parcours. */
const devCarl = appareil(cat0);
await doit("3. Carl fait exactement le meme parcours sur son telephone", async () => {
  if (devCarl.drinkForBarcode(CODE_X).name !== "Fritz-Kola") throw new Error("etat de depart inattendu");
  devCarl.disavowBarcode(CODE_X, ID_FAUTIVE);
  if (devCarl.drinkForBarcode(CODE_X) !== undefined) throw new Error("le desaveu n'a pas pris");
  const r = await fbProposerCodeChasse(carl, "carl", ID_ORPHELINE, "Golden Power Energy drink", CODE_X);
  if (r.nb !== 2) throw new Error("nb attendu 2, recu " + r.nb);
});
note("3. -> l'ecran de Carl affiche : « Une deuxieme personne l'avait deja vue : le code va etre pose pour tout le monde. » (index.html:23466)");

/* ═══ 4. CE QUE LA CLOUD FUNCTION EN FAIT ════════════════════════════════ */

await doit("4. la Cloud Function pose le code et paie les deux confirmants", async () => {
  const etat = await poserCodeChasse(CODE_X);
  if (etat !== "pose") throw new Error("la fonction a repondu « " + etat + " »");
  note("4. -> points verses : bob=" + (await lirePoints("bob")) + " carl=" + (await lirePoints("carl")));
});

const cat1 = await catalogue();
note("4. -> catalogue partage APRES la pose : fiches portant " + CODE_X + " = " + JSON.stringify(porteurs(cat1, CODE_X)));

await doit("4. l'invariant du depot tient : UN SEUL produit du catalogue porte CODE_X", async () => {
  const p = porteurs(cat1, CODE_X);
  if (p.length !== 1) throw new Error(p.length + " fiches portent le meme code : " + JSON.stringify(p));
});

/* ═══ 5. CE QUE VOIT QUELQU'UN QUI N'A RIEN DESAVOUE ═════════════════════ */

const devDiane = appareil(cat1);   // telephone neuf, catalogue a jour, aucun desaveu
await doit("5. Diane, qui n'a rien desavoue, scanne CODE_X et obtient le bon produit", async () => {
  const trouve = devDiane.drinkForBarcode(CODE_X);
  note("5. -> ce que l'app AFFIRME a Diane : « ✓ Deja au catalogue Magofeed : " + (trouve && trouve.name) + " »");
  if (!trouve) throw new Error("plus rien ne porte le code");
  if (trouve.name !== "Golden Power Energy drink")
    throw new Error("l'app nomme « " + trouve.name + " » alors que le produit en main est « Golden Power Energy drink »");
});

/* ═══ 6. QUI PEUT S'EN APERCEVOIR ? ══════════════════════════════════════ */

await doit("6. un ecran d'administration montre la fiche en double (renderFichesSansCode, index.html:23496)", async () => {
  const devAdmin = appareil(cat1);
  const listees = devAdmin.boissonsOrphelines().map((d) => d.name);   // le SEUL ecran admin sur les codes
  note("6. -> « Fiches sans code-barre » affiche : " + JSON.stringify(listees));
  const p = porteurs(cat1, CODE_X);
  if (p.length > 1 && listees.length === 0)
    throw new Error("le doublon existe (" + JSON.stringify(p) + ") et aucun ecran ne le montre : les deux fiches ont un code, donc aucune n'est orpheline");
});
note("6. la chasse ne reproposera pas la fiche non plus : boissonsOrphelines() (index.html:23491) exclut toute fiche qui a un code.");

/* ═══ 7. « TIRAGE AU SORT » : QUI GAGNE LE SCAN ? ════════════════════════
   DRINKS n'est pas trie : c'est le fichier de base (data/*.js) PUIS les lignes
   de Firestore ajoutees par mergeCatalog (index.html:10903, DRINKS.push).
   drinkForBarcode (index.html:9600) rend le PREMIER de la liste qui porte le
   code. Le gagnant depend donc de l'ordre de chargement, pas de la verite. */

await doit("7. si la fiche fautive est une boisson du fichier de base, c'est ELLE que le scan continue de nommer", async () => {
  const cat = await catalogue();
  /* Meme catalogue, ordre de chargement inverse : la fiche fautive arrive en
     premier, comme le ferait n'importe quelle boisson de data/*.js face a une
     fiche communautaire (id >= 1e12) ajoutee ensuite. */
  const ordreBase = cat.slice().sort((a, b) => Number(b.id) - Number(a.id));
  const devErik = appareil(ordreBase);
  const trouve = devErik.drinkForBarcode(CODE_X);
  note("7. -> meme donnee, autre ordre de chargement : l'app AFFIRME \u00AB " + (trouve && trouve.name) + " \u00BB");
  if (trouve && trouve.name !== "Golden Power Energy drink")
    throw new Error("le scan repond \u00AB " + trouve.name + " \u00BB ; a l'etape 5, la meme donnee repondait \u00AB Golden Power Energy drink \u00BB");
});
note("7. le meme code, le meme catalogue, deux reponses selon l'ordre de chargement : c'est exactement ce que le commentaire de index.html:23530 appelle « le scan devient un tirage au sort ».");

await bilan(env);
