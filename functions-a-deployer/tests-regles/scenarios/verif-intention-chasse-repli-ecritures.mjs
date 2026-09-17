/* ═══════════════════════════════════════════════════════════════════════════
   VERIFICATION D'INTENTION — « une chasse coute deux ecritures refusees »

   Trouvaille a verifier (annoncee comme choix/mineur) :
     « Une chasse coute deux ecritures refusees avant la bonne, a chaque
       lancement » — index.html:4557.

   Ce scenario rejoue window.fbJoinHunt (index.html:4545-4593) A L'IDENTIQUE
   et COMPTE les allers-retours dans les QUATRE situations reelles :
     A. la chasse n'existe pas encore        (creation)
     B. la chasse existe, je n'y suis pas    (Bob rejoint Alice)
     C. la chasse existe, j'y suis deja      (repositionnement GPS)
     D. j'avais quitte la chasse, j'y reviens (seekers.{uid} == null)

   Il mesure aussi le CODE d'erreur de chaque refus : si les trois situations
   rendent le meme code, l'application ne PEUT PAS choisir le bon chemin du
   premier coup — le repli serait alors une necessite, pas une negligence.
   ═══════════════════════════════════════════════════════════════════════════ */
import { banc, doit, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, serverTimestamp } from "firebase/firestore";

const env  = await banc("verif-chasse-repli");
const alice = env.authenticatedContext("alice").firestore();
const bob   = env.authenticatedContext("bob").firestore();
const anon  = env.unauthenticatedContext().firestore();
const ALICE = "alice", BOB = "bob";
const BXL = { lat: 50.8676, lng: 4.3436 };

function verifier(c, m) { if (!c) throw new Error(m); }
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/* index.html:4505 */
function _coarse(x) { return Math.round(x * 10) / 10; }

/* ── COPIE CONFORME de window.fbJoinHunt, index.html:4545-4593 ─────────────
   Seul ajout : `trace` note chaque aller-retour et son code d'erreur. Aucune
   ecriture n'est modifiee : memes collections, memes champs, meme ordre. */
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
    await updateDoc(ref, maj); trace.push("1.updateDoc direct OK");
  } catch (e) {
    trace.push("1.updateDoc direct -> " + (e.code || e.message));
    try {
      const bouge = Object.assign({}, commun);
      bouge["seekers." + uid + ".lat"] = pos.lat;
      bouge["seekers." + uid + ".lng"] = pos.lng;
      await updateDoc(ref, bouge); trace.push("2.updateDoc imbrique OK");
    } catch (e2) {
      trace.push("2.updateDoc imbrique -> " + (e2.code || e2.message));
      await setDoc(ref, Object.assign({
        drinkId: Number(drinkId) || drinkId,
        seekers: (function () { const o = {}; o[uid] = moi; return o; })(),
      }, commun));
      trace.push("3.setDoc creation OK");
    }
  }
  /* index.html:4577-4588 — la relecture de verification (1 LECTURE de plus). */
  let verif = null;
  try { verif = await getDoc(ref); } catch (e0) {}
  const inscrit = !!(verif && verif.exists() && (verif.data().seekers || {})[uid]);
  return { trace, inscrit, refus: trace.filter((t) => t.includes("->")).length };
}

/* index.html:4595-4604 — window.fbLeaveHunt */
async function fbLeaveHunt(db, uid, drinkId) {
  const patch = {}; patch["seekers." + uid] = null;
  await updateDoc(doc(db, "hunts", String(drinkId)), patch);
}

/* ════════════ A. LA CHASSE N'EXISTE PAS ENCORE (creation) ════════════════ */
let A = null;
await doit("A. Alice cree une chasse neuve : elle finit inscrite", async () => {
  A = await fbJoinHunt(alice, ALICE, 7, "Mountain Dew Spark", "", BXL.lat, BXL.lng);
  verifier(A.inscrit, "Alice n'est pas inscrite");
});
note("A. creation           : " + A.trace.join(" | ") + "   => " + A.trace.length
  + " ecriture(s), dont " + A.refus + " REFUS");

/* ════════════ B. LA CHASSE EXISTE, JE N'Y SUIS PAS ═══════════════════════ */
let B = null;
await doit("B. Bob rejoint la chasse d'Alice : il finit inscrit", async () => {
  B = await fbJoinHunt(bob, BOB, 7, "Mountain Dew Spark", "", 50.8946, 4.3436);
  verifier(B.inscrit, "Bob n'est pas inscrit");
  const d = (await getDoc(doc(anon, "hunts", "7"))).data();
  verifier(d.seekers[ALICE], "Bob a efface Alice");
});
note("B. 2e chercheur       : " + B.trace.join(" | ") + "   => " + B.trace.length
  + " ecriture(s), dont " + B.refus + " REFUS");

/* ════════════ C. J'Y SUIS DEJA (repositionnement GPS) ════════════════════ */
let C = null;
await doit("C. Alice se repositionne (fbRepositionMyHunts, index.html:4779)", async () => {
  await pause(20);
  C = await fbJoinHunt(alice, ALICE, 7, "Mountain Dew Spark", "", 51.2194, 4.4025);
  verifier(C.inscrit, "Alice n'est plus inscrite");
  const d = (await getDoc(doc(anon, "hunts", "7"))).data();
  verifier(d.seekers[ALICE].lat === _coarse(51.2194), "position pas mise a jour");
});
note("C. repositionnement   : " + C.trace.join(" | ") + "   => " + C.trace.length
  + " ecriture(s), dont " + C.refus + " REFUS");

/* ════════════ D. J'AVAIS QUITTE, JE REVIENS ══════════════════════════════ */
let D = null;
await doit("D. Alice quitte puis revient", async () => {
  await fbLeaveHunt(alice, ALICE, 7);
  D = await fbJoinHunt(alice, ALICE, 7, "Mountain Dew Spark", "", BXL.lat, BXL.lng);
  verifier(D.inscrit, "Alice n'est pas revenue");
});
note("D. retour apres depart: " + D.trace.join(" | ") + "   => " + D.trace.length
  + " ecriture(s), dont " + D.refus + " REFUS");

/* ════════════ LE CODE D'ERREUR EST-IL DISCRIMINANT ? ═════════════════════
   Si « document absent » et « deja chercheur » rendent le MEME code, aucun
   raccourci n'est possible : l'app ne peut pas savoir ou elle en est sans
   payer une lecture prealable. */
let codeAbsent = "?", codeDejaLa = "?", codeImbriqueAbsent = "?";
await doit("E. on releve les codes d'erreur des deux situations", async () => {
  const ref9 = doc(alice, "hunts", "999");
  const maj = { drinkName: "X", emoji: "", updatedAt: serverTimestamp() };
  maj["seekers." + ALICE] = { lat: 50.9, lng: 4.3, at: Date.now() };
  try { await updateDoc(ref9, maj); } catch (e) { codeAbsent = e.code || e.message; }
  const bouge = { drinkName: "X", emoji: "", updatedAt: serverTimestamp() };
  bouge["seekers." + ALICE + ".lat"] = 50.9; bouge["seekers." + ALICE + ".lng"] = 4.3;
  try { await updateDoc(ref9, bouge); } catch (e) { codeImbriqueAbsent = e.code || e.message; }
  const ref7 = doc(alice, "hunts", "7");
  const maj7 = { drinkName: "X", emoji: "", updatedAt: serverTimestamp() };
  maj7["seekers." + ALICE] = { lat: 50.9, lng: 4.3, at: Date.now() };
  try { await updateDoc(ref7, maj7); } catch (e) { codeDejaLa = e.code || e.message; }
});
note("E. document ABSENT, updateDoc direct    -> " + codeAbsent);
note("E. document ABSENT, updateDoc imbrique  -> " + codeImbriqueAbsent);
note("E. DEJA chercheur, updateDoc direct     -> " + codeDejaLa);
await doit("E. les deux situations rendent le MEME code : aucun raccourci possible sans lecture prealable",
  async () => { verifier(codeAbsent === codeDejaLa, "codes differents : " + codeAbsent + " vs " + codeDejaLa); });
await doit("E. sur un document absent, la 2e tentative est vouee a l'echec elle aussi",
  async () => { verifier(codeImbriqueAbsent !== "?" , "la 2e tentative a REUSSI sur un document absent"); });

/* ════════════ LE LANCEMENT REEL : lancerChasse appelle DEUX fois ═════════
   index.html:14368 (tout de suite, avec ce qu'on a) puis 14356 (rappel GPS). */
let L1 = null, L2 = null;
await doit("F. un lancement reel (index.html:14356 + 14368) : chasse neuve, GPS pas pret", async () => {
  L1 = await fbJoinHunt(alice, ALICE, 42, "Ramune Original", "", null, null);
  await pause(20);
  L2 = await fbJoinHunt(alice, ALICE, 42, "Ramune Original", "", BXL.lat, BXL.lng);
  verifier(L2.inscrit, "Alice pas inscrite apres repositionnement");
});
note("F. lancement complet  : " + (L1.trace.length + L2.trace.length) + " ecriture(s) au total, dont "
  + (L1.refus + L2.refus) + " REFUS  [" + L1.trace.join(" | ") + "]  puis  [" + L2.trace.join(" | ") + "]");
note("F. + 2 LECTURES de verification (index.html:4579) — une par appel.");

await bilan(env);
