/* ============================================================================
   VERIFICATION, LENTILLE « REPRODUCTION »
   Trouvaille : « fbChargerChasseCodes n'est appelee nulle part : l'etat
   partage de la chasse n'est jamais affiche » (index.html:2529).

   CE QUE CE SCENARIO REJOUE, LIGNE PAR LIGNE (numeros verifies ce jour) :
     - index.html:2503   window.fbProposerCodeChasse()   l'ecriture, telle quelle
     - index.html:2529   window.fbChargerChasseCodes()   la lecture, telle quelle
     - index.html:23491  boissonsOrphelines()            la SEULE source de l'ecran
     - index.html:23374  renderChasseCodes()             la carte d'accueil
     - index.html:23390  ouvrirChasseCodes()             la feuille « la chasse »
     - index.html:23431  proposerChasse()                le message apres le scan
     - index.html:10903  mergeCatalog()                  comment DRINKS recoit barcodes
     - functions-a-deployer/firestore.rules:1254  match /chasseCodes/{barcode}

   LA QUESTION : le serveur sait-il des choses que ces deux ecrans ne
   demandent jamais ? Et l'utilisateur en paie-t-il le prix ?
============================================================================ */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, getDocs, collection, query, where,
         serverTimestamp } from "firebase/firestore";

const env   = await banc("verif-chasse-jamais-lue");
const alice = env.authenticatedContext("alice").firestore();
const bob   = env.authenticatedContext("bob").firestore();
const carl  = env.authenticatedContext("carl").firestore();
const anon  = env.unauthenticatedContext().firestore();

const admin = async (fn) => {
  let sortie;
  await env.withSecurityRulesDisabled(async (c) => { sortie = await fn(c.firestore()); });
  return sortie;
};

/* Deux fiches nees d'une proposition PHOTO : id a 13 chiffres (Date.now()),
   aucun code-barre. Ce sont exactement les fiches que boissonsOrphelines()
   retient. */
const ID_ZERO   = 1700000000001;  // « Cusa Cola Zero »
const ID_CHERRY = 1700000000002;  // « Cusa Cola Cherry »
const CODE_ZERO   = "5449000000996";  // cle GS1 valide
const CODE_CHERRY = "5000112637922";  // cle GS1 valide

await admin(async (db) => {
  await setDoc(doc(db, "catalog", String(ID_ZERO)),
    { id: ID_ZERO, name: "Cusa Cola Zero", brand: "Cusa", cat: "Soda", createdAt: serverTimestamp() });
  await setDoc(doc(db, "catalog", String(ID_CHERRY)),
    { id: ID_CHERRY, name: "Cusa Cola Cherry", brand: "Cusa", cat: "Soda", createdAt: serverTimestamp() });
});

/* ── L'ETAT DU TELEPHONE ───────────────────────────────────────────────────
   window.DRINKS tel que mergeCatalog (index.html:10903) le construit a partir
   des documents catalog : le champ qui compte ici est `barcodes`, tableau vide
   quand la fiche n'en a pas. */
async function chargerDRINKS() {
  const rows = await admin(async (db) => {
    const s = await getDocs(collection(db, "catalog"));
    const out = []; s.forEach((d) => out.push(d.data())); return out;
  });
  return rows.map((r) => ({
    id: Number(r.id) || r.id,
    name: String(r.name),
    brand: String(r.brand || "Autre"),
    barcodes: Array.isArray(r.barcodes) ? r.barcodes.map(String).slice(0, 5) : [],
  }));
}

/* ── boissonsOrphelines — index.html:23491, recopiee a l'identique ───────── */
function boissonsOrphelines(DRINKS) {
  return (DRINKS || []).filter(function (d) {
    return Number(d.id) >= 1e12 && !(d.barcodes && d.barcodes.length);
  });
}

/* ── renderChasseCodes — index.html:23374, le TEXTE qu'elle produit ──────── */
function texteCarteChasse(DRINKS) {
  var liste = boissonsOrphelines(DRINKS);
  if (!liste.length) return "";
  var apercu = liste.slice(0, 3).map(function (d) { return d.name; }).join(" · ");
  return liste.length + " boisson" + (liste.length > 1 ? "s" : "") +
         " cherche" + (liste.length > 1 ? "nt leur" : " son") + " code-barre" +
         " | " + apercu + (liste.length > 3 ? " …" : "");
}
/* ── ouvrirChasseCodes — index.html:23390, une ligne par boisson ─────────── */
function lignesFeuilleChasse(DRINKS) {
  return boissonsOrphelines(DRINKS).map(function (d) { return d.name + " | " + (d.brand || ""); });
}

/* ── window.fbProposerCodeChasse — index.html:2503, recopiee a l'identique ─ */
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
      createdAt: serverTimestamp(),
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

/* ── window.fbChargerChasseCodes — index.html:2529, recopiee a l'identique ─ */
async function fbChargerChasseCodes(db) {
  try {
    var snap = await getDocs(query(collection(db, "chasseCodes"), where("etat", "==", "attente")));
    var out = {};
    snap.forEach(function (d) {
      var v = d.data() || {};
      out[String(v.barcode || d.id)] = { drinkId: v.drinkId, nb: (v.par || []).length };
    });
    return out;
  } catch (e) { return {}; }
}

/* ── proposerChasse — index.html:23464, le message APRES l'envoi ─────────── */
function messageApresEnvoi(r) {
  return "Merci — c'est noté | " + (r && r.nb >= 2
    ? "Une deuxième personne l'avait déjà vue : le code va être posé pour tout le monde."
    : "Il manque encore une confirmation d'une autre personne pour que le code compte pour tous.");
}

/* ═══ A. AU DEPART : L'ECRAN ET LE SERVEUR DISENT LA MEME CHOSE ═══════════ */

let DRINKS = await chargerDRINKS();
note("A. carte d'accueil (renderChasseCodes) -> « " + texteCarteChasse(DRINKS) + " »");
note("A. feuille (ouvrirChasseCodes) -> " + JSON.stringify(lignesFeuilleChasse(DRINKS)));
await doit("A. au depart, le serveur ne sait rien de plus : la chasse est vide", async () => {
  const l = await fbChargerChasseCodes(anon);
  if (Object.keys(l).length !== 0) throw new Error("chasse non vide : " + JSON.stringify(l));
});

/* ═══ B. BOB CONFIRME. LE SERVEUR APPREND. L'ECRAN, LUI ? ════════════════ */

await doit("B. Bob scanne la Zero en rayon et confirme son code (fbProposerCodeChasse)", async () => {
  const r = await fbProposerCodeChasse(bob, "bob", ID_ZERO, "Cusa Cola Zero", CODE_ZERO);
  if (r.nb !== 1) throw new Error("nb attendu 1, recu " + r.nb);
  note("B. ce que l'app dit a BOB, juste apres son envoi (index.html:23464) -> « " + messageApresEnvoi(r) + " »");
});
await doit("B. le serveur, lui, sait maintenant qu'il manque UNE confirmation", async () => {
  const l = await fbChargerChasseCodes(anon);
  if (!l[CODE_ZERO] || l[CODE_ZERO].nb !== 1) throw new Error("etat serveur inattendu : " + JSON.stringify(l));
  note("B. fbChargerChasseCodes (index.html:2529) renvoie -> " + JSON.stringify(l));
});

/* ALICE arrive ensuite. Elle ouvre l'accueil, puis la feuille de la chasse.
   Ces deux ecrans ne lisent QUE window.DRINKS. On recharge donc le catalogue
   comme l'app le fait (fbLoadCatalog, index.html:2401) et on regarde. */
DRINKS = await chargerDRINKS();
await doit("B. ALICE : la carte d'accueil est identique a l'etape A, aucun compteur", async () => {
  const txt = texteCarteChasse(DRINKS);
  note("B. carte d'accueil vue par Alice -> « " + txt + " »");
  if (/confirm|1 personne|manque/i.test(txt)) throw new Error("la carte parle de confirmations : " + txt);
});
await doitEchouer("B. la feuille de la chasse devrait pouvoir dire « il ne manque qu'une confirmation » pour la Zero", async () => {
  const lignes = lignesFeuilleChasse(DRINKS);
  const ligneZero = lignes.find((l) => l.indexOf("Cusa Cola Zero") === 0);
  note("B. ligne « Cusa Cola Zero » dans la feuille -> « " + ligneZero + " »");
  if (!/confirmation|1 personne|déjà/i.test(ligneZero)) {
    throw new Error("la ligne ne porte que le nom et la marque : " + ligneZero);
  }
});
note("B. -> le renseignement existe cote serveur (nb=1) et n'entre dans aucun des deux ecrans.");

/* ═══ C. LE CONFLIT : UN CODE DEJA PROPOSE POUR UNE AUTRE BOISSON ═════════ */

/* Carl a la CHERRY en main. Le code imprime dessus est CODE_ZERO — Bob s'est
   trompe de variante une minute plus tot. Le serveur sait que CODE_ZERO vise
   deja la Zero. Que voit Carl ? */
await doit("C. le serveur sait que CODE_ZERO vise deja la Zero, pas la Cherry", async () => {
  const l = await fbChargerChasseCodes(anon);
  if (!l[CODE_ZERO] || Number(l[CODE_ZERO].drinkId) !== ID_ZERO) {
    throw new Error("drinkId serveur inattendu : " + JSON.stringify(l[CODE_ZERO]));
  }
  note("C. le serveur repond -> " + JSON.stringify(l[CODE_ZERO]) + " (drinkId = la Zero)");
});
await doitEchouer("C. avant d'envoyer, l'ecran de Carl devrait pouvoir l'avertir du conflit", async () => {
  /* L'ecran de Carl, c'est proposerChasse (index.html:23431). On relit son
     code : il n'appelle ni fbChargerChasseCodes, ni aucune lecture de
     chasseCodes. Sa seule source est boissonsOrphelines(). */
  const lignes = lignesFeuilleChasse(DRINKS);
  const tout = lignes.join(" || ");
  if (!/déjà propos|conflit|autre boisson/i.test(tout)) {
    throw new Error("aucun ecran ne peut prevenir : la seule source est boissonsOrphelines(), qui ignore chasseCodes");
  }
});
await doit("C. Carl confirme donc « oui, c'est bien elle » pour la CHERRY", async () => {
  const r = await fbProposerCodeChasse(carl, "carl", ID_CHERRY, "Cusa Cola Cherry", CODE_ZERO);
  note("C. ce que l'app dit a CARL -> « " + messageApresEnvoi(r) + " »");
  if (r.nb !== 2) throw new Error("nb attendu 2, recu " + r.nb);
});
await doit("C. le document vise toujours la ZERO, alors que Carl confirmait la CHERRY", async () => {
  const d = await admin(async (db) => (await getDoc(doc(db, "chasseCodes", CODE_ZERO))).data());
  note("C. chasseCodes/" + CODE_ZERO + " -> drinkId=" + d.drinkId + " (« " + d.drinkName + " »), par=" + JSON.stringify(d.par));
  if (Number(d.drinkId) !== ID_ZERO) throw new Error("drinkId=" + d.drinkId);
});
note("C. -> le serveur pouvait prevenir Carl. Aucun ecran ne le lui a demande.");

/* ═══ D. LA PREUVE DE LA TROUVAILLE, REJOUEE ═════════════════════════════ */

await doit("D. fbChargerChasseCodes fonctionne parfaitement : ce n'est pas elle qui est cassee", async () => {
  const l = await fbChargerChasseCodes(alice);
  if (!l[CODE_ZERO]) throw new Error("la fonction ne renvoie rien");
  if (typeof l[CODE_ZERO].nb !== "number" || l[CODE_ZERO].drinkId === undefined) {
    throw new Error("forme inattendue : " + JSON.stringify(l[CODE_ZERO]));
  }
  note("D. { code: { drinkId, nb } } -> " + JSON.stringify(l) + " : tout le renseignement est la, lisible meme non connecte.");
});
note("D. grep -rn \"fbChargerChasseCodes\" index.html -> une seule ligne : « 2529:window.fbChargerChasseCodes = async function() { ».");
note("D. les deux ecrans de la chasse (renderChasseCodes:23374, ouvrirChasseCodes:23390) n'ont qu'une source : boissonsOrphelines() (23491), c'est-a-dire window.DRINKS.");
note("D. NUANCE : le nombre de confirmations EST montre une fois — apres l'envoi, dans le message de proposerChasse (index.html:23466), a partir du retour de fbProposerCodeChasse. Jamais AVANT, jamais a qui n'a pas encore confirme.");

await bilan(env);
