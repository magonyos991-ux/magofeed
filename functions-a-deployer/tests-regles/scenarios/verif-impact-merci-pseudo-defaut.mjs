/* ============================================================================
   VERIFICATION « IMPACT » — « Remercie » s'affiche, personne n'est remercie
   ----------------------------------------------------------------------------
   La question posee ici n'est pas « le code a-t-il un defaut ». C'est :
   QU'EST-CE QUE CA CHANGE POUR QUELQU'UN ? On suit donc le chemin d'une
   personne reelle, geste par geste, et on recopie a chaque etape le texte que
   l'ecran lui montre.

   Le decor est le cas le PLUS ordinaire de l'application :
     - Bob n'a jamais ouvert les reglages pour changer son pseudo. Son profil
       porte donc la valeur par defaut, « Explorateur » (index.html:1700).
     - Bob n'a JAMAIS coche « aider en discret ». Son profil n'a pas le champ.
       (Mesure en production ce jour : 0 compte sur 153 a aideDiscrete:true.)

   Fonctions rejouees, a l'identique :
     index.html:5129-5145   window.fbCoupsDeMain
     index.html:5149-5152   window.fbDireMerci
     index.html:5158-5163   window.fbAideDiscrete
     index.html:21775-21818 renderCoupsDeMain  (le texte affiche)
     points-et-parrainage.js:404-429  noterCoupDeMain
     points-et-parrainage.js:437-458  direMerci
   ========================================================================== */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import {
  doc, setDoc, updateDoc, getDoc, getDocs,
  collection, query, orderBy, limit, serverTimestamp,
} from "firebase/firestore";

const env = await banc("verif-impact-merci-pseudo-defaut");

const ALICE = "alice", BOB = "bob";
const alice = env.authenticatedContext(ALICE).firestore();
const bob = env.authenticatedContext(BOB).firestore();

const serveur = async (fn) => {
  let out;
  await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); });
  return out;
};
const verifier = (cond, quoi) => { if (!cond) throw new Error(quoi); };

const BOISSON = 7, MAGASIN = "st-delhaize-flagey";

/* ── index.html:5129-5145 — window.fbCoupsDeMain ────────────────────────── */
async function fbCoupsDeMain(db, uid) {
  const q = query(collection(db, "coupsDeMain", uid, "recus"), orderBy("at", "desc"), limit(12));
  const snap = await getDocs(q);
  const out = [];
  snap.forEach((d) => {
    const x = d.data() || {};
    out.push({
      id: d.id, aidantUid: x.aidantUid || null, aidantPseudo: x.aidantPseudo || null,
      drinkId: x.drinkId, storeId: x.storeId || "", at: x.at || 0, merci: x.merci === true,
    });
  });
  return out;
}
/* ── index.html:5149-5152 — window.fbDireMerci ──────────────────────────── */
async function fbDireMerci(db, uid, id) {
  await updateDoc(doc(db, "coupsDeMain", uid, "recus", String(id)), { merci: true });
  return true;
}
/* ── index.html:5158-5163 — window.fbAideDiscrete ───────────────────────── */
async function fbAideDiscrete(db, uid, actif) {
  await setDoc(doc(db, "users", uid), { aideDiscrete: !!actif }, { merge: true });
}

/* ── index.html:21775-21818 — renderCoupsDeMain ──────────────────────────
   On ne garde que ce qui produit du TEXTE LU PAR UN HUMAIN : le nom de
   l'aidant (ligne 21796) et l'etat du bouton (lignes 21800-21802). Le reste
   est de la mise en forme. */
function ecranCoupDeMain(x) {
  const qui = x.aidantPseudo ? String(x.aidantPseudo) : "Quelqu'un";
  return {
    titre: qui + " t'a donne un coup de main",
    action: x.merci ? "Remercie" : "[bouton Merci]",
  };
}

/* ── points-et-parrainage.js:404-429 — noterCoupDeMain ───────────────────── */
async function noterCoupDeMain(db, uidChercheur, aide) {
  let pseudo = null;
  const ua = await getDoc(doc(db, "users", aide.by));
  const da = ua.exists() ? (ua.data() || {}) : {};
  if (da.aideDiscrete !== true && typeof da.pseudo === "string") {
    pseudo = da.pseudo.slice(0, 24);
    if (pseudo === "Explorateur") pseudo = null;   // ligne 412
  }
  const quand = aide.createdAt && aide.createdAt.toMillis
    ? Math.floor(aide.createdAt.toMillis() / 3600000) * 3600000
    : Math.floor(Date.now() / 3600000) * 3600000;
  await setDoc(doc(db, "coupsDeMain", uidChercheur, "recus", aide.id), {
    aidantUid: pseudo ? String(aide.by) : null,     // ligne 419
    aidantPseudo: pseudo,
    drinkId: Number(aide.drinkId),
    storeId: String(aide.storeId || ""),
    at: quand, merci: false,
  }, { merge: true });
  return { id: aide.id, aidantUid: pseudo ? String(aide.by) : null, aidantPseudo: pseudo };
}

/* ── points-et-parrainage.js:437-458 — direMerci ─────────────────────────── */
function direMerci(avant, apres) {
  if (avant.merci === true || apres.merci !== true) return { envoi: false, pourquoi: "pas une bascule false->true" };
  if (!apres.aidantUid) return { envoi: false, pourquoi: "ligne 444 : !ap.aidantUid — rien n'est envoye" };
  return { envoi: true, pourquoi: "poussee « Quelqu'un te remercie » vers " + apres.aidantUid };
}

/* ═══════════════════════════════════════════════════════════════════════════
   LE DECOR : deux comptes tels que l'application les cree (index.html:1700)
   ═══════════════════════════════════════════════════════════════════════════ */
await doit("Alice et Bob ont le profil que l'app cree a la premiere connexion (index.html:1700)", async () => {
  await setDoc(doc(alice, "users", ALICE), { pseudo: "Explorateur", signals: 0, confirms: 0, createdAt: serverTimestamp() }, { merge: true });
  await setDoc(doc(bob, "users", BOB), { pseudo: "Explorateur", signals: 0, confirms: 0, createdAt: serverTimestamp() }, { merge: true });
});
await doit("Bob n'a JAMAIS coche « aider en discret » : le champ est absent de son profil", async () => {
  const d = await getDoc(doc(bob, "users", BOB));
  verifier((d.data() || {}).aideDiscrete === undefined, "le decor est fausse : aideDiscrete est deja pose");
});

/* ═══════════════════════════════════════════════════════════════════════════
   1. BOB AIDE ALICE. Le serveur depose le coup de main chez Alice.
   ═══════════════════════════════════════════════════════════════════════════ */
let coup = null;
await doit("le coup de main de Bob arrive bien chez Alice", async () => {
  coup = await serveur((db) => noterCoupDeMain(db, ALICE, {
    id: "aide-1", by: BOB, drinkId: BOISSON, storeId: MAGASIN,
    createdAt: { toMillis: () => Date.now() },
  }));
  verifier(coup && coup.id === "aide-1", "rien n'a ete depose");
});
note("ce que le serveur a ecrit : " + JSON.stringify(coup));

/* ═══════════════════════════════════════════════════════════════════════════
   2. CE QU'ALICE VOIT, AVANT D'APPUYER
   ═══════════════════════════════════════════════════════════════════════════ */
let recus = [];
let ecranAvant = null;
await doit("Alice voit la carte, et l'app lui PROPOSE le bouton « Merci »", async () => {
  recus = await fbCoupsDeMain(alice, ALICE);
  verifier(recus.length === 1, "Alice a " + recus.length + " carte(s), attendu 1");
  ecranAvant = ecranCoupDeMain(recus[0]);
  verifier(ecranAvant.action === "[bouton Merci]", "pas de bouton propose : " + ecranAvant.action);
});
note("ecran d'Alice AVANT : « " + (ecranAvant && ecranAvant.titre) + " » + " + (ecranAvant && ecranAvant.action));

/* L'app n'avertit nulle part que ce bouton ne mene a rien. Elle ne peut pas :
   l'information qui le dirait (aidantUid) est justement celle qui manque. */
await doit("rien dans la carte ne previent Alice que le bouton est sans effet", async () => {
  verifier(recus[0].aidantUid === null,
    "aidantUid present (" + recus[0].aidantUid + ") : ce scenario ne reproduit pas le cas etudie");
});

/* ═══════════════════════════════════════════════════════════════════════════
   3. ALICE APPUIE. L'ECRITURE PASSE, L'ECRAN CHANGE.
   ═══════════════════════════════════════════════════════════════════════════ */
const avantMerci = Object.assign({}, recus[0]);
let ecranApres = null;
await doit("l'appui d'Alice est accepte par les regles : le merci est enregistre", async () => {
  await fbDireMerci(alice, ALICE, recus[0].id);
  const r = await fbCoupsDeMain(alice, ALICE);
  verifier(r[0].merci === true, "le merci n'est pas enregistre");
  ecranApres = ecranCoupDeMain(r[0]);
});
note("ecran d'Alice APRES : « " + (ecranApres && ecranApres.titre) + " » + " + (ecranApres && ecranApres.action));

await doit("l'ecran d'Alice affiche « Remercie » (index.html:21801)", async () => {
  verifier(ecranApres && ecranApres.action === "Remercie",
    "l'ecran affiche " + (ecranApres && ecranApres.action));
});

/* ═══════════════════════════════════════════════════════════════════════════
   4. CE QUE BOB RECOIT
   ═══════════════════════════════════════════════════════════════════════════ */
const envoi = direMerci(avantMerci, Object.assign({}, avantMerci, { merci: true }));
note("direMerci cote serveur : " + (envoi.envoi ? "ENVOI" : "RIEN") + " — " + envoi.pourquoi);

await doit("Bob recoit la poussee « Quelqu'un te remercie » (points-et-parrainage.js:449)", async () => {
  verifier(envoi.envoi, envoi.pourquoi);
});
await doit("a defaut de poussee, Bob trouve une trace quelque part dans la base", async () => {
  const cdm = await getDocs(query(collection(bob, "coupsDeMain", BOB, "recus"), orderBy("at", "desc"), limit(12)));
  verifier(cdm.docs.length > 0,
    "aucun document nulle part ne dit a Bob qu'on l'a remercie : la seule voie etait la poussee, et elle n'est pas partie");
});

/* ═══════════════════════════════════════════════════════════════════════════
   5. LE POINT QUI DECIDE DE LA GRAVITE : EST-CE RATTRAPABLE ?
   Les regles (firestore.rules:301-304) n'autorisent le merci que dans un
   sens, une seule fois. Bonne intention — mais ici elle scelle l'echec.
   ═══════════════════════════════════════════════════════════════════════════ */
await doitEchouer("Alice ne peut pas revenir en arriere (regles 302-304)", async () => {
  await updateDoc(doc(alice, "coupsDeMain", ALICE, "recus", "aide-1"), { merci: false });
});
await doitEchouer("Alice ne peut pas re-appuyer pour reessayer (regles 304)", async () => {
  await fbDireMerci(alice, ALICE, "aide-1");
});
await doit("meme si Bob choisit un pseudo demain, CE coup de main reste mort", async () => {
  await setDoc(doc(bob, "users", BOB), { pseudo: "Bob" }, { merge: true });
  const r = await fbCoupsDeMain(alice, ALICE);
  const e = direMerci({ merci: false, aidantUid: r[0].aidantUid }, { merci: true, aidantUid: r[0].aidantUid });
  verifier(e.envoi,
    "le document garde aidantUid:null pour toujours — noterCoupDeMain ne repasse jamais sur un coup de main deja ecrit, et le merci ne peut plus etre rejoue");
});

/* ═══════════════════════════════════════════════════════════════════════════
   6. LE TEMOIN : le meme geste, avec un pseudo choisi, marche.
   C'est ce qui prouve que le pseudo par defaut est bien la cause, et non une
   panne generale du chemin.
   ═══════════════════════════════════════════════════════════════════════════ */
await doit("TEMOIN — avec un pseudo choisi, le merci part vraiment vers Bob", async () => {
  const c2 = await serveur((db) => noterCoupDeMain(db, ALICE, {
    id: "aide-2", by: BOB, drinkId: BOISSON, storeId: MAGASIN,
    createdAt: { toMillis: () => Date.now() },
  }));
  verifier(c2.aidantUid === BOB, "aidantUid absent meme avec un pseudo : " + JSON.stringify(c2));
  const e = direMerci({ merci: false, aidantUid: c2.aidantUid }, { merci: true, aidantUid: c2.aidantUid });
  verifier(e.envoi, e.pourquoi);
  const r = await fbCoupsDeMain(alice, ALICE);
  const vue = ecranCoupDeMain(r.find((x) => x.id === "aide-2"));
  note("ecran d'Alice avec un pseudo choisi : « " + vue.titre + " »");
});

/* ═══════════════════════════════════════════════════════════════════════════
   7. LA DISTINCTION QUI COMPTE : « aider en discret » est un CHOIX.
   Le silence y est voulu et compris. Le pseudo par defaut n'est le choix de
   personne — et pourtant il aboutit au meme silence.
   ═══════════════════════════════════════════════════════════════════════════ */
await doit("« aider en discret », lui, est un choix explicite de Bob (index.html:5158)", async () => {
  await fbAideDiscrete(bob, BOB, true);
  const c3 = await serveur((db) => noterCoupDeMain(db, ALICE, {
    id: "aide-3", by: BOB, drinkId: BOISSON, storeId: MAGASIN,
    createdAt: { toMillis: () => Date.now() },
  }));
  verifier(c3.aidantUid === null && c3.aidantPseudo === null, "le nom passe quand meme : " + JSON.stringify(c3));
});
note("les deux chemins produisent le meme document (aidantUid:null) — l'un a ete choisi, l'autre non");
note("production, mesure ce jour : 8 comptes sur 153 portent le pseudo « Explorateur » ; 0 compte sur 153 a coche « aider en discret »");

await bilan(env);
