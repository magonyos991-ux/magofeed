/* ============================================================================
   LENTILLE « IMPACT » — qu'est-ce que ca change pour QUELQU'UN ?
   Trouvaille verifiee : « une chasse lancee avant que le GPS reponde ne
   previent JAMAIS personne » (notifications-push.js:162).

   Ce fichier ne redemontre pas le mecanisme (verif-reproduction-chasse-gps-
   tardif.mjs le fait deja). Il repond a QUATRE questions d'impact :

     Q1. Une personne ordinaire tombe-t-elle dessus ? Et que voit-elle a l'ecran ?
     Q2. La chasse muette reste-t-elle trouvable autrement (l'onglet La chasse) ?
     Q3. Existe-t-il une sortie de secours qu'un utilisateur puisse trouver seul ?
     Q4. Jusqu'ou va le degat : la chasse SUIVANTE est-elle contaminee ?

   Recopie a l'identique (numeros de ligne dans index.html) :
     _coarse                        4550
     window.fbJoinHunt              4545-4592   (les trois ecritures en repli)
     window.fbLeaveHunt             4594-4602
     window.fbLoadNearbyHunts       4617-...    (le filtre de distance)
     window.fbRepositionMyHunts     4779-4787   (rappelle fbJoinHunt)
     lancerChasse                   14344-14400 (l'ordre des deux appels + les toasts)
     refreshLocation                6268-6297   (asynchrone ; 6281 repositionne)
     restauration magoLastPos       6239-6260   (7 jours : rien a restaurer sur un tel neuf)
   Cote serveur (l'emulateur n'execute pas les Cloud Functions : on rejoue la
   DECISION sur l'etat REEL relu en base) :
     notifyHuntNearby               notifications-push.js:153-266
       ligne 158 : pas de seekers
       ligne 162 : aucun NOUVEAU chercheur      <-- la sortie qui nous occupe
       ligne 170 : pas de centre + trace alertesAdmin
       ligne 243+ : les deux verrous anti-spam (_meta), APRES les sorties seches
   ========================================================================== */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, getDocs, collection, query, limit,
         serverTimestamp } from "firebase/firestore";

const env = await banc("verif-impact-chasse-gps-silencieuse");
const ALICE = "alice", BOB = "bob", ADMIN = "admin1";
const alice = env.authenticatedContext(ALICE).firestore();
const bob   = env.authenticatedContext(BOB).firestore();
const anon  = env.unauthenticatedContext().firestore();

const serveur = async (fn) => { let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out; };
const verifier = (c, quoi) => { if (!c) throw new Error(quoi); };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const BXL = { lat: 50.8676, lng: 4.3436 };          // Alice, place Flagey
const BOB_POS = { lat: 50.8946, lng: 4.3436 };      // Bob, 3 km au nord
const DRINK = 13109, NOM = "Mountain Dew Spark";

/* ── index.html:4550 ─────────────────────────────────────────────────────── */
function _coarse(x) { return Math.round(x * 10) / 10; }

/* ── index.html:4545-4592 — window.fbJoinHunt, ecritures identiques.
   Seul ajout : la trace des chemins essayes, que la vraie fonction ne rend pas. */
async function fbJoinHunt(db, uid, drinkId, drinkName, emoji, lat, lng) {
  const trace = [];
  try {
    const pos = { lat: lat != null ? _coarse(lat) : null, lng: lng != null ? _coarse(lng) : null };
    const moi = { lat: pos.lat, lng: pos.lng, at: Date.now() };
    const ref = doc(db, "hunts", String(drinkId));
    const commun = { drinkName: String(drinkName || "").slice(0, 60),
                     emoji: String(emoji || "").slice(0, 4), updatedAt: serverTimestamp() };
    const maj = Object.assign({}, commun);
    maj["seekers." + uid] = moi;
    try { await updateDoc(ref, maj); trace.push("updateDoc direct OK"); }
    catch (e) {
      trace.push("updateDoc direct -> " + (e.code || e.message));
      try {
        const bouge = Object.assign({}, commun);
        bouge["seekers." + uid + ".lat"] = pos.lat;
        bouge["seekers." + uid + ".lng"] = pos.lng;
        await updateDoc(ref, bouge); trace.push("updateDoc imbrique OK");
      } catch (e2) {
        trace.push("updateDoc imbrique -> " + (e2.code || e2.message));
        await setDoc(ref, Object.assign({ drinkId: Number(drinkId) || drinkId,
          seekers: (function () { const o = {}; o[uid] = moi; return o; })() }, commun));
        trace.push("setDoc creation OK");
      }
    }
    let verif = null;
    try { verif = await getDoc(ref); } catch (e0) {}
    const inscrit = !!(verif && verif.exists() && (verif.data().seekers || {})[uid]);
    let total = 0;
    if (verif && verif.exists()) { const sk = verif.data().seekers || {}; Object.keys(sk).forEach((u) => { if (sk[u]) total++; }); }
    return { ok: inscrit, chercheurs: total, position: pos.lat != null, reason: inscrit ? null : "non-inscrit", trace };
  } catch (e) { return { ok: false, reason: "erreur", detail: String(e.code || e.message), trace }; }
}

/* ── index.html:4594-4602 — window.fbLeaveHunt ───────────────────────────── */
async function fbLeaveHunt(db, uid, drinkId) {
  const patch = {}; patch["seekers." + uid] = null;
  await updateDoc(doc(db, "hunts", String(drinkId)), patch);
}

/* ── index.html:4617+ — window.fbLoadNearbyHunts (filtre de distance) ────── */
async function fbLoadNearbyHunts(db, myUid, lat, lng, radiusKm) {
  const snap = await getDocs(query(collection(db, "hunts"), limit(200)));
  const out = [];
  const R = (Number(radiusKm) > 0) ? Number(radiusKm) : 100, fresh = Date.now() - 365 * 86400000;
  snap.forEach((d) => {
    const h = d.data(), seekers = h.seekers || {};
    let near = 0, mine = false, distKm = null;
    Object.keys(seekers).forEach((uid) => {
      const s = seekers[uid]; if (!s) return;
      if (s.at && s.at < fresh) return;
      if (lat != null && s.lat != null) {
        const dLa = (lat - s.lat) * 111, dLo = (lng - s.lng) * 111 * Math.cos(lat * Math.PI / 180);
        const dk = Math.sqrt(dLa * dLa + dLo * dLo);
        if (dk > R) return;
        if (distKm == null || dk < distKm) distKm = dk;
      }
      near++; if (uid === myUid) mine = true;
    });
    if (near > 0) out.push({ drinkId: h.drinkId, drinkName: h.drinkName, seekers: near, mine, distKm });
  });
  return out;
}

/* ── notifications-push.js:153-266 — notifyHuntNearby, la DECISION.
   On rejoue les sorties dans l'ordre exact du fichier, verrous compris. */
const META = {}; // faux _meta, ferme au client par les regles (1044)
async function notifyHuntNearby(avant, apres, drinkIdParam) {
  const before = avant || {}, after = apres || {};
  if (!after || !after.seekers) return { envoi: false, ligne: 158, pourquoi: "pas de seekers" };
  const bSeek = before.seekers || {}, aSeek = after.seekers || {};
  const newSeekers = Object.keys(aSeek).filter((u) => aSeek[u] && !bSeek[u]);
  if (!newSeekers.length) return { envoi: false, ligne: 162, pourquoi: "aucun NOUVEAU chercheur" };
  let center = null;
  newSeekers.forEach((u) => { const s = aSeek[u]; if (s && s.lat != null && (!center || s.at > center.at)) center = s; });
  if (!center) {
    // ligne 176 : la seule trace laissee, dans alertesAdmin
    await serveur(async (db) => {
      await setDoc(doc(db, "alertesAdmin", "trace-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7)), {
        titre: "Chasse « " + String(after.drinkName || "?").slice(0, 40) + " » : rien envoyé",
        corps: "La chasse a été lancée sans position (GPS pas encore prêt).",
        at: serverTimestamp(), pousseesEnvoyees: 0, jetonsTrouves: 0, courrielEnvoye: false,
        type: "hunt", drinkId: String(after.drinkId != null ? after.drinkId : drinkIdParam),
      });
    });
    return { envoi: false, ligne: 170, pourquoi: "pas de centre : chasse sans position", trace: true };
  }
  // lignes 243-263 : les deux verrous, APRES les sorties seches
  const now = Date.now(), lanceur = newSeekers[0];
  const verrous = [
    { cle: "huntPush_d_" + String(after.drinkId != null ? after.drinkId : drinkIdParam), ms: 6 * 3600e3, nom: "boisson" },
    { cle: "huntPush_u_" + lanceur, ms: 45 * 60e3, nom: "personne" },
  ];
  for (const v of verrous) if (now - (META[v.cle] || 0) < v.ms)
    return { envoi: false, ligne: 253, pourquoi: "verrou anti-spam par " + v.nom };
  for (const v of verrous) META[v.cle] = now;
  return { envoi: true, ligne: 266, pourquoi: "vague envoyee autour de " + center.lat + "," + center.lng, centre: center };
}

await serveur(async (db) => { await setDoc(doc(db, "admins", ADMIN), { ok: true }); });
const admin = env.authenticatedContext(ADMIN).firestore();

/* ════════════════════════════════════════════════════════════════════════════
   Q1. UNE PERSONNE ORDINAIRE TOMBE-T-ELLE DESSUS, ET QUE VOIT-ELLE ?
   Telephone neuf : localStorage vide, donc magoLastPos absent (index.html:6243)
   -> userLat vaut null au moment du geste. lancerChasse ecrit tout de suite
   (14368) puis repositionne dans le rappel de refreshLocation (14355).
   ══════════════════════════════════════════════════════════════════════════ */
let r1 = null, r2 = null, etat1 = null, etat2 = null, p1 = null, p2 = null;

await doit("Alice, telephone neuf, lance la chasse : l'ecriture passe (elle est bien inscrite)", async () => {
  r1 = await fbJoinHunt(alice, ALICE, DRINK, NOM, "", null, null);   // userLat = null
  etat1 = (await getDoc(doc(anon, "hunts", String(DRINK)))).data();
  verifier(r1.ok === true, "fbJoinHunt renvoie ok=false : " + JSON.stringify(r1));
});
note("1re ecriture (sans GPS) : " + r1.trace.join(" | "));
note("ECRAN D'ALICE (index.html:14375-14380) : « Alerte activée · zone de 10 km », puis "
   + "« Chasse lancée · tu es le premier à la chercher », puis, parce que r.position="
   + r1.position + " : « Position pas encore connue — on préviendra les gens dès que le GPS répond »");
note("JOURNAL D'ACTIVITE, permanent (index.html:14393-14397) : « On prévient les gens autour de toi. »");

p1 = await notifyHuntNearby(null, etat1, DRINK);
note("serveur, ecriture 1 -> " + (p1.envoi ? "VAGUE" : "RIEN") + " (sortie ligne " + p1.ligne + " : " + p1.pourquoi + ")");

await doit("le GPS repond ~6 s plus tard : l'app repositionne la chasse (index.html:14356 / 6281)", async () => {
  await pause(60);
  r2 = await fbJoinHunt(alice, ALICE, DRINK, NOM, "", BXL.lat, BXL.lng);
  etat2 = (await getDoc(doc(anon, "hunts", String(DRINK)))).data();
  verifier(etat2.seekers[ALICE].lat === _coarse(BXL.lat), "la position n'a pas ete ecrite : " + JSON.stringify(etat2.seekers[ALICE]));
});
note("2e ecriture (avec GPS)  : " + r2.trace.join(" | "));
note("document apres coup : seekers.alice = " + JSON.stringify(etat2.seekers[ALICE])
   + " — il a DESORMAIS une position, rien ne distingue cette chasse d'une chasse saine");

p2 = await notifyHuntNearby(etat1, etat2, DRINK);
note("serveur, ecriture 2 -> " + (p2.envoi ? "VAGUE" : "RIEN") + " (sortie ligne " + p2.ligne + " : " + p2.pourquoi + ")");

await doit("LA PROMESSE FAITE A L'ECRAN EST TENUE : on previent bien les gens des que le GPS repond", async () => {
  verifier(p1.envoi || p2.envoi,
    "aucune des deux ecritures ne notifie. 1re : ligne " + p1.ligne + " (" + p1.pourquoi + ") / 2e : ligne " + p2.ligne + " (" + p2.pourquoi + ")");
});

await doitEchouer("Alice peut lire le journal qui explique pourquoi (alertesAdmin, regles 1234)", async () => {
  await getDocs(query(collection(alice, "alertesAdmin"), limit(1)));
});
await doit("seul l'admin voit la trace « rien envoyé »", async () => {
  const s = await getDocs(query(collection(admin, "alertesAdmin"), limit(10)));
  verifier(s.size >= 1, "aucune trace ecrite");
  note("alertesAdmin contient " + s.size + " ligne(s) — invisible pour Alice, visible du seul fondateur");
});

/* ════════════════════════════════════════════════════════════════════════════
   Q2. LA CHASSE MUETTE EST-ELLE AU MOINS TROUVABLE AUTREMENT ?
   L'onglet « La chasse » lit la collection (fbLoadNearbyHunts), il ne depend
   pas de la poussee. Si Bob ouvre l'app de lui-meme, la voit-il ?
   ══════════════════════════════════════════════════════════════════════════ */
await doit("Bob, a 3 km, qui OUVRE l'app de lui-meme, voit quand meme la chasse dans l'onglet", async () => {
  const l = await fbLoadNearbyHunts(bob, BOB, BOB_POS.lat, BOB_POS.lng, 10);
  const h = l.find((x) => String(x.drinkId) === String(DRINK));
  verifier(h, "la chasse n'apparait meme pas dans la liste : " + JSON.stringify(l));
  note("l'onglet La chasse la montre (" + h.seekers + " chercheur, "
     + (h.distKm == null ? "?" : h.distKm.toFixed(1)) + " km) : la chasse n'est pas INVISIBLE, elle est MUETTE. "
     + "Il faut que Bob ouvre l'app tout seul, au bon moment, et aille dans le bon onglet.");
});

/* ════════════════════════════════════════════════════════════════════════════
   Q3. UNE SORTIE DE SECOURS QU'UN UTILISATEUR PUISSE TROUVER SEUL ?
   Le seul geste qui refait d'Alice un NOUVEAU chercheur : quitter la chasse
   (fbLeaveHunt ecrit null, regles 1069-1083) puis la relancer.
   ══════════════════════════════════════════════════════════════════════════ */
await doit("si Alice RETIRE la veille puis la RELANCE, la vague part enfin", async () => {
  await fbLeaveHunt(alice, ALICE, DRINK);
  const etatParti = (await getDoc(doc(anon, "hunts", String(DRINK)))).data();
  await pause(30);
  const r3 = await fbJoinHunt(alice, ALICE, DRINK, NOM, "", BXL.lat, BXL.lng);
  const etat3 = (await getDoc(doc(anon, "hunts", String(DRINK)))).data();
  const p3 = await notifyHuntNearby(etatParti, etat3, DRINK);
  note("retirer puis relancer -> " + (p3.envoi ? "VAGUE" : "RIEN") + " (ligne " + p3.ligne + ") ; trace " + r3.trace.join(" | "));
  verifier(p3.envoi, "meme retirer puis relancer ne notifie pas : " + p3.pourquoi);
});
note("CE GESTE EXISTE MAIS RIEN NE L'INDIQUE : l'app vient de dire a Alice que tout est parti. "
   + "Personne ne retire une veille qui a l'air de marcher pour la remettre.");

/* ════════════════════════════════════════════════════════════════════════════
   Q4. JUSQU'OU VA LE DEGAT ? Les deux verrous anti-spam sont testes APRES les
   sorties seches (notifications-push.js:243). Une chasse muette ne devrait donc
   pas bruler le quota de 45 min d'Alice.
   ══════════════════════════════════════════════════════════════════════════ */
await doit("BORNE DU DEGAT : la 2e chasse d'Alice, GPS chaud, previent bien les gens (les verrous n'ont pas ete brules par la chasse muette)", async () => {
  // Nouvelle personne pour ne pas subir le verrou de 45 min consomme par Q3.
  const carol = env.authenticatedContext("carol").firestore();
  const r = await fbJoinHunt(carol, "carol", 10035, "Oasis Pomme Cassis", "", null, null); // muette
  const e1 = (await getDoc(doc(anon, "hunts", "10035"))).data();
  const a = await notifyHuntNearby(null, e1, 10035);
  verifier(!a.envoi, "la chasse muette a notifie, contre toute attente");
  const r2b = await fbJoinHunt(carol, "carol", 10088, "Monster Ultra Gold", "", BXL.lat, BXL.lng); // GPS chaud
  const e2 = (await getDoc(doc(anon, "hunts", "10088"))).data();
  const b = await notifyHuntNearby(null, e2, 10088);
  note("chasse muette (ligne " + a.ligne + ") puis chasse suivante avec GPS : " + (b.envoi ? "VAGUE" : "RIEN") + " (ligne " + b.ligne + ")");
  verifier(b.envoi, "la chasse muette a contamine la suivante : " + b.pourquoi);
});

await bilan(env);
