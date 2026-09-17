/* ============================================================================
   VERIFICATION « IMPACT » — deux ecritures refusees avant la bonne
   ----------------------------------------------------------------------------
   Trouvaille a verifier : « Une chasse coute deux ecritures refusees avant la
   bonne, a chaque lancement » (nature annoncee : choix / mineur).

   Ma seule question : QU'EST-CE QUE CA CHANGE POUR QUELQU'UN ?
   Donc je ne compte pas les allers-retours dans l'abstrait : je rejoue le
   GESTE reel — une personne appuie sur « Lancer la chasse » — et je regarde ce
   qui s'affiche a l'ecran a la fin.

   CE QUE FAIT VRAIMENT CE GESTE (index.html:14345-14388, fonction lancerChasse) :
     - 14356 : fbJoinHunt() est appele UNE PREMIERE FOIS dans le rappel de
               refreshLocation, quand le GPS repond. Son resultat est IGNORE.
     - 14369 : fbJoinHunt() est appele UNE DEUXIEME FOIS, tout de suite, et
               c'est CE resultat-la qui decide du message affiche :
                 ok=true  -> « Chasse lancee · tu es le premier a la chercher »
                 ok=false -> « La chasse n'est pas partie — verifie ta
                              connexion, puis relance-la » + son d'erreur.
   Un lancement, ce n'est donc pas UN fbJoinHunt, c'en est DEUX.

   fbJoinHunt lui-meme : index.html:4545-4593 (le repli a trois etages).
   fbRepositionMyHunts : index.html:4779-4787 (boucle fbJoinHunt sur toutes les
   veilles, declenchee a 6181 et 6281 des que le GPS repond).
   ========================================================================== */
import { banc, doit, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, serverTimestamp } from "firebase/firestore";

const env = await banc("verif-impact-chasse-deux-refus");
const alice = env.authenticatedContext("alice").firestore();
const bob = env.authenticatedContext("bob").firestore();

/* index.html:4505 */
function _coarse(x) { return Math.round(x * 10) / 10; }

/* ── Copie conforme de window.fbJoinHunt (index.html:4545-4593). ───────────
   Seuls ajouts : `uid` (le banc n'a pas ensureAuthed) et `j`, le journal des
   allers-retours. Rien d'autre n'est change : memes champs, meme ordre, meme
   relecture getDoc de controle (4578). */
async function fbJoinHunt(db, uid, drinkId, drinkName, emoji, lat, lng, j) {
  try {
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
      await updateDoc(ref, maj); j.push({ k: "ecriture", nom: "updateDoc direct", ok: true });
    } catch (e) {
      j.push({ k: "ecriture", nom: "updateDoc direct", ok: false, code: e.code || e.message });
      try {
        const bouge = Object.assign({}, commun);
        bouge["seekers." + uid + ".lat"] = pos.lat;
        bouge["seekers." + uid + ".lng"] = pos.lng;
        await updateDoc(ref, bouge); j.push({ k: "ecriture", nom: "updateDoc imbrique", ok: true });
      } catch (e2) {
        j.push({ k: "ecriture", nom: "updateDoc imbrique", ok: false, code: e2.code || e2.message });
        await setDoc(ref, Object.assign({
          drinkId: Number(drinkId) || drinkId,
          seekers: (function () { const o = {}; o[uid] = moi; return o; })(),
        }, commun));
        j.push({ k: "ecriture", nom: "setDoc creation", ok: true });
      }
    }
    let verif = null;
    try { verif = await getDoc(ref); j.push({ k: "lecture", nom: "getDoc de controle", ok: true }); } catch (e0) {}
    const inscrit = !!(verif && verif.exists() && (verif.data().seekers || {})[uid]);
    let total = 0;
    if (verif && verif.exists()) {
      const sk = verif.data().seekers || {};
      Object.keys(sk).forEach((u) => { if (sk[u]) total++; });
    }
    return { ok: inscrit, chercheurs: total, position: pos.lat != null,
             reason: inscrit ? null : "non-inscrit" };
  } catch (e) {
    /* index.html:4590 — le catch exterieur. C'est lui qui produit ok:false. */
    j.push({ k: "ecriture", nom: "setDoc creation", ok: false, code: e.code || e.message });
    return { ok: false, reason: "erreur", detail: String(e.code || e.message).slice(0, 140) };
  }
}

/* Ce que la personne LIT, mot pour mot (index.html:14370-14384). */
function ecran(r) {
  if (!r || !r.ok) return "SON D'ERREUR + « La chasse n'est pas partie — verifie ta connexion, puis relance-la »";
  const n = Number(r.chercheurs) || 1;
  let t = n > 1 ? "« Chasse lancee · vous etes " + n + " a la chercher »"
                : "« Chasse lancee · tu es le premier a la chercher »";
  if (!r.position) t += " + « Position pas encore connue — on previendra les gens des que le GPS repond »";
  return t;
}

const ecr = (j) => j.filter((x) => x.k === "ecriture");
const ref_ = (j) => j.filter((x) => x.k === "ecriture" && !x.ok);
const lec = (j) => j.filter((x) => x.k === "lecture");
function detail(j) { return j.map((x) => x.nom + (x.ok ? " OK" : " REFUSEE(" + x.code + ")")).join(" | "); }

/* ═══ 1. LE GESTE REEL : Alice appuie sur « Lancer la chasse » ══════════════
   Cas courant : le GPS d'un telephone met 1 a 10 s a repondre, donc l'appel
   immediat de 14369 part le premier et le rappel de 14356 suit. Je rejoue les
   deux, dans cet ordre. */
const j14369 = [], j14356 = [];
let vu = null;
await doit("1. Alice lance une chasse neuve : l'ecran lui dit la verite", async () => {
  const r = await fbJoinHunt(alice, "alice", 7, "Ramune Original", "", 50.8676, 4.3436, j14369); // 14369
  vu = ecran(r);
  await fbJoinHunt(alice, "alice", 7, "Ramune Original", "", 50.8676, 4.3436, j14356);           // 14356
  const d = await getDoc(doc(alice, "hunts", "7"));
  if (!d.exists() || !d.data().seekers.alice) throw new Error("Alice n'est pas inscrite en base");
  if (!/Chasse lancee/.test(vu)) throw new Error("l'ecran annonce un echec : " + vu);
});
note("GESTE 1 | appel 14369 (celui qui parle) : " + detail(j14369));
note("GESTE 1 | appel 14356 (muet, apres GPS) : " + detail(j14356));
const totE = ecr(j14369).length + ecr(j14356).length, totR = ref_(j14369).length + ref_(j14356).length;
note("GESTE 1 | UN appui sur « Lancer la chasse » = " + totE + " ecritures dont " + totR
  + " REFUSEES, plus " + (lec(j14369).length + lec(j14356).length) + " lectures.");
note("GESTE 1 | ce que la personne LIT : " + vu);

/* ═══ 2. Bob rejoint une chasse qui existe deja ════════════════════════════ */
const j2a = [], j2b = [];
let vu2 = null;
await doit("2. Bob rejoint la chasse d'Alice : l'ecran lui dit la verite", async () => {
  const r = await fbJoinHunt(bob, "bob", 7, "Ramune Original", "", 50.8946, 4.3436, j2a);
  vu2 = ecran(r);
  await fbJoinHunt(bob, "bob", 7, "Ramune Original", "", 50.8946, 4.3436, j2b);
  if (!/vous etes 2/.test(vu2)) throw new Error("le compte annonce est faux : " + vu2);
});
note("GESTE 2 | appel 14369 : " + detail(j2a));
note("GESTE 2 | appel 14356 : " + detail(j2b));
note("GESTE 2 | " + (ecr(j2a).length + ecr(j2b).length) + " ecritures dont "
  + (ref_(j2a).length + ref_(j2b).length) + " REFUSEES. Ce que Bob LIT : " + vu2);

/* ═══ 3. Chaque REOUVERTURE de l'app : fbRepositionMyHunts (4779) ══════════
   Declenche a 6181 / 6281 des que le GPS repond, une fois par session, sur
   TOUTES les veilles. Aucun de ces appels n'affiche quoi que ce soit. */
const veilles = [
  { id: 7, name: "Ramune Original", emoji: "" },
  { id: 21, name: "Club-Mate", emoji: "" },
  { id: 34, name: "Fritz-Kola", emoji: "" },
  { id: 55, name: "Thums Up", emoji: "" },
  { id: 61, name: "Inca Kola", emoji: "" },
];
const j3 = [];
await doit("3. Alice rouvre l'app avec 5 veilles : fbRepositionMyHunts les replace toutes", async () => {
  for (const w of veilles) await fbJoinHunt(alice, "alice", w.id, w.name, w.emoji, 50.85, 4.35, j3);
  for (const w of veilles) {
    const d = await getDoc(doc(alice, "hunts", String(w.id)));
    if (!d.exists() || !d.data().seekers.alice) throw new Error("veille " + w.id + " perdue");
  }
});
note("REOUVERTURE | 5 veilles = " + ecr(j3).length + " ecritures dont " + ref_(j3).length
  + " REFUSEES, en silence total (4786 : `catch (e) { /* silencieux */ }`).");

/* ═══ 4. Une fois la base chaude, le refus est-il PERMANENT ? ══════════════
   Alice est deja chercheuse de 7 ; elle ne bouge plus. Elle rouvre l'app dix
   fois. Est-ce que le premier updateDoc finit par passer, ou refuse-t-il a
   chaque fois ? */
const j4 = [];
await doit("4. dix reouvertures d'affilee sur une veille stable", async () => {
  for (let i = 0; i < 10; i++) await fbJoinHunt(alice, "alice", 7, "Ramune Original", "", 50.85, 4.35, j4);
});
note("STABLE | 10 reouvertures = " + ecr(j4).length + " ecritures dont " + ref_(j4).length
  + " REFUSEES. Le refus ne « s'apprend » pas : il revient a l'identique chaque fois.");

/* ═══ 5. LE POINT QUI DECIDE DE L'IMPACT ══════════════════════════════════
   Les deux appels de lancerChasse (14356 et 14369) ne sont pas en file : le
   premier part dans un rappel GPS, le second tout de suite. Si le GPS a une
   position en cache, il repond en quelques millisecondes et les deux chaines
   se CROISENT — d'autant plus facilement que le repli rallonge chacune de deux
   allers-retours. Que lit alors la personne ? */
const jA = [], jB = [];
let vuC = null, etat = null;
await doit("5. les deux appels de lancerChasse partent en meme temps (GPS en cache)", async () => {
  const [rB] = await Promise.all([
    fbJoinHunt(alice, "alice", 90, "Calpis Water", "", 50.8676, 4.3436, jB),  // 14369, celui qui parle
    fbJoinHunt(alice, "alice", 90, "Calpis Water", "", 50.8676, 4.3436, jA),  // 14356, muet
  ]);
  vuC = ecran(rB);
  const d = await getDoc(doc(alice, "hunts", "90"));
  etat = d.exists() && !!d.data().seekers.alice;
});
note("COURSE | appel 14369 : " + detail(jB));
note("COURSE | appel 14356 : " + detail(jA));
note("COURSE | en base, Alice est inscrite ? " + (etat ? "OUI" : "NON"));
note("COURSE | ce que la personne LIT : " + vuC);
await doit("5bis. l'ecran ne ment pas : ce qui est annonce correspond a ce qui est en base", () => {
  const annonceLance = /Chasse lancee/.test(vuC);
  if (annonceLance !== etat) {
    throw new Error("l'ecran dit " + (annonceLance ? "« lancee »" : "« pas partie »")
      + " alors qu'en base la chasse est " + (etat ? "BIEN lancee" : "absente") + " -> " + vuC);
  }
});

/* ═══ 6. Le prix en temps : combien de temps d'attente en plus ? ══════════ */
const t0 = Date.now();
const j6 = []; await fbJoinHunt(alice, "alice", 77, "Ramune Melon", "", 50.85, 4.35, j6);
const dureeCreation = Date.now() - t0;
const t1 = Date.now();
const j7 = []; await fbJoinHunt(alice, "alice", 77, "Ramune Melon", "", 50.86, 4.36, j7);
const dureeBouge = Date.now() - t1;
note("TEMPS | creation (" + ecr(j6).length + " ecritures) : " + dureeCreation + " ms sur l'emulateur local ; "
  + "repositionnement (" + ecr(j7).length + " ecritures) : " + dureeBouge + " ms.");
note("TEMPS | l'emulateur est en boucle locale (<5 ms l'aller-retour). Sur un telephone en 4G "
  + "(aller-retour ~150 ms), les 2 refus de la creation ajoutent ~300 ms AVANT le message "
  + "« Chasse lancee », qui n'est affiche qu'apres le .then() de 14369.");

/* ═══ 7. LA BORNE : le repli PEUT-IL faire mentir l'ecran ? ════════════════
   Le 3e etage (setDoc) ecrase le document entier. Si un AUTRE appel a deja
   cree la chasse avec un `at` different, ce setDoc devient un `update` que la
   regle chercheurStable (firestore.rules:1075-1084) REFUSE — et cette fois le
   refus sort du try/catch interieur, tombe dans le catch de 4590, et rend
   ok:false. Or c'est CE resultat qui ecrit le message a l'ecran.
   Je construis exactement cette situation, pour savoir ce qu'elle donnerait. */
const j7a = [], j7b = [];
let vuMenteur = null, etat7 = null;
await doit("7. l'appel MUET cree la chasse en premier, puis l'appel qui parle arrive", async () => {
  await fbJoinHunt(alice, "alice", 99, "Yuzu Sparkling", "", 50.85, 4.35, j7a); // 14356 gagne la creation
  await new Promise((r) => setTimeout(r, 5));                                    // `at` differera
  /* Pour rejouer l'appel de 14369 tel qu'il serait s'il avait demarre AVANT la
     creation, je force son chemin : ses deux updateDoc ont ete decides sur un
     document absent, il finit donc au setDoc. C'est la seule branche qui reste. */
  const ref = doc(alice, "hunts", "99");
  const moi = { lat: 50.9, lng: 4.4, at: Date.now() };
  let r14369;
  try {
    await setDoc(ref, { drinkId: 99, seekers: { alice: moi }, drinkName: "Yuzu Sparkling",
                        emoji: "", updatedAt: serverTimestamp() });
    j7b.push({ k: "ecriture", nom: "setDoc creation", ok: true });
    r14369 = { ok: true, chercheurs: 1, position: true, reason: null };
  } catch (e) {
    j7b.push({ k: "ecriture", nom: "setDoc creation", ok: false, code: e.code || e.message });
    r14369 = { ok: false, reason: "erreur", detail: String(e.code || e.message) };
  }
  vuMenteur = ecran(r14369);
  const d = await getDoc(ref);
  etat7 = d.exists() && !!d.data().seekers.alice;
});
note("BORNE | appel 14356 (muet, premier)  : " + detail(j7a));
note("BORNE | appel 14369 (qui parle, 2e) : " + detail(j7b));
note("BORNE | en base, la chasse existe et Alice y est ? " + (etat7 ? "OUI" : "NON"));
note("BORNE | ce que la personne LIRAIT : " + vuMenteur);
note("BORNE | => si cet ordre etait atteignable, l'app annoncerait un echec sur une chasse BIEN lancee. "
  + "Il ne l'est pas : navigator.geolocation.getCurrentPosition (index.html:6272) rappelle TOUJOURS de "
  + "facon asynchrone, donc l'appel de 14369 demarre toujours AVANT celui de 14356 et gagne la creation. "
  + "Mesure 5 ci-dessus (les deux lances ensemble) le confirme : l'ecran est reste juste.");

/* ═══ 8. L'ADDITION, a l'echelle d'une personne et de l'app ════════════════ */
const parMois = 5 /* veilles */ * 1 /* refus par veille et par session */ * 3 /* ouvertures/jour */ * 30;
note("ADDITION | une personne avec 5 veilles qui ouvre l'app 3 fois par jour : " + parMois
  + " ecritures refusees par mois, sans compter les lancements.");
note("ADDITION | a 1 000 personnes : ~" + (parMois * 1000).toLocaleString("fr-FR")
  + " ecritures refusees par mois. Le palier gratuit Firestore est de 20 000 ecritures par JOUR "
  + "(~600 000/mois). Savoir si ces refus sont FACTURES change donc l'echelle du probleme — "
  + "et la documentation Firebase ne le dit pas : elle affirme seulement que « les requetes refusees "
  + "par vos regles de securite ne comptent pas dans la bande passante reseau ». "
  + "Le cout en ECRITURES facturees reste, lui, non documente : a ne pas affirmer dans un sens ou l'autre.");

await bilan(env);
