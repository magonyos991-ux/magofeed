/* ============================================================================
   VERIFICATION INDEPENDANTE — « une chasse lancee avant que le GPS reponde ne
   previent JAMAIS personne »
   ----------------------------------------------------------------------------
   Ecrit de zero (sans reprendre chasse-bout-en-bout.mjs) pour repondre a une
   seule question : EST-CE QUE CA SE REPRODUIT ?

   Recopie a l'identique :
     index.html:4505        _coarse
     index.html:4545-4592   window.fbJoinHunt            (les 3 ecritures en repli)
     index.html:4779-4787   window.fbRepositionMyHunts   (rappelle fbJoinHunt)
     index.html:14344-14367 lancerChasse                 (l'ordre des deux appels)
     notifications-push.js:153-206  notifyHuntNearby      (les deux sorties seches)

   L'emulateur n'execute pas les Cloud Functions : on rejoue la DECISION de
   notifyHuntNearby sur l'etat REEL relu dans la base apres chaque ecriture.
   ========================================================================== */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, serverTimestamp } from "firebase/firestore";

const env = await banc("verif-chasse-gps-tardif");
const ALICE = "alice", BOB = "bob";
const alice = env.authenticatedContext(ALICE).firestore();
const bob = env.authenticatedContext(BOB).firestore();
const anon = env.unauthenticatedContext().firestore();

const BXL = { lat: 50.8676, lng: 4.3436 };
const verifier = (c, quoi) => { if (!c) throw new Error(quoi); };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── index.html:4505 ─────────────────────────────────────────────────────── */
function _coarse(x) { return Math.round(x * 10) / 10; }

/* ── index.html:4545-4592 — window.fbJoinHunt, ecritures identiques ──────── */
async function fbJoinHunt(db, uid, drinkId, drinkName, emoji, lat, lng) {
  const trace = [];
  const pos = { lat: lat != null ? _coarse(lat) : null, lng: lng != null ? _coarse(lng) : null };
  const moi = { lat: pos.lat, lng: pos.lng, at: Date.now() };
  const ref = doc(db, "hunts", String(drinkId));
  const commun = {
    drinkName: String(drinkName || "").slice(0, 60),
    emoji: String(emoji || "").slice(0, 4), updatedAt: serverTimestamp(),
  };
  const maj = Object.assign({}, commun);
  maj["seekers." + uid] = moi;
  try {
    await updateDoc(ref, maj); trace.push("updateDoc direct OK");
  } catch (e) {
    trace.push("updateDoc direct -> " + (e.code || e.message));
    try {
      const bouge = Object.assign({}, commun);
      bouge["seekers." + uid + ".lat"] = pos.lat;
      bouge["seekers." + uid + ".lng"] = pos.lng;
      await updateDoc(ref, bouge); trace.push("updateDoc imbrique OK");
    } catch (e2) {
      trace.push("updateDoc imbrique -> " + (e2.code || e2.message));
      await setDoc(ref, Object.assign({
        drinkId: Number(drinkId) || drinkId,
        seekers: (function () { const o = {}; o[uid] = moi; return o; })(),
      }, commun));
      trace.push("setDoc creation OK");
    }
  }
  /* la relecture de fin (index.html:4577-4586) : ce que l'app annonce a l'ecran */
  const verif = await getDoc(ref);
  const sk = (verif.exists() && verif.data().seekers) || {};
  let total = 0; Object.keys(sk).forEach((u) => { if (sk[u]) total++; });
  return { trace, ok: !!sk[uid], chercheurs: total, position: pos.lat != null };
}

/* ── notifications-push.js:153-206 — notifyHuntNearby, les deux sorties ──── */
function notifyHuntNearby(before, after) {
  if (!after || !after.seekers) return { envoi: false, pourquoi: "pas de seekers (ligne 158)" };
  const bSeek = (before && before.seekers) || {}, aSeek = after.seekers || {};
  const newSeekers = Object.keys(aSeek).filter((u) => aSeek[u] && !bSeek[u]);
  if (!newSeekers.length) return { envoi: false, pourquoi: "aucun NOUVEAU chercheur (ligne 162)", journal: null };
  let center = null;
  newSeekers.forEach((u) => { const s = aSeek[u]; if (s && s.lat != null && (!center || s.at > center.at)) center = s; });
  if (!center) return { envoi: false, pourquoi: "pas de centre : chasse sans position (ligne 170)", journal: "alertesAdmin : rien envoye" };
  return { envoi: true, pourquoi: "vague envoyee autour de " + center.lat + "," + center.lng, nouveaux: newSeekers };
}

/* ══════════════════════════════════════════════════════════════════════════
   CAS 1 — telephone neuf : lancerChasse part sans position, puis repositionne
   index.html:14355 refreshLocation(...) est ASYNCHRONE, donc l'appel
   synchrone de la ligne 14369 passe le premier avec userLat = null.
   ══════════════════════════════════════════════════════════════════════════ */
const DRINK = 7, NOM = "Mountain Dew Spark";
let e1 = null, e2 = null, r1 = null, r2 = null;

await doit("le parcours s'execute : Alice cree la chasse sans GPS puis l'app la repositionne", async () => {
  r1 = await fbJoinHunt(alice, ALICE, DRINK, NOM, "", null, null);          // index.html:14369
  e1 = (await getDoc(doc(anon, "hunts", String(DRINK)))).data();
  await pause(30);
  // index.html:14356 (rappel de refreshLocation) / index.html:4784 (fbRepositionMyHunts)
  r2 = await fbJoinHunt(alice, ALICE, DRINK, NOM, "", BXL.lat, BXL.lng);
  e2 = (await getDoc(doc(anon, "hunts", String(DRINK)))).data();
  verifier(e2.seekers[ALICE], "Alice n'est pas inscrite");
  verifier(e2.seekers[ALICE].lat === _coarse(BXL.lat), "la position n'a pas ete reecrite");
});
note("ecriture 1 (sans GPS) : " + r1.trace.join(" | "));
note("ecriture 2 (avec GPS) : " + r2.trace.join(" | "));
note("etat apres 1 : " + JSON.stringify(e1.seekers));
note("etat apres 2 : " + JSON.stringify(e2.seekers));

const p1 = notifyHuntNearby(null, e1);
const p2 = notifyHuntNearby(e1, e2);
note("notifyHuntNearby(ecriture 1) : " + (p1.envoi ? "VAGUE" : "RIEN") + " — " + p1.pourquoi);
note("notifyHuntNearby(ecriture 2) : " + (p2.envoi ? "VAGUE" : "RIEN") + " — " + p2.pourquoi);

await doit("LE POINT CONTESTE : le repositionnement GPS fait bien partir la vague (index.html:14345-14353)", async () => {
  verifier(p1.envoi || p2.envoi,
    "aucune des deux ecritures ne notifie. 1re : " + p1.pourquoi + " / 2e : " + p2.pourquoi);
});

await doit("l'ecran d'Alice sait au moins que la position manquait au depart (index.html:14380)", async () => {
  verifier(r1.ok === true, "fbJoinHunt renvoie ok=false");
  verifier(r1.position === false, "position devrait etre false au 1er appel");
});
note("ce que l'app a dit a Alice : « Chasse lancee · tu es le premier a la chercher » puis "
  + "« Position pas encore connue — on previendra les gens des que le GPS repond » (index.html:14380)");

/* ══════════════════════════════════════════════════════════════════════════
   CAS 2 — temoin : le GPS est deja pret au moment du geste (index.html:14369
   avec userLat non nul). Une seule ecriture, et la vague part.
   ══════════════════════════════════════════════════════════════════════════ */
await doit("TEMOIN : avec le GPS deja pret, la meme chasse previent bien les gens autour", async () => {
  const r = await fbJoinHunt(alice, ALICE, 42, "Ramune Original", "", BXL.lat, BXL.lng);
  const d = (await getDoc(doc(anon, "hunts", "42"))).data();
  const p = notifyHuntNearby(null, d);
  note("temoin — trace : " + r.trace.join(" | ") + " => " + p.pourquoi);
  verifier(p.envoi, "aucune vague : " + p.pourquoi);
});

/* ══════════════════════════════════════════════════════════════════════════
   CAS 3 — la permission de localisation est refusee : refreshLocation rend
   ok=false (index.html:14356 `if(!ok||userLat==null)return;`), il n'y a donc
   qu'UNE seule ecriture, sans position, pour toujours.
   ══════════════════════════════════════════════════════════════════════════ */
await doit("GPS refuse : la chasse existe et n'a jamais de centre", async () => {
  const r = await fbJoinHunt(bob, BOB, 99, "Cherry Coke Zero", "", null, null);
  const d = (await getDoc(doc(anon, "hunts", "99"))).data();
  const p = notifyHuntNearby(null, d);
  note("GPS refuse — trace : " + r.trace.join(" | ") + " => " + p.pourquoi
    + " | trace laissee : " + (p.journal || "aucune"));
  verifier(p.envoi, "aucune vague : " + p.pourquoi);
});

/* ══════════════════════════════════════════════════════════════════════════
   CAS 4 — la chasse muette du CAS 1 peut-elle se « reveiller » plus tard ?
   Seul un NOUVEAU chercheur relance la fonction. Alice, elle, ne compte plus.
   ══════════════════════════════════════════════════════════════════════════ */
await doit("Alice se repositionne une 3e fois : toujours rien (elle n'est plus un NOUVEAU chercheur)", async () => {
  const avant = (await getDoc(doc(anon, "hunts", String(DRINK)))).data();
  await fbJoinHunt(alice, ALICE, DRINK, NOM, "", 50.9, 4.4);
  const apres = (await getDoc(doc(anon, "hunts", String(DRINK)))).data();
  const p = notifyHuntNearby(avant, apres);
  note("3e repositionnement d'Alice => " + p.pourquoi);
  verifier(p.envoi, "aucune vague : " + p.pourquoi);
});

await doit("il faut qu'une AUTRE personne lance la meme chasse pour qu'une vague parte enfin", async () => {
  const avant = (await getDoc(doc(anon, "hunts", String(DRINK)))).data();
  await fbJoinHunt(bob, BOB, DRINK, NOM, "", 50.85, 4.35);
  const apres = (await getDoc(doc(anon, "hunts", String(DRINK)))).data();
  const p = notifyHuntNearby(avant, apres);
  note("Bob rejoint la chasse d'Alice => " + p.pourquoi);
  verifier(p.envoi, "meme l'arrivee de Bob ne notifie pas : " + p.pourquoi);
});

await bilan(env);
