/* ============================================================================
   VERIFICATION — LENTILLE « INTENTION »
   « Une chasse se cree sur une boisson inventee, avec un texte libre qui part
     en poussee dans tout le quartier »
   ----------------------------------------------------------------------------
   LA TROUVAILLE DIT : firestore.rules:1087 ne verifie que la coherence entre
   le nom du document et le champ drinkId ; rien ne dit que ce numero designe
   une vraie boisson, et le verrou par boisson (_meta/huntPush_d_<drinkId>,
   6 h) se contourne d'un changement de numero.

   MA SEULE QUESTION : BUG ou CHOIX ? Quatre choses a trancher :

     1. Le commentaire des regles (1066-1083) promet-il vraiment qu'un numero
        de boisson est VERIFIE ? Ou promet-il autre chose (l'anti-spam hors de
        portee du client) ?
     2. Le contournement du verrou par boisson est-il un angle mort, ou est-il
        ECRIT dans notifications-push.js:205-226 comme un residu accepte,
        borne par le verrou par personne ?
     3. Ce verrou par personne tient-il REELLEMENT quand le numero change ?
        C'est le seul point qui decide si la boucle est bornee ou illimitee.
     4. Le client peut-il desarmer ce verrou (_meta) ? Et la chasse inventee
        s'affiche-t-elle dans l'application ?

   TOUT CE QUI EST REJOUE ICI EST RECOPIE, A L'IDENTIQUE :
     index.html:4545-4592   window.fbJoinHunt
     index.html:4505        _coarse
     index.html:21894-21900 _peindreChasse (filtre « fiche inconnue »)
     index.html:17201-17202 _peindreBoard  (meme filtre)
     notifications-push.js:153-206  notifyHuntNearby (centre + nouveaux chercheurs)
     notifications-push.js:227-262  les DEUX verrous _meta + le journal
   ========================================================================== */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, getDocs, collection,
         serverTimestamp } from "firebase/firestore";
import fs from "node:fs";

const env = await banc("verif-intention-chasse-boisson-inventee");
const mallory = env.authenticatedContext("mallory").firestore();   // compte gratuit
const bob = env.authenticatedContext("bob").firestore();
const serveur = async (fn) => {
  let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out;
};

/* ── Le catalogue est un FICHIER STATIQUE, pas une collection Firestore ──── */
const CAT = fs.readFileSync("/home/user/magofeed/data/drinks.js", "utf8");
const IDS = new Set([...CAT.matchAll(/\{id:(\d+),/g)].map((m) => Number(m[1])));
const MAX = Math.max(...IDS);
const INVENTE = 123456, INVENTE2 = 654321, VRAI = 1;
const TEXTE = "GAGNE 500 EUR : ouvre magofeed-cadeau.example maintenant";

/* ── index.html:4505 ─────────────────────────────────────────────────────── */
const _coarse = (x) => Math.round(x * 10) / 10;

/* ── index.html:4545-4592 — window.fbJoinHunt, a l'identique ─────────────── */
async function fbJoinHunt(db, uid, drinkId, drinkName, emoji, lat, lng) {
  const pos = { lat: lat != null ? _coarse(lat) : null, lng: lng != null ? _coarse(lng) : null };
  const moi = { lat: pos.lat, lng: pos.lng, at: Date.now() };
  const ref = doc(db, "hunts", String(drinkId));
  const commun = { drinkName: String(drinkName || "").slice(0, 60),
                   emoji: String(emoji || "").slice(0, 4), updatedAt: serverTimestamp() };
  const maj = Object.assign({}, commun); maj["seekers." + uid] = moi;
  try { await updateDoc(ref, maj); }
  catch (e) {
    try {
      const bouge = Object.assign({}, commun);
      bouge["seekers." + uid + ".lat"] = pos.lat; bouge["seekers." + uid + ".lng"] = pos.lng;
      await updateDoc(ref, bouge);
    } catch (e2) {
      await setDoc(ref, Object.assign({ drinkId: Number(drinkId) || drinkId,
        seekers: (() => { const o = {}; o[uid] = moi; return o; })() }, commun));
    }
  }
  const verif = await getDoc(ref);
  return !!(verif.exists() && (verif.data().seekers || {})[uid]);
}

/* ── notifications-push.js:153-262 — la DECISION du serveur, a l'identique.
     Rend le corps de la poussee, ou la raison du silence.                   */
const _cle = (v) => String(v).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);
async function notifyHuntNearby(db, drinkIdDoc, before, after, now) {
  if (!after || !after.seekers) return { envoye: false, raison: "pas de seekers" };
  const bSeek = before.seekers || {}, aSeek = after.seekers || {};
  const news = Object.keys(aSeek).filter((u) => aSeek[u] && !bSeek[u]);
  if (!news.length) return { envoye: false, raison: "aucun nouveau chercheur" };
  let center = null;
  news.forEach((u) => { const s = aSeek[u]; if (s && s.lat != null && (!center || s.at > center.at)) center = s; });
  if (!center) return { envoye: false, raison: "sans position : on ne diffuse plus (push:170-178)" };
  const name = String(after.drinkName || "une boisson").slice(0, 40);
  const lanceur = news[0];
  const verrous = [
    { ref: db.collection("_meta").doc("huntPush_d_" + _cle(after.drinkId != null ? after.drinkId : drinkIdDoc)),
      ms: 6 * 3600 * 1000, nom: "boisson" },
    { ref: db.collection("_meta").doc("huntPush_u_" + _cle(lanceur)), ms: 45 * 60 * 1000, nom: "personne" },
  ];
  for (const v of verrous) {
    const snap = await v.ref.get();
    const at = (snap.exists && Number(snap.data().at)) || 0;
    if (now - at < v.ms) return { envoye: false, raison: "verrou par " + v.nom, name };
  }
  for (const v of verrous) { await v.ref.set({ at: now }); }
  const corps = "Quelqu'un cherche « " + name + " ». Si tu la vois en magasin, signale-la et gagne des points.";
  return { envoye: true, corps, name };
}

/* ── index.html:21894-21900 et 17201-17202 — le filtre d'affichage ───────── */
const affichable = (h) => IDS.has(Number(h.drinkId));

/* ══════════════════════════════════════════════════════════════════════════
   1. LA MECANIQUE : la creation passe-t-elle vraiment ?
   ═════════════════════════════════════════════════════════════════════════ */
note("catalogue data/drinks.js : " + IDS.size + " boissons, plus grand numero " + MAX
     + " — " + INVENTE + " n'existe pas");
note("le catalogue est un FICHIER de l'app, pas une collection Firestore : "
     + "les regles n'ont AUCUN document a interroger pour verifier un numero");

await doit("mallory (compte gratuit) cree hunts/" + INVENTE + " avec un texte libre", async () => {
  const ok = await fbJoinHunt(mallory, "mallory", INVENTE, TEXTE, "", 50.8676, 4.3436);
  if (!ok) throw new Error("creation refusee");
});

await doit("le texte libre est bien en base, tronque a 60 par le client", async () => {
  const d = await serveur((db) => db.collection("hunts").doc(String(INVENTE)).get());
  const n = d.data().drinkName;
  if (n !== TEXTE.slice(0, 60)) throw new Error("nom inattendu : " + n);
});

/* ══════════════════════════════════════════════════════════════════════════
   2. CE QUE LES REGLES PROMETTENT VRAIMENT (rules:1066-1083)
   ═════════════════════════════════════════════════════════════════════════ */
await doitEchouer("le nom du document doit suivre drinkId (hunts/999 avec drinkId=7)", async () => {
  await setDoc(doc(mallory, "hunts", "999"),
    { drinkId: 7, seekers: { mallory: { lat: 50.8, lng: 4.3, at: Date.now() } }, drinkName: "x" });
});
await doitEchouer("_lastPush reste hors de portee du client (promesse 1082)", async () => {
  await setDoc(doc(mallory, "hunts", "777"),
    { drinkId: 777, seekers: { mallory: { lat: 50.8, lng: 4.3, at: Date.now() } }, _lastPush: 0 });
});
await doitEchouer("mallory ne touche pas l'entree d'un autre chercheur (promesse 1082)", async () => {
  await updateDoc(doc(mallory, "hunts", String(INVENTE)), { "seekers.bob": { lat: 50.8, lng: 4.3, at: Date.now() } });
});

/* ══════════════════════════════════════════════════════════════════════════
   3. LE POINT QUI DECIDE : la boucle est-elle bornee ?
   ═════════════════════════════════════════════════════════════════════════ */
const T0 = Date.now();
const av = { seekers: {} };
const ap1 = await serveur((db) => db.collection("hunts").doc(String(INVENTE)).get()).then((d) => d.data());

const r1 = await serveur((db) => notifyHuntNearby(db, String(INVENTE), av, ap1, T0));
await doit("la 1re vague part, avec le texte libre dans le corps", async () => {
  if (!r1.envoye) throw new Error("rien envoye : " + r1.raison);
});
note("poussee 1 : « " + r1.corps + " »");

/* Le contournement annonce : on change de numero, donc le verrou par boisson
   ne s'applique pas. Reste le verrou par personne. */
await doit("mallory cree une 2e chasse inventee (autre numero) 2 min plus tard", async () => {
  const ok = await fbJoinHunt(mallory, "mallory", INVENTE2, TEXTE, "", 50.8676, 4.3436);
  if (!ok) throw new Error("creation refusee");
});
const ap2 = await serveur((db) => db.collection("hunts").doc(String(INVENTE2)).get()).then((d) => d.data());
const r2 = await serveur((db) => notifyHuntNearby(db, String(INVENTE2), av, ap2, T0 + 2 * 60000));
await doit("la 2e vague est ETOUFFEE malgre le changement de numero", async () => {
  if (r2.envoye) throw new Error("une 2e vague est partie 2 min apres la 1re");
  if (r2.raison !== "verrou par personne") throw new Error("etouffee, mais par : " + r2.raison);
});
note("2e vague : " + r2.raison + " — le verrou par boisson, lui, a bien ete saute");

const r3 = await serveur((db) => notifyHuntNearby(db, String(INVENTE2), av, ap2, T0 + 46 * 60000));
await doit("apres 46 min, la vague repart (verrou par personne = 45 min)", async () => {
  if (!r3.envoye) throw new Error("rien : " + r3.raison);
});
note("plafond mesure pour UN compte : 1 vague / 45 min = "
     + Math.floor(24 * 60 / 45) + " par jour — le chiffre exact ecrit en "
     + "commentaire dans notifications-push.js:219 (« une trentaine de vagues par jour et par compte »)");

/* Le verrou par personne ne se desarme pas depuis le client. */
await doitEchouer("mallory efface son propre verrou _meta/huntPush_u_mallory", async () => {
  await setDoc(doc(mallory, "_meta", "huntPush_u_mallory"), { at: 0 });
});
await doitEchouer("mallory lit seulement son verrou _meta", async () => {
  await getDoc(doc(mallory, "_meta", "huntPush_u_mallory"));
});

/* Sans position, rien ne part : la chasse inventee doit poser un vrai centre. */
await doit("une chasse inventee SANS position ne diffuse rien", async () => {
  await fbJoinHunt(bob, "bob", 111222, TEXTE, "", null, null);
  const d = await serveur((db) => db.collection("hunts").doc("111222").get());
  const r = await serveur((db) => notifyHuntNearby(db, "111222", av, d.data(), T0 + 3 * 3600000));
  if (r.envoye) throw new Error("une vague est partie sans centre");
});

/* ══════════════════════════════════════════════════════════════════════════
   4. ET DANS L'APPLICATION ? (index.html:21897 et 17201)
   ═════════════════════════════════════════════════════════════════════════ */
await doit("la chasse inventee n'apparait dans AUCUNE liste de l'app", async () => {
  const snap = await getDocs(collection(bob, "hunts"));
  const vues = [];
  snap.forEach((d) => { const h = d.data(); if (affichable(h)) vues.push(h.drinkId); });
  if (vues.some((x) => Number(x) === INVENTE || Number(x) === INVENTE2))
    throw new Error("une fiche inventee passe le filtre DRINKS");
});
note("les deux listes affichent d.name (le catalogue de l'appareil), jamais "
     + "h.drinkName : le texte libre ne s'affiche nulle part dans l'app");

/* ══════════════════════════════════════════════════════════════════════════
   5. LE TEXTE LIBRE NE DEPEND PAS DU NUMERO INVENTE
   ═════════════════════════════════════════════════════════════════════════ */
await doit("le meme texte libre passe sur une VRAIE boisson (id " + VRAI + ")", async () => {
  const ok = await fbJoinHunt(bob, "bob", VRAI, TEXTE, "", 50.8676, 4.3436);
  if (!ok) throw new Error("creation refusee");
  const d = await serveur((db) => db.collection("hunts").doc(String(VRAI)).get());
  if (d.data().drinkName !== TEXTE.slice(0, 60)) throw new Error("nom non conserve");
});
note("le texte de la poussee ne tient donc pas au numero invente : verifier le "
     + "numero ne retirerait pas une lettre au corps de la notification");
note("corps reellement envoye, tronque a 40 par le serveur (push:189) : « "
     + "Quelqu'un cherche « " + TEXTE.slice(0, 40) + " » » — le lien de la "
     + "poussee reste code en dur vers magofeed (push:295)");

await bilan(env);
