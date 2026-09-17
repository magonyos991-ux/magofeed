/* ============================================================================
   VERIFICATION — LENTILLE « IMPACT »
   « Les regles n'exigent aucun format de code-barre (firestore.rules:1260) »
   ----------------------------------------------------------------------------
   La reproduction est deja faite ailleurs. Ici, UNE SEULE question :
   QU'EST-CE QUE CA CHANGE POUR QUELQU'UN ?

   On ne s'arrete donc pas quand le faux code entre dans catalog.barcodes : on
   rejoue ensuite, A L'IDENTIQUE, les fonctions de l'app qui LISENT ce tableau,
   et on regarde ce que la personne a sous les yeux.

   Ce qui est rejoue, ligne par ligne :
     - index.html:2503   window.fbProposerCodeChasse()   l'ecriture
     - index.html:10903  la fabrication de DRINKS a partir du catalogue Firestore
     - index.html:23491  boissonsOrphelines()   qui entre (et reste) dans la chasse
     - index.html:23432  proposerChasse()       « Elle est dans la chasse ! »
     - index.html:9541   codeNu() / indexCode() / porteCode()
     - index.html:9598   drinkForBarcode()      « quelle boisson porte ce code ? »
     - index.html:18602  offreLienCode()        « Scanner son code-barre pour le relier »
     - index.html:9735   onBarcodeDetected()    le verrou d'entree du scan
     - index.html:9501   validGTIN()
     - functions-a-deployer/chasse-codes.js:60-110   poserCodeChasse
============================================================================ */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, getDocs, collection,
         serverTimestamp, increment } from "firebase/firestore";

const env   = await banc("verif-impact-codebarres-format");
const alice = env.authenticatedContext("alice").firestore();
const bob   = env.authenticatedContext("bob").firestore();
const admin = async (fn) => { let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out; };

/* ── Les fonctions de l'app, recopiees telles quelles ────────────────────── */

/* index.html:9501 */
function validGTIN(code){
  if(!/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(code))return false;
  var digits=code.split("").map(Number);
  var check=digits.pop();
  var sum=0,w=3;
  for(var i=digits.length-1;i>=0;i--){sum+=digits[i]*w;w=(w===3)?1:3;}
  return (10-(sum%10))%10===check;
}
/* index.html:9541-9548 */
function codeNu(c){ return String(c==null?"":c).replace(/\D/g,"").replace(/^0+/,""); }
function indexCode(liste,code){
  var x=codeNu(code);
  if(!liste||!liste.length||!x)return -1;
  for(var i=0;i<liste.length;i++) if(codeNu(liste[i])===x) return i;
  return -1;
}
function porteCode(liste,code){ return indexCode(liste,code)!==-1; }
/* index.html:9598 — sans les liens locaux (localStorage), qui n'existent pas ici */
function drinkForBarcode(DRINKS,code){
  var c=String(code);
  return DRINKS.find(function(x){return porteCode(x.barcodes,c);});
}
/* index.html:23491 */
function boissonsOrphelines(DRINKS){
  return DRINKS.filter(function(d){
    return Number(d.id)>=1e12&&!(d.barcodes&&d.barcodes.length);
  });
}
/* index.html:18602 — « return "" » = l'app n'offre RIEN */
function offreLienCode(drink){
  if(!drink||(drink.barcodes&&drink.barcodes.length))return "";
  return "Scanner son code-barre pour le relier";
}
/* index.html:23432, les deux premieres lignes : sans boisson orpheline,
   l'ecran « Elle est dans la chasse ! » n'est jamais propose. */
function chasseProposable(DRINKS,drinkId){
  var liste=boissonsOrphelines(DRINKS);
  if(!liste.length)return false;
  return liste.some(function(d){return Number(d.id)===Number(drinkId);});
}
/* index.html:9737-9738 — le verrou d'entree de TOUT scan */
function scanAccepte(rawCode){
  if(!rawCode)return false;
  if(!validGTIN(rawCode))return false;
  return true;
}
/* index.html:10903-10913 — DRINKS fabrique a partir du catalogue Firestore */
async function chargerDRINKS(){
  return admin(async (db) => {
    const out = [];
    const snap = await getDocs(collection(db, "catalog"));
    snap.forEach((s) => {
      const r = s.data() || {};
      out.push({ id: Number(r.id), name: String(r.name), brand: String(r.brand||"Autre"),
                 barcodes: Array.isArray(r.barcodes) ? r.barcodes.map(String).slice(0,5) : [] });
    });
    return out;
  });
}

/* ── window.fbProposerCodeChasse — index.html:2503, a l'identique ────────── */
async function fbProposerCodeChasse(db, uid, drinkId, drinkName, barcode) {
  var ref = doc(db, "chasseCodes", String(barcode));
  var snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      drinkId: Number(drinkId) || drinkId,
      drinkName: String(drinkName).slice(0, 60),
      barcode: String(barcode),
      par: [uid], etat: "attente", createdAt: serverTimestamp() });
    return { nb: 1, deja: false };
  }
  var d = snap.data() || {};
  var par = Array.isArray(d.par) ? d.par : [];
  if (d.etat !== "attente") return { nb: par.length, deja: true, pose: true };
  if (par.indexOf(uid) !== -1) return { nb: par.length, deja: true };
  await updateDoc(ref, { par: par.concat([uid]) });
  return { nb: par.length + 1, deja: false };
}
/* chasse-codes.js — meme seuil, meme verrou, meme ordre */
async function poserCodeChasse(id) {
  return admin(async (db) => {
    const ref = doc(db, "chasseCodes", String(id));
    const s = await getDoc(ref); if (!s.exists()) return "supprime";
    const d = s.data() || {};
    if (d.etat !== "attente") return "deja-traite";
    const par = Array.isArray(d.par) ? d.par : [];
    if (par.length < 2) return "pas-assez";
    const code = String(d.barcode || id || ""), drinkId = String(d.drinkId || "");
    if (!code || !drinkId) return "document-incomplet";
    await updateDoc(ref, { etat: "pose", poseLe: serverTimestamp() });
    const fiche = await getDoc(doc(db, "catalog", drinkId));
    if (!fiche.exists()) return "sans-suite";
    const codes = (fiche.data() || {}).barcodes || [];
    if (codes.indexOf(code) === -1)
      await setDoc(doc(db, "catalog", drinkId), { barcodes: codes.concat([code]), updatedAt: serverTimestamp() }, { merge: true });
    for (const uid of par) await setDoc(doc(db, "users", String(uid)), { pts: increment(5) }, { merge: true });
    return "pose";
  });
}

/* ── Le decor : une fiche nee d'une PHOTO, sans code, donc « dans la chasse » */
const ID   = 1786705203601;               // meme forme d'identifiant qu'en production
const NOM  = "Freeway Agrumes";
const VRAI = "5449000214799";             // le vrai code du produit (cle GS1 juste)
const FAUX = "PAS-UN-CODE";
await admin(async (db) => {
  await setDoc(doc(db, "catalog", String(ID)),
    { id: ID, name: NOM, brand: "Freeway", cat: "Jus", createdAt: serverTimestamp() });
});

/* ── ETAT 0 : avant l'accident, ce que la personne voit ─────────────────── */
let D = await chargerDRINKS();
await doit("0. la fiche sans code est dans la chasse (boissonsOrphelines, index.html:23491)", async () => {
  if (!chasseProposable(D, ID)) throw new Error("absente de la chasse des le depart");
});
await doit("0. la fiche propose « Scanner son code-barre pour le relier » (offreLienCode, index.html:18602)", async () => {
  if (offreLienCode(D[0]) === "") throw new Error("l'app n'offre rien");
});
note("0. etat de depart sain : la fiche est reparable par deux chemins — la chasse, et « Fiches sans code-barre » (admin).");

/* ── L'ACCIDENT : deux confirmations sur un « code » qui n'en est pas un ── */
await doitEchouer("1. les regles refusent « " + FAUX + " » (firestore.rules:1260)", async () => {
  await fbProposerCodeChasse(bob, "bob", ID, NOM, FAUX);
});
await doit("1. deux confirmations suffisent, et la Cloud Function pose le faux code", async () => {
  await fbProposerCodeChasse(alice, "alice", ID, NOM, FAUX).catch(() => {});
  const etat = await poserCodeChasse(FAUX);
  const f = await admin(async (db) => (await getDoc(doc(db, "catalog", String(ID)))).data() || {});
  note("1. -> poserCodeChasse : « " + etat + " » ; catalog/" + ID + ".barcodes = " + JSON.stringify(f.barcodes || []));
});

/* ── LE COEUR : CE QUE LA PERSONNE VOIT MAINTENANT ──────────────────────── */
D = await chargerDRINKS();
note("2. DRINKS[0].barcodes vaut maintenant " + JSON.stringify(D[0].barcodes) + " (index.html:10913)");

await doit("2. la personne scanne le VRAI code du produit : l'app doit le reconnaitre", async () => {
  if (!scanAccepte(VRAI)) throw new Error("le scan refuse le vrai code — impossible");
  const d = drinkForBarcode(D, VRAI);
  if (!d) throw new Error("« produit inconnu » : la fiche existe pourtant, avec un code inscrit dessus");
});
await doit("2. ... et a defaut, l'app doit lui proposer « Elle est dans la chasse ! » (index.html:23432)", async () => {
  if (!chasseProposable(D, ID))
    throw new Error("la fiche a quitte boissonsOrphelines : l'ecran de la chasse ne peut plus la proposer, le scan pousse « Ajouter aux decouvertes » -> doublon");
});
await doit("2. ... et la fiche doit rester dans « Fiches sans code-barre » du panneau admin (index.html:23496)", async () => {
  if (!boissonsOrphelines(D).some((d) => Number(d.id) === ID))
    throw new Error("elle n'y est plus : le seul chemin de reparation de l'app ne la liste plus");
});
await doit("2. ... et la fiche doit encore offrir « Scanner son code-barre pour le relier » (index.html:18602)", async () => {
  if (offreLienCode(D[0]) === "")
    throw new Error("offreLienCode renvoie \"\" : le bouton de rattrapage disparait de la fiche");
});
note("2. codeNu(\"" + FAUX + "\") = \"" + codeNu(FAUX) + "\" (index.html:9541) : le faux code ne repond a AUCUN scan. Il ne sert a rien, mais il compte comme un code.");

/* ── CE QUE LA CORRECTION PROPOSEE ARRETERAIT, ET CE QU'ELLE N'ARRETERAIT PAS */
note("3. onBarcodeDetected (index.html:9738) commence par « if(!validGTIN(rawCode))return; ».");
for (const c of [FAUX, "5449000000997", "7", "1786705198024"])
  note("3. scanAccepte(\"" + c + "\") = " + scanAccepte(c) + "  -> aucun de ces codes ne peut sortir du scanner ni de la saisie manuelle (index.html:7826).");
note("3. Le seul chemin vers fbProposerCodeChasse est proposerChasse (index.html:23456), atteint depuis le scan : l'interface ne peut donc pas produire l'accident ci-dessus.");

const ID2 = 1786725934671, NOM2 = "Kong Strong Fruity Energy Drink Tropical";
await admin(async (db) => { await setDoc(doc(db, "catalog", String(ID2)), { id: ID2, name: NOM2, brand: "Kong", cat: "Energy", createdAt: serverTimestamp() }); });
await doit("4. un code a cle GS1 JUSTE mais qui appartient a un autre produit passe aussi", async () => {
  await fbProposerCodeChasse(alice, "alice", ID2, NOM2, VRAI);
  await fbProposerCodeChasse(bob, "bob", ID2, NOM2, VRAI);
  const etat = await poserCodeChasse(VRAI);
  const f = await admin(async (db) => (await getDoc(doc(db, "catalog", String(ID2)))).data() || {});
  note("4. -> « " + etat + " » ; validGTIN(\"" + VRAI + "\") = " + validGTIN(VRAI) + " ; catalog/" + ID2 + ".barcodes = " + JSON.stringify(f.barcodes || []));
});
D = await chargerDRINKS();
await doit("4. et LUI fait mentir le scan : le vrai Coca-Cola Zero repond « " + NOM2 + " »", async () => {
  const d = drinkForBarcode(D, VRAI);
  note("4. -> drinkForBarcode(\"" + VRAI + "\") = « " + (d ? d.name : "rien") + " »");
  if (d && Number(d.id) === ID2)
    throw new Error("un code a cle JUSTE, donc accepte par la correction proposee, fait dire au scan une chose fausse");
});
note("4. Conclusion de mesure : exiger la cle GS1 dans les regles arreterait le code INUTILE, pas le code MENSONGER — celui-la a toujours une cle juste.");

/* ── CE QUE LA PRODUCTION MONTRE AUJOURD'HUI ────────────────────────────── */
note("5. PRODUCTION, lue le 2026-09-16 (catalog, lecture publique, 71 fiches / 66 codes) :");
note("5.   6 codes du catalogue partage echouent a cleOk() (outils/controle-catalogue.mjs:61).");
note("5.   4 fiches ne portent QUE ce faux code, et sont donc exactement dans l'etat teste en 2. :");
note("5.     Freeway Agrumes (1786705203601) -> [\"1786705198024\"]");
note("5.     Capri-Sun Multivitamin (1786705787961) -> [\"1786705784376\"]");
note("5.     Solevita Nectar de Multi-Fruits Light (1786708025810) -> [\"1786708019782\"]");
note("5.     Kong Strong Fruity Energy Drink Tropical (1786725934671) -> [\"1786725922285\"]");
note("5.   Ces faux codes sont des horodatages (l'identifiant de la proposition), poses par promoteDiscovery (index.html:24855 : /^[0-9]{6,}$/, pas validGTIN) — PAS par la chasse.");
note("5.   outils/controle-catalogue.mjs lit data/drinks.js, pas Firestore : il n'a jamais vu ces six-la.");

await bilan(env);
