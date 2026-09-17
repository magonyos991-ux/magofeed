/* VERIFICATION INDEPENDANTE — lentille « reproduction ».
   Question unique : deux comptes ANONYMES suffisent-ils a poser un code ?

   Rejoue :
     index.html:2503-2527  window.fbProposerCodeChasse   (ecriture, a l'identique)
     index.html:2505       if (user.isAnonymous) throw new Error("compte requis")
     functions-a-deployer/firestore.rules:1254-1268  match /chasseCodes/{barcode}
     functions-a-deployer/firestore.rules:913        pasAnonyme()
     functions-a-deployer/chasse-codes.js:57-58      seuil 2, 5 points
*/
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, getDocs, collection,
         serverTimestamp, increment } from "firebase/firestore";

const env = await banc("verif-chasse-anonyme");
/* Un vrai compte (e-mail / Google) : sign_in_provider != 'anonymous'. */
const alice = env.authenticatedContext("alice", { firebase: { sign_in_provider: "password" } }).firestore();
/* Deux comptes ANONYMES, tels que signInAnonymously() les produit
   (index.html:1598 et 5636) : le jeton porte sign_in_provider = 'anonymous'. */
const f1 = env.authenticatedContext("fantome1", { firebase: { sign_in_provider: "anonymous", identities: {} } }).firestore();
const f2 = env.authenticatedContext("fantome2", { firebase: { sign_in_provider: "anonymous", identities: {} } }).firestore();

const admin = async (fn) => { let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out; };

const ID = 1700000000009;              // fiche COMPLETE, elle a deja son code
const CODE_VRAI = "3068320123264";
const CODE_VOLE = "5449000054227";

await admin(async (db) => {
  await setDoc(doc(db, "catalog", String(ID)), { id: ID, name: "Fritz-Kola", brand: "Fritz", cat: "Soda", barcodes: [CODE_VRAI], createdAt: serverTimestamp() });
  await setDoc(doc(db, "stores", "mag1"), { name: "Carrefour Test", lat: 48.85, lng: 2.35 });
});

/* ── ETAPE 0 : le jeton anonyme est-il FIDELE ? ─────────────────────────────
   Si mes contextes « fantome » n'etaient pas de vrais anonymes, tout le reste
   ne prouverait rien. On les passe donc devant le SEUL verrou du depot qui
   sait distinguer un anonyme : pasAnonyme() (rules:913), utilise par
   shopClaims (rules:927). */
await doitEchouer("0. pasAnonyme() REFUSE bien fantome1 (shopClaims, rules:927) — le jeton anonyme est fidele", async () => {
  await setDoc(doc(f1, "shopClaims", "mag1"), { by: "fantome1", status: "pending", storeId: "mag1", contact: "Jean 0600000000" });
});
await doit("0. ... et ACCEPTE alice, compte e-mail — le contraste prouve que le verrou fonctionne dans l'emulateur", async () => {
  await setDoc(doc(alice, "shopClaims", "mag1"), { by: "alice", status: "pending", storeId: "mag1", contact: "Alice 0600000000" });
});

/* ── window.fbProposerCodeChasse, index.html:2503, recopiee mot pour mot,
   SANS la garde client (c'est justement elle qu'on met a l'epreuve). ─────── */
async function fbProposerCodeChasse(db, uid, drinkId, drinkName, barcode) {
  var ref = doc(db, "chasseCodes", String(barcode));
  var snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { drinkId: Number(drinkId) || drinkId, drinkName: String(drinkName).slice(0, 60),
      barcode: String(barcode), par: [uid], etat: "attente", createdAt: serverTimestamp() });
    return { nb: 1, deja: false };
  }
  var d = snap.data() || {};
  var par = Array.isArray(d.par) ? d.par : [];
  if (d.etat !== "attente") return { nb: par.length, deja: true, pose: true };
  if (par.indexOf(uid) !== -1) return { nb: par.length, deja: true };
  await updateDoc(ref, { par: par.concat([uid]) });
  return { nb: par.length + 1, deja: false };
}

/* ── ETAPE 1 : les regles laissent-elles passer un anonyme ? ──────────────── */
await doitEchouer("1. CREATE par un compte anonyme devrait etre refuse (rules:1256 n'exige que isSignedIn)", async () => {
  await fbProposerCodeChasse(f1, "fantome1", ID, "Fritz-Kola", CODE_VOLE);
});
await doitEchouer("2. UPDATE par un deuxieme compte anonyme devrait etre refuse (rules:1262)", async () => {
  const r = await fbProposerCodeChasse(f2, "fantome2", ID, "Fritz-Kola", CODE_VOLE);
  if (r.nb !== 2) throw new Error("nb=" + r.nb);
});

const etat = await admin(async (db) => (await getDoc(doc(db, "chasseCodes", CODE_VOLE))).data() || {});
note("3. -> chasseCodes/" + CODE_VOLE + " : par=" + JSON.stringify(etat.par || []) + " etat=" + etat.etat + " (seuil chasse-codes.js:57 = 2)");

/* ── ETAPE 2 : la Cloud Function, recopiee (chasse-codes.js) ─────────────── */
const SEUIL = 2, PTS = 5;
async function poserCodeChasse(id) {
  return admin(async (db) => {
    const ref = doc(db, "chasseCodes", String(id));
    const s = await getDoc(ref); if (!s.exists()) return "supprime";
    const d = s.data() || {};
    if (d.etat !== "attente") return "deja-traite";
    const par = Array.isArray(d.par) ? d.par : [];
    if (par.length < SEUIL) return "pas-assez";
    const code = String(d.barcode || ""), drinkId = String(d.drinkId || "");
    if (!code || !drinkId) return "document-incomplet";
    await updateDoc(ref, { etat: "pose", poseLe: serverTimestamp() });
    const fiche = await getDoc(doc(db, "catalog", drinkId));
    if (!fiche.exists()) { await updateDoc(ref, { etat: "sans-suite", raison: "fiche-absente" }); return "sans-suite"; }
    const codes = (fiche.data() || {}).barcodes || [];
    if (codes.indexOf(code) === -1) await setDoc(doc(db, "catalog", drinkId), { barcodes: codes.concat([code]), updatedAt: serverTimestamp() }, { merge: true });
    for (const uid of par) await setDoc(doc(db, "users", String(uid)), { pts: increment(PTS) }, { merge: true });
    return "pose";
  });
}

await doit("4. la Cloud Function refuse d'aller au bout quand les deux confirmants sont anonymes", async () => {
  const r = await poserCodeChasse(CODE_VOLE);
  const fiche = await admin(async (db) => (await getDoc(doc(db, "catalog", String(ID)))).data() || {});
  const p1 = await admin(async (db) => { const s = await getDoc(doc(db, "users", "fantome1")); return s.exists() ? (s.data().pts || 0) : 0; });
  const p2 = await admin(async (db) => { const s = await getDoc(doc(db, "users", "fantome2")); return s.exists() ? (s.data().pts || 0) : 0; });
  note("4. -> poserCodeChasse = « " + r + " » ; catalog/" + ID + " (Fritz-Kola).barcodes = " + JSON.stringify(fiche.barcodes || []) + " ; points fantome1=" + p1 + " fantome2=" + p2);
  if ((fiche.barcodes || []).includes(CODE_VOLE))
    throw new Error("un code etranger a ete pose sur une fiche complete par deux comptes anonymes, et " + (p1 + p2) + " points ont ete verses");
});

await bilan(env);
