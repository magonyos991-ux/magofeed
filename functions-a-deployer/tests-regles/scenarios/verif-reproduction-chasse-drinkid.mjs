/* ============================================================================
   VERIFICATION INDEPENDANTE — « la confirmation part sur une autre boisson »
   ----------------------------------------------------------------------------
   La trouvaille a verifier dit : quand le document chasseCodes/<code> existe
   deja, fbProposerCodeChasse ignore l'argument drinkId et se contente
   d'ajouter la personne a la liste. La confirmation du deuxieme scanneur
   compte donc pour la boisson du PREMIER, pendant que l'ecran lui dit
   « Merci — c'est note » et que son telephone lie le code a SA boisson.

   CE QUE JE NE VOULAIS PAS FAIRE : appeler fbProposerCodeChasse avec deux
   drinkId choisis a la main. Ca prouverait seulement que j'ai passe deux
   arguments differents. La vraie question est : L'APPLICATION peut-elle,
   toute seule, viser deux boissons differentes pour le MEME code-barre ?
   Seul proposerChasse (index.html:23431) decide de la cible, via
   trouverBoissonProche (index.html:10310). J'ai donc recopie ici, a
   l'identique, toute la chaine de decision :

     index.html:10217  levenshtein()
     index.html:10234  normTxt()
     index.html:10258  _foldOcr()
     index.html:10265  _motsNom()
     index.html:10288  _formesNom()
     index.html:10294  _ecartMots()
     index.html:12438  OFF_VARIANT_WORDS
     index.html:10310  trouverBoissonProche()
     index.html:23492  boissonsOrphelines()
     index.html:23431  proposerChasse()          -> le choix de « cible »
     index.html:2503   window.fbProposerCodeChasse()
     index.html:9586   linkBarcodeLocally()
     functions-a-deployer/chasse-codes.js        -> poserCodeChasse()

   LE CAS REJOUE, ET POURQUOI IL EST ORDINAIRE.
   Le catalogue partage contient deux fiches orphelines pour le meme produit :
   une ancienne, nee d'une proposition PHOTO avec une coquille
   (« Golden Power Energu Drink »), et la bonne, promue plus tard. C'est
   exactement le doublon que le code cite en commentaire (index.html:23336,
   « C'est arrive au Golden Power Energy drink »).
   Le catalogue n'est charge qu'UNE fois par session (fbLoadCatalog, appelee a
   l'ouverture, index.html:1654). Le telephone d'Alice, ouvert depuis
   avant-hier, n'a donc que l'ancienne fiche ; celui de Bob, ouvert ce matin,
   a les deux. Ils scannent la MEME canette, OpenFoodFacts leur renvoie le
   MEME nom. Aucun des deux ne ment, aucun des deux ne se trompe de bouton.
============================================================================ */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, getDocs, collection, query, where,
         serverTimestamp, increment } from "firebase/firestore";

const env   = await banc("verif-chasse-drinkid");
const alice = env.authenticatedContext("alice").firestore();
const bob   = env.authenticatedContext("bob").firestore();
const anon  = env.unauthenticatedContext().firestore();

const admin = async (fn) => {
  let sortie;
  await env.withSecurityRulesDisabled(async (c) => { sortie = await fn(c.firestore()); });
  return sortie;
};

/* ── index.html:12438, recopie a l'identique ─────────────────────────────── */
var OFF_VARIANT_WORDS=["edition","zero","light","diet","sugarfree","ultra","white","blanc","blanche","noir","black","cherry","cerise","vanille","vanilla","mango","mangue","watermelon","pasteque","citron","lemon","lime","peach","peche","tropical","paradise","rosa","gold","punch","exotic","exotique","fraise","strawberry","framboise","raspberry","orange","pomme","apple","raisin","grape","ananas","pineapple","coco","coconut","menthe","mint","mojito","cassis","myrtille","blueberry","grenade","pomegranate","abricot","apricot","poire","pear","kiwi","litchi","lychee","passion","goyave","guava","gingembre","ginger","sans","cafeine","decaf","max","intense","fusion","touch","sparkling","petillante","petillant","plate","green","vert","verte","rouge","red","blue","bleu","yellow","jaune","pink","rose","juiced","juice","assault","khaos","ripper","rehab","pipeline","loco"];

/* ── index.html:10217 ────────────────────────────────────────────────────── */
function levenshtein(a,b){
  if(a===b)return 0;
  var m=a.length,n=b.length;
  if(!m)return n;
  if(!n)return m;
  var prev=new Array(n+1),cur=new Array(n+1),i,j,tmp;
  for(j=0;j<=n;j++)prev[j]=j;
  for(i=1;i<=m;i++){
    cur[0]=i;
    for(j=1;j<=n;j++){
      var cost=a.charAt(i-1)===b.charAt(j-1)?0:1;
      cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+cost);
    }
    tmp=prev;prev=cur;cur=tmp;
  }
  return prev[n];
}
/* ── index.html:10234 / 10258 / 10265 / 10288 / 10294 ────────────────────── */
function normTxt(s){return(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");}
function _foldOcr(t){
  return t.replace(/0/g,"o").replace(/1/g,"l").replace(/5/g,"s")
          .replace(/8/g,"b").replace(/rn/g,"m");
}
function _motsNom(s){
  return _foldOcr(normTxt(s||"").replace(/[^a-z0-9]+/g," "))
    .split(" ").filter(function(m){return m.length>=2;});
}
function _formesNom(nom, marque, marqueOk){
  var out=[_motsNom(nom)];
  if(marque&&marqueOk)out.push(_motsNom(marque+" "+nom));
  return out.filter(function(x){return x.length;});
}
function _ecartMots(a,b){
  if(!a.length||a.length!==b.length)return null;
  var total=0, identiques=0;
  for(var i=0;i<a.length;i++){
    var x=a[i],y=b[i];
    if(x===y){identiques++;continue;}
    if(typeof OFF_VARIANT_WORDS!=="undefined"&&
       OFF_VARIANT_WORDS.indexOf(x)!==-1&&OFF_VARIANT_WORDS.indexOf(y)!==-1)return null;
    if(levenshtein(x,y)>1)return null;
    total+=1;
    if(total>1)return null;
  }
  if(total>0&&identiques===0)return null;
  return total;
}
/* ── index.html:10310 — la seule chose qui choisit la boisson visee ──────── */
function trouverBoissonProche(DRINKS, nomLu, marqueLue){
  if(!DRINKS||!nomLu)return null;
  var mq=normTxt(marqueLue||"").trim();
  var avecMarque=[], sansMarque=[];
  DRINKS.forEach(function(d){
    var dm=normTxt(d.brand||"");
    var marqueOk=!!(mq&&dm&&(dm.indexOf(mq)!==-1||mq.indexOf(dm)!==-1));
    var lues=_formesNom(nomLu,marqueLue,marqueOk);
    var refs=_formesNom(d.name,d.brand,marqueOk);
    var best=null;
    lues.forEach(function(a){ refs.forEach(function(b){
      var e=_ecartMots(a,b);
      if(e!==null&&(best===null||e<best))best=e;
    });});
    if(best===null)return;
    (marqueOk?avecMarque:sansMarque).push({drink:d,distance:best});
  });
  var pool=(mq&&avecMarque.length)?avecMarque:avecMarque.concat(sansMarque);
  if(!pool.length)return null;
  pool.sort(function(a,b){ return (a.distance-b.distance)||(Number(a.drink.id)-Number(b.drink.id)); });
  return pool[0];
}
/* ── index.html:23492 ────────────────────────────────────────────────────── */
function boissonsOrphelines(DRINKS){
  return (DRINKS||[]).filter(function(d){
    return Number(d.id)>=1e12&&!(d.barcodes&&d.barcodes.length);
  });
}
/* ── index.html:23431 — proposerChasse(), la partie qui DECIDE la cible ──── */
function cibleDeLaChasse(DRINKS, code, best){
  var liste=boissonsOrphelines(DRINKS);
  if(!liste.length||!best)return null;
  var cible=null;
  if(best&&best.name){
    try{
      var proche=trouverBoissonProche(DRINKS,best.name,best.brand);
      if(proche&&proche.drink&&liste.indexOf(proche.drink)!==-1&&proche.distance<=1)cible=proche.drink;
    }catch(e){}
  }
  return cible;
}
/* ── index.html:9586 — le lien pose sur CE telephone ─────────────────────── */
function linkBarcodeLocally(memoire,code,drinkId){ memoire[String(code)]=Number(drinkId); }

/* ── index.html:2503 — window.fbProposerCodeChasse, recopiee a l'identique ─
   (ensureAuthed / isAnonymous en moins : le banc fournit deja des comptes
   nominatifs, et ce test-ci ne porte pas sur l'anonymat.) */
async function fbProposerCodeChasse(db, uid, drinkId, drinkName, barcode) {
  var ref = doc(db, "chasseCodes", String(barcode));
  var snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      drinkId: Number(drinkId) || drinkId,
      drinkName: String(drinkName).slice(0, 60),
      barcode: String(barcode),
      par: [uid],
      etat: "attente",
      createdAt: serverTimestamp()
    });
    return { nb: 1, deja: false };
  }
  var d = snap.data() || {};
  var par = Array.isArray(d.par) ? d.par : [];
  if (d.etat !== "attente") return { nb: par.length, deja: true, pose: true };
  if (par.indexOf(uid) !== -1) return { nb: par.length, deja: true };
  await updateDoc(ref, { par: par.concat([uid]) });
  return { nb: par.length + 1, deja: false };
}
/* ── index.html:23456 — ce que l'ecran affiche apres la reponse ──────────── */
function ecranApresEnvoi(r){
  return (r && r.nb >= 2)
    ? "Une deuxieme personne l'avait deja vue : le code va etre pose pour tout le monde."
    : "Il manque encore une confirmation d'une autre personne pour que le code compte pour tous. De ton cote, il marche deja.";
}
/* ── chasse-codes.js — poserCodeChasse, meme seuil, meme verrou, meme ordre ─ */
const CONFIRMATIONS_REQUISES = 2;
const POINTS_PAR_CONFIRMANT  = 5;
async function poserCodeChasse(barcodeDocId) {
  return admin(async (db) => {
    const ref = doc(db, "chasseCodes", String(barcodeDocId));
    const s = await getDoc(ref);
    if (!s.exists()) return "supprime";
    const d = s.data() || {};
    if (d.etat !== "attente") return "deja-traite";
    const par = Array.isArray(d.par) ? d.par : [];
    if (par.length < CONFIRMATIONS_REQUISES) return "pas-assez";
    const code = String(d.barcode || barcodeDocId || "");
    const drinkId = String(d.drinkId || "");
    if (!code || !drinkId) return "document-incomplet";
    await updateDoc(ref, { etat: "pose", poseLe: serverTimestamp() });
    const fiche = await getDoc(doc(db, "catalog", drinkId));
    if (!fiche.exists()) { await updateDoc(ref, { etat: "sans-suite", raison: "fiche-absente" }); return "sans-suite"; }
    const codes = (fiche.data() || {}).barcodes || [];
    if (codes.indexOf(code) === -1) {
      await setDoc(doc(db, "catalog", drinkId),
        { barcodes: codes.concat([code]), updatedAt: serverTimestamp() }, { merge: true });
    }
    for (const uid of par) {
      await setDoc(doc(db, "users", String(uid)), { pts: increment(POINTS_PAR_CONFIRMANT) }, { merge: true });
    }
    return "pose";
  });
}
const lireCatalogue = (id) => admin(async (db) => (await getDoc(doc(db, "catalog", String(id)))).data() || {});
const lireChasse    = (id) => admin(async (db) => (await getDoc(doc(db, "chasseCodes", String(id)))).data() || {});

/* ════════════════════════════════════════════════════════════════════════════
   LE DECOR
   ════════════════════════════════════════════════════════════════════════════ */
const ID_COQUILLE = 1700000000001;   // ancienne fiche PHOTO, nom avec une coquille
const ID_BONNE    = 1700000000002;   // la bonne fiche, promue ce matin
const CODE        = "5000112637922"; // cle GS1 valide, imprime sur la canette

const FICHE_COQUILLE = { id: ID_COQUILLE, name: "Golden Power Energu Drink", brand: "Golden Power", cat: "Energy" };
const FICHE_BONNE    = { id: ID_BONNE,    name: "Golden Power Energy Drink", brand: "Golden Power", cat: "Energy" };

await admin(async (db) => {
  await setDoc(doc(db, "catalog", String(ID_COQUILLE)), Object.assign({}, FICHE_COQUILLE, { createdAt: serverTimestamp() }));
  await setDoc(doc(db, "catalog", String(ID_BONNE)),    Object.assign({}, FICHE_BONNE,    { createdAt: serverTimestamp() }));
});

/* Les deux telephones. fbLoadCatalog n'est appelee qu'a l'ouverture de la
   session (index.html:1654) : celui d'Alice, ouvert avant la promotion de la
   bonne fiche, ne la connait pas encore. */
const DRINKS_ALICE = [Object.assign({}, FICHE_COQUILLE)];
const DRINKS_BOB   = [Object.assign({}, FICHE_COQUILLE), Object.assign({}, FICHE_BONNE)];
const memoireAlice = {};   // localStorage "magoLiensCode"
const memoireBob   = {};

/* La reponse d'OpenFoodFacts pour CE code-barre : la meme pour les deux. */
const OFF = { name: "Golden Power Energy Drink", brand: "Golden Power", cat: "Energy" };

/* ════════════════════════════════════════════════════════════════════════════
   1. L'APPLICATION PEUT-ELLE, SEULE, VISER DEUX BOISSONS POUR UN MEME CODE ?
   ════════════════════════════════════════════════════════════════════════════ */
const cibleAlice = cibleDeLaChasse(DRINKS_ALICE, CODE, OFF);
const cibleBob   = cibleDeLaChasse(DRINKS_BOB,   CODE, OFF);

note("1. meme canette, meme reponse OpenFoodFacts (« " + OFF.name + " »).");
note("1. -> proposerChasse sur le telephone d'Alice vise : " + (cibleAlice ? "« " + cibleAlice.name + " » (id " + cibleAlice.id + ")" : "rien"));
note("1. -> proposerChasse sur le telephone de Bob  vise : " + (cibleBob   ? "« " + cibleBob.name   + " » (id " + cibleBob.id   + ")" : "rien"));

await doit("1. les deux telephones proposent bien quelque chose (sinon rien a tester)", async () => {
  if (!cibleAlice || !cibleBob) throw new Error("un des deux n'a rien propose : " +
    JSON.stringify([cibleAlice && cibleAlice.name, cibleBob && cibleBob.name]));
});
note("1. les deux cibles sont " + (cibleAlice && cibleBob && cibleAlice.id === cibleBob.id ? "IDENTIQUES" : "DIFFERENTES") +
     " — c'est l'application qui les a choisies, pas le scenario.");

/* ════════════════════════════════════════════════════════════════════════════
   2. LE PARCOURS A DEUX PERSONNES, TEL QUEL
   ════════════════════════════════════════════════════════════════════════════ */
let rAlice, rBob;
await doit("2. Alice scanne, repond « Oui, c'est bien elle » : sa proposition part", async () => {
  rAlice = await fbProposerCodeChasse(alice, "alice", cibleAlice.id, cibleAlice.name, CODE);
  linkBarcodeLocally(memoireAlice, CODE, cibleAlice.id);
  if (rAlice.nb !== 1) throw new Error("nb attendu 1, recu " + rAlice.nb);
});
await doit("2. Bob scanne la meme canette et repond « Oui, c'est bien elle »", async () => {
  rBob = await fbProposerCodeChasse(bob, "bob", cibleBob.id, cibleBob.name, CODE);
  linkBarcodeLocally(memoireBob, CODE, cibleBob.id);
  if (rBob.nb !== 2) throw new Error("nb attendu 2, recu " + rBob.nb);
});
note("2. -> ecran de Bob : « Merci — c'est note » / « " + ecranApresEnvoi(rBob) + " »");

/* ════════════════════════════════════════════════════════════════════════════
   3. SUR QUOI LA CONFIRMATION DE BOB A-T-ELLE COMPTE ?
   ════════════════════════════════════════════════════════════════════════════ */
await doit("3. le document de chasse doit viser la boisson que Bob avait sous les yeux", async () => {
  const d = await lireChasse(CODE);
  note("3. -> chasseCodes/" + CODE + " : drinkId=" + d.drinkId + " (« " + d.drinkName + " »), par=" + JSON.stringify(d.par));
  if (String(d.drinkId) !== String(cibleBob.id))
    throw new Error("le document vise « " + d.drinkName + " » (id " + d.drinkId +
      ") alors que Bob confirmait « " + cibleBob.name + " » (id " + cibleBob.id + ")");
});

let etat;
await doit("3. et la Cloud Function doit poser le code sur cette boisson-la", async () => {
  etat = await poserCodeChasse(CODE);
  const bonne    = await lireCatalogue(ID_BONNE);
  const coquille = await lireCatalogue(ID_COQUILLE);
  note("3. -> poserCodeChasse : « " + etat + " » ; catalog/" + ID_BONNE + " (« " + FICHE_BONNE.name + " ») .barcodes = " +
       JSON.stringify(bonne.barcodes || []) + " ; catalog/" + ID_COQUILLE + " (« " + FICHE_COQUILLE.name + " ») .barcodes = " +
       JSON.stringify(coquille.barcodes || []));
  const porteur = (bonne.barcodes || []).includes(CODE) ? FICHE_BONNE : ((coquille.barcodes || []).includes(CODE) ? FICHE_COQUILLE : null);
  if (!porteur) throw new Error("le code n'a ete pose nulle part");
  if (String(porteur.id) !== String(cibleBob.id))
    throw new Error("le code a ete pose sur « " + porteur.name + " », pas sur « " + cibleBob.name + " » que Bob confirmait");
});

/* ════════════════════════════════════════════════════════════════════════════
   4. CE QUE LE TELEPHONE DE BOB CROIT, ET CE QUE LE CATALOGUE DIT
   ════════════════════════════════════════════════════════════════════════════ */
await doit("4. le telephone de Bob et le catalogue partage doivent dire la meme chose", async () => {
  const dansLeCatalogue = await admin(async (db) => {
    const snap = await getDocs(collection(db, "catalog"));
    let nom = null, id = null;
    snap.forEach((d) => { const v = d.data() || {}; if ((v.barcodes || []).includes(CODE)) { nom = v.name; id = v.id; } });
    return { nom, id };
  });
  note("4. -> localStorage de Bob : " + CODE + " -> id " + memoireBob[CODE] +
       " ; catalogue partage : " + CODE + " -> « " + dansLeCatalogue.nom + " » (id " + dansLeCatalogue.id + ")");
  if (String(memoireBob[CODE]) !== String(dansLeCatalogue.id))
    throw new Error("le telephone de Bob lie " + CODE + " a la fiche " + memoireBob[CODE] +
      ", le catalogue le lie a « " + dansLeCatalogue.nom + " » (" + dansLeCatalogue.id + ")");
});

/* ════════════════════════════════════════════════════════════════════════════
   5. L'APPLICATION AURAIT-ELLE PU PREVENIR BOB ?
   ════════════════════════════════════════════════════════════════════════════ */
note("5. fbProposerCodeChasse (index.html:2503) lit pourtant le document AVANT d'ecrire (getDoc, index.html:2507) :");
note("5. la boisson deja visee est sous ses yeux au moment ou elle ajoute Bob (index.html:2519-2526), et elle ne la compare jamais a drinkId.");
note("5. fbChargerChasseCodes (index.html:2529) expose bien drinkId, mais « grep -n fbChargerChasseCodes index.html » ne renvoie que sa definition : aucun ecran ne l'appelle.");
note("5. le chemin ADMIN, lui, refuse ce cas : « Ce code est deja sur ... » (index.html:23534) — donc le cas est connu du projet.");

/* Et une fois le code pose, l'ecran suivant ne rattrape rien : le document
   n'est plus en 'attente', fbProposerCodeChasse renvoie {deja:true,pose:true}
   sans rien dire de la boisson. */
await doit("5. apres la pose, une troisieme personne qui scanne la canette n'apprend toujours rien", async () => {
  const r = await fbProposerCodeChasse(bob, "bob", cibleBob.id, cibleBob.name, CODE);
  note("5. -> fbProposerCodeChasse renvoie " + JSON.stringify(r) + " : aucune mention de la boisson reellement visee.");
  if (!r.deja) throw new Error("reponse inattendue " + JSON.stringify(r));
});

/* ════════════════════════════════════════════════════════════════════════════
   6. CONTRE-EPREUVE : quand les deux telephones ont le MEME catalogue,
      le parcours est-il sain ? (pour ne pas accuser le code a tort)
   ════════════════════════════════════════════════════════════════════════════ */
const CODE2 = "5449000000996";
const c1 = cibleDeLaChasse(DRINKS_BOB, CODE2, OFF);
const c2 = cibleDeLaChasse(DRINKS_BOB, CODE2, OFF);
await doit("6. deux telephones a jour choisissent la meme boisson (le rapprochement est deterministe)", async () => {
  if (!c1 || !c2 || c1.id !== c2.id) throw new Error("cibles " + (c1 && c1.id) + " et " + (c2 && c2.id));
});
await doit("6. et dans ce cas le code finit bien sur la boisson confirmee", async () => {
  await fbProposerCodeChasse(alice, "alice", c1.id, c1.name, CODE2);
  await fbProposerCodeChasse(bob, "bob", c2.id, c2.name, CODE2);
  await poserCodeChasse(CODE2);
  const fiche = await lireCatalogue(c1.id);
  if (!(fiche.barcodes || []).includes(CODE2)) throw new Error("code absent de « " + c1.name + " »");
});
note("6. le defaut n'est donc pas « la chasse ne marche pas » : elle marche tant que les deux telephones visent la meme fiche.");

await bilan(env);
