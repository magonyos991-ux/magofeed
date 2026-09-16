/* ============================================================================
   VERIFICATION INDEPENDANTE — « les regles n'exigent aucun format de code »
   ----------------------------------------------------------------------------
   Question unique : un « code-barre » qui n'en est pas un peut-il traverser
   /chasseCodes et finir dans catalog.barcodes ?

   Ce qui est rejoue, a l'identique :
     - index.html:2503   window.fbProposerCodeChasse()  (l'ecriture, telle quelle)
     - index.html:9501   validGTIN()                    (le seul juge de l'app)
     - index.html:9738   onBarcodeDetected()            « if(!validGTIN(rawCode))return; »
     - functions-a-deployer/chasse-codes.js:60-110      poserCodeChasse
     - functions-a-deployer/firestore.rules:1254-1268   match /chasseCodes
============================================================================ */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, serverTimestamp, increment } from "firebase/firestore";

const env   = await banc("verif-codebarres-format");
const alice = env.authenticatedContext("alice").firestore();
const bob   = env.authenticatedContext("bob").firestore();

const admin = async (fn) => { let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out; };

/* validGTIN, recopiee depuis index.html:9501 */
function validGTIN(code){
  if(!/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(code))return false;
  var digits=code.split("").map(Number);
  var check=digits.pop();
  var sum=0,w=3;
  for(var i=digits.length-1;i>=0;i--){sum+=digits[i]*w;w=(w===3)?1:3;}
  return (10-(sum%10))%10===check;
}

/* window.fbProposerCodeChasse — index.html:2503, a l'identique (ensureAuthed
   en moins : le banc fournit deja l'identite). */
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

/* poserCodeChasse — chasse-codes.js, meme seuil, meme ordre, meme verrou. */
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
const lireCat = (id) => admin(async (db) => (await getDoc(doc(db, "catalog", String(id)))).data() || {});

const ID = 1700000000009;   // fiche orpheline, nee d'une proposition PHOTO
await admin(async (db) => { await setDoc(doc(db, "catalog", String(ID)), { id: ID, name: "Cusa Cola Zero", brand: "Cusa", cat: "Soda", createdAt: serverTimestamp() }); });

/* ── 0. SANITE : les regles s'appliquent bien a mes ecritures ───────────── */
await doitEchouer("0. sanite : un code de 21 caracteres est refuse (rules:1261, size() <= 20)", async () => {
  await fbProposerCodeChasse(bob, "bob", ID, "Cusa Cola Zero", "123456789012345678901");
});
await doitEchouer("0. sanite : creer avec etat 'pose' est refuse (rules:1259)", async () => {
  await setDoc(doc(bob, "chasseCodes", "5449000000996"), {
    drinkId: ID, drinkName: "Cusa Cola Zero", barcode: "5449000000996",
    par: ["bob"], etat: "pose", createdAt: serverTimestamp() });
});
note("0. les regles repondent : ce qui passe ci-dessous passe donc vraiment.");

/* ── 1. CE QUE L'APPLICATION, ELLE, REFUSE ─────────────────────────────── */
for (const c of ["5449000000997", "PAS-UN-CODE", "7", "0000000"])
  note("1. validGTIN(\"" + c + "\") = " + validGTIN(c) + "   (index.html:9501)");
note("1. onBarcodeDetected (index.html:9738) commence par « if(!validGTIN(rawCode))return; » : aucun de ces quatre ne peut sortir du scan.");

/* ── 2. CE QUE LES REGLES, ELLES, ACCEPTENT ────────────────────────────── */
await doitEchouer("2. les regles refusent un code a cle GS1 fausse (5449000000997)", async () => {
  await fbProposerCodeChasse(bob, "bob", ID, "Cusa Cola Zero", "5449000000997");
});
await doitEchouer("2. les regles refusent un « code » qui n'est pas une suite de chiffres", async () => {
  await fbProposerCodeChasse(bob, "bob", ID, "Cusa Cola Zero", "PAS-UN-CODE");
});
await doitEchouer("2. les regles refusent un code d'UN SEUL chiffre (aucune longueur minimale)", async () => {
  await fbProposerCodeChasse(bob, "bob", ID, "Cusa Cola Zero", "7");
});

/* ── 3. JUSQU'OU CA VA ? ───────────────────────────────────────────────── */
await doit("3. deux personnes confirment « PAS-UN-CODE » et la fonction le pose", async () => {
  await fbProposerCodeChasse(alice, "alice", ID, "Cusa Cola Zero", "PAS-UN-CODE").catch(() => {});
  const etat = await poserCodeChasse("PAS-UN-CODE");
  const f = await lireCat(ID);
  note("3. -> poserCodeChasse : « " + etat + " » ; catalog/" + ID + ".barcodes = " + JSON.stringify(f.barcodes || []));
  if ((f.barcodes || []).includes("PAS-UN-CODE"))
    throw new Error("« PAS-UN-CODE » est un code-barre du catalogue partage");
});

await bilan(env);
