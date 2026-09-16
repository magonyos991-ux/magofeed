/* ============================================================================
   PARCOURS : LA CHASSE AUX CODES-BARRES
   ----------------------------------------------------------------------------
   Une fiche du catalogue nee d'une proposition PHOTO n'a pas de code-barre :
   elle existe dans la recherche, mais scanner le produit ne la trouve pas. La
   chasse demande a ceux qui font les courses de la retrouver en rayon.

   CE QUE CE SCENARIO REJOUE, LIGNE PAR LIGNE :
     - index.html:23294  renderChasseCodes()      la liste affichee a Alice
     - index.html:23375  boissonsOrphelines()     qui entre dans la chasse
     - index.html:23351  proposerChasse()         l'ecran « Oui, c'est bien elle »
     - index.html:2504   window.fbProposerCodeChasse()   l'ecriture, telle quelle
     - index.html:2529   window.fbChargerChasseCodes()   la lecture, telle quelle
     - index.html:9474   validGTIN()              la cle de controle GS1
     - index.html:23451  renderFichesSansCode()   le chemin ADMIN, pour comparer
     - index.html:2493   window.fbSetCatalogBarcodes()   ecriture catalogue
     - functions-a-deployer/chasse-codes.js       la Cloud Function poserCodeChasse
     - functions-a-deployer/firestore.rules:1254  match /chasseCodes/{barcode}

   Le banc n'execute pas les Cloud Functions : poserCodeChasse() est donc
   recopiee ici a l'identique (meme ordre, memes champs, meme verrou) et jouee
   avec l'Admin SDK, exactement comme en production.
============================================================================ */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, getDocs, collection, query, where,
         serverTimestamp, increment, deleteDoc } from "firebase/firestore";

const env  = await banc("chasse-codes-barres");
const alice   = env.authenticatedContext("alice").firestore();
const bob     = env.authenticatedContext("bob").firestore();
const carl    = env.authenticatedContext("carl").firestore();
const anon    = env.unauthenticatedContext().firestore();
/* Un compte ANONYME : c'est ce que l'app cree toute seule a la premiere
   ouverture, sans e-mail ni mot de passe (auth anonyme). fbProposerCodeChasse
   le refuse explicitement (« compte requis »). Les regles, elles ? */
const fantome1 = env.authenticatedContext("fantome1", { firebase: { sign_in_provider: "anonymous", identities: {} } }).firestore();
const fantome2 = env.authenticatedContext("fantome2", { firebase: { sign_in_provider: "anonymous", identities: {} } }).firestore();

/* L'Admin SDK : les Cloud Functions et l'import du catalogue passent par la. */
/* withSecurityRulesDisabled ne renvoie pas ce que la fonction retourne : on
   recupere la valeur par la fermeture, sinon toute lecture vaut undefined. */
const admin = async (fn) => {
  let sortie;
  await env.withSecurityRulesDisabled(async (c) => { sortie = await fn(c.firestore()); });
  return sortie;
};

/* ── Le catalogue de depart ─────────────────────────────────────────────────
   Trois fiches ecrites comme fbPromoteDiscovery les ecrit (index.html:2431) :
   deux orphelines (sans barcodes : elles entrent dans la chasse) et une fiche
   normale, qui porte deja son code. */
const ID_A = 1700000000001;  // orpheline : « Cusa Cola Zero »
const ID_B = 1700000000002;  // orpheline : « Cusa Cola Cherry »
const ID_C = 1700000000003;  // fiche complete : « Fritz-Kola », code deja pose

const CODE_A     = "5449000000996";  // cle GS1 valide
const CODE_B     = "5000112637922";  // cle GS1 valide
const CODE_C     = "3068320123264";  // cle GS1 valide, DEJA sur la fiche C
const CODE_FAUX  = "5449000000997";  // 13 chiffres, mais cle de controle FAUSSE
const CODE_TEXTE = "PAS-UN-CODE";    // meme pas des chiffres

/* validGTIN(), recopiee depuis index.html:9474 — c'est le seul juge de
   l'application sur la validite d'un code-barre. */
function validGTIN(code){
  if(!/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(code))return false;
  var digits=code.split("").map(Number);
  var check=digits.pop();
  var sum=0,w=3;
  for(var i=digits.length-1;i>=0;i--){sum+=digits[i]*w;w=(w===3)?1:3;}
  return (10-(sum%10))%10===check;
}

await admin(async (db) => {
  await setDoc(doc(db, "catalog", String(ID_A)), { id: ID_A, name: "Cusa Cola Zero",   brand: "Cusa", cat: "Soda", createdAt: serverTimestamp() });
  await setDoc(doc(db, "catalog", String(ID_B)), { id: ID_B, name: "Cusa Cola Cherry", brand: "Cusa", cat: "Soda", createdAt: serverTimestamp() });
  await setDoc(doc(db, "catalog", String(ID_C)), { id: ID_C, name: "Fritz-Kola",       brand: "Fritz", cat: "Soda", barcodes: [CODE_C], createdAt: serverTimestamp() });
});

/* ── window.fbProposerCodeChasse — index.html:2504, recopiee a l'identique ── */
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

/* ── window.fbChargerChasseCodes — index.html:2529, recopiee a l'identique ── */
async function fbChargerChasseCodes(db) {
  var snap = await getDocs(query(collection(db, "chasseCodes"), where("etat", "==", "attente")));
  var out = {};
  snap.forEach(function (d) {
    var v = d.data() || {};
    out[String(v.barcode || d.id)] = { drinkId: v.drinkId, nb: (v.par || []).length };
  });
  return out;
}

/* ── functions-a-deployer/chasse-codes.js — poserCodeChasse, a l'identique ──
   Meme seuil (2), memes points (5), meme verrou 'attente' -> 'pose', meme
   ordre : verrou, fiche, codes, points. */
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
    await updateDoc(ref, { etat: "pose", poseLe: serverTimestamp() });   // le verrou
    const fiche = await getDoc(doc(db, "catalog", drinkId));
    if (!fiche.exists()) {
      await updateDoc(ref, { etat: "sans-suite", raison: "fiche-absente" });
      return "sans-suite";
    }
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
const lireChasse    = (id) => admin(async (db) => (await getDoc(doc(db, "chasseCodes", String(id)))).data() || {});
const lirePoints    = (uid) => admin(async (db) => { const s = await getDoc(doc(db, "users", String(uid))); return s.exists() ? (s.data().pts || 0) : 0; });

/* ═══ 1. ALICE VOIT LA LISTE ══════════════════════════════════════════════ */

await doit("1. un visiteur NON CONNECTE peut lire la chasse (fbChargerChasseCodes, read: if true)", async () => {
  await fbChargerChasseCodes(anon);
});
/* fbChargerChasseCodes (index.html:2529) est la SEULE lecture de l'etat
   partage de la chasse. Elle n'est appelee nulle part :
     grep -rn "fbChargerChasseCodes" index.html  ->  la definition, et rien
   d'autre. renderChasseCodes (index.html:23294) se contente de la liste locale
   boissonsOrphelines(). Aucun ecran ne peut donc dire « 1 personne a deja
   confirme » ni « ce code est deja propose pour une autre boisson ». */
note("1. fbChargerChasseCodes (index.html:2529) n'est appelee nulle part dans l'app : l'etat partage de la chasse n'est jamais affiche.");
await doit("1. Alice, connectee, lit la chasse", async () => {
  const l = await fbChargerChasseCodes(alice);
  if (Object.keys(l).length !== 0) throw new Error("la chasse devrait etre vide au depart");
});

/* ═══ 2. BOB SCANNE ET PROPOSE ════════════════════════════════════════════ */

await doit("2. Bob scanne « Cusa Cola Zero » en rayon et propose son code", async () => {
  const r = await fbProposerCodeChasse(bob, "bob", ID_A, "Cusa Cola Zero", CODE_A);
  if (r.nb !== 1) throw new Error("nb attendu 1, recu " + r.nb);
});
await doit("2. la proposition apparait dans la liste de tout le monde, avec 1 confirmation", async () => {
  const l = await fbChargerChasseCodes(anon);
  if (!l[CODE_A] || l[CODE_A].nb !== 1) throw new Error("absente ou mal comptee : " + JSON.stringify(l));
});
await doit("2. Bob qui rescanne le meme produit ne se compte pas deux fois (garde client)", async () => {
  const r = await fbProposerCodeChasse(bob, "bob", ID_A, "Cusa Cola Zero", CODE_A);
  if (!r.deja || r.nb !== 1) throw new Error("recu " + JSON.stringify(r));
});
await doitEchouer("2. ... et les regles le lui interdisent aussi, garde client contournee", async () => {
  await updateDoc(doc(bob, "chasseCodes", CODE_A), { par: ["bob", "bob"] });
});

/* ═══ 3. QUI VALIDE ? LE CLIENT PEUT-IL ECRIRE LE CATALOGUE ? ═════════════ */

await doitEchouer("3. Bob ne peut PAS ecrire le code dans le catalogue (fbSetCatalogBarcodes, catalog = isAdmin)", async () => {
  await setDoc(doc(bob, "catalog", String(ID_A)), { barcodes: [CODE_A], updatedAt: serverTimestamp() }, { merge: true });
});
await doitEchouer("3. Bob ne peut PAS se declarer valide (etat 'pose')", async () => {
  await updateDoc(doc(bob, "chasseCodes", CODE_A), { etat: "pose" });
});
await doitEchouer("3. Bob ne peut PAS creer une proposition deja posee", async () => {
  await setDoc(doc(bob, "chasseCodes", CODE_B), {
    drinkId: ID_B, drinkName: "Cusa Cola Cherry", barcode: CODE_B,
    par: ["bob"], etat: "pose", createdAt: serverTimestamp() });
});
await doitEchouer("3. Bob ne peut PAS supprimer une proposition (delete = isAdmin)", async () => {
  await deleteDoc(doc(bob, "chasseCodes", CODE_A));
});
await doit("3. Alice, deuxieme personne a avoir le produit en main, confirme", async () => {
  const r = await fbProposerCodeChasse(alice, "alice", ID_A, "Cusa Cola Zero", CODE_A);
  if (r.nb !== 2) throw new Error("nb attendu 2, recu " + r.nb);
});
await doit("3. la Cloud Function pose alors le code sur la fiche, et paie les deux", async () => {
  const etat = await poserCodeChasse(CODE_A);
  if (etat !== "pose") throw new Error("la fonction a repondu « " + etat + " »");
  const fiche = await lireCatalogue(ID_A);
  if (!(fiche.barcodes || []).includes(CODE_A)) throw new Error("code absent de la fiche");
  if (await lirePoints("bob") !== POINTS_PAR_CONFIRMANT) throw new Error("Bob n'a pas ses points");
  if (await lirePoints("alice") !== POINTS_PAR_CONFIRMANT) throw new Error("Alice n'a pas ses points");
});
await doit("3. une fois pose, le document sort de la chasse (etat != 'attente')", async () => {
  const l = await fbChargerChasseCodes(anon);
  if (l[CODE_A]) throw new Error("toujours affiche comme a chasser");
});
await doitEchouer("3. et plus personne ne peut s'y ajouter apres coup", async () => {
  await updateDoc(doc(carl, "chasseCodes", CODE_A), { par: ["bob", "alice", "carl"] });
});
note("3. parcours nominal complet : 2 confirmations -> code pose -> 5 pts a chacun. Aucune ecriture catalogue par le client.");

/* ═══ 4. UN CODE-BARRE INVALIDE PEUT-IL ETRE PROPOSE ? ════════════════════ */

note("4. validGTIN(\"" + CODE_FAUX + "\") = " + validGTIN(CODE_FAUX) + "  (index.html:9474 — cle de controle fausse)");
note("4. validGTIN(\"" + CODE_TEXTE + "\") = " + validGTIN(CODE_TEXTE) + "  (index.html:9474 — ce ne sont pas des chiffres)");

await doitEchouer("4. les regles refusent un code dont la cle de controle GS1 est fausse", async () => {
  await fbProposerCodeChasse(bob, "bob", ID_B, "Cusa Cola Cherry", CODE_FAUX);
});
await doitEchouer("4. les regles refusent un « code » qui n'est meme pas une suite de chiffres", async () => {
  await fbProposerCodeChasse(carl, "carl", ID_B, "Cusa Cola Cherry", CODE_TEXTE);
});
await doit("4. consequence : ce qui a ete accepte ci-dessus atteint 2 confirmations et part au catalogue", async () => {
  await fbProposerCodeChasse(alice, "alice", ID_B, "Cusa Cola Cherry", CODE_TEXTE).catch(() => {});
  const etat = await poserCodeChasse(CODE_TEXTE);
  const fiche = await lireCatalogue(ID_B);
  note("4. -> poserCodeChasse a repondu « " + etat + " » ; catalog/" + ID_B + ".barcodes = " + JSON.stringify(fiche.barcodes || []));
  if ((fiche.barcodes || []).includes(CODE_TEXTE))
    throw new Error("« " + CODE_TEXTE + " » est desormais un code-barre du catalogue partage");
});

/* ═══ 5. LE MEME CODE POUR DEUX BOISSONS / UN CODE VOLE ══════════════════ */

/* Alice se trompe de variante et propose CODE_B pour la Zero.
   Bob, lui, a la Cherry en main : le scan la reconnait (proposerChasse,
   index.html:23351) et il repond « Oui, c'est bien elle ». */
await doit("5. Alice propose CODE_B pour « Cusa Cola Zero » (elle s'est trompee de variante)", async () => {
  const r = await fbProposerCodeChasse(alice, "alice", ID_A, "Cusa Cola Zero", CODE_B);
  if (r.nb !== 1) throw new Error("nb attendu 1, recu " + r.nb);
});
await doit("5. Bob a la CHERRY en main et repond « Oui, c'est bien elle » : l'app lui dit que c'est note", async () => {
  const r = await fbProposerCodeChasse(bob, "bob", ID_B, "Cusa Cola Cherry", CODE_B);
  note("5. -> ce que l'ecran affiche a Bob : nb=" + r.nb + (r.nb >= 2
      ? "  « Une deuxieme personne l'avait deja vue : le code va etre pose pour tout le monde. »"
      : ""));
  if (r.nb !== 2) throw new Error("nb attendu 2, recu " + r.nb);
});
await doit("5. la confirmation de Bob pour la CHERRY doit viser la CHERRY", async () => {
  const d = await lireChasse(CODE_B);
  if (String(d.drinkId) !== String(ID_B))
    throw new Error("le document vise toujours « " + d.drinkName + " » (id " + d.drinkId + "), pas « Cusa Cola Cherry » (id " + ID_B + ")");
});
await doit("5. et le code doit finir sur la CHERRY, pas ailleurs", async () => {
  await poserCodeChasse(CODE_B);
  const cherry = await lireCatalogue(ID_B);
  const zero   = await lireCatalogue(ID_A);
  note("5. -> catalog/" + ID_B + " (Cherry).barcodes = " + JSON.stringify(cherry.barcodes || []) +
       " ; catalog/" + ID_A + " (Zero).barcodes = " + JSON.stringify(zero.barcodes || []));
  if (!(cherry.barcodes || []).includes(CODE_B))
    throw new Error("CODE_B a ete pose sur « " + (zero.name || "?") + " » alors que Bob confirmait la Cherry");
});

/* Le vol : CODE_C appartient DEJA a « Fritz-Kola » (fiche C, complete).
   Le chemin ADMIN refuse ce cas (index.html:23451 : « Ce code est deja sur
   ... »). Le chemin communautaire, lui ? */
await doit("5. deux personnes proposent CODE_C — deja porte par « Fritz-Kola » — pour la Zero", async () => {
  await fbProposerCodeChasse(bob, "bob", ID_A, "Cusa Cola Zero", CODE_C);
  const r = await fbProposerCodeChasse(carl, "carl", ID_A, "Cusa Cola Zero", CODE_C);
  if (r.nb !== 2) throw new Error("nb attendu 2, recu " + r.nb);
});
await doit("5. apres la pose, UN SEUL produit du catalogue porte CODE_C (sinon le scan est un tirage au sort)", async () => {
  await poserCodeChasse(CODE_C);
  const porteurs = await admin(async (db) => {
    const snap = await getDocs(collection(db, "catalog"));
    const out = [];
    snap.forEach((d) => { if (((d.data() || {}).barcodes || []).includes(CODE_C)) out.push((d.data() || {}).name); });
    return out;
  });
  note("5. -> fiches du catalogue portant " + CODE_C + " : " + JSON.stringify(porteurs));
  if (porteurs.length !== 1) throw new Error(porteurs.length + " fiches portent le meme code : " + JSON.stringify(porteurs));
});

/* L'unicite du lien repose entierement sur UNE convention : le nom du document
   EST le code-barre (fbProposerCodeChasse, index.html:2506). Les regles de
   /discoveries imposent cette convention (rules:689 : barcode == id) ; celles
   de /chasseCodes ne la verifient pas. */
await doitEchouer("5. les regles exigent que le nom du document soit le code (comme /discoveries, rules:689)", async () => {
  await setDoc(doc(carl, "chasseCodes", "un-nom-libre"), {
    drinkId: ID_B, drinkName: "Cusa Cola Cherry", barcode: "5449000054197",
    par: ["carl"], etat: "attente", createdAt: serverTimestamp() });
});
await doit("5. consequence : deux documents ne peuvent pas viser le MEME code pour deux boissons", async () => {
  /* Bob, lui, passe par l'app : elle ecrit sous le nom = le code. Les deux
     documents coexistent, chacun avec sa boisson, chacun avec son compteur. */
  await fbProposerCodeChasse(bob, "bob", ID_A, "Cusa Cola Zero", "5449000054197").catch(() => {});
  const vus = await admin(async (db) => {
    const snap = await getDocs(collection(db, "chasseCodes"));
    const out = [];
    snap.forEach((d) => { if ((d.data() || {}).barcode === "5449000054197") out.push(d.id + " -> " + (d.data() || {}).drinkName); });
    return out;
  });
  note("5. -> documents portant le code 5449000054197 : " + JSON.stringify(vus));
  if (vus.length !== 1) throw new Error(vus.length + " documents visent le meme code : " + JSON.stringify(vus));
});

/* ═══ 6. ECRASER LA PROPOSITION D'UN AUTRE ═══════════════════════════════ */

await doit("6. Bob depose une proposition pour la Cherry", async () => {
  const r = await fbProposerCodeChasse(bob, "bob", ID_B, "Cusa Cola Cherry", "4062139001132");
  if (r.nb !== 1) throw new Error("nb attendu 1, recu " + r.nb);
});
await doitEchouer("6. Carl ne peut pas ECRASER le document et le detourner vers une autre boisson", async () => {
  await setDoc(doc(carl, "chasseCodes", "4062139001132"), {
    drinkId: ID_A, drinkName: "Cusa Cola Zero", barcode: "4062139001132",
    par: ["carl"], etat: "attente", createdAt: serverTimestamp() });
});
await doitEchouer("6. Carl ne peut pas changer la boisson visee", async () => {
  await updateDoc(doc(carl, "chasseCodes", "4062139001132"), { drinkId: ID_A });
});
await doitEchouer("6. Carl ne peut pas changer le code", async () => {
  await updateDoc(doc(carl, "chasseCodes", "4062139001132"), { barcode: CODE_A });
});
await doitEchouer("6. Carl ne peut pas EFFACER Bob de la liste des confirmants", async () => {
  await updateDoc(doc(carl, "chasseCodes", "4062139001132"), { par: ["carl"] });
});
await doitEchouer("6. Carl ne peut pas ajouter QUELQU'UN D'AUTRE que lui (une identite inventee)", async () => {
  await updateDoc(doc(carl, "chasseCodes", "4062139001132"), { par: ["bob", "mallory"] });
});
await doitEchouer("6. Carl ne peut pas se glisser en ajoutant deux personnes d'un coup", async () => {
  await updateDoc(doc(carl, "chasseCodes", "4062139001132"), { par: ["bob", "carl", "mallory"] });
});
await doit("6. Carl ne peut QUE s'ajouter lui-meme, une fois — et c'est ce que fait l'app", async () => {
  const r = await fbProposerCodeChasse(carl, "carl", ID_B, "Cusa Cola Cherry", "4062139001132");
  if (r.nb !== 2) throw new Error("nb attendu 2, recu " + r.nb);
});
note("6. la liste des confirmants est infalsifiable : seul « l'ancienne liste + moi » passe.");

/* ═══ BONUS — QUI A LE DROIT DE CONFIRMER ? ══════════════════════════════
   fbProposerCodeChasse (index.html:2505-2506) commence par :
       var user = await ensureAuthed();
       if (user.isAnonymous) throw new Error("compte requis");
   Les regles, elles, se contentent de isSignedIn() (rules:1257). Le depot
   connait pourtant le verrou : pasAnonyme() existe (rules:914). */

await doitEchouer("B. un compte ANONYME ne devrait pas pouvoir proposer un code (client : « compte requis »)", async () => {
  await fbProposerCodeChasse(fantome1, "fantome1", ID_B, "Cusa Cola Cherry", "90311017");
});
await doitEchouer("B. les regles devraient exiger que la boisson visee soit une fiche SANS code (boissonsOrphelines, index.html:23375)", async () => {
  await setDoc(doc(fantome1, "chasseCodes", "5449000054227"), {
    drinkId: ID_C, drinkName: "Fritz-Kola", barcode: "5449000054227",
    par: ["fantome1"], etat: "attente", createdAt: serverTimestamp() });
});
await doit("B. consequence : deux comptes anonymes du meme telephone suffisent a poser un code sur une fiche deja complete", async () => {
  await fbProposerCodeChasse(fantome2, "fantome2", ID_C, "Fritz-Kola", "5449000054227").catch(() => {});
  const etat = await poserCodeChasse("5449000054227");
  const fiche = await lireCatalogue(ID_C);
  note("B. -> poserCodeChasse : « " + etat + " » ; catalog/" + ID_C + " (Fritz-Kola).barcodes = " + JSON.stringify(fiche.barcodes || []));
  note("B. -> points verses aux deux comptes anonymes : fantome1=" + (await lirePoints("fantome1")) + " fantome2=" + (await lirePoints("fantome2")));
  if ((fiche.barcodes || []).includes("5449000054227"))
    throw new Error("un code etranger a ete ajoute a « Fritz-Kola » par deux comptes anonymes");
});

await bilan(env);
