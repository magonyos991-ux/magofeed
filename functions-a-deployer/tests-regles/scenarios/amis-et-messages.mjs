/* ============================================================================
   PARCOURS « amis-et-messages »
   ----------------------------------------------------------------------------
   Demandes d'amis, refus, blocage, premiere conversation, messagerie.

   Chaque ecriture de ce fichier RECOPIE une fonction de index.html, a
   l'identique : memes collections, memes champs, meme ordre, memes valeurs.
   Le numero de ligne de la fonction rejouee est cite au-dessus de chaque
   helper. Rien n'est invente : ce qui est teste ici est ce que l'application
   envoie vraiment a Firestore.

   Les etapes « doitEchouer » sont des ABUS : elles doivent etre refusees par
   les regles. Une ligne « ECHEC » sur un doitEchouer veut dire que l'abus est
   passe. Les etapes « doit » qui contiennent un throw explicite verifient une
   promesse faite a l'utilisateur ; une ligne « ECHEC » veut dire que la
   promesse n'est pas tenue.
   ============================================================================ */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, collection, query,
         where, orderBy, limit, startAt, endAt, serverTimestamp, arrayUnion,
         arrayRemove, increment, writeBatch, Timestamp } from "firebase/firestore";

const env = await banc("amis-et-messages");

const A = "alice", B = "bob", C = "carol", D = "dan", E = "eve", F = "franck";
const alice  = env.authenticatedContext(A).firestore();
const bob    = env.authenticatedContext(B).firestore();
const carol  = env.authenticatedContext(C).firestore();
const dan    = env.authenticatedContext(D).firestore();
const eve    = env.authenticatedContext(E).firestore();
const franck = env.authenticatedContext(F).firestore();
const anon   = env.unauthenticatedContext().firestore();

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/* index.html:2581 — window.fbConvId */
const cid = (a, b) => [String(a), String(b)].sort().join("_");

/* index.html:2683 — window.fbDemanderAmi, branche « aucun lien n'existe » */
const demanderAmi = (db, me, uid) => setDoc(doc(db, "amis", cid(me, uid)), {
  members: [me, uid].sort(),
  requestBy: me,
  state: "request",
  createdAt: serverTimestamp(),
  at: serverTimestamp()
});
/* index.html:2720 — window.fbRepondreAmi */
const repondreAmi = (db, me, uid, oui) => updateDoc(doc(db, "amis", cid(me, uid)),
  { state: oui ? "ok" : "declined", at: serverTimestamp() });
/* index.html:2743 — window.fbRetirerAmi */
const retirerAmi = (db, me, uid) => deleteDoc(doc(db, "amis", cid(me, uid)));
/* index.html:2658 — window.fbMesAmis (l'ecouteur, en version « une fois ») */
const mesAmis = (db, me) => getDocs(query(collection(db, "amis"),
  where("members", "array-contains", me), limit(300)));

/* index.html:2613 — window.fbBloquer */
const bloquer = (db, me, uid, oui) => setDoc(doc(db, "blocks", me), {
  list: oui ? arrayUnion(uid) : arrayRemove(uid),
  at: serverTimestamp()
}, { merge: true });
/* index.html:2588 — window.fbMesBlocs */
const mesBlocs = (db, me) => getDoc(doc(db, "blocks", me));

/* index.html:2755 — window.fbOuvrirConversation.
   `ami` rejoue window.fbEstAmi(otherUid) (index.html:2679). */
async function ouvrirConversation(db, me, autre, ami) {
  const id = cid(me, autre);
  const unread = {}; unread[me] = 0; unread[autre] = 0;
  await setDoc(doc(db, "conversations", id), {
    members: [me, autre].sort(),
    createdBy: me,
    createdAt: serverTimestamp(),
    state: ami ? "open" : "request",
    requestBy: me,
    reqCount: 0,
    lastAt: serverTimestamp(),
    unread: unread
  });
  return id;
}
/* index.html:2805 — window.fbEnvoyerMessage, type "text" : LE LOT (message +
   en-tete de conversation), construit exactement comme construireLot(). */
async function envoyerTexte(db, me, id, texte, etatDuFil) {
  const membres = String(id).split("_");
  const autre = membres[0] === me ? membres[1] : membres[0];
  const t = String(texte || "").slice(0, 2000);
  const m = { by: me, at: serverTimestamp(), type: "text", text: t };
  const mref = doc(collection(db, "conversations", id, "messages"));
  const batch = writeBatch(db);
  batch.set(mref, m);
  const maj = {
    lastAt: serverTimestamp(),
    lastMsg: { by: me, type: "text", text: t.slice(0, 80), at: serverTimestamp() }
  };
  maj["unread." + autre] = increment(1);
  if (etatDuFil === "request") maj.reqCount = 1;
  batch.update(doc(db, "conversations", id), maj);
  await batch.commit();
  return mref.id;
}
/* La MOITIE du lot ci-dessus : l'en-tete seul, sans le message. L'application
   ne fait jamais ca — c'est precisement l'abus qu'on teste. */
const majApercuSeul = (db, me, id, autre, texte) => updateDoc(doc(db, "conversations", id), Object.assign({
  lastAt: serverTimestamp(),
  lastMsg: { by: me, type: "text", text: String(texte).slice(0, 80), at: serverTimestamp() }
}, { ["unread." + autre]: increment(1) }));

/* index.html:2916 — window.fbAccepterConversation */
async function accepterConversation(db, me, id, oui) {
  const maj = { state: oui ? "open" : "declined" };
  if (!oui) maj["unread." + me] = 0;
  await updateDoc(doc(db, "conversations", id), maj);
}
/* index.html:2905 — window.fbMarquerLu */
const marquerLu = (db, me, id) => updateDoc(doc(db, "conversations", id), { ["unread." + me]: 0 });
/* index.html:2973 — window.fbMasquerConversation */
const masquer = (db, me, id) => updateDoc(doc(db, "conversations", id), { ["masque." + me]: serverTimestamp() });
/* index.html:2964 — window.fbSupprimerMessage */
const supprimerMessage = (db, id, mid) => deleteDoc(doc(db, "conversations", id, "messages", mid));
/* index.html:2984 — window.fbMessages (l'ecouteur, en version « une fois ») */
const lireMessages = (db, id) => getDocs(query(collection(db, "conversations", id, "messages"),
  orderBy("at", "desc"), limit(60)));
/* index.html:2931 — window.fbMesConversations */
const mesConversations = (db, me) => getDocs(query(collection(db, "conversations"),
  where("members", "array-contains", me), orderBy("lastAt", "desc"), limit(50)));

/* index.html:1406 — fbSyncStats : la forme EXACTE du profil public. */
const ecrireProfil = (db, uid, pseudo, recent) => setDoc(doc(db, "users", uid), {
  pseudo: pseudo,
  pseudoLower: pseudo.toLowerCase(),
  avatar: { type: "emo", v: "🦊" },
  favs: [1, 2],
  recent: recent || [],
  signals: 0,
  confirms: 3,
  discAccepted: 1,
  streak: 2,
  bestStreak: 5,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp()
}, { merge: true });
/* index.html:5497 — window.fbSearchUsers : les memes cinq requetes. */
async function chercherJoueurs(db, prefix) {
  const p = String(prefix || "").trim();
  if (!p) return [];
  const low = p.toLowerCase(), cap = low.charAt(0).toUpperCase() + low.slice(1);
  const variantes = [p, low, cap, p.toUpperCase()].filter((v, i, a) => a.indexOf(v) === i);
  const users = collection(db, "users");
  const requetes = [query(users, orderBy("pseudoLower"), startAt(low), endAt(low + ""), limit(12))]
    .concat(variantes.map((v) => query(users, orderBy("pseudo"), startAt(v), endAt(v + ""), limit(12))));
  const snaps = await Promise.all(requetes.map((q) => getDocs(q).catch(() => null)));
  const vus = {}, rows = [];
  snaps.forEach((snap) => {
    if (!snap) return;
    snap.forEach((d) => {
      if (vus[d.id]) return;
      const x = d.data(); x.uid = d.id;
      if (String(x.pseudo || "").toLowerCase().indexOf(low) !== 0) return;
      vus[d.id] = true; rows.push(x);
    });
  });
  return rows.slice(0, 12);
}

/* ══ 0. Les profils publics, ecrits par leurs proprietaires ════════════════ */
await doit("chacun cree son profil public (fbSyncStats, index.html:1406)", async () => {
  await ecrireProfil(alice, A, "Alice", [
    { t: "confirm", d: "Oasis Tropical", s: "Carrefour Market Flagey", j: "2026-09-14" },
    { t: "scan", d: "Fanta Exotic", s: "Delhaize Chatelain", j: "2026-09-15" }
  ]);
  await ecrireProfil(bob, B, "Bob", []);
  await ecrireProfil(carol, C, "Carol", []);
  await ecrireProfil(dan, D, "Dan", []);
  await ecrireProfil(eve, E, "Eve", []);
  await ecrireProfil(franck, F, "Franck", []);
});

/* ══ 1. Alice demande Bob en ami, Bob accepte ══════════════════════════════ */
await doit("1. Alice demande Bob en ami (fbDemanderAmi, index.html:2683)", async () => {
  await demanderAmi(alice, A, B);
});
await doitEchouer("1. Alice ne peut pas s'accepter elle-meme (elle est la demandeuse)", async () => {
  await repondreAmi(alice, A, B, true);
});
await doitEchouer("1. Alice ne peut pas naitre deja amie (state 'ok' a la creation)", async () => {
  await setDoc(doc(alice, "amis", cid(A, C)), {
    members: [A, C].sort(), requestBy: A, state: "ok",
    createdAt: serverTimestamp(), at: serverTimestamp()
  });
});
await doitEchouer("1. Alice ne peut pas creer un lien entre Bob et Carol", async () => {
  await setDoc(doc(alice, "amis", cid(B, C)), {
    members: [B, C].sort(), requestBy: B, state: "request",
    createdAt: serverTimestamp(), at: serverTimestamp()
  });
});
await doit("1. Bob accepte (fbRepondreAmi, index.html:2720)", async () => {
  await repondreAmi(bob, B, A, true);
});
await doit("1. Alice voit Bob dans sa liste d'amis (fbMesAmis, index.html:2658)", async () => {
  const s = await mesAmis(alice, A);
  const ok = s.docs.filter((d) => d.data().state === "ok" && d.data().members.includes(B));
  if (ok.length !== 1) throw new Error("Alice voit " + ok.length + " ami(s) au lieu de 1");
});
await doit("1. Bob voit Alice dans sa liste d'amis", async () => {
  const s = await mesAmis(bob, B);
  const ok = s.docs.filter((d) => d.data().state === "ok" && d.data().members.includes(A));
  if (ok.length !== 1) throw new Error("Bob voit " + ok.length + " ami(s) au lieu de 1");
});
await doitEchouer("1. Franck ne lit pas le lien d'amitie d'Alice et Bob", async () => {
  await getDoc(doc(franck, "amis", cid(A, B)));
});
await doitEchouer("1. Franck ne peut pas lister les liens d'amitie d'Alice", async () => {
  await getDocs(query(collection(franck, "amis"), where("members", "array-contains", A), limit(300)));
});
await doitEchouer("1. Franck ne peut pas aspirer toute la collection amis", async () => {
  await getDocs(collection(franck, "amis"));
});

/* ══ 2. Dan refuse. Alice peut-elle transformer le refus en amitie ? ═══════ */
await doit("2. Alice demande Dan en ami", async () => { await demanderAmi(alice, A, D); });
await doit("2. Dan refuse (fbRepondreAmi, index.html:2720)", async () => {
  await repondreAmi(dan, D, A, false);
});
await doitEchouer("2. Alice ne transforme pas le refus de Dan en amitie (declined -> ok)", async () => {
  await updateDoc(doc(alice, "amis", cid(A, D)), { state: "ok", at: serverTimestamp() });
});
await doitEchouer("2. Alice ne remet pas le lien refuse en demande (declined -> request)", async () => {
  await updateDoc(doc(alice, "amis", cid(A, D)), { state: "request", at: serverTimestamp() });
});
await doitEchouer("2. Alice ne remplace pas le demandeur pour pouvoir trancher elle-meme", async () => {
  await updateDoc(doc(alice, "amis", cid(A, D)), { requestBy: D, state: "ok", at: serverTimestamp() });
});
/* La regle (firestore.rules:393) annonce : « ON NE REVIENT JAMAIS A request.
   Un refus serait sinon un simple detour : refuser, puis se voir redemander,
   indefiniment. » Et firestore.rules:406 : « PAS DE SPAM POSSIBLE, MEME EN
   ANNULANT ET REDEMANDANT ». On verifie avec les DEUX fonctions de l'app. */
await doitEchouer("2. apres le refus de Dan, Alice ne peut pas effacer le lien puis redemander (fbRetirerAmi index.html:2743 + fbDemanderAmi index.html:2683)", async () => {
  await retirerAmi(alice, A, D);
  await demanderAmi(alice, A, D);
});
await note((await (async () => {
  const s = await getDoc(doc(dan, "amis", cid(A, D)));
  const d = s.exists() ? s.data() : null;
  return "2. etat du lien Alice-Dan apres le refus puis la tentative de redemande : " +
    (d ? "state=" + d.state + " requestBy=" + d.requestBy : "(lien absent)");
})()));
await doit("2. Dan, lui, peut revenir sur son propre refus (declined -> ok)", async () => {
  await demanderAmi(carol, C, D);            // Carol demande, Dan refuse...
  await repondreAmi(dan, D, C, false);
  await repondreAmi(dan, D, C, true);        // ...puis change d'avis, seul
});
await doitEchouer("2. Carol, elle, ne peut pas changer d'avis a la place de Dan", async () => {
  await demanderAmi(carol, C, E);
  await repondreAmi(eve, E, C, false);
  await repondreAmi(carol, C, E, true);
});

/* ══ 3+5. Le fil ouvert entre amis : Bob ecrit a Alice ═════════════════════ */
let AB = cid(A, B);
await doitEchouer("3. un fil ne naît pas « ouvert » entre deux inconnus (Franck vers Carol)", async () => {
  await ouvrirConversation(franck, F, C, true);
});
await doit("3. entre amis, le fil naît ouvert (fbOuvrirConversation, index.html:2755)", async () => {
  await ouvrirConversation(bob, B, A, true);
});
await pause(900);
let M1 = null;
await doit("3. Bob envoie son premier message (fbEnvoyerMessage, index.html:2805)", async () => {
  M1 = await envoyerTexte(bob, B, AB, "Salut Alice", "open");
});
await doitEchouer("6. Bob ne peut pas enchaîner un deuxieme message en moins de 700 ms", async () => {
  await envoyerTexte(bob, B, AB, "et encore un", "open");
});
await pause(900);
await doit("3. Alice repond", async () => { await envoyerTexte(alice, A, AB, "Salut Bob", "open"); });
await pause(900);
await doitEchouer("6. un message SEUL, sans mise a jour de l'en-tete, est refuse", async () => {
  await setDoc(doc(collection(alice, "conversations", AB, "messages")),
    { by: A, at: serverTimestamp(), type: "text", text: "message isole" });
});
await doitEchouer("6. on ne peut pas ANTIDATER un message (at = hier)", async () => {
  const hier = Timestamp.fromDate(new Date(Date.now() - 86400000));
  const mref = doc(collection(alice, "conversations", AB, "messages"));
  const batch = writeBatch(alice);
  batch.set(mref, { by: A, at: hier, type: "text", text: "je l'avais dit hier" });
  batch.update(doc(alice, "conversations", AB), Object.assign({
    lastAt: serverTimestamp(),
    lastMsg: { by: A, type: "text", text: "je l'avais dit hier", at: serverTimestamp() }
  }, { ["unread." + B]: increment(1) }));
  await batch.commit();
});
await doitEchouer("6. on ne peut pas USURPER l'auteur (Alice ecrit au nom de Bob)", async () => {
  const mref = doc(collection(alice, "conversations", AB, "messages"));
  const batch = writeBatch(alice);
  batch.set(mref, { by: B, at: serverTimestamp(), type: "text", text: "c'est Bob qui parle" });
  batch.update(doc(alice, "conversations", AB), Object.assign({
    lastAt: serverTimestamp(),
    lastMsg: { by: A, type: "text", text: "c'est Bob qui parle", at: serverTimestamp() }
  }, { ["unread." + B]: increment(1) }));
  await batch.commit();
});
await doitEchouer("6. on ne peut pas MODIFIER un message deja envoye", async () => {
  await updateDoc(doc(alice, "conversations", AB, "messages", M1), { text: "je n'ai jamais dit ca" });
});
await doitEchouer("6. Alice ne peut pas EFFACER le message de Bob", async () => {
  await supprimerMessage(alice, AB, M1);
});
await pause(900);
let M3 = null;
await doit("6. Bob envoie un message qu'il va regretter", async () => {
  M3 = await envoyerTexte(bob, B, AB, "Je retire ce que j'ai dit", "open");
});
await doit("6. Bob efface SON message (fbSupprimerMessage, index.html:2964)", async () => {
  await supprimerMessage(bob, AB, M3);
});
/* L'app promet a Bob : « Il disparaît aussi chez l'autre personne, et c'est
   definitif. » (index.html:26367). L'apercu du fil, lui, est un autre document. */
await doit("6. apres l'effacement, la boite d'Alice ne cite plus le message efface", async () => {
  const s = await getDoc(doc(alice, "conversations", AB));
  const lm = (s.data() || {}).lastMsg || {};
  const msgs = await lireMessages(alice, AB);
  const encore = msgs.docs.some((d) => d.id === M3);
  if (!encore && lm.text === "Je retire ce que j'ai dit")
    throw new Error("le message est efface mais l'apercu de la boite d'Alice affiche toujours « " + lm.text + " »");
});
await doit("6. Alice marque le fil comme lu (fbMarquerLu, index.html:2905)", async () => {
  await marquerLu(alice, A, AB);
});
await doitEchouer("6. Alice ne peut pas se gonfler son propre compteur de non-lus", async () => {
  await updateDoc(doc(alice, "conversations", AB), { ["unread." + A]: 50 });
});
await doitEchouer("6. Bob ne peut pas gonfler le compteur d'Alice sans message", async () => {
  await updateDoc(doc(bob, "conversations", AB), { ["unread." + A]: increment(1) });
});
await doit("6. Alice range le fil de son cote (fbMasquerConversation, index.html:2973)", async () => {
  await masquer(alice, A, AB);
});
await doitEchouer("6. Alice ne peut pas ranger le fil a la place de Bob", async () => {
  await updateDoc(doc(alice, "conversations", AB), { ["masque." + B]: serverTimestamp() });
});

/* ══ 4. Premier message a un inconnu : Bob ecrit a Carol ═══════════════════ */
const BC = cid(B, C);
await doit("4. Bob ouvre un fil avec Carol, qu'il ne connaît pas : il naît en demande", async () => {
  await ouvrirConversation(bob, B, C, false);
});
await pause(900);
await doit("4. Bob envoie SON message de demande", async () => {
  await envoyerTexte(bob, B, BC, "Salut, tu as vu du Oasis Tropical par chez toi ?", "request");
});
await pause(900);
await doitEchouer("4. Bob n'a droit qu'a UN message tant que Carol n'a pas repondu", async () => {
  await envoyerTexte(bob, B, BC, "tu reponds ?", "request");
});
await doit("4. Carol, destinataire, lit la demande et son contenu AVANT d'accepter", async () => {
  const c = await getDoc(doc(carol, "conversations", BC));
  if (!c.exists()) throw new Error("Carol ne voit pas la conversation");
  const m = await lireMessages(carol, BC);
  if (m.size !== 1) throw new Error("Carol voit " + m.size + " message(s) au lieu de 1");
});
await note("4. avant d'accepter, Carol lit le message ENTIER (2000 caracteres possibles), pas seulement l'apercu de 80 de la carte de demande");
await doitEchouer("4. Carol ne peut pas repondre tant qu'elle n'a pas accepte", async () => {
  await envoyerTexte(carol, C, BC, "salut", "request");
});
await doit("4. Carol refuse la demande (fbAccepterConversation, index.html:2916)", async () => {
  await accepterConversation(carol, C, BC, false);
});
await pause(900);
await doitEchouer("4. apres le refus, Bob ne peut plus ecrire a Carol", async () => {
  await envoyerTexte(bob, B, BC, "allo ?", "declined");
});
await doitEchouer("4. apres le refus, personne ne remet le fil en demande", async () => {
  await updateDoc(doc(bob, "conversations", BC), { state: "request" });
});
await doitEchouer("4. Bob ne peut pas effacer le fil refuse pour en ouvrir un neuf", async () => {
  await deleteDoc(doc(bob, "conversations", BC));
});
await doitEchouer("4. apres le refus, Bob ne peut plus toucher a l'apercu ni au compteur de Carol", async () => {
  await majApercuSeul(bob, B, BC, C, "reponds-moi");
});
/* Le fil refuse ne peut plus jamais s'ouvrir, meme si les deux deviennent
   amis ensuite : etatHonnete (firestore.rules:466) ne part que de 'request'. */
await doit("4. Bob et Carol deviennent amis apres le refus", async () => {
  await demanderAmi(bob, B, C);
  await repondreAmi(carol, C, B, true);
});
await note((await (async () => {
  const s = await getDoc(doc(bob, "conversations", BC));
  return "4. Bob et Carol sont maintenant amis ; l'etat de leur fil reste : " + (s.data() || {}).state;
})()));
await pause(900);
/* La liste d'amis affiche « Appuie pour lui ecrire » (index.html:25977) et le
   champ de saisie du fil reste actif (index.html:26491 : « attente » est faux
   hors etat request). On rejoue donc le geste reel : fbEnvoyerMessage. */
await doit("4. devenus amis, Bob peut de nouveau ecrire a Carol (fbEnvoyerMessage, index.html:2805)", async () => {
  await envoyerTexte(bob, B, BC, "on est amis maintenant !", "declined");
});
await note("4. index.html:26240 (msgMarquerLuSiOuvert) refuse de marquer lu un fil qui n'est pas « open » : la promesse de l'ecran de demande — « il ne voit pas si tu l'as lu » (msgReqIntro) — est bien tenue");

/* ══ 5. Un tiers peut-il lire une conversation qui ne le concerne pas ? ════ */
await doitEchouer("5. Franck ne lit pas la conversation d'Alice et Bob", async () => {
  await getDoc(doc(franck, "conversations", AB));
});
await doitEchouer("5. Franck ne lit pas les messages d'Alice et Bob", async () => {
  await lireMessages(franck, AB);
});
await doitEchouer("5. Franck ne peut pas aspirer toute la collection conversations", async () => {
  await getDocs(collection(franck, "conversations"));
});
await doitEchouer("5. Franck ne peut pas lister les conversations d'Alice", async () => {
  await getDocs(query(collection(franck, "conversations"),
    where("members", "array-contains", A), orderBy("lastAt", "desc"), limit(50)));
});
await doit("5. Franck liste les SIENNES, et n'en a aucune (fbMesConversations, index.html:2931)", async () => {
  const s = await mesConversations(franck, F);
  if (s.size !== 0) throw new Error("Franck voit " + s.size + " conversation(s)");
});
await doitEchouer("5. Franck ne s'inscrit pas dans le fil d'Alice et Bob", async () => {
  await updateDoc(doc(franck, "conversations", AB), { members: [A, B, F].sort() });
});
await doitEchouer("5. Franck n'ecrit pas dans le fil d'Alice et Bob", async () => {
  await envoyerTexte(franck, F, AB, "coucou c'est moi", "open");
});
await doitEchouer("5. un visiteur sans compte ne lit aucune conversation", async () => {
  await getDoc(doc(anon, "conversations", AB));
});

/* ══ 3(bis). Alice bloque Bob ══════════════════════════════════════════════ */
await doit("3. Alice bloque Bob (fbBloquer, index.html:2613)", async () => {
  await bloquer(alice, A, B, true);
});
await doit("3. Alice relit sa liste de blocage (fbMesBlocs, index.html:2588)", async () => {
  const s = await mesBlocs(alice, A);
  if (!(s.data() || {}).list || s.data().list.indexOf(B) === -1) throw new Error("Bob absent de la liste");
});
await doitEchouer("3. Bob ne peut pas savoir qu'Alice l'a bloque", async () => {
  await getDoc(doc(bob, "blocks", A));
});
await pause(900);
await doitEchouer("3. Bob bloque ne peut plus ECRIRE a Alice", async () => {
  await envoyerTexte(bob, B, AB, "tu m'ignores ?", "open");
});
/* Le blocage doit « fermer la porte » (firestore.rules:405). L'en-tete de
   conversation, lui, n'est protege par aucune verification de blocage. */
await doitEchouer("3. Bob bloque ne peut plus deposer d'apercu ni de non-lu chez Alice", async () => {
  await majApercuSeul(bob, B, AB, A, "je passe quand meme par la porte de service");
});
await note((await (async () => {
  const s = await getDoc(doc(alice, "conversations", AB));
  const d = s.data() || {};
  return "3. ce que la boite d'Alice affiche apres le blocage : lastMsg.by=" +
    ((d.lastMsg || {}).by || "?") + " lastMsg.text=« " + ((d.lastMsg || {}).text || "") +
    " » unread[alice]=" + ((d.unread || {})[A]);
})()));
await doit("3. les messages du fil, eux, n'ont pas bouge", async () => {
  const m = await lireMessages(alice, AB);
  const apres = m.docs.filter((d) => d.data().text === "je passe quand meme par la porte de service");
  if (apres.length) throw new Error("un message est passe malgre le blocage");
});
await doitEchouer("3. Eve bloquee ne peut plus demander Alice en ami", async () => {
  await bloquer(alice, A, E, true);
  await demanderAmi(eve, E, A);
});
await doitEchouer("3. Eve bloquee ne peut pas ouvrir un fil avec un apercu chez Alice", async () => {
  const id = cid(E, A);
  const unread = {}; unread[E] = 0; unread[A] = 0;
  await setDoc(doc(eve, "conversations", id), {
    members: [E, A].sort(), createdBy: E, createdAt: serverTimestamp(),
    state: "request", requestBy: E, reqCount: 0, lastAt: serverTimestamp(),
    lastMsg: { by: E, type: "text", text: "tu ne m'echapperas pas", at: serverTimestamp() },
    unread: unread
  });
});
await doit("3. Bob bloque peut toujours LIRE le profil public d'Alice", async () => {
  const s = await getDoc(doc(bob, "users", A));
  if (!s.exists()) throw new Error("profil illisible");
});
/* firestore.rules:114 : « surtout AUCUNE coordonnee : le profil est public,
   une position dedans dirait ou la personne fait ses courses. » */
await doit("3. le profil public d'Alice ne dit pas ou elle fait ses courses", async () => {
  const s = await getDoc(doc(bob, "users", A));
  const magasins = ((s.data() || {}).recent || []).map((g) => g.s).filter(Boolean);
  if (magasins.length) throw new Error("le profil, lisible par la personne bloquee, nomme ses magasins : " + magasins.join(" / "));
});
await pause(900);
await note((await (async () => {
  let r = "non";
  try { await envoyerTexte(alice, A, AB, "et moi je peux encore ?", "open"); r = "oui"; } catch (e) {}
  return "3. Alice a bloque Bob ; Alice peut-elle encore ecrire a Bob ? " + r +
    " — les regles ne lisent que la liste du DESTINATAIRE (firestore.rules:600) ; c'est l'app qui refuse ce sens-la (index.html:2813)";
})()));
await doit("3. Alice peut debloquer Bob", async () => {
  await bloquer(alice, A, B, false);
  const s = await mesBlocs(alice, A);
  if ((s.data().list || []).indexOf(B) !== -1) throw new Error("Bob toujours bloque");
});
await doitEchouer("3. une liste de blocage de plus de 200 noms est refusee", async () => {
  const liste = []; for (let i = 0; i < 201; i++) liste.push("u" + i);
  await setDoc(doc(alice, "blocks", A), { list: liste, at: serverTimestamp() }, { merge: true });
});

/* ══ 7. fbSearchUsers : que sort-il de l'annuaire ? ════════════════════════ */
await doit("7. la recherche par prefixe trouve Bob (fbSearchUsers, index.html:5497)", async () => {
  const rows = await chercherJoueurs(alice, "bo");
  if (!rows.some((r) => r.uid === B)) throw new Error("Bob introuvable");
});
await doit("7. la recherche ignore la casse (« BOB » trouve Bob)", async () => {
  const rows = await chercherJoueurs(alice, "BOB");
  if (!rows.some((r) => r.uid === B)) throw new Error("Bob introuvable");
});
await note((await (async () => {
  const rows = await chercherJoueurs(alice, "a");
  const champs = rows.length ? Object.keys(rows[0]).sort().join(", ") : "(aucun)";
  return "7. un resultat de recherche rapporte le document ENTIER : " + champs;
})()));
await doit("7. un visiteur SANS COMPTE ne peut pas aspirer tout l'annuaire", async () => {
  const s = await getDocs(collection(anon, "users"));
  throw new Error("un visiteur sans compte a telecharge " + s.size + " profils en une requete, sans limite");
});
await note("7. l'application limite ses recherches a 12 resultats (index.html:5504) ; la regle users (firestore.rules:140 « allow read: if true ») n'impose, elle, aucune limite");

/* ══ 8. Taille, HTML, lien piege ═══════════════════════════════════════════ */
await pause(900);
await doitEchouer("8. un message de 100 000 caracteres est refuse", async () => {
  const mref = doc(collection(alice, "conversations", AB, "messages"));
  const batch = writeBatch(alice);
  batch.set(mref, { by: A, at: serverTimestamp(), type: "text", text: "x".repeat(100000) });
  batch.update(doc(alice, "conversations", AB), Object.assign({
    lastAt: serverTimestamp(),
    lastMsg: { by: A, type: "text", text: "xxx", at: serverTimestamp() }
  }, { ["unread." + B]: increment(1) }));
  await batch.commit();
});
await pause(900);
await doit("8. un message de 2000 caracteres (le maximum annonce) passe", async () => {
  await envoyerTexte(alice, A, AB, "y".repeat(2000), "open");
});
await pause(900);
await doitEchouer("8. un apercu de plus de 80 caracteres est refuse", async () => {
  await updateDoc(doc(alice, "conversations", AB), {
    lastAt: serverTimestamp(),
    lastMsg: { by: A, type: "text", text: "z".repeat(500), at: serverTimestamp() }
  });
});
await pause(900);
await doit("8. du HTML et un lien sont acceptes comme TEXTE (l'app les echappe a l'affichage, index.html:10082 et 26357)", async () => {
  await envoyerTexte(alice, A, AB, "<img src=x onerror=alert(1)> http://faux-magofeed.example/gagne", "open");
});
await note("8. index.html:26357 rend le texte par sanitize() et ne transforme jamais une adresse en lien cliquable : le HTML reste inerte et le lien piege n'est pas cliquable");
await pause(900);
await doitEchouer("8. une « image » qui n'est pas un JPEG en base64 est refusee", async () => {
  const mref = doc(collection(alice, "conversations", AB, "messages"));
  const batch = writeBatch(alice);
  batch.set(mref, { by: A, at: serverTimestamp(), type: "image", img: "https://pisteur.example/pixel.gif?u=bob" });
  batch.update(doc(alice, "conversations", AB), Object.assign({
    lastAt: serverTimestamp(),
    lastMsg: { by: A, type: "image", text: "Photo", at: serverTimestamp() }
  }, { ["unread." + B]: increment(1) }));
  await batch.commit();
});
await note("8. index.html:26267 (msgImgSure) revalide le prefixe data:image/jpeg;base64 avant d'afficher : meme acceptee par les regles, une fausse image n'est jamais chargee");

await bilan(env);
