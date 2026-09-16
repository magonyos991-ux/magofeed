/* ============================================================================
   VERIFICATION « REPRODUCTION » — le repli a trois etages de fbJoinHunt
   ----------------------------------------------------------------------------
   Trouvaille a verifier : « une chasse coute deux ecritures refusees avant la
   bonne, a chaque lancement ».

   Ce fichier ne recopie PAS le scenario accuse : il reconstruit fbJoinHunt a
   partir de index.html:4545-4593 (y compris la RELECTURE getDoc de 4578, que le
   scenario chasse-bout-en-bout.mjs omet) et compte CHAQUE aller-retour
   Firestore, refuse ou non, dans les trois situations que l'application connait :

     A. creation   — la chasse n'existe pas encore    (lancerChasse, 14368)
     B. rejoindre  — la chasse existe, je n'y suis pas (lancerChasse, 14368)
     C. bouger     — la chasse existe, j'y suis deja   (fbRepositionMyHunts, 4779)

   Puis il mesure le cout de fbRepositionMyHunts (index.html:4779-4787) qui
   boucle fbJoinHunt sur TOUTES les veilles.
   ========================================================================== */
import { banc, doit, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, serverTimestamp } from "firebase/firestore";

const env = await banc("verif-reproduction-chasse-deux-refus");
const alice = env.authenticatedContext("alice").firestore();
const bob = env.authenticatedContext("bob").firestore();

/* index.html:4505 */
function _coarse(x) { return Math.round(x * 10) / 10; }

/* index.html:4545-4593 — copie conforme de window.fbJoinHunt.
   Seuls ajouts : `trace` (ce qui est parti et ce qui est revenu) et `uid`
   (le banc n'a pas ensureAuthed). La relecture getDoc de 4578 est conservee :
   c'est un aller-retour reel, facture comme les autres. */
async function fbJoinHunt(db, uid, drinkId, drinkName, emoji, lat, lng, trace) {
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
    await updateDoc(ref, maj); trace.push("ECRITURE 1 updateDoc direct : ACCEPTEE");
  } catch (e) {
    trace.push("ECRITURE 1 updateDoc direct : REFUSEE (" + (e.code || e.message) + ")");
    try {
      const bouge = Object.assign({}, commun);
      bouge["seekers." + uid + ".lat"] = pos.lat;
      bouge["seekers." + uid + ".lng"] = pos.lng;
      await updateDoc(ref, bouge); trace.push("ECRITURE 2 updateDoc imbrique : ACCEPTEE");
    } catch (e2) {
      trace.push("ECRITURE 2 updateDoc imbrique : REFUSEE (" + (e2.code || e2.message) + ")");
      await setDoc(ref, Object.assign({
        drinkId: Number(drinkId) || drinkId,
        seekers: (function () { const o = {}; o[uid] = moi; return o; })(),
      }, commun));
      trace.push("ECRITURE 3 setDoc creation : ACCEPTEE");
    }
  }
  /* index.html:4578 — la relecture qui prouve que l'ecriture a pris. */
  let verif = null;
  try { verif = await getDoc(ref); trace.push("LECTURE getDoc de controle (4578)"); } catch (e0) {}
  const inscrit = !!(verif && verif.exists() && (verif.data().seekers || {})[uid]);
  let total = 0;
  if (verif && verif.exists()) {
    const sk = verif.data().seekers || {};
    Object.keys(sk).forEach((u) => { if (sk[u]) total++; });
  }
  return { ok: inscrit, chercheurs: total, position: pos.lat != null,
           reason: inscrit ? null : "non-inscrit" };
}

const refus = (t) => t.filter((l) => l.includes("REFUSEE")).length;

/* ── A. Alice cree la chasse : le document n'existe pas ──────────────────── */
const tA = [];
let rA;
await doit("A. Alice lance une chasse qui n'existe pas encore : elle est bien inscrite", async () => {
  rA = await fbJoinHunt(alice, "alice", 7, "Ramune Original", "", 50.8676, 4.3436, tA);
  if (!rA.ok) throw new Error("fbJoinHunt rend ok=false : " + rA.reason);
});
tA.forEach((l) => note("A(creation)  | " + l));
note("A(creation)  | => " + tA.length + " aller-retour(s), dont " + refus(tA) + " REFUS. Resultat rendu a l'ecran : "
  + JSON.stringify(rA));

/* ── B. Bob rejoint la chasse d'Alice : le document existe, il n'y est pas ── */
const tB = [];
let rB;
await doit("B. Bob rejoint la chasse existante d'Alice : il est bien inscrit", async () => {
  rB = await fbJoinHunt(bob, "bob", 7, "Ramune Original", "", 50.8946, 4.3436, tB);
  if (!rB.ok) throw new Error("fbJoinHunt rend ok=false : " + rB.reason);
});
tB.forEach((l) => note("B(rejoindre) | " + l));
note("B(rejoindre) | => " + tB.length + " aller-retour(s), dont " + refus(tB) + " REFUS.");

/* ── C. Alice bouge : elle est deja chercheuse, les regles figent son `at` ── */
const avant = (await getDoc(doc(alice, "hunts", "7"))).data().seekers.alice.at;
const tC = [];
await doit("C. Alice se repositionne : elle reste inscrite et son `at` ne bouge pas (regles 1075-1084)", async () => {
  const r = await fbJoinHunt(alice, "alice", 7, "Ramune Original", "", 51.2194, 4.4025, tC);
  if (!r.ok) throw new Error("fbJoinHunt rend ok=false : " + r.reason);
  const apres = (await getDoc(doc(alice, "hunts", "7"))).data().seekers.alice;
  if (apres.at !== avant) throw new Error("la date d'inscription a bouge : " + avant + " -> " + apres.at);
  if (apres.lat !== 51.2) throw new Error("la position n'a pas suivi : " + apres.lat);
});
tC.forEach((l) => note("C(bouger)    | " + l));
note("C(bouger)    | => " + tC.length + " aller-retour(s), dont " + refus(tC) + " REFUS.");

/* ── D. Le vrai appelant : fbRepositionMyHunts (index.html:4779-4787) ─────
   Il boucle fbJoinHunt sur TOUTES les veilles, une fois le GPS arrive
   (index.html:6181 et 6281, garde par window._huntsRepositioned). */
const veilles = [
  { id: 7, name: "Ramune Original", emoji: "" },   // existante, Alice dedans -> cas C
  { id: 21, name: "Club-Mate", emoji: "" },        // inexistante -> cas A
  { id: 34, name: "Fritz-Kola", emoji: "" },       // inexistante -> cas A
];
const tD = [];
await doit("D. fbRepositionMyHunts (4779) repositionne les 3 veilles d'Alice", async () => {
  for (const w of veilles) await fbJoinHunt(alice, "alice", w.id, w.name, w.emoji, 50.85, 4.35, tD);
  for (const w of veilles) {
    const d = await getDoc(doc(alice, "hunts", String(w.id)));
    if (!d.exists() || !d.data().seekers.alice) throw new Error("veille " + w.id + " non inscrite");
  }
});
note("D(3 veilles) | => " + tD.length + " aller-retour(s) au total, dont " + refus(tD) + " REFUS pour 3 boissons.");

/* ── E. Le repli est-il COMMENTE dans le code ? (choix assume ou accident) ── */
import fs from "node:fs";
const src = fs.readFileSync("/home/user/magofeed/index.html", "utf8").split("\n");
const zone = src.slice(4544, 4594).join("\n");
await doit("E. le code EXPLIQUE lui-meme les deux replis (c'est un choix, pas un accident)", () => {
  if (!/les regles figent .at./.test(zone)) throw new Error("le 1er repli n'est pas commente");
  if (!/La chasse n'existe pas encore/.test(zone)) throw new Error("le 2e repli n'est pas commente");
});
note("E(intention) | index.html:4561 « Deja chercheur : les regles figent `at` (...) On ne bouge alors que la position »");
note("E(intention) | index.html:4568 « La chasse n'existe pas encore : on la cree avec soi comme seul chercheur. »");

/* ── F. Ce que la personne voit : le refus remonte-t-il a l'ecran ? ──────── */
await doit("F. malgre les refus, fbJoinHunt rend ok=true et le compte exact de chercheurs", async () => {
  const t = [];
  const r = await fbJoinHunt(bob, "bob", 21, "Club-Mate", "", 50.86, 4.34, t);
  if (!r.ok) throw new Error("ok=false");
  if (r.chercheurs !== 2) throw new Error("chercheurs=" + r.chercheurs + " au lieu de 2");
});
note("F(ecran)     | aucun des refus n'atteint la personne : ils sont rattrapes dans le try/catch, "
  + "le resultat rendu est juste. Le cout est en console et en quota, pas en mensonge.");

await bilan(env);
