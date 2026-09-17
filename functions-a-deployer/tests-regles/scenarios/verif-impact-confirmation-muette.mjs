/* VERIFICATION « impact » — « ✓ Stock confirme · +3 pts » alors que rien n'est parti.
 *
 * On rejoue A L'IDENTIQUE les deux ecritures que declenche le bouton OK de la
 * fiche magasin (confirmWithPrice, index.html:6746) :
 *   1. window.fbAddReport(s.fbId||sid, did, "stock", {note:_provenance("fiche",s)})
 *      -> index.html:3310-3351, addDoc("reports", {storeId, drinkId, type, by, byPseudo, createdAt, storeName, lat, lng, tz, note})
 *   2. window.fbConfirmStock(sid, did, 1)
 *      -> index.html:2310-2336, updateDoc("stores/<fbId>", {confirmations.<did> +1, seenAt.<did>, confirmedBy.<did>, confirmedAt.<did>})
 *
 * Les deux fonctions avalent leur erreur (console.warn, index.html:3349 et 2333)
 * et ne renvoient rien. confirmWithPrice ne les attend pas : elle credite +3 pts
 * en local puis affiche toast("✓ Stock confirme · +3 pts") (index.html:6770-6777).
 *
 * On mesure ce que VOIT LA PERSONNE D'EN FACE (le chasseur, qui lit stores en
 * lecture publique) quand la session d'Alice n'a pas pu etre restauree :
 * ensureAuthed leve (index.html:5629-5632), `uid` reste null.
 */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, addDoc, collection,
         serverTimestamp, increment } from "firebase/firestore";

const env = await banc("verif-impact-confirmation-muette");

const alice = env.authenticatedContext("alice").firestore();   // session OK
const perdue = env.unauthenticatedContext().firestore();       // session expiree : ensureAuthed a leve
const bob = env.unauthenticatedContext().firestore();          // le chasseur, qui lit la fiche publique

const SID = "magasin-ixelles";
const DID = 42;
const HEURE = Math.floor(Date.now() / 3600000) * 3600000;      // meme arrondi que index.html:2325

// Le magasin existe deja dans la base (importe). On le pose hors regles.
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), "stores", SID), {
    name: "Delhaize Flagey", lat: 50.83, lng: 4.37, confirmations: {}, addedBy: "import",
  });
});

/* ── 1. Le parcours normal : la session tient. Reference. ───────────────── */
await doit("session OK — le signalement part (reports)", async () => {
  await addDoc(collection(alice, "reports"), {
    storeId: SID, drinkId: DID, type: "stock",
    by: "alice", byPseudo: "Alice", createdAt: serverTimestamp(),
    storeName: "Delhaize Flagey", lat: 50.83, lng: 4.37,
    tz: "Europe/Brussels", note: "fiche|120",
  });
});

await doit("session OK — la confirmation arrive sur la fiche publique (stores)", async () => {
  await updateDoc(doc(alice, "stores", SID), {
    ["confirmations." + DID]: increment(1),
    ["seenAt." + DID]: HEURE,
    ["confirmedBy." + DID]: "Alice",
    ["confirmedAt." + DID]: HEURE,
  });
});

/* ── 2. Le meme geste, session expiree. `by` vaut null (index.html:3345). ── */
await doitEchouer("session expiree — le signalement est refuse (by=null)", async () => {
  await addDoc(collection(perdue, "reports"), {
    storeId: SID, drinkId: DID, type: "stock",
    by: null, byPseudo: "Alice", createdAt: serverTimestamp(),
    storeName: "Delhaize Flagey", lat: 50.83, lng: 4.37,
    tz: "Europe/Brussels", note: "fiche|120",
  });
});

await doitEchouer("session expiree — la confirmation n'atteint pas la fiche publique", async () => {
  await updateDoc(doc(perdue, "stores", SID), {
    ["confirmations." + DID]: increment(1),
    ["seenAt." + DID]: HEURE,
    ["confirmedBy." + DID]: "Alice",
    ["confirmedAt." + DID]: HEURE,
  });
});

/* ── 3. Le meme geste, negatif : doConfirm(...,-1), index.html:6733-6739,
       toast("Signale · +3 pts"). Meme silence. ────────────────────────────── */
await doitEchouer("session expiree — la rupture signalee n'atteint personne", async () => {
  await updateDoc(doc(perdue, "stores", SID), {
    ["confirmations." + DID]: increment(-1),
    ["absentBy." + DID]: "Alice",
    ["absentAt." + DID]: HEURE,
  });
});

/* ── 4. Ce que Bob, le chasseur, lit vraiment sur la fiche. ─────────────── */
let vu = null;
await doit("le chasseur relit la fiche publique", async () => {
  const s = await getDoc(doc(bob, "stores", SID));
  const d = s.data() || {};
  vu = {
    conf: (d.confirmations || {})[DID],
    par: (d.confirmedBy || {})[DID],
    le: (d.seenAt || {})[DID],
  };
});

note("fiche vue par le chasseur apres les DEUX gestes d'Alice : confirmations=" +
     vu.conf + ", confirmedBy=" + vu.par + " — soit UNE seule des deux confirmations annoncees.");
note("index.html:6770-6777 — confirmWithPrice n'attend ni fbAddReport ni fbConfirmStock :");
note("  le toast « ✓ Stock confirme · +3 pts » et le +3 local tombent AVANT tout verdict du serveur.");
note("index.html:3349 / index.html:2333 — les deux echecs finissent en console.warn : l'ecran ne dit rien.");
note("index.html:7537-7546 — adopterScoreServeur remplace ensuite userStats.pts par le score serveur :");
note("  les +3 pts annonces disparaissent a la prochaine ouverture du profil, sans un mot.");

await bilan(env);
