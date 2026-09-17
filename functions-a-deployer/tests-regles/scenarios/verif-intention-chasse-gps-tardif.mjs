/* ============================================================================
   LENTILLE « INTENTION » — le repositionnement GPS d'une chasse est-il un BUG
   ou un CHOIX ?
   ----------------------------------------------------------------------------
   Question unique : le code se tait-il EXPRES quand une chasse lancee sans
   position est repositionnee, ou bien echoue-t-il a faire ce que ses propres
   commentaires annoncent ?

   CE QUE LE DEPOT DIT VOULOIR (trois endroits, tous concordants) :
     index.html:14345-14353   « On cree la chasse tout de suite avec ce qu'on a
                                [...] puis on la REPOSITIONNE des que le GPS
                                repond : cette deuxieme ecriture relance la
                                fonction, cette fois avec un vrai centre. »
     index.html:4775-4778     « En les repositionnant, on relance la fonction
                                avec une vraie position -> elle notifie les gens
                                autour. »
     notifications-push.js:170-173 « Le client la repositionne desormais des que
                                le GPS repond — ce qui repasse ici avec un
                                centre. »
     commit 17e1bfb, point 2  « cette deuxieme ecriture relance la fonction avec
                                un vrai centre » (verifie a l'epoque par
                                « une deuxieme ecriture apres le GPS : 2 »,
                                jamais par ce que la fonction en fait).

   RECOPIE A L'IDENTIQUE :
     index.html:4505          _coarse
     index.html:4545-4592     window.fbJoinHunt (les trois ecritures en repli)
     index.html:4779-4787     window.fbRepositionMyHunts (rappelle fbJoinHunt)
     index.html:4593-4600     window.fbLeaveHunt
     index.html:14344-14372   lancerChasse (l'ordre reel des deux appels)
     notifications-push.js:153-180  notifyHuntNearby (jusqu'aux deux sorties)

   L'emulateur n'execute pas les Cloud Functions : il fait tourner les VRAIES
   regles (c'est lui qui decide laquelle des trois ecritures de fbJoinHunt
   passe), et on rejoue la DECISION de la fonction sur l'etat relu en base.
   ========================================================================== */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, serverTimestamp } from "firebase/firestore";

const env = await banc("verif-intention-chasse-gps-tardif");
const ALICE = "alice", BOB = "bob";
const alice = env.authenticatedContext(ALICE).firestore();
const bob = env.authenticatedContext(BOB).firestore();
const anon = env.unauthenticatedContext().firestore();
const BXL = { lat: 50.8676, lng: 4.3436 };
const verifier = (c, q) => { if (!c) throw new Error(q); };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const lire = async (id) => { const s = await getDoc(doc(anon, "hunts", String(id))); return s.exists() ? s.data() : null; };

/* ── index.html:4505 ─────────────────────────────────────────────────────── */
function _coarse(x) { return Math.round(x * 10) / 10; }

/* ── index.html:4545-4592 : fbJoinHunt, ecritures identiques, meme ordre ─── */
async function fbJoinHunt(db, uid, drinkId, drinkName, emoji, lat, lng) {
  const chemin = [];
  const pos = { lat: lat != null ? _coarse(lat) : null, lng: lng != null ? _coarse(lng) : null };
  const moi = { lat: pos.lat, lng: pos.lng, at: Date.now() };
  const ref = doc(db, "hunts", String(drinkId));
  const commun = { drinkName: String(drinkName || "").slice(0, 60),
                   emoji: String(emoji || "").slice(0, 4), updatedAt: serverTimestamp() };
  const maj = Object.assign({}, commun);
  maj["seekers." + uid] = moi;
  try {
    await updateDoc(ref, maj); chemin.push("A:updateDoc(seekers.uid=objet complet) ACCEPTE");
  } catch (e) {
    chemin.push("A:updateDoc(objet complet) REFUSE(" + (e.code || e.message) + ")");
    try {
      const bouge = Object.assign({}, commun);
      bouge["seekers." + uid + ".lat"] = pos.lat;
      bouge["seekers." + uid + ".lng"] = pos.lng;
      await updateDoc(ref, bouge); chemin.push("B:updateDoc(seekers.uid.lat/lng) ACCEPTE");
    } catch (e2) {
      chemin.push("B:updateDoc(lat/lng) REFUSE(" + (e2.code || e2.message) + ")");
      await setDoc(ref, Object.assign({ drinkId: Number(drinkId) || drinkId,
        seekers: (function () { const o = {}; o[uid] = moi; return o; })() }, commun));
      chemin.push("C:setDoc(creation) ACCEPTE");
    }
  }
  const verif = await getDoc(ref);
  const sk = (verif.exists() && verif.data().seekers) || {};
  let total = 0; Object.keys(sk).forEach((u) => { if (sk[u]) total++; });
  return { chemin, ok: !!sk[uid], chercheurs: total, position: pos.lat != null };
}

/* ── index.html:4593-4600 : fbLeaveHunt ──────────────────────────────────── */
async function fbLeaveHunt(db, uid, drinkId) {
  const patch = {}; patch["seekers." + uid] = null;
  await updateDoc(doc(db, "hunts", String(drinkId)), patch);
}

/* ── notifications-push.js:153-180 : la decision, guard par guard ────────── */
function notifyHuntNearby(before, after) {
  if (!after || !after.seekers) return { envoi: false, sortie: "ligne 158 : pas de seekers" };
  const bSeek = (before && before.seekers) || {}, aSeek = after.seekers || {};
  const newSeekers = Object.keys(aSeek).filter((u) => aSeek[u] && !bSeek[u]);   // ligne 161
  if (!newSeekers.length) return { envoi: false, sortie: "ligne 162 : aucun NOUVEAU chercheur", journal: "AUCUN" };
  let center = null;                                                            // ligne 168
  newSeekers.forEach((u) => { const s = aSeek[u]; if (s && s.lat != null && (!center || s.at > center.at)) center = s; });
  if (!center) return { envoi: false, sortie: "ligne 170 : pas de centre", journal: "alertesAdmin « rien envoye »" };
  return { envoi: true, sortie: "vague autour de " + center.lat + "," + center.lng, nouveaux: newSeekers };
}

/* ══ 1. LE PARCOURS REEL, TELEPHONE NEUF (pas de magoLastPos : index.html:6244
      ne restaure rien, userLat reste null au moment du geste) ══════════════ */
const D = 7, NOM = "Mountain Dew Spark";
let etat0 = null, etat1 = null, etat2 = null, j1 = null, j2 = null;

await doit("le parcours s'execute : chasse creee sans GPS (index.html:14369) puis repositionnee (index.html:14356)", async () => {
  j1 = await fbJoinHunt(alice, ALICE, D, NOM, "🥤", null, null);
  etat1 = await lire(D);
  await pause(25);
  j2 = await fbJoinHunt(alice, ALICE, D, NOM, "🥤", BXL.lat, BXL.lng);
  etat2 = await lire(D);
  verifier(etat2.seekers[ALICE].lat === _coarse(BXL.lat), "la 2e ecriture n'a pas pose la position");
});
note("ecriture 1 (userLat=null) : " + j1.chemin.join(" | "));
note("ecriture 2 (GPS repond)   : " + j2.chemin.join(" | "));
note("seekers apres 1 : " + JSON.stringify(etat1.seekers));
note("seekers apres 2 : " + JSON.stringify(etat2.seekers));

/* CE QUE LES REGLES IMPOSENT, et qui decide de tout : `at` est fige pour un
   chercheur deja inscrit (firestore.rules:1075-1083, chercheurStable), donc la
   2e ecriture NE PEUT PAS repasser par le chemin A. Elle ne bouge que lat/lng
   sur une CLE QUI EXISTAIT DEJA. */
await doit("les regles figent `at` : la 2e ecriture passe forcement par le chemin B (lat/lng seuls)", async () => {
  verifier(/^A:.*REFUSE/.test(j2.chemin[0]), "le chemin A n'a pas ete refuse : " + j2.chemin.join(" | "));
  verifier(j2.chemin.some((c) => /^B:.*ACCEPTE/.test(c)), "le chemin B n'a pas ete pris");
  verifier(etat2.seekers[ALICE].at === etat1.seekers[ALICE].at, "`at` a bouge, la cle serait vue comme neuve");
});

const p1 = notifyHuntNearby(null, etat1);
const p2 = notifyHuntNearby(etat1, etat2);
note("fonction sur l'ecriture 1 : " + (p1.envoi ? "VAGUE" : "RIEN") + " — " + p1.sortie + " — journal : " + (p1.journal || "-"));
note("fonction sur l'ecriture 2 : " + (p2.envoi ? "VAGUE" : "RIEN") + " — " + p2.sortie + " — journal : " + (p2.journal || "-"));

/* ══ 2. LE POINT CONTESTE. Les trois commentaires promettent que la 2e
      ecriture « repasse ici avec un centre ». Le guard de la ligne 162 est
      AVANT le calcul du centre (ligne 168) : le code n'atteint jamais la
      branche que ces commentaires decrivent. ══════════════════════════════ */
await doit("INTENTION DOCUMENTEE : le repositionnement fait partir la vague (index.html:14351-14353)", async () => {
  verifier(p1.envoi || p2.envoi,
    "aucune des deux ecritures ne notifie. 1re -> " + p1.sortie + " / 2e -> " + p2.sortie);
});
await doit("INTENTION DOCUMENTEE : la 2e ecriture atteint au moins le calcul du centre (notifications-push.js:168)", async () => {
  verifier(!/ligne 162/.test(p2.sortie),
    "elle sort AVANT, a la ligne 162 (aucun nouveau chercheur) : la branche `!center` de la ligne 170, "
    + "celle que le commentaire des lignes 170-173 decrit, n'est jamais atteinte");
});

/* ══ 3. Y A-T-IL UN AUTRE CHEMIN qui rattrape ? On epuise les mecanismes que
      l'app declenche vraiment. ═══════════════════════════════════════════ */
await doit("3e repositionnement (index.html:6181/6281, fbRepositionMyHunts) : rattrape-t-il ?", async () => {
  const avant = await lire(D);
  await fbJoinHunt(alice, ALICE, D, NOM, "🥤", 50.9, 4.4);
  const apres = await lire(D);
  const p = notifyHuntNearby(avant, apres);
  note("3e repositionnement -> " + p.sortie);
  verifier(p.envoi, p.sortie);
});

await doit("un AUTRE chercheur (Bob) rejoint la chasse muette d'Alice : la vague part-elle ?", async () => {
  const avant = await lire(D);
  await fbJoinHunt(bob, BOB, D, NOM, "🥤", 50.85, 4.35);
  const apres = await lire(D);
  const p = notifyHuntNearby(avant, apres);
  note("arrivee de Bob -> " + p.sortie);
  verifier(p.envoi, p.sortie);
});

/* Le seul geste qui ré-arme la chasse d'Alice existe, mais rien ne l'indique :
   quitter la chasse (seekers.uid = null) puis la relancer refait une CLE NEUVE. */
await doit("contournement non documente : quitter la chasse puis la relancer avec le GPS re-arme la vague", async () => {
  const avantQuit = await lire(D);
  await fbLeaveHunt(alice, ALICE, D);
  const apresQuit = await lire(D);
  verifier(apresQuit.seekers[ALICE] === null, "seekers.alice n'est pas a null");
  const r = await fbJoinHunt(alice, ALICE, D, NOM, "🥤", BXL.lat, BXL.lng);
  const apres = await lire(D);
  const p = notifyHuntNearby(apresQuit, apres);
  note("quitter puis relancer -> " + r.chemin.join(" | ") + " => " + p.sortie);
  verifier(p.envoi, p.sortie);
  note("aucun ecran de l'app ne propose ce geste apres une chasse muette (avantQuit.seekers="
    + Object.keys(avantQuit.seekers).length + " cles)");
});

/* ══ 4. TEMOIN : avec le GPS deja pret, le meme code notifie. Le defaut est
      bien dans la sequence « sans position puis repositionnee », pas dans la
      fonction en general. ═══════════════════════════════════════════════ */
await doit("TEMOIN : GPS pret au moment du geste -> une seule ecriture, et la vague part", async () => {
  const r = await fbJoinHunt(alice, ALICE, 42, "Ramune Original", "🍾", BXL.lat, BXL.lng);
  const p = notifyHuntNearby(null, await lire(42));
  note("temoin -> " + r.chemin.join(" | ") + " => " + p.sortie);
  verifier(p.envoi, p.sortie);
});

/* ══ 5. L'INTENTION EST-ELLE SEULEMENT REALISABLE ? Un guard qui compte aussi
      « chercheur qui GAGNE une position » aurait fait partir la vague sur
      exactement la meme ecriture. Ce n'est donc pas une impossibilite
      technique qui explique le silence. ════════════════════════════════════ */
function notifyHuntNearby_variante(before, after) {
  const bSeek = (before && before.seekers) || {}, aSeek = (after && after.seekers) || {};
  const news = Object.keys(aSeek).filter((u) => aSeek[u] && !bSeek[u]);
  const repositionnes = Object.keys(aSeek).filter((u) =>
    aSeek[u] && bSeek[u] && bSeek[u].lat == null && aSeek[u].lat != null);
  const tous = news.concat(repositionnes);
  if (!tous.length) return { envoi: false, sortie: "aucun nouveau ni repositionne" };
  let center = null;
  tous.forEach((u) => { const s = aSeek[u]; if (s && s.lat != null && (!center || s.at > center.at)) center = s; });
  if (!center) return { envoi: false, sortie: "pas de centre" };
  return { envoi: true, sortie: "vague autour de " + center.lat + "," + center.lng };
}
await doit("la meme ecriture aurait suffi : un guard qui compte les chercheurs REPOSITIONNES envoie la vague", async () => {
  const p = notifyHuntNearby_variante(etat1, etat2);
  note("variante sur la MEME ecriture 2 -> " + p.sortie);
  verifier(p.envoi, p.sortie);
});

/* ══ 6. CE QUE L'APP PROMET A L'ECRAN pendant ce temps (index.html:14380) ══ */
note("ecran d'Alice, ecriture 1 : ok=" + j1.ok + ", position=" + j1.position
  + " -> « Chasse lancee · tu es le premier a la chercher » + « Position pas encore connue — "
  + "on previendra les gens des que le GPS repond » (index.html:14380)");
note("promesse tenue ? non : la seule trace laissee par la suite est une ligne alertesAdmin "
  + "« rien envoye » (notifications-push.js:174-186), visible de l'admin seul, et encore "
  + "seulement pour la 1re ecriture — la 2e sort ligne 162 sans rien ecrire du tout.");

await bilan(env);
