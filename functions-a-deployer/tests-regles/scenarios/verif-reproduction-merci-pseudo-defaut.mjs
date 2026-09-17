/* ============================================================================
   VERIFICATION : « Alice remercie, Bob ne recoit rien »
   ----------------------------------------------------------------------------
   La trouvaille a verifier affirme : « Le pseudo par defaut est precisement
   "Explorateur" (index.html:1700, 1727). Donc pour tout compte qui n'a jamais
   change de pseudo, aidantUid vaut null » et le merci ne part jamais.

   Ce scenario rejoue la SEQUENCE DE DEMARRAGE REELLE de l'application, qui
   decide de ce que vaut localStorage.magopseudo AVANT que le profil Firestore
   ne soit ecrit :

     index.html:1302   <script type="module">   -> DIFFERE (s'execute apres le
                                                   parsing du document)
     index.html:5919   <script>  (classique)    -> s'execute PENDANT le parsing
     index.html:23167-23170  (dans ce script classique) :
         var userPseudo=localStorage.getItem("magopseudo");
         if(!userPseudo){ userPseudo=generatePseudo();
                          try{localStorage.setItem("magopseudo",userPseudo);}catch(e){} }
     index.html:23127  generatePseudo() -> « Jaguar Nocturne 427 »
     index.html:1699-1703  (dans le module, rappel onAuthStateChanged, donc
                            apres) :
         setDoc(userDocRef(uid), {
           pseudo: String(localStorage.getItem("magopseudo")||"Explorateur").slice(0,24),
           signals:0, confirms:0, createdAt: serverTimestamp() }, {merge:true})

   Cote serveur (l'emulateur n'execute pas les Cloud Functions : on rejoue leur
   decision, champ par champ) :
     noterCoupDeMain   functions-a-deployer/points-et-parrainage.js:404-430
     direMerci         functions-a-deployer/points-et-parrainage.js:438-461
   ========================================================================== */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import {
  doc, setDoc, getDoc, getDocs, collection, query, orderBy, limit,
  updateDoc, serverTimestamp,
} from "firebase/firestore";

const env = await banc("verif-merci-pseudo-defaut");
const ALICE = "alice", BOB = "bob";
const alice = env.authenticatedContext(ALICE).firestore();
const bob = env.authenticatedContext(BOB).firestore();
const serveur = async (fn) => {
  let out;
  await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); });
  return out;
};
const verifier = (cond, quoi) => { if (!cond) throw new Error(quoi); };

/* ── un localStorage de navigateur, avec l'option « ecriture refusee » ──
   (navigateur en mode restreint : setItem leve, getItem continue de rendre). */
function fauxLocalStorage(ecritureRefusee) {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (ecritureRefusee) throw new Error("QuotaExceededError"); m.set(k, String(v)); },
  };
}

/* index.html:23127 — generatePseudo() */
function generatePseudo() {
  const animaux = ["Jaguar", "Panthère", "Faucon", "Loup", "Cobra", "Lynx", "Phénix", "Puma", "Condor", "Orque", "Grizzly", "Tigre"];
  const boissons = ["Nocturne", "Solaire", "Éclair", "Sauvage", "Néon", "Cosmique", "Polaire", "Ultra", "Mystique", "Turbo", "Magnétique", "Suprême"];
  const a = animaux[Math.floor(Math.random() * animaux.length)];
  const b = boissons[Math.floor(Math.random() * boissons.length)];
  return a + " " + b + " " + String(Math.floor(100 + Math.random() * 900));
}

/* index.html:23167-23170 — le script CLASSIQUE, execute pendant le parsing,
   donc AVANT le module differe qui ecrit le profil. */
function demarrageScriptClassique(LS) {
  let userPseudo = LS.getItem("magopseudo");
  if (!userPseudo) {
    userPseudo = generatePseudo();
    try { LS.setItem("magopseudo", userPseudo); } catch (e) {}
  }
  return userPseudo;
}

/* index.html:1699-1703 — le profil cree a la premiere connexion, dans le
   module differe (rappel onAuthStateChanged). */
async function creerProfil(db, uid, LS) {
  await setDoc(doc(db, "users", uid), {
    pseudo: String(LS.getItem("magopseudo") || "Explorateur").slice(0, 24),
    signals: 0, confirms: 0,
    createdAt: serverTimestamp(),
  }, { merge: true });
}

/* points-et-parrainage.js:404-430 — noterCoupDeMain */
async function noterCoupDeMain(db, uidChercheur, aide) {
  if (!uidChercheur || !aide || !aide.by) return null;
  let pseudo = null;
  const ua = await getDoc(doc(db, "users", aide.by));
  const da = ua.exists() ? (ua.data() || {}) : {};
  if (da.aideDiscrete !== true && typeof da.pseudo === "string") {
    pseudo = da.pseudo.slice(0, 24);
    if (pseudo === "Explorateur") pseudo = null;      // ligne 412
  }
  const quand = aide.createdAt && aide.createdAt.toMillis
    ? Math.floor(aide.createdAt.toMillis() / 3600000) * 3600000
    : Math.floor(Date.now() / 3600000) * 3600000;
  const ecrit = {
    aidantUid: pseudo ? String(aide.by) : null,       // ligne 418
    aidantPseudo: pseudo,
    drinkId: Number(aide.drinkId),
    storeId: String(aide.storeId || ""),
    at: quand,
    merci: false,
  };
  await setDoc(doc(db, "coupsDeMain", uidChercheur, "recus", aide.id), ecrit, { merge: true });
  return ecrit;
}

/* points-et-parrainage.js:438-461 — direMerci */
function direMerci(av, ap) {
  if (av.merci === true || ap.merci !== true) return { envoi: false, pourquoi: "pas une bascule false->true" };
  if (!ap.aidantUid) return { envoi: false, pourquoi: "aidantUid absent (ligne 444) : rien n'est envoye" };
  return { envoi: true, pourquoi: "poussee « Quelqu'un te remercie » vers " + ap.aidantUid };
}

/* index.html:5149 — window.fbDireMerci */
const fbDireMerci = (db, uid, id) =>
  updateDoc(doc(db, "coupsDeMain", uid, "recus", String(id)), { merci: true });
/* index.html:5134 — window.fbCoupsDeMain */
async function fbCoupsDeMain(db, uid) {
  const snap = await getDocs(query(collection(db, "coupsDeMain", uid, "recus"), orderBy("at", "desc"), limit(12)));
  return snap.docs.map((d) => {
    const x = d.data() || {};
    return { id: d.id, aidantUid: x.aidantUid || null, aidantPseudo: x.aidantPseudo || null,
             drinkId: x.drinkId, storeId: x.storeId || "", at: x.at || 0, merci: x.merci === true };
  });
}

const BOISSON = 7, MAGASIN = "st-delhaize-flagey";

/* ════════════════════════════════════════════════════════════════════════ */
/* CAS 1 — UN TELEPHONE ORDINAIRE, COMPTE NEUF, PSEUDO JAMAIS TOUCHE       */
/* ════════════════════════════════════════════════════════════════════════ */
const lsBob = fauxLocalStorage(false);
const pseudoBob = demarrageScriptClassique(lsBob);
note("index.html:23167-23170 au premier lancement — localStorage.magopseudo = "
     + JSON.stringify(lsBob.getItem("magopseudo")));

await doit("le profil ecrit par index.html:1700 ne contient PAS « Explorateur »", async () => {
  await creerProfil(bob, BOB, lsBob);
  await creerProfil(alice, ALICE, fauxLocalStorage(false));
  const p = await serveur((db) => getDoc(doc(db, "users", BOB)));
  verifier(p.data().pseudo !== "Explorateur",
    "le profil porte bien « Explorateur » : " + JSON.stringify(p.data().pseudo));
  verifier(p.data().pseudo === pseudoBob, "pseudo inattendu : " + JSON.stringify(p.data().pseudo));
});

let recu1 = null;
await doit("noterCoupDeMain (p-et-p.js:404) garde l'uid de l'aidant pour un compte neuf ordinaire", async () => {
  recu1 = await serveur((db) => noterCoupDeMain(db, ALICE, {
    id: "aide-1", by: BOB, drinkId: BOISSON, storeId: MAGASIN, createdAt: { toMillis: () => Date.now() },
  }));
  verifier(recu1.aidantUid === BOB,
    "aidantUid est " + JSON.stringify(recu1.aidantUid) + " alors que le pseudo vaut " + JSON.stringify(pseudoBob));
});
note("coup de main ecrit chez Alice : " + JSON.stringify(recu1));

await doit("Alice appuie sur « Merci » (index.html:5149) et la poussee part vraiment vers Bob", async () => {
  const avant = (await fbCoupsDeMain(alice, ALICE))[0];
  await fbDireMerci(alice, ALICE, avant.id);
  const apres = (await fbCoupsDeMain(alice, ALICE))[0];
  verifier(apres.merci === true, "le merci n'est pas enregistre");
  const e = direMerci(avant, apres);
  verifier(e.envoi, e.pourquoi);
  note("direMerci : " + e.pourquoi);
});

/* ════════════════════════════════════════════════════════════════════════ */
/* CAS 2 — LE SEUL CHEMIN QUI PRODUIT « Explorateur » :                    */
/*         un navigateur qui REFUSE d'ecrire dans localStorage             */
/* ════════════════════════════════════════════════════════════════════════ */
const CARLA = "carla";
const carla = env.authenticatedContext(CARLA).firestore();
const lsCarla = fauxLocalStorage(true);              // setItem leve
demarrageScriptClassique(lsCarla);
note("navigateur qui refuse l'ecriture locale — localStorage.magopseudo = "
     + JSON.stringify(lsCarla.getItem("magopseudo"))
     + " -> index.html:1700 retombe sur « Explorateur »");

let recu2 = null;
await doit("LA (et seulement la), l'uid de l'aidant disparait et le merci ne part pas", async () => {
  await creerProfil(carla, CARLA, lsCarla);
  const p = await serveur((db) => getDoc(doc(db, "users", CARLA)));
  verifier(p.data().pseudo === "Explorateur", "pseudo : " + JSON.stringify(p.data().pseudo));
  recu2 = await serveur((db) => noterCoupDeMain(db, ALICE, {
    id: "aide-2", by: CARLA, drinkId: BOISSON, storeId: MAGASIN, createdAt: { toMillis: () => Date.now() },
  }));
  verifier(recu2.aidantUid === null, "aidantUid : " + JSON.stringify(recu2.aidantUid));
  const e = direMerci(recu2, Object.assign({}, recu2, { merci: true }));
  verifier(!e.envoi, "le merci part quand meme");
  note("CAS 2 — direMerci : " + e.pourquoi + " ; l'ecran d'Alice affichera pourtant « Remercie » (index.html:21802)");
});

/* ════════════════════════════════════════════════════════════════════════ */
/* CAS 3 — « AIDER EN DISCRET » : le silence est ecrit et commente         */
/* ════════════════════════════════════════════════════════════════════════ */
await doit("« aider en discret » (index.html:5158) coupe aussi la poussee — c'est ecrit noir sur blanc ligne 444", async () => {
  await setDoc(doc(bob, "users", BOB), { aideDiscrete: true }, { merge: true });
  const r = await serveur((db) => noterCoupDeMain(db, ALICE, {
    id: "aide-3", by: BOB, drinkId: BOISSON, storeId: MAGASIN, createdAt: { toMillis: () => Date.now() },
  }));
  verifier(r.aidantUid === null && r.aidantPseudo === null, "le nom passe quand meme : " + JSON.stringify(r));
  const e = direMerci(r, Object.assign({}, r, { merci: true }));
  verifier(!e.envoi, "la poussee part malgre le mode discret");
});

note("index.html:21802 affiche « Remercie » des que merci===true, sans savoir si la poussee est partie.");

await bilan(env);
