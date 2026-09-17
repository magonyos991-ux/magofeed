/* ============================================================================
   VERIFICATION D'IMPACT — « une chasse sur une boisson inventee, avec un texte
   libre qui part en poussee dans tout le quartier »
   ----------------------------------------------------------------------------
   Question posee : QU'EST-CE QUE CA CHANGE POUR QUELQU'UN ? On ne juge pas les
   regles, on suit le chemin d'une personne reelle jusqu'a l'ecran de son
   telephone, et on mesure : combien d'appareils, quel texte exact, combien de
   fois par jour.

   Fonctions rejouees a l'identique :
     index.html:4705-4736   window.fbEnablePush      (le voisin s'inscrit aux notifs)
     index.html:4767-4773   window.fbUpdatePushPos   (position + rayon du voisin)
     index.html:4534-4567   window.fbJoinHunt        (l'ecriture de la chasse)
     index.html:21894-21899 _peindreChasse           (le filtre d'affichage)
     notifications-push.js:151-300  notifyHuntNearby (verrous _meta + diffusion)
     firestore.rules:1085-1099      match /hunts/{drinkId}
   ========================================================================== */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, getDocs, collection, serverTimestamp } from "firebase/firestore";

const env = await banc("verif-impact-chasse-nom-libre");

/* Mallory : un compte connecte ordinaire. Les regles ne demandent que
   `request.auth != null` (firestore.rules:37) — la ligne 915 montre qu'ailleurs
   le depot sait exclure l'anonyme (`sign_in_provider != 'anonymous'`), hunts ne
   le fait pas. Un compte anonyme est donc un compte valide ici. */
const MALLORY = "mallory", MALLORY2 = "mallory-2";
const mallory  = env.authenticatedContext(MALLORY).firestore();
const mallory2 = env.authenticatedContext(MALLORY2).firestore();
const anon = env.unauthenticatedContext().firestore();

const serveur = async (fn) => { let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out; };

/* ── Le decor : Bruxelles, trois voisins qui ont accepte les notifications ── */
const BXL = { lat: 50.8676, lng: 4.3436 };
const VOISINS = [
  { uid: "nadia",  lat: 50.85, lng: 4.35, rayon: 15, ou: "Ixelles, 2 km" },
  { uid: "omar",   lat: 50.95, lng: 4.45, rayon: 15, ou: "Vilvorde, 12 km" },
  { uid: "paulo",  lat: null,  lng: null, rayon: 15, ou: "jamais bouge depuis l'installation" },
  { uid: "quentin",lat: 51.22, lng: 4.40, rayon: 15, ou: "Anvers, 39 km — hors rayon" },
];

/* index.html:4534-4567 — COPIE CONFORME de window.fbJoinHunt */
function _coarse(x) { return Math.round(x * 10) / 10; }
async function fbJoinHunt(db, uid, drinkId, drinkName, emoji, lat, lng) {
  const pos = { lat: lat != null ? _coarse(lat) : null, lng: lng != null ? _coarse(lng) : null };
  const moi = { lat: pos.lat, lng: pos.lng, at: Date.now() };
  const ref = doc(db, "hunts", String(drinkId));
  const commun = { drinkName: String(drinkName || "").slice(0, 60), emoji: String(emoji || "").slice(0, 4), updatedAt: serverTimestamp() };
  const maj = Object.assign({}, commun);
  maj["seekers." + uid] = moi;
  try { await updateDoc(ref, maj); }
  catch (e) {
    try {
      const bouge = Object.assign({}, commun);
      bouge["seekers." + uid + ".lat"] = pos.lat;
      bouge["seekers." + uid + ".lng"] = pos.lng;
      await updateDoc(ref, bouge);
    } catch (e2) {
      await setDoc(ref, Object.assign({ drinkId: Number(drinkId) || drinkId, seekers: (function () { const o = {}; o[uid] = moi; return o; })() }, commun));
    }
  }
  let verif = null; try { verif = await getDoc(ref); } catch (e0) {}
  const inscrit = !!(verif && verif.exists() && (verif.data().seekers || {})[uid]);
  return { ok: inscrit, chercheurs: inscrit ? Object.keys(verif.data().seekers || {}).length : 0 };
}

/* notifications-push.js:151-300 — COPIE CONFORME de notifyHuntNearby, verrous
   _meta compris. `now` est passe pour pouvoir avancer l'horloge sans dormir. */
function _dist(aLat, aLng, bLat, bLng) {
  if (aLat == null || bLat == null) return Infinity;
  const dLa = (aLat - bLat) * 111, dLo = (aLng - bLng) * 111 * Math.cos(aLat * Math.PI / 180);
  return Math.sqrt(dLa * dLa + dLo * dLo);
}
const _cle = (v) => String(v).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);
async function notifyHuntNearby(sdb, drinkIdParam, before, after, now) {
  if (!after || !after.seekers) return { envoi: false, pourquoi: "pas de seekers" };
  const bSeek = (before && before.seekers) || {}, aSeek = after.seekers || {};
  const newSeekers = Object.keys(aSeek).filter((u) => aSeek[u] && !bSeek[u]);
  if (!newSeekers.length) return { envoi: false, pourquoi: "aucun NOUVEAU chercheur (ligne 189)" };
  let center = null;
  newSeekers.forEach((u) => { const s = aSeek[u]; if (s && s.lat != null && (!center || s.at > center.at)) center = s; });
  if (!center) return { envoi: false, pourquoi: "pas de centre (ligne 172)" };
  const seekerUids = new Set(Object.keys(aSeek).filter((u) => aSeek[u]));
  const name = String(after.drinkName || "une boisson").slice(0, 40);   // ligne 189
  const lanceur = newSeekers[0];
  const verrous = [
    { ref: doc(sdb, "_meta", "huntPush_d_" + _cle(after.drinkId != null ? after.drinkId : drinkIdParam)), ms: 6 * 3600 * 1000, nom: "boisson" },
    { ref: doc(sdb, "_meta", "huntPush_u_" + _cle(lanceur)), ms: 45 * 60 * 1000, nom: "personne" },
  ];
  for (const v of verrous) {
    const snap = await getDoc(v.ref);
    const at = (snap.exists() && Number(snap.data().at)) || 0;
    if (now - at < v.ms) return { envoi: false, pourquoi: "verrou par " + v.nom + " : encore " + Math.ceil((v.ms - (now - at)) / 60000) + " min" };
  }
  for (const v of verrous) await setDoc(v.ref, { at: now });
  const tokensSnap = await getDocs(collection(sdb, "pushTokens"));
  const msgs = [];
  tokensSnap.forEach((d) => {
    if (seekerUids.has(d.id)) return;
    const t = d.data();
    if (!t.token) return;
    const rayon = Math.max(1, Math.min(50, Number(t.rayon) || 15));
    if (center && t.lat != null && _dist(center.lat, center.lng, t.lat, t.lng) > rayon) return;
    msgs.push({ qui: d.id, title: "Chasse pres de toi", body: "Quelqu'un cherche « " + name + " ». Si tu la vois en magasin, signale-la et gagne des points." });
  });
  return { envoi: true, msgs: msgs, total: tokensSnap.size, centre: center };
}

/* ── 1. Les voisins s'inscrivent aux notifications (leur propre appareil) ── */
for (const v of VOISINS) {
  const ctx = env.authenticatedContext(v.uid).firestore();
  await doit("le voisin " + v.uid + " accepte les notifications (" + v.ou + ")", async () => {
    // index.html:4727-4729 — fbEnablePush
    const payload = { token: "tok-" + v.uid, updatedAt: serverTimestamp() };
    if (v.lat != null) { payload.lat = v.lat; payload.lng = v.lng; }
    await setDoc(doc(ctx, "pushTokens", v.uid), payload, { merge: true });
    // index.html:4772 — fbUpdatePushPos ecrit aussi le rayon choisi
    if (v.lat != null) await setDoc(doc(ctx, "pushTokens", v.uid), { lat: v.lat, lng: v.lng, rayon: v.rayon, updatedAt: serverTimestamp() }, { merge: true });
  });
}

/* ── 2. Mallory lance sa « chasse » sur une boisson qui n'existe pas ────── */
const TEXTE = "GAGNE 500 EUR : magofeed-cadeau.example";
const FAUX_ID = 123456;
await doit("un simple compte connecte cree hunts/123456 par le chemin normal de l'app (fbJoinHunt)", async () => {
  const r = await fbJoinHunt(mallory, MALLORY, FAUX_ID, TEXTE, "", BXL.lat, BXL.lng);
  if (!r.ok) throw new Error("fbJoinHunt a rendu ok:false");
});
{
  const d = (await getDoc(doc(anon, "hunts", String(FAUX_ID)))).data();
  note("le document ecrit, relu SANS compte : drinkId=" + JSON.stringify(d.drinkId)
    + " drinkName=" + JSON.stringify(d.drinkName) + " (" + String(d.drinkName).length + " caracteres, aucune limite de type ni de contenu cote regles)");
}

/* ── 3. Ce que la Cloud Function fait de ce document ────────────────────── */
let T = Date.now();
const apres1 = (await serveur((s) => getDoc(doc(s, "hunts", String(FAUX_ID))))).data();
const vague1 = await serveur((s) => notifyHuntNearby(s, String(FAUX_ID), null, apres1, T));
await doit("la vague part vraiment vers des appareils reels", async () => {
  if (!vague1.envoi || !vague1.msgs.length) throw new Error("rien envoye : " + vague1.pourquoi);
});
note("appareils enregistres : " + vague1.total + " — notifies : " + vague1.msgs.length
  + " (" + vague1.msgs.map((m) => m.qui).join(", ") + ")");
note("TEXTE EXACT SUR L'ECRAN DU VOISIN — titre : « " + vague1.msgs[0].title + " » | corps : « " + vague1.msgs[0].body + " »");
note("quentin (39 km) est bien epargne par son rayon ; paulo, qui n'a jamais bouge, est notifie quand meme (notifications-push.js:281-283, choix assume)");

/* ── 4. Ce que le voisin peut faire de cette notification : rien ────────── */
{
  /* index.html:21894-21899 — _peindreChasse : une chasse dont le drinkId est
     inconnu du catalogue local est retiree de la liste. */
  const DRINKS = [{ id: 7, name: "Mountain Dew Spark" }];   // le catalogue de l'appareil
  const affichee = !!DRINKS.find((y) => Number(y.id) === Number(FAUX_ID));
  note("la meme chasse dans l'onglet Chasse du voisin : " + (affichee ? "affichee" : "INVISIBLE")
    + " — index.html:21898 (`if(!d)return false`). Le voisin recoit le texte, ne le retrouve nulle part dans l'app, et n'a donc rien a signaler.");
}

/* ── 5. Le rythme : verrou par boisson contourne, verrou par compte tenu ── */
{
  T += 10 * 60 * 1000;   // dix minutes plus tard
  await doit("Mallory recree une chasse sur un AUTRE numero invente (222222)", async () => {
    const r = await fbJoinHunt(mallory, MALLORY, 222222, TEXTE, "", BXL.lat, BXL.lng);
    if (!r.ok) throw new Error("refuse");
  });
  const a2 = (await serveur((s) => getDoc(doc(s, "hunts", "222222")))).data();
  const v2 = await serveur((s) => notifyHuntNearby(s, "222222", null, a2, T));
  note("10 min plus tard, meme compte, numero neuf : " + (v2.envoi ? "VAGUE ENVOYEE (" + v2.msgs.length + ")" : "rien — " + v2.pourquoi)
    + " — le verrou par boisson (6 h) est bien contourne par le changement de numero, seul le verrou par compte (45 min) retient.");

  await doit("un DEUXIEME compte gratuit lance la sienne dans la meme minute (333333)", async () => {
    const r = await fbJoinHunt(mallory2, MALLORY2, 333333, TEXTE, "", BXL.lat, BXL.lng);
    if (!r.ok) throw new Error("refuse");
  });
  const a3 = (await serveur((s) => getDoc(doc(s, "hunts", "333333")))).data();
  const v3 = await serveur((s) => notifyHuntNearby(s, "333333", null, a3, T));
  note("deuxieme compte, meme minute : " + (v3.envoi ? "VAGUE ENVOYEE (" + v3.msgs.length + " appareils)" : "rien — " + v3.pourquoi)
    + " — le verrou par compte est par compte : il ne coute qu'une inscription anonyme de plus.");
}

/* ── 6. Ce qui, lui, tient : le client ne touche pas aux verrous ────────── */
await doitEchouer("le verrou anti-spam reste hors de portee du client (_meta)", async () => {
  await setDoc(doc(mallory, "_meta", "huntPush_u_" + MALLORY), { at: 0 });
});
await doitEchouer("le client ne peut pas non plus lire les verrous", async () => {
  await getDoc(doc(mallory, "_meta", "huntPush_u_" + MALLORY));
});
await doitEchouer("l'identifiant du document doit rester coherent avec drinkId (regles 1088)", async () => {
  await setDoc(doc(mallory, "hunts", "abc"), { drinkId: 7, drinkName: "x", seekers: { [MALLORY]: { at: Date.now(), lat: 50.8, lng: 4.3 } } });
});

await bilan(env);
