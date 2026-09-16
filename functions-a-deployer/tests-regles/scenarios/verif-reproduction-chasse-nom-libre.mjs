/* ============================================================================
   VERIFICATION INDEPENDANTE — « une chasse se cree sur une boisson inventee,
   avec un texte libre qui part en poussee dans tout le quartier »

   Question unique : EST-CE QUE CA SE REPRODUIT ?

   Ce fichier ne reprend RIEN du scenario d'origine : il recopie a la main
   l'ecriture de window.fbJoinHunt (index.html:4545-4577) et la decision de
   notifyHuntNearby (functions-a-deployer/notifications-push.js:153-298).

   Fonction rejouee : window.fbJoinHunt, index.html:4545-4577
   Regles visees   : firestore.rules:1085-1097 (match /hunts/{drinkId})
   Catalogue       : data/drinks.js — le plus grand identifiant est 17934,
                     donc 123456 et 999999999 ne designent AUCUNE boisson.
   ========================================================================== */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, serverTimestamp } from "firebase/firestore";

const env = await banc("verif-chasse-nom-libre");

/* Le compte de l'attaquant est un compte ANONYME : firestore.rules:37 dit
   isSignedIn() = request.auth != null, sans regarder le fournisseur. */
const mallory = env.authenticatedContext("mallory", { firebase: { sign_in_provider: "anonymous" } }).firestore();
const anon = env.unauthenticatedContext().firestore();
const MALLORY = "mallory";

/* index.html:4505 */
function _coarse(x) { return Math.round(x * 10) / 10; }

/* index.html:4545-4577 — window.fbJoinHunt, recopie a l'identique. */
async function fbJoinHunt(db, uid, drinkId, drinkName, emoji, lat, lng) {
  const pos = { lat: lat != null ? _coarse(lat) : null, lng: lng != null ? _coarse(lng) : null };
  const moi = { lat: pos.lat, lng: pos.lng, at: Date.now() };
  const ref = doc(db, "hunts", String(drinkId));
  const commun = {
    drinkName: typeof drinkName === "string" ? String(drinkName || "").slice(0, 60) : drinkName,
    emoji: String(emoji || "").slice(0, 4), updatedAt: serverTimestamp(),
  };
  const maj = Object.assign({}, commun);
  maj["seekers." + uid] = moi;
  try { await updateDoc(ref, maj); return "updateDoc direct"; }
  catch (e) {
    const bouge = Object.assign({}, commun);
    bouge["seekers." + uid + ".lat"] = pos.lat;
    bouge["seekers." + uid + ".lng"] = pos.lng;
    try { await updateDoc(ref, bouge); return "updateDoc imbrique"; }
    catch (e2) {
      await setDoc(ref, Object.assign({
        drinkId: Number(drinkId) || drinkId,
        seekers: (function () { const o = {}; o[uid] = moi; return o; })(),
      }, commun));
      return "setDoc creation";
    }
  }
}

/* notifications-push.js:153-206 puis 246-298 — la decision du serveur.
   `verrous` est une carte { cle -> date }, comme les documents _meta. */
function _cle(v) { return String(v).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80); }
function notifyHuntNearby(before, after, docId, verrous, now) {
  const bSeek = (before && before.seekers) || {}, aSeek = (after && after.seekers) || {};
  if (!after || !after.seekers) return { envoi: false, pourquoi: "pas de seekers" };
  const nouveaux = Object.keys(aSeek).filter((u) => aSeek[u] && !bSeek[u]);
  if (!nouveaux.length) return { envoi: false, pourquoi: "aucun NOUVEAU chercheur (ligne 160)" };
  let center = null;
  nouveaux.forEach((u) => { const s = aSeek[u]; if (s && s.lat != null && (!center || s.at > center.at)) center = s; });
  if (!center) return { envoi: false, pourquoi: "pas de centre (ligne 173)" };
  const name = String(after.drinkName || "une boisson").slice(0, 40);   // ligne 193
  const lanceur = nouveaux[0];
  const listeVerrous = [
    { cle: "huntPush_d_" + _cle(after.drinkId != null ? after.drinkId : docId), ms: 6 * 3600 * 1000, nom: "boisson" },
    { cle: "huntPush_u_" + _cle(lanceur), ms: 45 * 60 * 1000, nom: "personne" },
  ];
  for (const v of listeVerrous) {
    const at = Number(verrous[v.cle]) || 0;
    if (now - at < v.ms) return { envoi: false, pourquoi: "verrou anti-spam par " + v.nom, cleVerrou: v.cle };
  }
  for (const v of listeVerrous) verrous[v.cle] = now;
  return {
    envoi: true,
    cles: listeVerrous.map((v) => v.cle),
    corps: "Quelqu'un cherche « " + name + " ». Si tu la vois en magasin, signale-la et gagne des points.",
  };
}

/* ── 1. Une boisson qui n'existe pas ─────────────────────────────────────── */
await doitEchouer("les regles refusent une chasse sur un identifiant absent du catalogue (999999999 > 17934)", async () => {
  await fbJoinHunt(mallory, MALLORY, 999999999, "Aucune boisson n'a ce numero", "", 50.8676, 4.3436);
});

/* ── 2. Le texte libre ───────────────────────────────────────────────────── */
const APPAT = "GAGNE 500 EUR : ouvre magofeed-cadeau.example maintenant";
await doitEchouer("les regles refusent un drinkName publicitaire sur une boisson inventee", async () => {
  await fbJoinHunt(mallory, MALLORY, 123456, APPAT, "", 50.8676, 4.3436);
});

{
  const s = await getDoc(doc(anon, "hunts", "123456"));
  if (s.exists()) {
    const d = s.data();
    note("hunts/123456 est en base et LISIBLE SANS COMPTE (regles 1086) : "
      + JSON.stringify({ drinkId: d.drinkId, drinkName: d.drinkName, seekers: Object.keys(d.seekers || {}) }));
    const verrous = {};
    const p = notifyHuntNearby(null, d, "123456", verrous, Date.now());
    note("notifications-push.js:288 enverrait a tous les pushTokens dans le rayon : "
      + (p.envoi ? "« " + p.corps + " »" : "rien — " + p.pourquoi));
  } else {
    note("hunts/123456 n'existe pas : les regles ont refuse.");
  }
}

/* ── 3. Le type et la longueur du nom ────────────────────────────────────── */
await doitEchouer("les regles refusent un drinkName qui n'est pas un texte (nombre)", async () => {
  await setDoc(doc(mallory, "hunts", "4242"), {
    drinkId: 4242, drinkName: 9999, emoji: "", updatedAt: serverTimestamp(),
    seekers: { [MALLORY]: { lat: 50.9, lng: 4.3, at: Date.now() } },
  });
});
await doitEchouer("les regles refusent un drinkName de 5000 caracteres (l'app coupe a 60, pas la base)", async () => {
  await setDoc(doc(mallory, "hunts", "4243"), {
    drinkId: 4243, drinkName: "A".repeat(5000), emoji: "", updatedAt: serverTimestamp(),
    seekers: { [MALLORY]: { lat: 50.9, lng: 4.3, at: Date.now() } },
  });
});
{
  const a = await getDoc(doc(anon, "hunts", "4242"));
  const b = await getDoc(doc(anon, "hunts", "4243"));
  note("apres coup : hunts/4242.drinkName = " + JSON.stringify(a.exists() ? a.data().drinkName : null)
    + " (type " + (a.exists() ? typeof a.data().drinkName : "-") + ")"
    + " | hunts/4243.drinkName fait " + (b.exists() ? String(b.data().drinkName).length : 0) + " caracteres");
}

/* ── 4. Le verrou anti-spam par boisson, et celui par compte ─────────────── */
{
  const verrous = {};
  const maintenant = Date.now();
  let vagues = 0, bloquees = 0;
  const cles = new Set();
  for (let i = 0; i < 5; i++) {
    const id = 500000 + i;
    await fbJoinHunt(mallory, MALLORY, id, APPAT + " #" + i, "", 50.8676, 4.3436);
    const d = (await getDoc(doc(anon, "hunts", String(id)))).data();
    const p = notifyHuntNearby(null, d, String(id), verrous, maintenant);
    if (p.envoi) { vagues++; p.cles.forEach((c) => cles.add(c)); } else bloquees++;
  }
  note("5 chasses creees d'affilee par le MEME compte anonyme, 5 numeros differents, a la meme seconde : "
    + vagues + " vague(s) partie(s), " + bloquees + " bloquee(s) — verrous poses : " + [...cles].join(", "));

  const verrous2 = {};
  let vagues2 = 0;
  for (let i = 0; i < 5; i++) {
    const id = 600000 + i;
    await fbJoinHunt(mallory, MALLORY, id, APPAT + " @" + i, "", 50.8676, 4.3436);
    const d = (await getDoc(doc(anon, "hunts", String(id)))).data();
    const p = notifyHuntNearby(null, d, String(id), verrous2, maintenant + i * 46 * 60000);
    if (p.envoi) vagues2++;
  }
  note("les memes 5 chasses espacees de 46 min (le verrou par compte est de 45 min, ligne 254) : "
    + vagues2 + " vague(s) partie(s) — le verrou par boisson (6 h) ne se declenche jamais, la cle change avec le numero.");
}

/* ── 5. Ce que l'attaquant ne peut PAS faire (pour mesurer la borne reelle) ─ */
await doitEchouer("l'attaquant ne peut pas effacer le verrou par compte dans _meta (regles 1042)", async () => {
  await setDoc(doc(mallory, "_meta", "huntPush_u_mallory"), { at: 0 });
});
await doitEchouer("l'attaquant ne peut pas creer une chasse au nom de quelqu'un d'autre (regles 1089)", async () => {
  await setDoc(doc(mallory, "hunts", "700000"), {
    drinkId: 700000, drinkName: APPAT, emoji: "", updatedAt: serverTimestamp(),
    seekers: { victime: { lat: 50.9, lng: 4.3, at: Date.now() } },
  });
});
await doit("le controle qui EXISTE marche : le nom du document doit egaler drinkId (regles 1088)", async () => {
  let refuse = false;
  try {
    await setDoc(doc(mallory, "hunts", "abc"), {
      drinkId: 7, drinkName: "x", emoji: "", updatedAt: serverTimestamp(),
      seekers: { [MALLORY]: { lat: 50.9, lng: 4.3, at: Date.now() } },
    });
  } catch (e) { refuse = true; }
  if (!refuse) throw new Error("hunts/abc a ete accepte avec drinkId=7");
});

await bilan(env);
