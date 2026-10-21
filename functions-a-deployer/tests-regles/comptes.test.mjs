/* © 2026 Magofeed — Tous droits réservés / All rights reserved.
   Titulaire des droits (mention légale) : Ilias Benabdellah. */

/* ============================================================================
   LE COMPTE MAGOFEED — ÉPREUVES SUR LE CODE LIVRÉ
   ----------------------------------------------------------------------------
   CE QUI EST EN JEU. Un compte Magofeed natif (adresse + mot de passe) et une
   connexion Google doivent pouvoir vivre sur UN SEUL compte. Si la liaison
   échoue, Firebase n'affiche pas d'erreur : il ouvre un AUTRE compte, avec un
   autre uid. Or les points, le pseudo, la série et le classement vivent sous
   users/{uid}. Un uid qui change, c'est un joueur qui perd tout — en silence.
   C'est exactement ce que faisait le code avant ces épreuves : la liaison était
   enfermée dans « si le compte est anonyme », donc un compte ne pouvait porter
   qu'UNE méthode dans sa vie, et l'état « Google + mot de passe » était
   littéralement inatteignable.

   DEUX RÈGLES DE MÉTHODE, apprises à nos dépens :

   1. ON EXTRAIT LES VRAIES FONCTIONS DE index.html. Une réécriture ne
      prouverait que la réécriture. Un test écrit à côté du code passe sur du
      code cassé — c'est déjà arrivé ici.

   2. C'EST FIREBASE QUI ARBITRE, PAS NOUS. Les scénarios tournent contre
      l'ÉMULATEUR Firebase Auth, pas contre une imitation maison. Les codes
      d'erreur (auth/credential-already-in-use, auth/provider-already-linked…)
      viennent donc de Firebase lui-même. Une imitation nous aurait seulement
      renvoyé ce qu'on croit savoir.

   CE QU'ON NE PEUT PAS TESTER ICI : la fenêtre surgissante Google. Elle exige
   un navigateur. On la remplace par la credential Google que l'émulateur
   accepte — c'est-à-dire exactement ce que la fenêtre produit une fois fermée.
   Le repli par redirection, lui, reste couvert par l'essai navigateur.

   Lancer :  npm run test:comptes     (depuis functions-a-deployer/tests-regles)
   ============================================================================ */

import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import {
  getAuth, connectAuthEmulator, signInAnonymously, signOut,
  GoogleAuthProvider, EmailAuthProvider, linkWithCredential, signInWithCredential,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification,
  sendPasswordResetEmail, unlink, updatePassword, reauthenticateWithCredential,
  deleteUser,
} from "firebase/auth";

const PORT_AUTH = 9399;

/* ── Extraction des vraies fonctions ──────────────────────────────────────── */
const src = readFileSync("../../index.html", "utf8");

/* Récupère un bloc depuis sa première accolade jusqu'à sa fermeture, en
   comptant les niveaux. Les chaînes contenant des accolades fausseraient le
   compte ; aucune des fonctions extraites ici n'en contient. */
function blocDepuis(debut) {
  let prof = 0;
  for (let j = src.indexOf("{", debut); j < src.length; j++) {
    if (src[j] === "{") prof++;
    else if (src[j] === "}") { prof--; if (!prof) return src.slice(debut, j + 1); }
  }
  throw new Error("fin de bloc introuvable");
}
function fonction(nom) {
  for (const motif of ["async function " + nom + "(", "function " + nom + "("]) {
    const d = src.indexOf(motif);
    if (d !== -1) return blocDepuis(d);
  }
  throw new Error("fonction " + nom + " introuvable dans index.html");
}
function methodeWindow(nom) {
  const d = src.indexOf("window." + nom + " = ");
  if (d === -1) throw new Error("window." + nom + " introuvable dans index.html");
  return blocDepuis(d) + ";";
}

/* ── Le décor : tout ce que le code appelle, sauf la logique testée ───────── */
const app = initializeApp({ apiKey: "cle-emulateur", projectId: "magofeed-test" });
const auth = getAuth(app);
connectAuthEmulator(auth, "http://127.0.0.1:" + PORT_AUTH, { disableWarnings: true });

/* Ce que recordGoogleLink a écrit : on le relit pour vérifier que l'étiquette
   du fournisseur suit l'état RÉEL du compte. Écrite en dur à "google", elle
   effaçait la trace du mot de passe dès qu'on liait Google par-dessus. */
let dernierProfilEcrit = null;
const faux = {
  setDoc: async (_ref, data) => { dernierProfilEcrit = data; },
  userDocRef: (uid) => ({ uid }),
  localStorage: {
    _m: new Map(),
    getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
    setItem(k, v) { this._m.set(k, String(v)); },
    removeItem(k) { this._m.delete(k); },
  },
};

/* L'identité Google que « la fenêtre » rendra au prochain appel. L'émulateur
   accepte un jeton d'identité fabriqué : c'est le mécanisme officiel pour
   rejouer une connexion OAuth sans navigateur. */
let googleCourant = null;
function credGoogle(id) {
  return GoogleAuthProvider.credential(JSON.stringify({
    sub: id.sub, email: id.email, email_verified: true, name: id.nom || "Testeur",
  }));
}

const portee = {
  auth, GoogleAuthProvider, EmailAuthProvider,
  linkWithCredential, signInWithCredential, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail,
  unlink, updatePassword, reauthenticateWithCredential,
  setDoc: faux.setDoc, userDocRef: faux.userDocRef,
  localStorage: faux.localStorage,
  console: { warn() {}, log() {} },
  window: {},
  /* La fenêtre surgissante rendue par sa conclusion : une credential Google.
     Les deux variantes « redirection » ne peuvent pas aboutir hors navigateur ;
     si le code y tombait, l'épreuve le dirait au lieu de réussir en silence. */
  linkWithPopup: async (u) => linkWithCredential(u, credGoogle(googleCourant)),
  signInWithPopup: async (a) => signInWithCredential(a, credGoogle(googleCourant)),
  linkWithRedirect: async () => { throw new Error("REDIRECTION inattendue"); },
  signInWithRedirect: async () => { throw new Error("REDIRECTION inattendue"); },
  reauthenticateWithPopup: async (u) => signInWithCredential(auth, credGoogle(googleCourant)) && u,
  signOut: () => signOut(auth),
};

const codeExtrait = [
  fonction("_mesProviders"),
  fonction("_aProvider"),
  fonction("_envoyerVerification"),
  fonction("_popupBloquee"),
  fonction("recordGoogleLink"),
  methodeWindow("fbMesMethodes"),
  methodeWindow("fbSignInWithGoogle"),
  methodeWindow("fbLierGoogleEnAttente"),
  methodeWindow("fbEmailSignUp"),
  methodeWindow("fbAjouterMotDePasse"),
  methodeWindow("fbEmailSignIn"),
  methodeWindow("fbChangerMotDePasse"),
  methodeWindow("fbDelierMethode"),
  methodeWindow("fbSignOut"),
  methodeWindow("fbRenvoyerVerification"),
].join("\n");

const noms = Object.keys(portee);
const charger = new Function(...noms, codeExtrait + "\nreturn window;");
const F = charger(...noms.map((n) => portee[n]));
portee.window.fbArreterMessagerie = function () {};

/* ── Le banc ──────────────────────────────────────────────────────────────── */
let reussites = 0; const echecs = [];
async function epreuve(titre, fn) {
  dernierProfilEcrit = null;
  try { await fn(); reussites++; console.log("  ok   " + titre); }
  catch (e) { echecs.push({ titre, e }); console.log("  ECHEC " + titre + "\n        " + (e && e.message)); }
}
function vrai(cond, quoi) { if (!cond) throw new Error(quoi); }
function egal(a, b, quoi) { if (a !== b) throw new Error(quoi + " — attendu " + JSON.stringify(b) + ", obtenu " + JSON.stringify(a)); }
async function codeDe(promesse) {
  try { await promesse; return null; } catch (e) { return (e && e.code) || String(e && e.message); }
}
/* Chaque scénario part d'une page blanche : un compte qui traîne d'une épreuve
   à l'autre produirait des réussites qui ne veulent rien dire. */
async function table_rase() {
  try { if (auth.currentUser) await deleteUser(auth.currentUser); } catch (e) { /* déjà parti */ }
  try { await signOut(auth); } catch (e) { /* pas connecté */ }
  faux.localStorage._m.clear();
  portee.window._magoGoogleEnAttente = null;
  await fetch("http://127.0.0.1:" + PORT_AUTH + "/emulator/v1/projects/magofeed-test/accounts", { method: "DELETE" });
}
const prov = (u) => (u.providerData || []).map((p) => p.providerId).sort().join("+");

console.log("\nLE COMPTE MAGOFEED — scénarios de liaison\n");

/* ── 1. Le chemin principal : compte natif, puis Google par-dessus ────────── */
await epreuve("un compte anonyme qui crée un mot de passe GARDE son uid", async () => {
  await table_rase();
  const anon = (await signInAnonymously(auth)).user;
  const avant = anon.uid;
  const u = await F.fbEmailSignUp("ilias@exemple.be", "motdepasse1");
  egal(u.uid, avant, "l'uid a changé : les points seraient perdus");
  egal(prov(u), "password", "le compte devrait porter le mot de passe");
  egal(u.isAnonymous, false, "le compte devrait ne plus être anonyme");
});

await epreuve("lier Google à un compte Magofeed natif : MÊME uid, deux méthodes", async () => {
  const avant = auth.currentUser.uid;
  googleCourant = { sub: "g-ilias", email: "ilias@exemple.be" };
  const u = await F.fbSignInWithGoogle();
  egal(u.uid, avant, "L'UID A CHANGÉ — c'est le bug qui faisait perdre les points");
  egal(prov(u), "google.com+password", "les deux méthodes doivent coexister sur le même compte");
  egal(dernierProfilEcrit && dernierProfilEcrit.provider, "google+password",
    "l'étiquette du profil doit refléter les DEUX méthodes");
});

await epreuve("rappuyer sur Google ne casse rien (déjà lié)", async () => {
  const avant = auth.currentUser.uid;
  const u = await F.fbSignInWithGoogle();
  egal(u.uid, avant, "un second appui ne doit rien changer");
  egal(prov(u), "google.com+password", "les méthodes doivent rester les deux");
});

/* ── 2. Le chemin inverse : Google d'abord, mot de passe ensuite ──────────── */
await epreuve("ajouter un mot de passe à un compte Google : MÊME uid", async () => {
  await table_rase();
  const anon = (await signInAnonymously(auth)).user;
  const avant = anon.uid;
  googleCourant = { sub: "g-sarah", email: "sarah@exemple.be" };
  await F.fbSignInWithGoogle();
  egal(auth.currentUser.uid, avant, "la liaison Google depuis l'anonyme doit garder l'uid");
  const u = await F.fbAjouterMotDePasse("motdepasse2");
  egal(u.uid, avant, "L'UID A CHANGÉ — createUserWithEmailAndPassword a repris la main");
  egal(prov(u), "google.com+password", "le mot de passe doit s'ajouter, pas remplacer");
});

await epreuve("un compte réel refuse un mot de passe sur une AUTRE adresse", async () => {
  const avant = auth.currentUser.uid;
  const code = await codeDe(F.fbEmailSignUp("une-autre@exemple.be", "motdepasse3"));
  egal(code, "magofeed/autre-adresse", "la règle « même adresse » doit s'appliquer");
  egal(prov(auth.currentUser), "google.com+password", "le compte ne doit pas avoir bougé");
  egal(auth.currentUser.uid, avant, "UN COMPTE NEUF A ÉTÉ CRÉÉ : le profil est abandonné");
});

await epreuve("un compte qui a déjà un mot de passe n'en fabrique pas un second", async () => {
  const avant = auth.currentUser.uid;
  const code = await codeDe(F.fbEmailSignUp(auth.currentUser.email, "encore-un-mot-de-passe"));
  egal(code, "magofeed/mot-de-passe-deja-defini", "il faut renvoyer vers « changer mon mot de passe »");
  egal(auth.currentUser.uid, avant, "UN COMPTE NEUF A ÉTÉ CRÉÉ : le profil est abandonné");
});

/* ── 3. Le piège qui coûtait les points : le Google de quelqu'un d'autre ──── */
await epreuve("Google appartenant à un AUTRE joueur : refusé, uid intact", async () => {
  await table_rase();
  // Le compte de Benjamin existe déjà, avec son Google à lui.
  await signInAnonymously(auth);
  googleCourant = { sub: "g-benjamin", email: "benjamin@exemple.be" };
  await F.fbSignInWithGoogle();
  const uidBenjamin = auth.currentUser.uid;
  await signOut(auth);

  // David a son propre compte Magofeed natif, avec ses points.
  await signInAnonymously(auth);
  await F.fbEmailSignUp("david@exemple.be", "motdepasse4");
  const uidDavid = auth.currentUser.uid;
  vrai(uidDavid !== uidBenjamin, "les deux comptes doivent être distincts");

  // Il appuie sur Google et choisit, par erreur, le compte de Benjamin.
  const code = await codeDe(F.fbSignInWithGoogle());
  egal(code, "magofeed/google-autre-joueur", "le code doit nommer la vraie cause");
  egal(auth.currentUser.uid, uidDavid, "DAVID A CHANGÉ DE COMPTE : ses points sont perdus");
  egal(prov(auth.currentUser), "password", "rien ne doit avoir été lié");
});

/* ── 4. Les inverses : délier, changer, se déconnecter ────────────────────── */
await epreuve("délier la DERNIÈRE méthode est refusé (sinon : compte muré)", async () => {
  await table_rase();
  await signInAnonymously(auth);
  await F.fbEmailSignUp("seul@exemple.be", "motdepasse5");
  const code = await codeDe(F.fbDelierMethode("password"));
  egal(code, "magofeed/derniere-methode", "on ne peut pas retirer la seule porte d'entrée");
  egal(prov(auth.currentUser), "password", "la méthode doit être restée");
});

await epreuve("délier Google quand il reste le mot de passe", async () => {
  googleCourant = { sub: "g-seul", email: "seul@exemple.be" };
  await F.fbSignInWithGoogle();
  egal(prov(auth.currentUser), "google.com+password", "les deux doivent être liées avant de délier");
  const etat = await F.fbDelierMethode("google.com");
  egal(prov(auth.currentUser), "password", "Google doit avoir été retiré");
  egal(etat.google, false, "l'état rendu doit dire que Google n'est plus là");
  egal(etat.motDePasse, true, "le mot de passe doit rester");
});

await epreuve("délier une méthode absente est refusé", async () => {
  const code = await codeDe(F.fbDelierMethode("google.com"));
  egal(code, "auth/no-such-provider", "délier ce qui n'est pas lié doit être nommé");
});

await epreuve("changer de mot de passe : l'ancien ne marche plus, le neuf oui", async () => {
  await table_rase();
  await signInAnonymously(auth);
  await F.fbEmailSignUp("chg@exemple.be", "ancien-mot-de-passe");
  await F.fbChangerMotDePasse("ancien-mot-de-passe", "nouveau-mot-de-passe");
  await signOut(auth);
  /* L'émulateur rend auth/wrong-password, la production auth/invalid-credential
     (protection contre l'énumération des comptes). Les deux disent la même
     chose, et authErrorMsg traduit les deux. */
  const refus = await codeDe(F.fbEmailSignIn("chg@exemple.be", "ancien-mot-de-passe"));
  vrai(refus === "auth/invalid-credential" || refus === "auth/wrong-password",
    "l'ancien mot de passe devrait être refusé, obtenu " + refus);
  const u = await F.fbEmailSignIn("chg@exemple.be", "nouveau-mot-de-passe");
  vrai(!!u && !!u.uid, "le nouveau mot de passe devrait ouvrir le compte");
});

await epreuve("changer de mot de passe avec le mauvais ancien est refusé", async () => {
  await table_rase();
  await signInAnonymously(auth);
  await F.fbEmailSignUp("mauvais@exemple.be", "le-bon-mot-de-passe");
  const code = await codeDe(F.fbChangerMotDePasse("pas-le-bon", "encore-un-autre"));
  vrai(code === "auth/invalid-credential" || code === "auth/wrong-password",
    "il faut prouver qu'on possède le compte, obtenu " + code);
  const u = await F.fbEmailSignIn("mauvais@exemple.be", "le-bon-mot-de-passe");
  vrai(!!u, "le mot de passe d'origine doit être resté valable");
});

await epreuve("se déconnecter laisse vraiment la place", async () => {
  vrai(!!auth.currentUser, "on devrait être connecté avant de se déconnecter");
  await F.fbSignOut();
  egal(auth.currentUser, null, "fbSignOut doit réellement fermer la session");
  egal(faux.localStorage.getItem("magoAuthProvider"), null, "la trace locale doit être effacée");
});

/* ── 5. L'état rendu à l'écran doit dire la vérité ────────────────────────── */
await epreuve("fbMesMethodes décrit fidèlement un compte à deux méthodes", async () => {
  await table_rase();
  await signInAnonymously(auth);
  egal(F.fbMesMethodes().connecte, false, "un compte anonyme n'est pas « connecté »");
  await F.fbEmailSignUp("etat@exemple.be", "motdepasse6");
  googleCourant = { sub: "g-etat", email: "etat@exemple.be" };
  await F.fbSignInWithGoogle();
  const m = F.fbMesMethodes();
  egal(m.connecte, true, "le compte est réel");
  egal(m.google, true, "Google est lié");
  egal(m.motDePasse, true, "le mot de passe est défini");
  egal(m.nombre, 2, "deux méthodes");
  egal(m.email, "etat@exemple.be", "l'adresse doit être celle du compte");
});

/* ── 6. La vérification d'adresse : ce qui fait SURVIVRE le compte natif ──── */
await epreuve("créer un compte natif envoie la vérification d'adresse", async () => {
  await table_rase();
  await signInAnonymously(auth);
  await F.fbEmailSignUp("verif@exemple.be", "motdepasse7");
  const r = await fetch("http://127.0.0.1:" + PORT_AUTH + "/emulator/v1/projects/magofeed-test/oobCodes");
  const { oobCodes } = await r.json();
  const pourLui = (oobCodes || []).filter((c) => c.email === "verif@exemple.be" && c.requestType === "VERIFY_EMAIL");
  vrai(pourLui.length >= 1,
    "AUCUN e-mail de vérification : Firebase effacera le mot de passe à la première connexion Google");
});

await table_rase();

console.log("\n" + reussites + " épreuve(s) conformes, " + echecs.length + " en échec\n");
if (echecs.length) { for (const f of echecs) console.error(f.e); process.exit(1); }
