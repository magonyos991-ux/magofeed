/* ============================================================================
   VERIFICATION D'INTENTION — « les regles de chasseCodes ne reprennent pas le
   "compte requis" du client ». Bug, choix, ou lacune ?

   CE QUE CE SCENARIO REJOUE :
     - index.html:2503  window.fbProposerCodeChasse()  (la garde client ligne 2505)
     - functions-a-deployer/chasse-codes.js:63  poserCodeChasse (seuil 2, 5 pts)
     - functions-a-deployer/firestore.rules:1254  match /chasseCodes/{barcode}

   LA QUESTION N'EST PAS « est-ce que l'anonyme passe » (c'est verifie ailleurs),
   MAIS : « le correctif propose (pasAnonyme(), rules:913) fermerait-il le
   chemin decrit ? ». On rejoue donc exactement la meme attaque avec deux
   comptes que pasAnonyme() LAISSE PASSER (sign_in_provider = 'password' :
   deux inscriptions e-mail faites en dix secondes).
============================================================================ */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, serverTimestamp, increment } from "firebase/firestore";

const env = await banc("verif-intention-chasse-anonyme");

/* Deux sessions anonymes : ce que l'app cree toute seule (auth anonyme). */
const fantome1 = env.authenticatedContext("fantome1", { firebase: { sign_in_provider: "anonymous", identities: {} } }).firestore();
const fantome2 = env.authenticatedContext("fantome2", { firebase: { sign_in_provider: "anonymous", identities: {} } }).firestore();
/* Deux comptes e-mail jetables : ce que pasAnonyme() (rules:913) accepte. */
const jetable1 = env.authenticatedContext("jetable1", { firebase: { sign_in_provider: "password", identities: { email: ["a@jetable.test"] } } }).firestore();
const jetable2 = env.authenticatedContext("jetable2", { firebase: { sign_in_provider: "password", identities: { email: ["b@jetable.test"] } } }).firestore();

const admin = async (fn) => { let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out; };

const ID_ORPHELINE = 1700000000011;   // fiche nee d'une proposition PHOTO : sans code
const ID_COMPLETE  = 1700000000012;   // fiche qui porte deja son code
const CODE_DEJA    = "3068320123264";

await admin(async (db) => {
  await setDoc(doc(db, "catalog", String(ID_ORPHELINE)), { id: ID_ORPHELINE, name: "Cusa Cola Zero", brand: "Cusa", cat: "Soda", createdAt: serverTimestamp() });
  await setDoc(doc(db, "catalog", String(ID_COMPLETE)),  { id: ID_COMPLETE,  name: "Fritz-Kola",     brand: "Fritz", cat: "Soda", barcodes: [CODE_DEJA], createdAt: serverTimestamp() });
});

/* window.fbProposerCodeChasse — index.html:2503, recopiee sans la garde client
   (c'est justement la garde qu'on teste : elle n'existe que dans le navigateur). */
async function fbProposerCodeChasse(db, uid, drinkId, drinkName, barcode) {
  const ref = doc(db, "chasseCodes", String(barcode));
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { drinkId: Number(drinkId) || drinkId, drinkName: String(drinkName).slice(0, 60),
      barcode: String(barcode), par: [uid], etat: "attente", createdAt: serverTimestamp() });
    return { nb: 1 };
  }
  const d = snap.data() || {};
  const par = Array.isArray(d.par) ? d.par : [];
  if (d.etat !== "attente") return { nb: par.length, pose: true };
  if (par.indexOf(uid) !== -1) return { nb: par.length, deja: true };
  await updateDoc(ref, { par: par.concat([uid]) });
  return { nb: par.length + 1 };
}

/* chasse-codes.js:63 — poserCodeChasse, meme seuil, memes points, meme ordre. */
const CONFIRMATIONS_REQUISES = 2, POINTS_PAR_CONFIRMANT = 5;
async function poserCodeChasse(id) {
  return admin(async (db) => {
    const ref = doc(db, "chasseCodes", String(id));
    const s = await getDoc(ref);
    if (!s.exists()) return "supprime";
    const d = s.data() || {};
    if (d.etat !== "attente") return "deja-traite";
    const par = Array.isArray(d.par) ? d.par : [];
    if (par.length < CONFIRMATIONS_REQUISES) return "pas-assez";
    const code = String(d.barcode || id), drinkId = String(d.drinkId || "");
    await updateDoc(ref, { etat: "pose", poseLe: serverTimestamp() });
    const fiche = await getDoc(doc(db, "catalog", drinkId));
    if (!fiche.exists()) { await updateDoc(ref, { etat: "sans-suite", raison: "fiche-absente" }); return "sans-suite"; }
    const codes = (fiche.data() || {}).barcodes || [];
    if (codes.indexOf(code) === -1)
      await setDoc(doc(db, "catalog", drinkId), { barcodes: codes.concat([code]), updatedAt: serverTimestamp() }, { merge: true });
    for (const uid of par) await setDoc(doc(db, "users", String(uid)), { pts: increment(POINTS_PAR_CONFIRMANT) }, { merge: true });
    return "pose";
  });
}
const lireCatalogue = (id) => admin(async (db) => (await getDoc(doc(db, "catalog", String(id)))).data() || {});
const lirePoints = (uid) => admin(async (db) => { const s = await getDoc(doc(db, "users", String(uid))); return s.exists() ? (s.data().pts || 0) : 0; });

/* ═══ A. LE FAIT : deux sessions anonymes atteignent le seuil ══════════════ */
await doit("A. deux sessions ANONYMES atteignent les 2 confirmations (rules:1256 = isSignedIn)", async () => {
  await fbProposerCodeChasse(fantome1, "fantome1", ID_ORPHELINE, "Cusa Cola Zero", "5449000054197");
  const r = await fbProposerCodeChasse(fantome2, "fantome2", ID_ORPHELINE, "Cusa Cola Zero", "5449000054197");
  if (r.nb !== 2) throw new Error("nb attendu 2, recu " + r.nb);
});
await doit("A. -> le code part au catalogue et les deux sessions sont payees", async () => {
  const etat = await poserCodeChasse("5449000054197");
  note("A. -> poserCodeChasse : « " + etat + " » ; points : fantome1=" + (await lirePoints("fantome1")) + " fantome2=" + (await lirePoints("fantome2")));
});

/* ═══ B. LE CORRECTIF PROPOSE FERMERAIT-IL CE CHEMIN ? ════════════════════
   pasAnonyme() (rules:913) ne regarde qu'une chose : sign_in_provider !=
   'anonymous'. Deux inscriptions e-mail passent donc. On rejoue a l'identique. */
await doit("B. deux comptes E-MAIL jetables font exactement la meme chose (ce que pasAnonyme() laisse passer)", async () => {
  await fbProposerCodeChasse(jetable1, "jetable1", ID_ORPHELINE, "Cusa Cola Zero", "5000112637922");
  const r = await fbProposerCodeChasse(jetable2, "jetable2", ID_ORPHELINE, "Cusa Cola Zero", "5000112637922");
  if (r.nb !== 2) throw new Error("nb attendu 2, recu " + r.nb);
});
await doit("B. -> meme resultat : code pose, 5 points a chacun", async () => {
  const etat = await poserCodeChasse("5000112637922");
  const fiche = await lireCatalogue(ID_ORPHELINE);
  note("B. -> poserCodeChasse : « " + etat + " » ; catalog/" + ID_ORPHELINE + ".barcodes = " + JSON.stringify(fiche.barcodes || []));
  note("B. -> points : jetable1=" + (await lirePoints("jetable1")) + " jetable2=" + (await lirePoints("jetable2")));
  if (etat !== "pose") throw new Error("la fonction a repondu « " + etat + " »");
});
note("B. CONCLUSION : pasAnonyme() deplacerait le cout de « deux navigations privees » a « deux inscriptions e-mail ». Le chemin reste ouvert.");

/* ═══ C. LE DEGAT ANNONCE (« Fritz-Kola ») VIENT-IL DE L'ANONYMAT ? ═══════
   Rejeu du meme detournement avec deux comptes NON anonymes. Si ca passe
   aussi, le degat ne tient pas a l'anonymat mais a l'absence de controle sur
   la fiche visee (aucune regle n'exige qu'elle soit orpheline). */
await doit("C. deux comptes NON anonymes posent un code etranger sur « Fritz-Kola », fiche deja complete", async () => {
  await fbProposerCodeChasse(jetable1, "jetable1", ID_COMPLETE, "Fritz-Kola", "4062139001132");
  const r = await fbProposerCodeChasse(jetable2, "jetable2", ID_COMPLETE, "Fritz-Kola", "4062139001132");
  if (r.nb !== 2) throw new Error("nb attendu 2, recu " + r.nb);
  await poserCodeChasse("4062139001132");
  const fiche = await lireCatalogue(ID_COMPLETE);
  note("C. -> catalog/" + ID_COMPLETE + " (Fritz-Kola).barcodes = " + JSON.stringify(fiche.barcodes || []));
  if (!(fiche.barcodes || []).includes("4062139001132"))
    throw new Error("le code n'a pas ete pose : le degat tiendrait donc a l'anonymat");
});
note("C. CONCLUSION : le degat « code etranger sur une fiche complete » se produit a l'identique sans le moindre compte anonyme.");

/* ═══ D. LA VRAIE BARRIERE DU DEPOT, EST-ELLE APPLIQUEE ICI ? ═════════════
   anti-farm.js:170-184 face au meme probleme (« deux comptes anonymes crees en
   dix secondes ») n'a PAS choisi pasAnonyme() : il exige, cote serveur, un
   compte avec un provider reel ET vieux de 7 jours. poserCodeChasse
   (chasse-codes.js:63-130) ne lit jamais getAuth().getUser() : il compte des
   uid distincts, un point c'est tout. */
note("D. chasse-codes.js ne contient ni getAuth() ni providerData ni creationTime : le controle anti-farm du depot n'est pas applique a la chasse.");

await bilan(env);
