/* ============================================================================
   LE CORRECTIF PROPOSE, MIS A L'EPREUVE
   ----------------------------------------------------------------------------
   Meme banc, mais avec une COPIE PATCHEE des regles
   (scenarios/verif-intention-chasse-proprietaire.correctif.rules, generee a
   partir de functions-a-deployer/firestore.rules — le fichier du depot n'est
   PAS modifie). Trois ajouts a `allow update` sur /hunts/{drinkId} :
     - drinkId fige (la creation le lie deja au nom du document, regles 1088) ;
     - drinkName / emoji ne bougent que si l'auteur de l'ecriture est chercheur
       DANS LE DOCUMENT RESULTANT ;
     - drinkName est une chaine de 60 au plus (meme borne que index.html:4553
       et que la regle 640 pour une autre collection).
   But de ce fichier : verifier que le correctif refuse l'abus SANS refuser une
   seule ecriture honnete de l'application.
   ========================================================================== */
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doit, doitEchouer, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import fs from "node:fs";
import path from "node:path";

const REGLES = path.join(process.cwd(), "scenarios", "verif-intention-chasse-proprietaire.correctif.rules");
const env = await initializeTestEnvironment({
  projectId: "verif-correctif-chasse",
  firestore: { rules: fs.readFileSync(REGLES, "utf8"), host: "127.0.0.1", port: Number(process.env.MAGO_PORT || 8391) },
});
const ALICE = "alice", BOB = "bob", CAMILLE = "camille";
const alice = env.authenticatedContext(ALICE).firestore();
const bob = env.authenticatedContext(BOB).firestore();
const camille = env.authenticatedContext(CAMILLE).firestore();
const anon = env.unauthenticatedContext().firestore();
const verifier = (c, quoi) => { if (!c) throw new Error(quoi); };

const BXL = { lat: 50.8676, lng: 4.3436 };
const BOISSON = 7, NOM = "Mountain Dew Spark";
const PIRATE = "PIRATE — appelle le 0900";
function _coarse(x) { return Math.round(x * 10) / 10; }

/* index.html:4545-4593 */
async function fbJoinHunt(db, uid, drinkId, drinkName, emoji, lat, lng) {
  const trace = [];
  const pos = { lat: lat != null ? _coarse(lat) : null, lng: lng != null ? _coarse(lng) : null };
  const moi = { lat: pos.lat, lng: pos.lng, at: Date.now() };
  const ref = doc(db, "hunts", String(drinkId));
  const commun = { drinkName: String(drinkName || "").slice(0, 60), emoji: String(emoji || "").slice(0, 4), updatedAt: serverTimestamp() };
  const maj = Object.assign({}, commun); maj["seekers." + uid] = moi;
  try { await updateDoc(ref, maj); trace.push("updateDoc direct OK"); return trace; }
  catch (e) {
    trace.push("updateDoc direct -> " + (e.code || e.message));
    try {
      const bouge = Object.assign({}, commun);
      bouge["seekers." + uid + ".lat"] = pos.lat; bouge["seekers." + uid + ".lng"] = pos.lng;
      await updateDoc(ref, bouge); trace.push("updateDoc imbrique OK"); return trace;
    } catch (e2) {
      trace.push("updateDoc imbrique -> " + (e2.code || e2.message));
      await setDoc(ref, Object.assign({ drinkId: Number(drinkId) || drinkId,
        seekers: (function () { const o = {}; o[uid] = moi; return o; })() }, commun));
      trace.push("setDoc creation OK"); return trace;
    }
  }
}
/* index.html:4595-4604 */
async function fbLeaveHunt(db, uid, drinkId) {
  const p = {}; p["seekers." + uid] = null;
  await updateDoc(doc(db, "hunts", String(drinkId)), p);
}
const lire = async () => (await getDoc(doc(anon, "hunts", String(BOISSON)))).data();

/* ── LE PARCOURS HONNETE DOIT PASSER ENTIEREMENT ────────────────────────── */
await doit("Alice lance la chasse (fbJoinHunt, creation)", async () => {
  const t = await fbJoinHunt(alice, ALICE, BOISSON, NOM, "", BXL.lat, BXL.lng);
  verifier(t[t.length - 1].endsWith("OK"), t.join(" | "));
});
await doit("Camille rejoint la meme chasse (fbJoinHunt, mise a jour)", async () => {
  const t = await fbJoinHunt(camille, CAMILLE, BOISSON, NOM, "", 50.8946, 4.3436);
  verifier(t[t.length - 1].endsWith("OK"), t.join(" | "));
  verifier(Object.keys((await lire()).seekers).length === 2, "Camille n'est pas entree");
});
await doit("Camille se repositionne (chemin imbrique : `at` fige)", async () => {
  const t = await fbJoinHunt(camille, CAMILLE, BOISSON, NOM, "", 50.9100, 4.3500);
  verifier(t[t.length - 1] === "updateDoc imbrique OK", t.join(" | "));
});
await doit("le catalogue renomme la boisson : un chercheur met le nom a jour en rejoignant", async () => {
  await fbJoinHunt(camille, CAMILLE, BOISSON, "Mountain Dew Spark (50 cl)", "", 50.9100, 4.3500);
  verifier((await lire()).drinkName === "Mountain Dew Spark (50 cl)", "le nom n'a pas suivi le catalogue");
});
await doit("Alice quitte la chasse (fbLeaveHunt)", async () => {
  await fbLeaveHunt(alice, ALICE, BOISSON);
  verifier((await lire()).seekers[ALICE] === null, "Alice n'est pas sortie");
});
await doit("Alice revient (fbLeaveHunt puis fbJoinHunt : nouvelle date d'inscription)", async () => {
  const t = await fbJoinHunt(alice, ALICE, BOISSON, "Mountain Dew Spark (50 cl)", "", BXL.lat, BXL.lng);
  verifier(t[t.length - 1].endsWith("OK"), t.join(" | "));
});

/* ── L'ABUS DOIT ETRE REFUSE ────────────────────────────────────────────── */
await doitEchouer("Bob, qui ne chasse pas, ne renomme plus la chasse", async () => {
  await updateDoc(doc(bob, "hunts", String(BOISSON)), { drinkName: PIRATE });
});
await doitEchouer("Bob ne repointe plus la chasse sur une autre boisson", async () => {
  await updateDoc(doc(bob, "hunts", String(BOISSON)), { drinkId: 999 });
});
await doitEchouer("meme en rejoignant dans la meme ecriture, Bob ne repointe pas drinkId", async () => {
  const maj = { drinkId: 999, drinkName: NOM, emoji: "", updatedAt: serverTimestamp() };
  maj["seekers." + BOB] = { lat: 50.9, lng: 4.3, at: Date.now() };
  await updateDoc(doc(bob, "hunts", String(BOISSON)), maj);
});
await doitEchouer("un nom de plus de 60 caracteres est refuse (index.html:4553 tronque deja a 60)", async () => {
  const maj = { drinkName: "x".repeat(61), emoji: "", updatedAt: serverTimestamp() };
  maj["seekers." + BOB] = { lat: 50.9, lng: 4.3, at: Date.now() };
  await updateDoc(doc(bob, "hunts", String(BOISSON)), maj);
});
/* les garde-fous deja en place ne doivent pas avoir bouge */
await doitEchouer("Bob ne retire toujours pas Alice", async () => {
  const p = {}; p["seekers." + ALICE] = null;
  await updateDoc(doc(bob, "hunts", String(BOISSON)), p);
});
await doitEchouer("_lastPush reste hors de portee", async () => {
  await updateDoc(doc(bob, "hunts", String(BOISSON)), { _lastPush: Date.now() });
});
await doitEchouer("la suppression reste reservee a l'administrateur", async () => {
  await deleteDoc(doc(bob, "hunts", String(BOISSON)));
});

/* ── CE QUE LE CORRECTIF NE REGLE PAS, ET QU'IL FAUT DIRE ────────────────── */
{
  const maj = { drinkName: PIRATE, emoji: "", updatedAt: serverTimestamp() };
  maj["seekers." + BOB] = { lat: 50.9, lng: 4.3, at: Date.now() };
  let passe = true;
  try { await updateDoc(doc(bob, "hunts", String(BOISSON)), maj); } catch (e) { passe = false; }
  note("Bob qui REJOINT vraiment peut encore choisir le nom : " + (passe ? "ecriture acceptee" : "refusee")
    + " — le texte libre dans la poussee (notifications-push.js:189 et :288) est un autre probleme,"
    + " il se corrige cote serveur en prenant le nom au catalogue plutot qu'au document.");
  const d = await lire();
  note("etat final : drinkId=" + JSON.stringify(d.drinkId) + " (jamais repointe) drinkName=" + JSON.stringify(d.drinkName));
}
await bilan(env);
