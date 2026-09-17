/* ============================================================================
   VERIFICATION « IMPACT » — fbChargerChasseCodes n'est appelee nulle part.
   ----------------------------------------------------------------------------
   LA QUESTION, ET RIEN D'AUTRE : qu'est-ce que ca change pour quelqu'un ?
   On ne demande pas si la fonction est morte (le grep le dit), on demande ce
   qu'une personne reelle voit a l'ecran, et si ce qu'elle voit est faux.

   CE QUE CE SCENARIO REJOUE, LIGNE PAR LIGNE :
     - index.html:23491  boissonsOrphelines()   la SEULE source de l'ecran
     - index.html:23374  renderChasseCodes()    la carte d'accueil, mot pour mot
     - index.html:23390  ouvrirChasseCodes()    la liste de l'ecran, mot pour mot
     - index.html:23431  proposerChasse()       l'ecran « Oui, c'est bien elle »
     - index.html:23463  le message apres confirmation (r.nb >= 2 ?)
     - index.html:2503   window.fbProposerCodeChasse()   l'ecriture, telle quelle
     - index.html:2529   window.fbChargerChasseCodes()   la lecture orpheline
     - functions-a-deployer/chasse-codes.js:57  CONFIRMATIONS_REQUISES = 2
============================================================================ */
import { banc, doit, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, getDocs, collection, query, where,
         serverTimestamp } from "firebase/firestore";

const env   = await banc("verif-impact-chasse-jamais-affichee");
const alice = env.authenticatedContext("alice").firestore();
const bob   = env.authenticatedContext("bob").firestore();
const anon  = env.unauthenticatedContext().firestore();
const admin = async (fn) => { let s; await env.withSecurityRulesDisabled(async (c) => { s = await fn(c.firestore()); }); return s; };

/* ── Le catalogue local du telephone : window.DRINKS ───────────────────────
   Deux fiches nees d'une proposition PHOTO (id = Date.now(), 13 chiffres,
   aucun barcodes) : ce sont exactement celles que boissonsOrphelines() retient. */
const ID_A = 1700000000001, ID_B = 1700000000002;
const CODE_A = "5449000000996";
const DRINKS = [
  { id: ID_A, name: "Cusa Cola Zero",   brand: "Cusa",  cat: "Soda" },
  { id: ID_B, name: "Yuzu Sparkling",   brand: "Kimino", cat: "Soda" },
  { id: 12,   name: "Coca-Cola Zero",   brand: "Coca",  cat: "Soda", barcodes: ["5449000131805"] },
];

/* ── index.html:23491 — boissonsOrphelines(), a l'identique ──────────────── */
function boissonsOrphelines(){
  return (DRINKS||[]).filter(function(d){
    return Number(d.id)>=1e12&&!(d.barcodes&&d.barcodes.length);
  });
}
/* Les deux fonctions d'affichage n'utilisent rien d'autre : ni argument, ni
   etat serveur. sanitize/drinkIconHTML sont neutralises — ils ne changent pas
   ce qui est DIT a l'ecran. */
const sanitize = (s) => String(s==null?"":s);
const drinkIconHTML = () => "<i>";

/* ── index.html:23374 — renderChasseCodes(), le texte de la carte ────────── */
function carteChasse(){
  var liste=boissonsOrphelines();
  if(!liste.length) return "";
  var apercu=liste.slice(0,3).map(function(d){return sanitize(d.name);}).join(" · ");
  return liste.length+' boisson'+(liste.length>1?"s":"")+' cherche'+(liste.length>1?"nt leur":" son")+' code-barre'
       + "\n" + apercu+(liste.length>3?" …":"");
}
/* ── index.html:23390 — ouvrirChasseCodes(), une ligne par boisson ───────── */
function lignesChasse(){
  var liste=boissonsOrphelines();
  return liste.map(function(d){
    return '<div style="width:38px;height:38px;flex-shrink:0;border-radius:10px;overflow:hidden;font-size:24px">'+drinkIconHTML(d)+'</div>'+
      '<div style="flex:1;min-width:0">'+
        '<div style="font-size:13px;font-weight:800;color:var(--s1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+sanitize(d.name)+'</div>'+
        '<div style="font-size:11px;font-weight:600;color:var(--s2)">'+sanitize(d.brand||"")+'</div></div>';
  }).join("\n");
}
/* ── index.html:2503 — window.fbProposerCodeChasse, a l'identique ────────── */
async function fbProposerCodeChasse(db, uid, drinkId, drinkName, barcode) {
  var ref = doc(db, "chasseCodes", String(barcode));
  var snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { drinkId: Number(drinkId) || drinkId,
      drinkName: String(drinkName).slice(0, 60), barcode: String(barcode),
      par: [uid], etat: "attente", createdAt: serverTimestamp() });
    return { nb: 1, deja: false };
  }
  var d = snap.data() || {};
  var par = Array.isArray(d.par) ? d.par : [];
  if (d.etat !== "attente") return { nb: par.length, deja: true, pose: true };
  if (par.indexOf(uid) !== -1) return { nb: par.length, deja: true };
  await updateDoc(ref, { par: par.concat([uid]) });
  return { nb: par.length + 1, deja: false };
}
/* ── index.html:2529 — window.fbChargerChasseCodes, la fonction orpheline ── */
async function fbChargerChasseCodes(db) {
  try {
    var snap = await getDocs(query(collection(db, "chasseCodes"), where("etat", "==", "attente")));
    var out = {};
    snap.forEach(function (d) { var v = d.data() || {};
      out[String(v.barcode || d.id)] = { drinkId: v.drinkId, nb: (v.par || []).length }; });
    return out;
  } catch (e) { return {}; }
}
/* ── index.html:23463 — le message vu APRES avoir confirme, mot pour mot ─── */
function messageApresConfirmation(r){
  return "Merci — c'est noté. " + (r&&r.nb>=2
    ? "Une deuxième personne l'avait déjà vue : le code va être posé pour tout le monde."
    : "Il manque encore une confirmation d'une autre personne pour que le code compte pour tous. De ton côté, il marche déjà.");
}
const CONFIRMATIONS_REQUISES = 2;   // chasse-codes.js:57

/* ══ A. L'ecran de la chasse, AVANT que personne n'ait confirme ════════════ */
const CARTE_AVANT  = carteChasse();
const LIGNES_AVANT = lignesChasse();
note("A. carte d'accueil (renderChasseCodes, index.html:23374) -> « " + CARTE_AVANT.split("\n")[0] + " »");
note("A. l'ecran ouvert (ouvrirChasseCodes, index.html:23390) affiche " + boissonsOrphelines().length +
     " ligne(s), chacune avec 2 informations : le nom et la marque. Aucun compteur, aucune mention du serveur.");

/* ══ B. Alice trouve la boisson en rayon et confirme ═══════════════════════ */
let rAlice;
await doit("B. Alice confirme le code en rayon (fbProposerCodeChasse, index.html:2503)", async () => {
  rAlice = await fbProposerCodeChasse(alice, "alice", ID_A, "Cusa Cola Zero", CODE_A);
  if (rAlice.nb !== 1) throw new Error("nb attendu 1, recu " + rAlice.nb);
});
/* Ce qu'Alice lit a l'ecran est-il VRAI ? On le confronte a la base. */
await doit("B. le message qu'Alice lit apres avoir confirme dit la verite", async () => {
  const d = await admin(async (db) => (await getDoc(doc(db, "chasseCodes", CODE_A))).data() || {});
  const msg = messageApresConfirmation(rAlice);
  const vraiNb = (d.par || []).length;
  if (vraiNb !== 1) throw new Error("la base dit " + vraiNb);
  if (!/Il manque encore une confirmation/.test(msg))
    throw new Error("l'app annonce la pose alors qu'il manque " + (CONFIRMATIONS_REQUISES - vraiNb) + " confirmation(s)");
});
note("B. Alice lit : « " + messageApresConfirmation(rAlice) + " »  (base : par.length=1, seuil=2) — exact.");

/* ══ C. LE COEUR DE LA TROUVAILLE ══════════════════════════════════════════
   Bob ouvre l'ecran de la chasse au meme instant. Une confirmation existe
   deja pour « Cusa Cola Zero ». Son ecran change-t-il d'un seul caractere ? */
await doit("C. l'ecran de Bob est RIGOUREUSEMENT identique avant et apres la confirmation d'Alice", async () => {
  if (lignesChasse() !== LIGNES_AVANT) throw new Error("l'ecran a change : la trouvaille serait fausse");
  if (carteChasse()  !== CARTE_AVANT)  throw new Error("la carte a change : la trouvaille serait fausse");
});
note("C. -> rien ne bouge : boissonsOrphelines() ne lit que window.DRINKS (index.html:23491). L'ecran ne pose aucune question au serveur.");

/* Ce que le serveur savait, a la seconde ou Bob regardait. */
const vue = await fbChargerChasseCodes(anon);
note("C. fbChargerChasseCodes (index.html:2529), si on l'appelait, rendait : " + JSON.stringify(vue) +
     " — soit « il ne manque qu'une confirmation » pour la fiche " + ID_A + ".");
await doit("C. la fonction orpheline marche parfaitement : ce n'est pas elle qui est cassee", async () => {
  if (!vue[CODE_A] || vue[CODE_A].nb !== 1 || vue[CODE_A].drinkId !== ID_A)
    throw new Error("renvoi inattendu : " + JSON.stringify(vue));
});

/* ══ D. LA CHASSE ABOUTIT-ELLE QUAND MEME ? ════════════════════════════════
   C'est la vraie mesure de l'impact : la lacune bloque-t-elle le parcours ? */
let rBob;
await doit("D. Bob, qui n'a rien vu du compteur, croise le produit et confirme : le seuil est atteint", async () => {
  rBob = await fbProposerCodeChasse(bob, "bob", ID_A, "Cusa Cola Zero", CODE_A);
  const d = await admin(async (db) => (await getDoc(doc(db, "chasseCodes", CODE_A))).data() || {});
  if ((d.par || []).length < CONFIRMATIONS_REQUISES)
    throw new Error("la chasse n'aboutit pas : par=" + JSON.stringify(d.par));
});
await doit("D. le message que Bob lit dit la verite (le code va bien etre pose)", async () => {
  const msg = messageApresConfirmation(rBob);
  const d = await admin(async (db) => (await getDoc(doc(db, "chasseCodes", CODE_A))).data() || {});
  const posable = (d.etat === "attente") && (d.par || []).length >= CONFIRMATIONS_REQUISES;
  if (/va être posé pour tout le monde/.test(msg) && !posable)
    throw new Error("l'app promet une pose qui n'aura pas lieu");
  if (!/va être posé pour tout le monde/.test(msg) && posable)
    throw new Error("l'app cache une pose qui va avoir lieu");
});
note("D. Bob lit : « " + messageApresConfirmation(rBob) + " » — exact : par.length=2, la Cloud Function posera le code.");
note("D. -> le parcours a deux personnes ABOUTIT sans que l'etat partage n'ait jamais ete affiche. La lacune ne bloque rien et ne fait rien dire de faux.");

/* ══ E. Ce que l'ecran PROMET, compare a ce qu'il donne ════════════════════
   Si le texte de l'ecran annoncait un compteur, l'absence serait un mensonge.
   On recopie le texte affiche par ouvrirChasseCodes (index.html:23395-23400). */
const LEAD    = "Elles sont dans Magofeed, mais sans leur code-barre : scanner le produit ne les retrouve pas, et cree un doublon.";
const HONNETE = "Si tu en croises une en rayon, scanne-la : l'app reconnaitra qu'il s'agit d'elle et te demandera de confirmer. Le code n'est pose que quand c'est sur — un code faux serait pire que pas de code du tout.";
await doit("E. le texte de l'ecran ne promet aucun compteur, aucun avancement, aucun conflit", async () => {
  const t = (LEAD + " " + HONNETE).toLowerCase();
  for (const mot of ["confirmation", "personne a deja", "avancement", "compteur", "deja propose"])
    if (t.indexOf(mot) !== -1) throw new Error("l'ecran promet « " + mot + " » et ne le tient pas");
});
note("E. -> l'ecran ne promet rien qu'il ne tienne : il dit « scanne-la », pas « voici ou en est la chasse ». Rien de faux n'est affiche.");

/* ══ F. Ce que la personne perd, chiffre ═══════════════════════════════════ */
const orphelines = boissonsOrphelines();
const parDrink = {};
for (const k of Object.keys(vue)) parDrink[String(vue[k].drinkId)] = vue[k].nb;
const presque = orphelines.filter((d) => (parDrink[String(d.id)] || 0) === CONFIRMATIONS_REQUISES - 1);
note("F. sur " + orphelines.length + " fiche(s) listee(s), " + presque.length +
     " est a UNE confirmation de la fin — information disponible cote serveur, jamais demandee : la personne choisit au hasard laquelle chasser.");
note("F. l'avertissement « ce code est deja propose pour une autre boisson » ne pourrait de toute facon pas tenir sur cet ecran : la chasse liste des BOISSONS, le conflit porte sur un CODE, et il ne se decouvre qu'au scan (proposerChasse, index.html:23431).");
note("F. fbChargerChasseCodes n'est pas seule : fbGetDocs, fbOnSnapshot, fbOrderBy, fbMesMagasins, fbMonParrainage sont definies et jamais appelees non plus (grep sur index.html). Aucune n'ecrit ni ne coute : jamais appelee, jamais facturee.");

await bilan(env);
