/* ============================================================================
   « ✓ STOCK CONFIRME · +3 PTS » — EST-CE UN CHOIX OU UN DEFAUT ?
   ----------------------------------------------------------------------------
   Ce scenario ne juge pas l'ecran : il mesure CE QUI RESTE EN BASE quand
   l'application vient d'afficher « ✓ Stock confirme · +3 pts ».

   Fonctions rejouees, a l'identique (numeros de ligne dans index.html) :
     window.fbAddReport      3316-3352  (le rapport qui paie les points)
     window.fbConfirmStock   2311-2336  (la mise a jour qui remplit la carte)
     confirmWithPrice        6747-6779  (l'appelant : l'ordre exact des gestes)
     ensureAuthed            5604-5642  (ce qui met `uid` a null)

   Deux situations, la meme suite de gestes :
     A. session absente  — ensureAuthed a leve, `by` vaut null
     B. session presente — un compte (anonyme) repond
   ========================================================================== */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import {
  doc, setDoc, updateDoc, getDoc, getDocs, addDoc, collection,
  serverTimestamp, increment,
} from "firebase/firestore";

const env = await banc("verif-intention-confirmation-muette");

const alice = env.authenticatedContext("alice").firestore();   // session presente
const anon = env.unauthenticatedContext().firestore();         // session absente
const serveur = async (fn) => {
  let out;
  await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); });
  return out;
};
const verifier = (cond, quoi) => { if (!cond) throw new Error(quoi); };

/* ── Le decor : un magasin deja en base, une boisson du catalogue ────────── */
const BOISSON = 7;
const MAGASIN = { id: "st-delhaize-flagey", fbId: "st-delhaize-flagey",
                  name: "Delhaize Flagey", lat: 50.8281, lng: 4.3720 };
const STORES = [MAGASIN];
const PSEUDO = "Zdoudex";                       // localStorage magopseudo

await serveur(async (db) => {
  await setDoc(doc(db, "stores", MAGASIN.fbId), {
    name: MAGASIN.name, lat: MAGASIN.lat, lng: MAGASIN.lng,
    drinks: [BOISSON], confirmations: {}, addedBy: "alice",
  });
});

/* ══ COPIE CONFORME : index.html:3316-3352 — window.fbAddReport ═══════════
   Seule difference : `uid` arrive en argument (dans l'app il vient de
   ensureAuthed, qui rend null quand elle leve, ligne 3321) et l'erreur est
   renvoyee au lieu d'etre avalee par console.warn (ligne 3350) — c'est
   justement ce que l'appelant ne peut pas voir. */
async function fbAddReport(db, uid, storeId, drinkId, type, plus) {
  const st = STORES.find((x) => String(x.id) === String(storeId) || String(x.fbId) === String(storeId));
  const extra = {};
  if (st) {
    if (st.name) extra.storeName = String(st.name).slice(0, 60);
    if (typeof st.lat === "number" && typeof st.lng === "number") {
      extra.lat = Math.round(st.lat * 100) / 100;
      extra.lng = Math.round(st.lng * 100) / 100;
    }
  }
  extra.tz = "Europe/Brussels";
  await addDoc(collection(db, "reports"), Object.assign({
    storeId: storeId,
    drinkId: drinkId,
    type: type,
    by: uid || null,
    byPseudo: PSEUDO.slice(0, 24),
    createdAt: serverTimestamp(),
  }, extra, (plus && plus.note != null) ? { note: String(plus.note).slice(0, 300) } : {}));
}

/* ══ COPIE CONFORME : index.html:2311-2336 — window.fbConfirmStock ════════
   A noter : cette fonction n'appelle PAS ensureAuthed. Elle ecrit avec la
   session telle qu'elle est a cet instant. */
async function fbConfirmStock(db, storeId, drinkId, value) {
  const s = STORES.find((x) => x.id === storeId || x.fbId === storeId);
  if (!s || !s.fbId) return "sans-fbId";        // sortie muette, ligne 2314
  const updates = {};
  updates["confirmations." + drinkId] = increment(value);
  const qui = PSEUDO.slice(0, 24);
  const quand = Math.floor(Date.now() / 3600000) * 3600000;
  if (value > 0) {
    updates["seenAt." + drinkId] = quand;
    updates["confirmedBy." + drinkId] = qui;
    updates["confirmedAt." + drinkId] = quand;
  } else {
    updates["absentBy." + drinkId] = qui;
    updates["absentAt." + drinkId] = quand;
  }
  await updateDoc(doc(db, "stores", s.fbId), updates);
  return "ecrit";
}

/* index.html:14858 — _provenance("fiche", s) */
const provenance = "fiche|412";

/* ══════════════════════════════════════════════════════════════════════════
   A. SESSION ABSENTE — c'est le cas ou ensureAuthed leve (index.html:5633 ou
      5640) et ou `uid` reste null (ligne 3321).
   ═════════════════════════════════════════════════════════════════════════ */
await doitEchouer("A1. le rapport `by: null` est refuse par les regles (reports, create)", async () => {
  await fbAddReport(anon, null, MAGASIN.fbId, BOISSON, "stock", { note: provenance });
});

await doitEchouer("A2. la mise a jour du magasin est refusee elle aussi (stores exige isSignedIn)", async () => {
  await fbConfirmStock(anon, MAGASIN.id, BOISSON, 1);
});

const apresA = await serveur(async (db) => {
  const rs = await getDocs(collection(db, "reports"));
  const st = await getDoc(doc(db, "stores", MAGASIN.fbId));
  const d = st.data() || {};
  return { rapports: rs.size, conf: (d.confirmations || {})[BOISSON], vu: (d.confirmedBy || {})[BOISSON] };
});
await doit("A3. apres l'ecran « ✓ Stock confirme · +3 pts » : RIEN n'est en base", async () => {
  verifier(apresA.rapports === 0, "rapports en base : " + apresA.rapports);
  verifier(apresA.conf === undefined, "confirmations ecrite : " + apresA.conf);
  verifier(apresA.vu === undefined, "confirmedBy ecrit : " + apresA.vu);
});
note("A. mesure : 0 rapport, 0 confirmation, aucun « vu par » — l'ecran a pourtant dit « ✓ Stock confirme · +3 pts » (index.html:6777).");

/* ══════════════════════════════════════════════════════════════════════════
   B. SESSION PRESENTE — la meme suite de gestes, un compte qui repond.
      Sert de temoin : si B passe, c'est bien la session, et non le scenario,
      qui fait echouer A.
   ═════════════════════════════════════════════════════════════════════════ */
await doit("B1. le meme rapport, signe, est accepte", async () => {
  await fbAddReport(alice, "alice", MAGASIN.fbId, BOISSON, "stock", { note: provenance });
});
await doit("B2. la meme mise a jour du magasin passe", async () => {
  const r = await fbConfirmStock(alice, MAGASIN.id, BOISSON, 1);
  verifier(r === "ecrit", "sortie inattendue : " + r);
});
const apresB = await serveur(async (db) => {
  const rs = await getDocs(collection(db, "reports"));
  const st = await getDoc(doc(db, "stores", MAGASIN.fbId));
  const d = st.data() || {};
  return { rapports: rs.size, conf: (d.confirmations || {})[BOISSON], vu: (d.confirmedBy || {})[BOISSON] };
});
await doit("B3. cette fois la base porte le rapport ET la confirmation", async () => {
  verifier(apresB.rapports === 1, "rapports : " + apresB.rapports);
  verifier(apresB.conf === 1, "confirmations : " + apresB.conf);
  verifier(apresB.vu === PSEUDO, "confirmedBy : " + apresB.vu);
});
note("B. mesure : 1 rapport, confirmations[7] = 1, « vu par Zdoudex ». Le scenario est donc fidele : seule la session change entre A et B.");

/* ══════════════════════════════════════════════════════════════════════════
   C. LE MAGASIN SANS fbId — sortie muette de fbConfirmStock (ligne 2314),
      sans aucune regle en cause : c'est du JavaScript, pas de la securite.
   ═════════════════════════════════════════════════════════════════════════ */
await doit("C1. magasin connu de l'app mais pas de la base : fbConfirmStock sort sans ecrire", async () => {
  STORES.push({ id: "osm-9999", name: "Night shop Flagey", lat: 50.83, lng: 4.37 });
  const r = await fbConfirmStock(alice, "osm-9999", BOISSON, 1);
  verifier(r === "sans-fbId", "sortie : " + r);
});
note("C. index.html:2314 — `if(!s || !s.fbId) return;` : aucune erreur n'est levee, donc meme un appelant qui attendrait la promesse ne verrait rien. L'ecran affiche « ✓ Stock confirme · +3 pts ».");

/* ══════════════════════════════════════════════════════════════════════════
   D. CE QUE FAIT DEJA LE RESTE DU DEPOT, pour comparaison.
   ═════════════════════════════════════════════════════════════════════════ */
note("D. index.html:4534-4544 — le depot ecrit lui-meme, au-dessus de fbJoinHunt : « CETTE FONCTION MENTAIT PAR OMISSION […] Elle rend desormais un resultat. Celui qui l'appelle DOIT le lire. » fbAddReport (3350) et fbConfirmStock (2334) tiennent encore le `catch { console.warn }` decrit.");
note("E. index.html:3359-3363 — fbReportBadBarcode, ecrite pour le meme besoin, teste `if (!uid) return;` avec le commentaire « sans session, l'ecriture serait refusee en silence. Mieux vaut le dire que de faire croire a un envoi. » fbAddReport, dix lignes plus haut, envoie quand meme `by: null`.");

await bilan(env);
