/* ============================================================================
   UN JETON PUSH PAR APPAREIL — l'ecriture reelle, contre les vraies regles
   ----------------------------------------------------------------------------
   POURQUOI CE FICHIER EXISTE. pushTokens/{uid} ne portait qu'un champ
   « token », et l'app le reecrivait a chaque ouverture ou la permission etait
   deja accordee. Le dernier appareil ouvert ecrasait donc le jeton de tous les
   autres, et rien nulle part ne disait a quel appareil ce jeton appartenait :
   ouvrir Magofeed sur son ordinateur suffisait a faire taire son telephone
   pour de bon. Google acceptait l'envoi, le journal ecrivait « notification
   envoyee », et l'ecran concluait que le blocage venait des reglages du
   telephone. Des semaines perdues sur une phrase fausse.

   CE QUE CE SCENARIO EPROUVE, ET QU'AUCUN ESSAI EN MEMOIRE NE PEUT EPROUVER :
   Firestore accepte-t-il vraiment ce que le client ecrit maintenant ? La
   charge porte un « serverTimestamp() » IMBRIQUE dans une carte, pose avec
   « merge: true ». Si Firestore le refusait, fbEnablePush leverait et
   l'activation des notifications casserait pour les 169 comptes — un essai en
   memoire ne l'aurait jamais vu. Tout ici passe par les VRAIES regles du
   depot, sur un emulateur jetable.

   node lancer-scenario.mjs scenarios/jeton-par-appareil.mjs
   ========================================================================== */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import {
  doc, setDoc, getDoc, updateDoc, deleteField, serverTimestamp,
} from "firebase/firestore";

const env = await banc("jeton-par-appareil");
const ALICE = "alice", BOB = "bob";
const alice = env.authenticatedContext(ALICE).firestore();
const bob = env.authenticatedContext(BOB).firestore();
const anon = env.unauthenticatedContext().firestore();

/* index.html — _chargeAppareil() et fbEnablePush(), recopiees a l'identique.
   Si tu changes l'une, change l'autre : c'est cette charge-la qui doit passer
   les regles, pas une approximation. */
function chargeAppareil(id, jeton, nom) {
  const m = {};
  m[id] = { token: jeton, appareil: nom, at: serverTimestamp() };
  return m;
}
async function fbEnablePush(db, uid, jeton, id, nom, lat, lng) {
  const charge = { token: jeton, updatedAt: serverTimestamp(), appareil: nom, jetons: chargeAppareil(id, jeton, nom) };
  if (lat != null && lng != null) { charge.lat = lat; charge.lng = lng; }
  return setDoc(doc(db, "pushTokens", uid), charge, { merge: true });
}
async function fbDisablePush(db, uid, id) {
  return setDoc(doc(db, "pushTokens", uid),
    { token: null, updatedAt: serverTimestamp(), jetons: chargeAppareil(id, null, "") }, { merge: true });
}
/* functions-a-deployer/outils-admin.js — jetonsDuDoc(), recopiee a l'identique.
   C'est la lecture serveur : si elle divergeait de l'ecriture cliente, le
   telephone redeviendrait muet sans que rien ne le dise. */
function jetonsDuDoc(d) {
  const data = d || {};
  const vus = new Set();
  const liste = [];
  if (data.token) { vus.add(data.token); liste.push({ cle: "token", token: data.token, appareil: String(data.appareil || "") }); }
  const carte = (data.jetons && typeof data.jetons === "object") ? data.jetons : {};
  for (const cle of Object.keys(carte)) {
    const e = carte[cle] || {};
    if (e.token && !vus.has(e.token)) { vus.add(e.token); liste.push({ cle: "jetons." + cle, token: e.token, appareil: String(e.appareil || "") }); }
  }
  return liste;
}

/* ── ACTE 1 : LA CHARGE PASSE, HORODATAGE IMBRIQUE COMPRIS ────────────────── */
await doit("l'iPhone enregistre son jeton (serverTimestamp imbrique dans une carte)", async () => {
  await fbEnablePush(alice, ALICE, "jeton-iphone", "tel1", "iPhone · Safari", 50.85, 4.35);
});
let vu = null;
await doit("le document est relisible et l'horodatage imbrique a bien ete resolu", async () => {
  const s = await getDoc(doc(alice, "pushTokens", ALICE));
  vu = s.data() || {};
  if (!vu.jetons || !vu.jetons.tel1) throw new Error("la carte « jetons » est absente : " + JSON.stringify(Object.keys(vu)));
  if (!vu.jetons.tel1.at) throw new Error("l'horodatage imbrique est vide — Firestore a refuse le sentinel dans une carte");
  if (typeof vu.jetons.tel1.at.toMillis !== "function") throw new Error("l'horodatage imbrique n'est pas un Timestamp : " + typeof vu.jetons.tel1.at);
});
await doit("l'appareil porte un nom lisible", async () => {
  if (vu.jetons.tel1.appareil !== "iPhone · Safari") throw new Error(String(vu.jetons.tel1.appareil));
});

/* ── ACTE 2 : LE PC N'ECRASE PLUS LE TELEPHONE ───────────────────────────── */
await doit("Alice ouvre ensuite Magofeed sur son PC", async () => {
  await fbEnablePush(alice, ALICE, "jeton-pc", "pc1", "Windows · Chrome", 50.85, 4.35);
});
await doit("LE JETON DE L'IPHONE A SURVECU — c'est toute la panne du 28 novembre", async () => {
  const d = (await getDoc(doc(alice, "pushTokens", ALICE))).data() || {};
  const liste = jetonsDuDoc(d);
  const jetons = liste.map((j) => j.token).sort();
  if (jetons.indexOf("jeton-iphone") === -1) {
    throw new Error("l'iPhone a disparu de la liste : " + JSON.stringify(jetons) + " — le PC a vole le jeton");
  }
  if (jetons.length !== 2) throw new Error(liste.length + " jeton(s) : " + JSON.stringify(jetons));
  note("Les deux appareils d'Alice, vus par le serveur : " + liste.map((j) => j.appareil + " (" + j.cle + ")").join(", "));
});
await doit("le jeton du PC n'est compte qu'une fois alors qu'il est a deux endroits", async () => {
  /* L'appareil qui vient d'ecrire est a la fois dans « token » et dans sa
     propre entree. Sans la deduplication, il recevrait chaque alerte DEUX
     fois, et la notification doublee serait prise pour un bug d'affichage. */
  const d = (await getDoc(doc(alice, "pushTokens", ALICE))).data() || {};
  const n = jetonsDuDoc(d).filter((j) => j.token === "jeton-pc").length;
  if (n !== 1) throw new Error(n + " fois");
});
await doit("la position et le rayon de zone sont intacts", async () => {
  const d = (await getDoc(doc(alice, "pushTokens", ALICE))).data() || {};
  if (d.lat !== 50.85 || d.lng !== 4.35) throw new Error("lat=" + d.lat + " lng=" + d.lng);
});

/* ── ACTE 3 : ETEINDRE SUR LE PC NE DOIT PAS TAIRE LE TELEPHONE ──────────── */
await doit("Alice coupe les notifications depuis son PC", async () => {
  await fbDisablePush(alice, ALICE, "pc1");
});
await doit("L'IPHONE RECOIT TOUJOURS, le PC non", async () => {
  const d = (await getDoc(doc(alice, "pushTokens", ALICE))).data() || {};
  const jetons = jetonsDuDoc(d).map((j) => j.token);
  if (jetons.indexOf("jeton-pc") !== -1) throw new Error("le PC recoit encore : " + JSON.stringify(jetons));
  if (jetons.indexOf("jeton-iphone") === -1) throw new Error("l'iPhone est devenu muet alors qu'on a coupe l'AUTRE appareil : " + JSON.stringify(jetons));
});

/* ── ACTE 4 : LE JETON MORT, ET LUI SEUL ────────────────────────────────────
   Le serveur (Admin SDK) fait update({ "jetons.pc1": FieldValue.delete() }).
   Les regles ne s'appliquent pas a l'Admin SDK, mais la SEMANTIQUE du chemin
   pointe est la meme : c'est elle qu'on eprouve ici. Avant, le serveur
   supprimait le DOCUMENT ENTIER — et avec lui la position, le rayon de zone et
   le choix du secours de la personne. Un telephone remplace rendait ses
   alertes « pres de toi » muettes pour une raison sans aucun rapport. */
await doit("Alice reactive son PC, puis Google declare ce jeton mort", async () => {
  await fbEnablePush(alice, ALICE, "jeton-pc2", "pc1", "Windows · Chrome", 50.85, 4.35);
  await updateDoc(doc(alice, "pushTokens", ALICE), { "jetons.pc1": deleteField() });
});
await doit("seule l'entree de l'appareil mort a disparu, le document est intact", async () => {
  const s = await getDoc(doc(alice, "pushTokens", ALICE));
  if (!s.exists()) throw new Error("le document entier a disparu");
  const d = s.data() || {};
  if (d.jetons && d.jetons.pc1) throw new Error("l'entree morte est encore la");
  if (d.lat !== 50.85) throw new Error("la position a ete perdue : lat=" + d.lat);
  if (!d.jetons || !d.jetons.tel1 || d.jetons.tel1.token !== "jeton-iphone") {
    throw new Error("l'iPhone a ete emporte avec le PC : " + JSON.stringify(d.jetons && Object.keys(d.jetons)));
  }
});

/* ── ACTE 5 : LES APPAREILS DE QUELQU'UN NE SONT PAS PUBLICS ─────────────── */
await doitEchouer("Bob lit la liste des appareils d'Alice", async () => {
  await getDoc(doc(bob, "pushTokens", ALICE));
});
await doitEchouer("un visiteur non connecte lit les appareils d'Alice", async () => {
  await getDoc(doc(anon, "pushTokens", ALICE));
});
await doitEchouer("Bob ajoute SON appareil au compte d'Alice pour recevoir ses alertes", async () => {
  await setDoc(doc(bob, "pushTokens", ALICE), { jetons: chargeAppareil("bob1", "jeton-de-bob", "chez Bob") }, { merge: true });
});
await doitEchouer("Bob efface l'appareil d'Alice pour la rendre muette", async () => {
  await updateDoc(doc(bob, "pushTokens", ALICE), { "jetons.tel1": deleteField() });
});

/* ── ACTE 6 : LA CARTE NE GROSSIT PAS SANS FIN ────────────────────────────── */
await doit("trente appareils successifs tiennent dans le document", async () => {
  for (let i = 0; i < 30; i++) {
    await fbEnablePush(alice, ALICE, "jeton-" + i, "app" + i, "Appareil · Navigateur", 50.85, 4.35);
  }
  const d = (await getDoc(doc(alice, "pushTokens", ALICE))).data() || {};
  const n = jetonsDuDoc(d).length;
  note("Apres trente ouvertures sur trente navigateurs differents : " + n + " jeton(s) dans le document, "
     + "soit environ " + Math.round(JSON.stringify(d).length / 1024) + " ko sur la limite de 1024 ko de Firestore. "
     + "Aucun elagage n'est fait : chaque navigateur dont les donnees sont effacees laisse une entree morte, "
     + "que le serveur retire au premier refus de Google. Une personne reelle en a deux ou trois.");
  if (n < 30) throw new Error("des entrees ont ete perdues : " + n);
});

/* ── ACTE 7 : LA PANNE, REPRODUITE SUR L'ANCIENNE ECRITURE ──────────────────
   Un correctif qu'on ne peut pas voir echouer n'est pas demontre. On rejoue
   donc ici l'ecriture d'AVANT — un seul champ « token », rien d'autre — et on
   verifie qu'elle perd bel et bien l'appareil precedent. Cet acte doit rester
   « ok » : il affirme que la panne existait, pas qu'elle existe encore. */
async function fbEnablePushAVANT(db, uid, jeton, lat, lng) {
  const charge = { token: jeton, updatedAt: serverTimestamp() };
  if (lat != null && lng != null) { charge.lat = lat; charge.lng = lng; }
  return setDoc(doc(db, "pushTokens", uid), charge, { merge: true });
}
await doit("l'ancienne ecriture perdait bien le jeton de l'appareil precedent", async () => {
  const CAR = "carla";
  const carla = env.authenticatedContext(CAR).firestore();
  await fbEnablePushAVANT(carla, CAR, "ancien-iphone", 50.85, 4.35);
  await fbEnablePushAVANT(carla, CAR, "ancien-pc", 50.85, 4.35);
  const d = (await getDoc(doc(carla, "pushTokens", CAR))).data() || {};
  const jetons = jetonsDuDoc(d).map((j) => j.token);
  if (jetons.indexOf("ancien-iphone") !== -1) {
    throw new Error("l'ancienne ecriture gardait le jeton : la panne decrite n'existait pas, ce scenario raconte n'importe quoi");
  }
  if (jetons.length !== 1 || jetons[0] !== "ancien-pc") throw new Error(JSON.stringify(jetons));
  note("Ancienne ecriture : apres l'ouverture sur le PC, le serveur ne connait plus que « ancien-pc ». "
     + "Le telephone de Carla ne recevra plus jamais rien, et aucun ecran n'aurait pu le lui dire.");
});

await bilan(env);
