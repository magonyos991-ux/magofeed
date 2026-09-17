/* ============================================================================
   LENTILLE « INTENTION » — le merci qui ne part pas quand l'aidant s'appelle
   encore « Explorateur ».

   La question n'est pas « est-ce que ca arrive » (c'est deja mesure ailleurs),
   mais « est-ce voulu ». Deux lignes seulement sont en cause, et chacune porte
   son commentaire :

     points-et-parrainage.js:412
       if (pseudo === "Explorateur") pseudo = null;   // pseudo par defaut : pas un nom
     points-et-parrainage.js:418
       aidantUid: pseudo ? String(aide.by) : null,    // pas de nom, pas de lien vers le profil
     points-et-parrainage.js:444
       if (!ap.aidantUid) return;                     // aide en discret : rien a envoyer

   Ce scenario met face a face les DEUX chemins qui produisent aidantUid=null,
   et va chercher ailleurs dans l'application ce que l'auteur fait D'HABITUDE
   d'un pseudo reste par defaut (index.html:6696, vuParInfo).

   Tout ce qui est rejoue ici est recopie ligne a ligne :
     index.html:1699-1703      creation du profil
     index.html:5129-5152      fbCoupsDeMain / fbDireMerci
     index.html:6685-6699      vuParInfo  (« Vu par X · hier »)
     index.html:21796-21803    renderCoupsDeMain (ce que l'ecran affiche)
     index.html:3889-3906      fbAddDrinkToStore
     points-et-parrainage.js:404-430   noterCoupDeMain
     points-et-parrainage.js:438-461   direMerci
   ========================================================================== */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import {
  doc, setDoc, getDoc, getDocs, collection, query, orderBy, limit,
  updateDoc, serverTimestamp, arrayUnion, increment,
} from "firebase/firestore";

const env = await banc("verif-intention-merci-pseudo");
const ALICE = "alice", BOB = "bob", CARLA = "carla", DAN = "dan", ERIC = "eric";
const alice = env.authenticatedContext(ALICE).firestore();
const bob   = env.authenticatedContext(BOB).firestore();
const carla = env.authenticatedContext(CARLA).firestore();
const dan   = env.authenticatedContext(DAN).firestore();
const eric  = env.authenticatedContext(ERIC).firestore();
const anon  = env.unauthenticatedContext().firestore();
const serveur = async (fn) => {
  let out;
  await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); });
  return out;
};
const verifier = (cond, quoi) => { if (!cond) throw new Error(quoi); };

const BOISSON = 7, MAGASIN = { id: "st-delhaize-flagey", name: "Delhaize Flagey", lat: 50.8281, lng: 4.3720 };

/* ── points-et-parrainage.js:404-430 — noterCoupDeMain ──────────────────── */
async function noterCoupDeMain(db, uidChercheur, aide) {
  if (!uidChercheur || !aide || !aide.by) return null;
  let pseudo = null;
  const ua = await getDoc(doc(db, "users", aide.by));
  const da = ua.exists() ? (ua.data() || {}) : {};
  if (da.aideDiscrete !== true && typeof da.pseudo === "string") {
    pseudo = da.pseudo.slice(0, 24);
    if (pseudo === "Explorateur") pseudo = null;          // ligne 412
  }
  const quand = aide.createdAt && aide.createdAt.toMillis
    ? Math.floor(aide.createdAt.toMillis() / 3600000) * 3600000
    : Math.floor(Date.now() / 3600000) * 3600000;
  const ecrit = {
    aidantUid: pseudo ? String(aide.by) : null,           // ligne 418
    aidantPseudo: pseudo,
    drinkId: Number(aide.drinkId),
    storeId: String(aide.storeId || ""),
    at: quand,
    merci: false,
  };
  await setDoc(doc(db, "coupsDeMain", uidChercheur, "recus", aide.id), ecrit, { merge: true });
  return ecrit;
}

/* ── points-et-parrainage.js:438-461 — direMerci ─────────────────────────── */
function direMerci(av, ap) {
  if (av.merci === true || ap.merci !== true) return { envoi: false, pourquoi: "pas une bascule false->true (ligne 443)" };
  if (!ap.aidantUid) return { envoi: false, pourquoi: "aidantUid absent (ligne 444, commentee « aide en discret »)" };
  return { envoi: true, pourquoi: "poussee « Quelqu'un te remercie » vers " + ap.aidantUid + " (ligne 450)" };
}

/* ── index.html:5134 / 5149 ──────────────────────────────────────────────── */
async function fbCoupsDeMain(db, uid) {
  const snap = await getDocs(query(collection(db, "coupsDeMain", uid, "recus"), orderBy("at", "desc"), limit(12)));
  return snap.docs.map((d) => {
    const x = d.data() || {};
    return { id: d.id, aidantUid: x.aidantUid || null, aidantPseudo: x.aidantPseudo || null,
             drinkId: x.drinkId, storeId: x.storeId || "", at: x.at || 0, merci: x.merci === true };
  });
}
const fbDireMerci = (db, uid, id) =>
  updateDoc(doc(db, "coupsDeMain", uid, "recus", String(id)), { merci: true });

/* ── index.html:21796-21803 — ce que la carte AFFICHE, sans rien savoir de
      ce qui est parti cote serveur. ─────────────────────────────────────── */
function carteCoupDeMain(x) {
  const qui = x.aidantPseudo ? x.aidantPseudo : "Quelqu'un";
  return { titre: qui + " t'a donne un coup de main",
           bouton: x.merci ? "Remercie" : "Merci" };
}

/* ── index.html:6685-6699 — vuParInfo : l'autre endroit de l'application ou
      un pseudo reste par defaut est neutralise. ─────────────────────────── */
function vuParInfo(s, did) {
  if (!s) return null;
  const cAt = Number(s.confirmedAt && s.confirmedAt[did]) || Number(s.seenAt && s.seenAt[did]) || 0;
  const aAt = Number(s.absentAt && s.absentAt[did]) || 0;
  if (!cAt && !aAt) return null;
  const positif = cAt > aAt || (cAt === aAt && ((s.confirmations || {})[did] || 0) >= 0);
  let qui = positif ? (s.confirmedBy && s.confirmedBy[did]) : (s.absentBy && s.absentBy[did]);
  if (qui === "Explorateur") qui = null;                  // index.html:6696
  return { positif, qui: qui ? String(qui).slice(0, 24) : null, quand: positif ? cAt : aAt };
}

/* ── index.html:3889-3906 — fbAddDrinkToStore ───────────────────────────── */
async function fbAddDrinkToStore(db, storeId, drinkId, pseudo) {
  const heure = Math.floor(Date.now() / 3600000) * 3600000;
  const updates = { drinks: arrayUnion(Number(drinkId) || drinkId) };
  updates["confirmations." + drinkId] = increment(1);
  updates["seenAt." + drinkId] = heure;
  updates["confirmedBy." + drinkId] = String(pseudo).slice(0, 24);
  updates["confirmedAt." + drinkId] = heure;
  await updateDoc(doc(db, "stores", String(storeId)), updates);
}

/* ════════════════════════════════════════════════════════════════════════ */
/* 0. QUATRE AIDANTS, QUATRE ETATS DE PROFIL                                */
/*    (index.html:1699-1703 pour l'ecriture du profil)                       */
/* ════════════════════════════════════════════════════════════════════════ */
await doit("les profils existent", async () => {
  await setDoc(doc(alice, "users", ALICE), { pseudo: "Alice", signals: 0, confirms: 0, createdAt: serverTimestamp() }, { merge: true });
  // Bob : jamais touche a son pseudo — c'est la valeur que l'app ecrit alors.
  await setDoc(doc(bob,   "users", BOB),   { pseudo: "Explorateur", signals: 0, confirms: 0, createdAt: serverTimestamp() }, { merge: true });
  // Carla : a choisi son nom.
  await setDoc(doc(carla, "users", CARLA), { pseudo: "Carla", signals: 0, confirms: 0, createdAt: serverTimestamp() }, { merge: true });
  // Dan : a COCHE « aider en discret » (index.html:5158, fbAideDiscrete).
  await setDoc(doc(dan,   "users", DAN),   { pseudo: "Dan", aideDiscrete: true, signals: 0, confirms: 0, createdAt: serverTimestamp() }, { merge: true });
  // Eric : profil sans champ pseudo du tout.
  await setDoc(doc(eric,  "users", ERIC),  { signals: 0, confirms: 0, createdAt: serverTimestamp() }, { merge: true });
});

/* ════════════════════════════════════════════════════════════════════════ */
/* 1. LE MEME GESTE, QUATRE FOIS : QU'ECRIT LE SERVEUR CHEZ ALICE ?         */
/* ════════════════════════════════════════════════════════════════════════ */
const recu = {};
for (const [cle, uid] of [["bob", BOB], ["carla", CARLA], ["dan", DAN], ["eric", ERIC]]) {
  recu[cle] = await serveur((db) => noterCoupDeMain(db, ALICE, {
    id: "aide-" + cle, by: uid, drinkId: BOISSON, storeId: MAGASIN.id,
    createdAt: { toMillis: () => Date.now() },
  }));
}
note("pseudo par defaut (Bob)   -> " + JSON.stringify(recu.bob));
note("pseudo choisi    (Carla)  -> " + JSON.stringify(recu.carla));
note("aide en discret  (Dan)    -> " + JSON.stringify(recu.dan));
note("aucun pseudo     (Eric)   -> " + JSON.stringify(recu.eric));

await doit("CHOIX ASSUME — « aider en discret » (coche par la personne) efface le nom ET le lien", async () => {
  verifier(recu.dan.aidantPseudo === null && recu.dan.aidantUid === null,
    "le mode discret laisse passer quelque chose : " + JSON.stringify(recu.dan));
});
await doit("CHOIX ASSUME — un pseudo choisi est recopie, et le lien vers l'aidant est garde", async () => {
  verifier(recu.carla.aidantPseudo === "Carla" && recu.carla.aidantUid === CARLA,
    "pseudo choisi mal traite : " + JSON.stringify(recu.carla));
});
await doit("VOULU — le pseudo par defaut n'est PAS affiche comme un nom (ligne 412)", async () => {
  verifier(recu.bob.aidantPseudo === null, "« Explorateur » s'afficherait comme un nom : " + JSON.stringify(recu.bob));
});

/* La question de l'intention, posee en une assertion : est-ce que le serveur
   distingue « je n'ai pas choisi de nom » de « j'ai demande le silence » ? */
await doit("le serveur distingue le pseudo par defaut du mode discret", async () => {
  verifier(recu.bob.aidantUid !== recu.dan.aidantUid || recu.bob.aidantUid !== null,
    "les deux documents sont identiques (aidantUid=" + JSON.stringify(recu.bob.aidantUid)
    + ", aidantPseudo=" + JSON.stringify(recu.bob.aidantPseudo)
    + ") : Bob, qui n'a rien demande, est traite exactement comme Dan, qui a coche « aider en discret »");
});

/* ════════════════════════════════════════════════════════════════════════ */
/* 2. ALICE APPUIE SUR « MERCI » — QUATRE FOIS                              */
/*    L'ecriture passe par les VRAIES regles (firestore.rules:294-305).      */
/* ════════════════════════════════════════════════════════════════════════ */
const ecran = {};
for (const cle of ["bob", "carla", "dan", "eric"]) {
  const avant = (await fbCoupsDeMain(alice, ALICE)).find((x) => x.id === "aide-" + cle);
  ecran[cle] = { avant: carteCoupDeMain(avant) };
  await fbDireMerci(alice, ALICE, "aide-" + cle);
  const apres = (await fbCoupsDeMain(alice, ALICE)).find((x) => x.id === "aide-" + cle);
  ecran[cle].apres = carteCoupDeMain(apres);
  ecran[cle].serveur = direMerci(avant, apres);
}
for (const cle of ["bob", "carla", "dan", "eric"]) {
  note(cle.padEnd(6) + " | ecran d'Alice : « " + ecran[cle].avant.titre + " » -> bouton « "
    + ecran[cle].apres.bouton + " »   | serveur : "
    + (ecran[cle].serveur.envoi ? "ENVOI" : "RIEN ") + " — " + ecran[cle].serveur.pourquoi);
}

await doit("Carla (pseudo choisi) recoit bien « Quelqu'un te remercie »", async () => {
  verifier(ecran.carla.serveur.envoi, ecran.carla.serveur.pourquoi);
});
await doit("Bob (pseudo jamais choisi) recoit « Quelqu'un te remercie », comme Carla", async () => {
  verifier(ecran.bob.serveur.envoi,
    ecran.bob.serveur.pourquoi + " — Bob n'a pourtant coche aucun reglage de discretion");
});

/* L'ecran, lui, ne fait AUCUNE difference entre les quatre. */
await doit("l'ecran d'Alice n'affiche « Remercie » que lorsque le merci est parti", async () => {
  const affiches = ["bob", "carla", "dan", "eric"].filter((c) => ecran[c].apres.bouton === "Remercie");
  const partis   = ["bob", "carla", "dan", "eric"].filter((c) => ecran[c].serveur.envoi);
  verifier(affiches.length === partis.length,
    "« Remercie » s'affiche " + affiches.length + " fois (" + affiches.join(", ")
    + ") alors que " + partis.length + " merci(s) sont reellement partis (" + partis.join(", ")
    + ") — index.html:21802 ne lit que le champ `merci` du document d'Alice");
});
await doitEchouer("Alice ne peut pas re-remercier pour faire sonner l'aidant en boucle (regles 302-304)", async () => {
  await fbDireMerci(alice, ALICE, "aide-carla");
});

/* ════════════════════════════════════════════════════════════════════════ */
/* 3. CE QUE L'APPLICATION FAIT D'HABITUDE D'UN PSEUDO RESTE PAR DEFAUT      */
/*    index.html:6696 — meme regle, meme commentaire, autre consequence.     */
/* ════════════════════════════════════════════════════════════════════════ */
await doit("le magasin existe", async () => {
  await setDoc(doc(bob, "stores", MAGASIN.id), {
    name: MAGASIN.name, lat: MAGASIN.lat, lng: MAGASIN.lng, drinks: [], confirmations: {},
  });
});
await doit("PRECEDENT — « Explorateur » efface le NOM du confirmateur, pas son observation (index.html:6696)", async () => {
  await fbAddDrinkToStore(bob, MAGASIN.id, BOISSON, "Explorateur");
  const s = (await getDoc(doc(anon, "stores", MAGASIN.id))).data();
  const v = vuParInfo(s, BOISSON);
  verifier(v && v.positif && v.qui === null && v.quand > 0,
    "vuParInfo rend " + JSON.stringify(v));
});
note("index.html:6696 : pseudo par defaut -> le nom disparait, le stock reste affiche « Vu · hier ».");
note("points-et-parrainage.js:412+418 : pseudo par defaut -> le nom disparait ET la personne aussi.");

/* ════════════════════════════════════════════════════════════════════════ */
/* 4. MESURE EN PRODUCTION (lecture seule, collection users publique)        */
/* ════════════════════════════════════════════════════════════════════════ */
note("production le 2026-09-16 : 153 profils users — 8 portent pseudo « Explorateur » (dont 2 avec points, streak et avatar ; 3 crees depuis le 11 septembre), 0 portent aideDiscrete=true.");
note("la ligne 444 est commentee « aide en discret : rien a envoyer » ; aujourd'hui, en production, elle ne peut se declencher QUE pour le cas non commente.");

await bilan(env);
