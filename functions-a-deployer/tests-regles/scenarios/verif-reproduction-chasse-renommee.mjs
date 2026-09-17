/* ============================================================================
   VERIFICATION INDEPENDANTE — « un connecte peut renommer/repointer la chasse
   d'autrui » (regles hunts, firestore.rules:1086-1097).

   Je n'utilise PAS le document hunts/42 du scenario d'origine : 42 n'est pas
   une boisson du catalogue (data/drinks.js). Je prends la boisson 7
   (« Mountain Dew Spark »), qui EXISTE vraiment, pour que la consequence
   « la chasse disparait des listes » soit mesurable et pas un artefact.

   Fonctions rejouees a l'identique :
     window.fbJoinHunt        index.html:4545-4590
     window.fbLoadNearbyHunts index.html:4616-4661
     renderChasse (mapping)   index.html:21861-21871
     _peindreChasse (filtre)  index.html:21892-21900
     notifyHuntNearby (corps) functions-a-deployer/notifications-push.js:189 + 288
   ========================================================================== */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, getDocs, collection, query, limit,
         serverTimestamp } from "firebase/firestore";

const env = await banc("verif-chasse-renommee");
const ALICE = "alice", BOB = "bob";
const alice = env.authenticatedContext(ALICE).firestore();
const bob   = env.authenticatedContext(BOB).firestore();
const anon  = env.unauthenticatedContext().firestore();

const BXL = { lat: 50.8676, lng: 4.3436 };
const BOISSON = 7, NOM = "Mountain Dew Spark";
/* Extrait fidele du catalogue : seule la boisson 7 existe ici, comme dans
   data/drinks.js ou 999 est absent (verifie : 4599 identifiants, pas de 999). */
const DRINKS = [{ id: 7, name: NOM }];

/* index.html:4515 */
const _coarse = (x) => Math.round(x * 10) / 10;

/* index.html:4545-4590 — window.fbJoinHunt, copie conforme */
async function fbJoinHunt(db, uid, drinkId, drinkName, emoji, lat, lng) {
  const pos = { lat: lat != null ? _coarse(lat) : null, lng: lng != null ? _coarse(lng) : null };
  const moi = { lat: pos.lat, lng: pos.lng, at: Date.now() };
  const ref = doc(db, "hunts", String(drinkId));
  const commun = { drinkName: String(drinkName || "").slice(0, 60),
                   emoji: String(emoji || "").slice(0, 4), updatedAt: serverTimestamp() };
  const maj = Object.assign({}, commun); maj["seekers." + uid] = moi;
  try { await updateDoc(ref, maj); return "updateDoc direct"; }
  catch (e) {
    try {
      const bouge = Object.assign({}, commun);
      bouge["seekers." + uid + ".lat"] = pos.lat;
      bouge["seekers." + uid + ".lng"] = pos.lng;
      await updateDoc(ref, bouge); return "updateDoc imbrique";
    } catch (e2) {
      await setDoc(ref, Object.assign({ drinkId: Number(drinkId) || drinkId,
        seekers: (() => { const o = {}; o[uid] = moi; return o; })() }, commun));
      return "setDoc creation";
    }
  }
}

/* index.html:4616-4661 — window.fbLoadNearbyHunts, sans le cache (un seul tir) */
async function fbLoadNearbyHunts(db, myUid, lat, lng, radiusKm) {
  const snap = await getDocs(query(collection(db, "hunts"), limit(200)));
  const out = [], R = (Number(radiusKm) > 0) ? Number(radiusKm) : 100;
  const fresh = Date.now() - 365 * 86400000;
  snap.forEach((d) => {
    const h = d.data(), seekers = h.seekers || {};
    let near = 0, mine = false, distKm = null, lastAt = null;
    Object.keys(seekers).forEach((uid) => {
      const s = seekers[uid]; if (!s) return;
      if (s.at && s.at < fresh) return;
      if (lat != null && s.lat != null) {
        const dLa = (lat - s.lat) * 111, dLo = (lng - s.lng) * 111 * Math.cos(lat * Math.PI / 180);
        const dk = Math.sqrt(dLa * dLa + dLo * dLo);
        if (dk > R) return;
        if (distKm == null || dk < distKm) distKm = dk;
      }
      if (s.at && (lastAt == null || s.at > lastAt)) lastAt = s.at;
      near++; if (uid === myUid) mine = true;
    });
    if (near > 0) out.push({ drinkId: h.drinkId, drinkName: h.drinkName, emoji: h.emoji,
                             seekers: near, mine, distKm, lastAt });
  });
  return out;
}

/* index.html:21861-21871 puis 21892-21900 : ce que l'onglet Chasse affiche
   REELLEMENT a quelqu'un qui n'a pas de veille locale sur cette boisson. */
function lignesAffichees(hunts) {
  const demande = {};
  (hunts || []).forEach((h) => {
    const k = String(h.drinkId);
    demande[k] = { id: Number(h.drinkId), chercheurs: h.seekers || 0, moi: !!h.mine };
  });
  return Object.keys(demande).map((k) => demande[k]).filter((x) => {
    const d = DRINKS.find((y) => Number(y.id) === Number(x.id));
    if (!d) return false;            // index.html:21898
    x.d = d; return true;
  });
}

/* notifications-push.js:189 + 288 — le texte exact de la poussee. */
const corpsPoussee = (h) =>
  "Quelqu'un cherche « " + String(h.drinkName || "une boisson").slice(0, 40)
  + " ». Si tu la vois en magasin, signale-la et gagne des points.";

/* ── 1. Alice lance sa chasse par le vrai chemin de l'app ───────────────── */
await doit("Alice lance sa chasse sur la boisson 7 (fbJoinHunt, index.html:4545)", async () => {
  const chemin = await fbJoinHunt(alice, ALICE, BOISSON, NOM, "", BXL.lat, BXL.lng);
  note("chemin emprunte par fbJoinHunt : " + chemin);
  const d = (await getDoc(doc(anon, "hunts", "7"))).data();
  if (d.drinkName !== NOM) throw new Error("nom inattendu : " + d.drinkName);
});
{
  const l = lignesAffichees(await fbLoadNearbyHunts(bob, BOB, BXL.lat, BXL.lng, 50));
  note("AVANT — ce que l'onglet Chasse de Bob affiche : " + JSON.stringify(l.map((x) => ({ id: x.id, chercheurs: x.chercheurs }))));
  const d = (await getDoc(doc(anon, "hunts", "7"))).data();
  note("AVANT — poussee envoyee au quartier : " + corpsPoussee(d));
}

/* ── 2. Bob, simple compte connecte, jamais chercheur de cette chasse ───── */
await doitEchouer("Bob ne renomme pas la chasse d'Alice (regles 1091)", async () => {
  await updateDoc(doc(bob, "hunts", "7"), { drinkName: "PIRATE — appelle le 0900" });
});
await doitEchouer("Bob ne repointe pas la chasse d'Alice sur une boisson inexistante (regles 1091)", async () => {
  await updateDoc(doc(bob, "hunts", "7"), { drinkId: 999 });
});
await doitEchouer("Bob ne change pas l'emoji de la chasse d'Alice", async () => {
  await updateDoc(doc(bob, "hunts", "7"), { emoji: "💀" });
});

/* ── 3. Temoin : un visiteur SANS COMPTE doit etre refuse (isSignedIn) ──── */
await doitEchouer("TEMOIN — un visiteur sans compte ne renomme pas la chasse", async () => {
  await updateDoc(doc(anon, "hunts", "7"), { drinkName: "sans compte" });
});

/* ── 4. Ce que la base contient apres, et ce que l'app en fait ──────────── */
{
  const d = (await getDoc(doc(anon, "hunts", "7"))).data();
  note("APRES — hunts/7 : drinkName=" + JSON.stringify(d.drinkName)
       + " drinkId=" + JSON.stringify(d.drinkId)
       + " ; seekers = " + JSON.stringify(Object.keys(d.seekers || {})));
  note("APRES — poussee envoyee au quartier (notifications-push.js:288) : " + corpsPoussee(d));
  const l = lignesAffichees(await fbLoadNearbyHunts(bob, BOB, BXL.lat, BXL.lng, 50));
  note("APRES — ce que l'onglet Chasse de Bob affiche : " + JSON.stringify(l.map((x) => ({ id: x.id, chercheurs: x.chercheurs })))
       + (l.length ? "" : "  << liste VIDE : index.html:21898 ecarte le drinkId 999, inconnu du catalogue"));
  const brut = await fbLoadNearbyHunts(alice, ALICE, BXL.lat, BXL.lng, 50);
  note("APRES — Alice est pourtant toujours la seule chercheuse en base : " + JSON.stringify(brut));
}

/* ── 5. Le meme abus par le chemin officiel de l'app, expose sur window ─── */
await doitEchouer("Bob ne renomme pas la chasse en la REJOIGNANT (window.fbJoinHunt, index.html:4545, appelable depuis la console)", async () => {
  const avant = (await getDoc(doc(anon, "hunts", "7"))).data().drinkName;
  await fbJoinHunt(bob, BOB, BOISSON, "GAGNE 500 EUR : magofeed-cadeau.example", "", BXL.lat, BXL.lng);
  const apres = (await getDoc(doc(anon, "hunts", "7"))).data().drinkName;
  if (apres === avant) throw new Error("le nom n'a pas bouge");
});

await bilan(env);
