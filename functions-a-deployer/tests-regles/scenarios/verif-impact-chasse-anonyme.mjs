/* VERIFICATION INDEPENDANTE — lentille « IMPACT ».
   La trouvaille dit : les regles acceptent un compte ANONYME la ou le client
   exige un vrai compte (index.html:2505). La question ici n'est PAS « est-ce
   vrai » (ca l'est, rules:1256/1262 n'exigent que isSignedIn) mais :
   QU'EST-CE QUE CA CHANGE POUR QUELQU'UN ?

   Chemins compares, tels que l'application les vit :
     index.html:2503-2529  window.fbProposerCodeChasse  (ecriture recopiee)
     index.html:2505       if (user.isAnonymous) throw new Error("compte requis")
     index.html:23454-23474 l'ecran du scan, et le toast « Cree un compte... »
     index.html:4920       window.fbEmailSignUp -> createUserWithEmailAndPassword
                           (aucune verification d'adresse nulle part)
     index.html:3192,3220  window.fbLoadLeaderboard : orderBy("points"), et
                           « contributions <= 0 » ecarte le compte
     functions-a-deployer/chasse-codes.js:57-58,122-127  seuil 2, +5 dans `pts`
     firestore.rules:914   pasAnonyme(), le verrou que la trouvaille reclame
*/
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, getDocs, collection, query, orderBy,
         limit, serverTimestamp, increment } from "firebase/firestore";

const env = await banc("verif-impact-chasse-anonyme");

/* Deux comptes ANONYMES, tels que signInAnonymously() les fabrique. */
const anon1 = env.authenticatedContext("fantome1", { firebase: { sign_in_provider: "anonymous", identities: {} } }).firestore();
const anon2 = env.authenticatedContext("fantome2", { firebase: { sign_in_provider: "anonymous", identities: {} } }).firestore();
/* Deux comptes E-MAIL, ceux que le client exige : fabriques en 10 secondes
   avec deux adresses inventees (index.html:4920, aucune verification). */
const mail1 = env.authenticatedContext("jetable1", { firebase: { sign_in_provider: "password", identities: { email: ["a@b.cd"] } } }).firestore();
const mail2 = env.authenticatedContext("jetable2", { firebase: { sign_in_provider: "password", identities: { email: ["c@d.ef"] } } }).firestore();

const admin = async (fn) => { let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out; };

const ID = 1700000000009;
const CODE_A = "5449000054221";   // le code pose par la paire ANONYME
const CODE_B = "5449000054222";   // le code pose par la paire E-MAIL

await admin(async (db) => {
  await setDoc(doc(db, "catalog", String(ID)), { id: ID, name: "Fritz-Kola", brand: "Fritz", cat: "Soda", barcodes: [], createdAt: serverTimestamp() });
  await setDoc(doc(db, "stores", "mag1"), { name: "Carrefour Test", lat: 48.85, lng: 2.35 });
});

/* Le jeton anonyme est-il fidele ? pasAnonyme() (rules:914) est le seul juge. */
await doitEchouer("0. le jeton « fantome1 » est bien anonyme (pasAnonyme le refuse sur shopClaims)", async () => {
  await setDoc(doc(anon1, "shopClaims", "mag1"), { by: "fantome1", status: "pending", storeId: "mag1", contact: "X 0600000000" });
});

/* window.fbProposerCodeChasse — index.html:2503. La garde client est un
   PARAMETRE ici : c'est exactement ce qu'on met a l'epreuve. */
async function fbProposerCodeChasse(db, uid, estAnonyme, drinkId, drinkName, barcode) {
  if (estAnonyme) throw new Error("compte requis");            // index.html:2505
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

/* chasse-codes.js recopiee (seuil, pose, points). */
const SEUIL = 2, PTS = 5;
async function poserCodeChasse(code) {
  return admin(async (db) => {
    const ref = doc(db, "chasseCodes", String(code));
    const s = await getDoc(ref); if (!s.exists()) return "absent";
    const d = s.data() || {};
    if (d.etat !== "attente") return "deja-traite";
    const par = Array.isArray(d.par) ? d.par : [];
    if (par.length < SEUIL) return "pas-assez";
    const drinkId = String(d.drinkId || ""); if (!drinkId) return "incomplet";
    await updateDoc(ref, { etat: "pose", poseLe: serverTimestamp() });
    const fiche = await getDoc(doc(db, "catalog", drinkId));
    if (!fiche.exists()) { await updateDoc(ref, { etat: "sans-suite", raison: "fiche-absente" }); return "sans-suite"; }
    const codes = (fiche.data() || {}).barcodes || [];
    if (codes.indexOf(String(code)) === -1)
      await setDoc(doc(db, "catalog", drinkId), { barcodes: codes.concat([String(code)]), updatedAt: serverTimestamp() }, { merge: true });
    for (const uid of par) await setDoc(doc(db, "users", String(uid)), { pts: increment(PTS) }, { merge: true });
    return "pose";
  });
}

/* ── A. LE CHEMIN DE LA PERSONNE ORDINAIRE ────────────────────────────────
   Premiere ouverture de l'app : compte anonyme automatique. Elle scanne en
   rayon, l'ecran propose « Elle est dans la chasse ! », elle tape « Oui ». */
await doit("A. l'anonyme qui passe par l'APPLICATION est arrete avant toute ecriture (toast « Cree un compte pour participer a la chasse »)", async () => {
  let vu = "";
  try { await fbProposerCodeChasse(anon1, "fantome1", true, ID, "Fritz-Kola", CODE_A); }
  catch (e) { vu = String(e.message); }
  if (vu !== "compte requis") throw new Error("garde client absente : " + vu);
  const s = await admin(async (db) => await getDoc(doc(db, "chasseCodes", CODE_A)));
  if (s.exists()) throw new Error("un document a quand meme ete ecrit");
});

/* ── B. LE CHEMIN DE CELUI QUI CONTOURNE L'APPLICATION ────────────────────
   Il ne tape plus dans l'app : il appelle Firestore directement, avec un
   jeton anonyme obtenu par la cle publique. La garde client n'existe plus. */
await doitEchouer("B. hors application, un compte ANONYME est accepte par les regles (create, rules:1256)", async () => {
  await fbProposerCodeChasse(anon1, "fantome1", false, ID, "Fritz-Kola", CODE_A);
});
await doitEchouer("B. ... et un second anonyme atteint le seuil (update, rules:1262)", async () => {
  const r = await fbProposerCodeChasse(anon2, "fantome2", false, ID, "Fritz-Kola", CODE_A);
  if (r.nb !== 2) throw new Error("nb=" + r.nb);
});
const rA = await poserCodeChasse(CODE_A);
note("B. -> paire ANONYME : poserCodeChasse = « " + rA + " »");

/* ── C. LE MEME GESTE AVEC LE COMPTE QUE LE CLIENT EXIGE ──────────────────
   C'est le TEMOIN : si pasAnonyme() etait ajoute demain aux regles, voici ce
   que le meme individu ferait a la place — deux inscriptions e-mail, sans
   verification d'adresse (index.html:4920). Meme resultat ou non ? */
await doit("C. TEMOIN : deux comptes e-mail jetables (ce que le client autorise) posent le meme genre de code", async () => {
  const r1 = await fbProposerCodeChasse(mail1, "jetable1", false, ID, "Fritz-Kola", CODE_B);
  const r2 = await fbProposerCodeChasse(mail2, "jetable2", false, ID, "Fritz-Kola", CODE_B);
  if (r1.nb !== 1 || r2.nb !== 2) throw new Error("nb=" + r1.nb + "/" + r2.nb);
});
const rB = await poserCodeChasse(CODE_B);
note("C. -> paire E-MAIL : poserCodeChasse = « " + rB + " »");

const fiche = await admin(async (db) => (await getDoc(doc(db, "catalog", String(ID)))).data() || {});
note("D. catalog/" + ID + ".barcodes = " + JSON.stringify(fiche.barcodes || []) +
     "  (A=anonymes, B=e-mails jetables)");
await doit("D. le mal fait est IDENTIQUE des deux cotes : pasAnonyme() aurait change l'etiquette du compte, pas le resultat", async () => {
  const b = fiche.barcodes || [];
  if (!b.includes(CODE_A) || !b.includes(CODE_B))
    throw new Error("resultats differents : anonyme=" + b.includes(CODE_A) + " e-mail=" + b.includes(CODE_B));
});

/* ── E. « CHACUN ENCAISSE 5 POINTS » : ou vont-ils vraiment ? ─────────────
   chasse-codes.js:125 ecrit `pts`. Le classement, lui, lit `points`
   (index.html:3192) et ecarte tout compte sans contribution (index.html:3220). */
const profils = await admin(async (db) => {
  const out = {};
  for (const u of ["fantome1", "fantome2", "jetable1", "jetable2"]) {
    const s = await getDoc(doc(db, "users", u));
    out[u] = s.exists() ? s.data() : null;
  }
  return out;
});
note("E. users/fantome1 = " + JSON.stringify(profils.fantome1) + " ; users/jetable1 = " + JSON.stringify(profils.jetable1));

/* On rejoue la requete EXACTE du classement (index.html:3192). */
const classement = await (async () => {
  const snap = await getDocs(query(collection(anon1, "users"), orderBy("points", "desc"), limit(30)));
  const lignes = [];
  snap.forEach((d) => {
    const data = d.data() || {};
    const contributions = (Number(data.confirms) || 0) + (Number(data.signals) || 0) + (Number(data.discAccepted) || 0);
    if (contributions <= 0) return;
    lignes.push(d.id);
  });
  return lignes;
})();
note("E. classement rejoue (orderBy \"points\", contributions>0) = " + JSON.stringify(classement));
await doit("E. les 5 points encaisses n'apparaissent NULLE PART pour l'utilisateur : ecrits dans `pts`, le classement lit `points`", async () => {
  if (classement.includes("fantome1") || classement.includes("fantome2"))
    throw new Error("un compte anonyme est entre dans le classement");
  const p = profils.fantome1 || {};
  if (p.points !== undefined) throw new Error("le score officiel a bouge : points=" + p.points);
});

await bilan(env);
