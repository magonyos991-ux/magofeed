/* ============================================================================
   VERIFICATION — LENTILLE « INTENTION »
   « La confirmation part sur une autre boisson, et l'app affirme le contraire »
   ----------------------------------------------------------------------------
   LA TROUVAILLE DIT : fbProposerCodeChasse (index.html:2503) n'utilise drinkId
   que dans la branche creation (index.html:2510) ; quand le document existe
   deja, elle se contente de `updateDoc(ref, { par: par.concat([uid]) })`
   (index.html:2526) sans comparer d.drinkId a drinkId. Exemple donne : Alice a
   propose le code pour la « Cusa Cola Zero », Bob a la « Cusa Cola Cherry » en
   main, sa confirmation compte pour la Zero.

   MA SEULE QUESTION : est-ce un OUBLI, ou une DECISION ? Trois choses a
   trancher, dans cet ordre :

     1. Ce que la trouvaille attend (« la confirmation de Bob doit compter pour
        la Cherry ») est-il seulement PERMIS ? Les regles disent le contraire,
        noir sur blanc (firestore.rules:1239-1252 puis 1266).

     2. L'APPLICATION, toute seule, peut-elle viser la Zero quand la canette
        est une Cherry ? C'est proposerChasse (index.html:23431) qui choisit,
        via trouverBoissonProche (index.html:10311) — dont le commentaire
        (index.html:10235-10256, 10294-10289) dit exactement le contraire.

     3. Ce qui RESTE possible : deux fiches jumelles a une lettre pres et un
        catalogue perime. Jusqu'ou va le degat, et le telephone reste-t-il
        vraiment en desaccord avec le catalogue (drinkForBarcode,
        index.html:9598) ?

   TOUT CE QUI EST REJOUE ICI EST RECOPIE DE index.html, A L'IDENTIQUE :
     index.html:9541  codeNu()        index.html:10265  _motsNom()
     index.html:9542  indexCode()     index.html:10289  _formesNom()
     index.html:9548  porteCode()     index.html:10294  _ecartMots()
     index.html:9586  linkBarcodeLocally()   index.html:10311 trouverBoissonProche()
     index.html:9598  drinkForBarcode()      index.html:12438 OFF_VARIANT_WORDS
     index.html:10217 levenshtein()   index.html:23431  proposerChasse()
     index.html:10234 normTxt()       index.html:23492  boissonsOrphelines()
     index.html:10257 _foldOcr()      index.html:2503   fbProposerCodeChasse()
     functions-a-deployer/chasse-codes.js  poserCodeChasse()
============================================================================ */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, getDocs, collection,
         serverTimestamp, increment } from "firebase/firestore";

const env   = await banc("verif-intention-chasse-drinkid");
const alice = env.authenticatedContext("alice").firestore();
const bob   = env.authenticatedContext("bob").firestore();

const admin = async (fn) => {
  let sortie;
  await env.withSecurityRulesDisabled(async (c) => { sortie = await fn(c.firestore()); });
  return sortie;
};

/* ── index.html:12438 ────────────────────────────────────────────────────── */
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
/* ── index.html:10234 / 10257 / 10265 / 10289 / 10294 ────────────────────── */
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
/* ── index.html:10311 — DRINKS passe en argument : c'est le catalogue CHARGE
      par ce telephone-la (fbLoadCatalog, index.html:1654). ───────────────── */
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
/* ── index.html:23431 — proposerChasse(), la partie qui DECIDE la cible.
      Renvoie null quand l'ecran « Oui, c'est bien elle » ne s'affiche pas. ─ */
function cibleDeLaChasse(DRINKS, best){
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
/* ── index.html:9541 / 9542 / 9548 / 9586 / 9598 ─────────────────────────── */
function codeNu(c){ return String(c==null?"":c).replace(/\D/g,"").replace(/^0+/,""); }
function indexCode(liste,code){
  var x=codeNu(code);
  if(!liste||!liste.length||!x)return -1;
  for(var i=0;i<liste.length;i++) if(codeNu(liste[i])===x) return i;
  return -1;
}
function porteCode(liste,code){ return indexCode(liste,code)!==-1; }
function linkBarcodeLocally(liens,code,drinkId){ liens[String(code)]=Number(drinkId); }
/* Sans desaveu (barcodeDisavowed) : personne ne desavoue rien dans ce parcours.
   L'ORDRE est ce qui compte ici : le CATALOGUE d'abord, les liens locaux apres. */
function drinkForBarcode(DRINKS,liens,code){
  var c=String(code);
  var d=DRINKS.find(function(x){return porteCode(x.barcodes,c);});
  if(d)return d;
  var id=liens[c];
  if(id==null)return undefined;
  return DRINKS.find(function(x){return Number(x.id)===Number(id);});
}
/* ── index.html:2503 — fbProposerCodeChasse, a l'identique (ensureAuthed en
      moins : le banc fournit deja des comptes nominatifs). ───────────────── */
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
/* ── chasse-codes.js — poserCodeChasse : meme seuil, meme verrou, meme ordre ─ */
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
const lireChasse    = (id) => admin(async (db) => (await getDoc(doc(db, "chasseCodes", String(id)))).data() || {});
const lireCatalogue = (id) => admin(async (db) => (await getDoc(doc(db, "catalog", String(id)))).data() || {});
/* fbLoadCatalog (index.html:1654) : ce que le telephone charge a l'ouverture. */
const chargerCatalogue = () => admin(async (db) => {
  const snap = await getDocs(collection(db, "catalog"));
  const out = [];
  snap.forEach((d) => out.push(JSON.parse(JSON.stringify(d.data() || {}))));
  return out;
});

/* ════════════════════════════════════════════════════════════════════════════
   1. CE QUE LA TROUVAILLE ATTEND EST-IL SEULEMENT PERMIS ?
      « sa confirmation doit compter pour la Cherry » = deplacer la boisson
      visee apres coup. firestore.rules:1239-1252 :
        « toucher a autre chose que cette liste apres coup — ni la boisson
          visee, ni le code, ni l'etat. Le lien propose ne peut donc pas etre
          detourne vers une autre boisson une fois les confirmations reunies. »
   ════════════════════════════════════════════════════════════════════════════ */
const ID_ZERO   = 1700000000001;
const ID_CHERRY = 1700000000002;
const CODE_CH   = "5000112637922";   // cle GS1 valide, imprime sur la canette Cherry

await admin(async (db) => {
  await setDoc(doc(db, "catalog", String(ID_ZERO)),   { id: ID_ZERO,   name: "Cusa Cola Zero",   brand: "Cusa", cat: "Soda", createdAt: serverTimestamp() });
  await setDoc(doc(db, "catalog", String(ID_CHERRY)), { id: ID_CHERRY, name: "Cusa Cola Cherry", brand: "Cusa", cat: "Soda", createdAt: serverTimestamp() });
});

await doit("1. Alice cree le document de chasse pour la ZERO (branche creation, index.html:2510)", async () => {
  const r = await fbProposerCodeChasse(alice, "alice", ID_ZERO, "Cusa Cola Zero", CODE_CH);
  if (r.nb !== 1) throw new Error("nb attendu 1, recu " + r.nb);
});
await doitEchouer("1. Bob ne peut PAS deplacer la cible vers la Cherry en s'ajoutant (rules:1266)", async () => {
  const d = (await getDoc(doc(bob, "chasseCodes", CODE_CH))).data() || {};
  await updateDoc(doc(bob, "chasseCodes", CODE_CH),
    { par: (d.par || []).concat(["bob"]), drinkId: ID_CHERRY, drinkName: "Cusa Cola Cherry" });
});
await doitEchouer("1. ni en ne touchant QUE la boisson visee", async () => {
  await updateDoc(doc(bob, "chasseCodes", CODE_CH), { drinkId: ID_CHERRY });
});
note("1. -> le comportement attendu par la trouvaille est INTERDIT par les regles, et le commentaire des regles (firestore.rules:1247-1252) dit pourquoi : « Le lien propose ne peut donc pas etre detourne vers une autre boisson ». fbProposerCodeChasse n'omet donc pas drinkId : c'est la SEULE ecriture qu'on lui laisse.");

/* ════════════════════════════════════════════════════════════════════════════
   2. L'APPLICATION PEUT-ELLE VISER LA ZERO QUAND LA CANETTE EST UNE CHERRY ?
      C'est la seule facon dont le cas de la trouvaille pourrait NAITRE sans
      qu'une personne lise « Cusa Cola Zero » a l'ecran et reponde « oui ».
   ════════════════════════════════════════════════════════════════════════════ */
const CATALOGUE_COMPLET = [
  { id: ID_ZERO,   name: "Cusa Cola Zero",   brand: "Cusa", cat: "Soda" },
  { id: ID_CHERRY, name: "Cusa Cola Cherry", brand: "Cusa", cat: "Soda" },
];
const CATALOGUE_PERIME = [ { id: ID_ZERO, name: "Cusa Cola Zero", brand: "Cusa", cat: "Soda" } ];
const OFF_CHERRY = { name: "Cusa Cola Cherry", brand: "Cusa", cat: "Soda" };
const OFF_ZERO   = { name: "Cusa Cola Zero",   brand: "Cusa", cat: "Soda" };

const cComplet = cibleDeLaChasse(CATALOGUE_COMPLET, OFF_CHERRY);
const cPerime  = cibleDeLaChasse(CATALOGUE_PERIME,  OFF_CHERRY);
note("2. canette Cherry, OpenFoodFacts repond « " + OFF_CHERRY.name + " »");
note("2. -> telephone a jour  : l'ecran propose " + (cComplet ? "« " + cComplet.name + " »" : "RIEN"));
note("2. -> telephone perime (il n'a que la Zero) : l'ecran propose " + (cPerime ? "« " + cPerime.name + " »" : "RIEN — l'ecran ne s'affiche pas"));

await doit("2. un telephone a jour vise la CHERRY", async () => {
  if (!cComplet || cComplet.id !== ID_CHERRY) throw new Error("vise " + (cComplet && cComplet.name));
});
await doit("2. aucun catalogue ne fait proposer la ZERO pour une canette Cherry", async () => {
  if (cComplet && cComplet.id === ID_ZERO) throw new Error("le telephone a jour a propose la Zero");
  if (cPerime  && cPerime.id  === ID_ZERO) throw new Error("le telephone perime a propose la Zero");
});
await doit("2. et reciproquement : canette Zero, la Cherry n'est jamais proposee", async () => {
  const a = cibleDeLaChasse(CATALOGUE_COMPLET, OFF_ZERO);
  const b = cibleDeLaChasse([{ id: ID_CHERRY, name: "Cusa Cola Cherry", brand: "Cusa", cat: "Soda" }], OFF_ZERO);
  note("2. -> canette Zero : telephone a jour propose " + (a ? "« " + a.name + " »" : "RIEN") +
       " ; telephone qui n'a que la Cherry propose " + (b ? "« " + b.name + " »" : "RIEN"));
  if (a && a.id === ID_CHERRY) throw new Error("la Cherry a ete proposee pour une Zero");
  if (b) throw new Error("la Cherry a ete proposee pour une Zero");
});
note("2. -> _ecartMots refuse « zero » contre « cherry » : les deux sont dans OFF_VARIANT_WORDS (index.html:10300 : « deux mots de variante qui different : deux parfums, pas une coquille »).");
note("2. -> le cas de la trouvaille (Alice vise la Zero, Bob la Cherry, meme code) ne peut donc PAS naitre de l'application : il faut qu'une personne lise « Cusa Cola Zero » a l'ecran (index.html:23447) et reponde quand meme « Oui, c'est bien elle », en ignorant « Non, c'est autre chose » (index.html:23483).");

/* ════════════════════════════════════════════════════════════════════════════
   3. CE QUI RESTE VRAIMENT POSSIBLE : DEUX FICHES JUMELLES + CATALOGUE PERIME
      (le doublon « Golden Power » que le code cite lui-meme, index.html:23343)
   ════════════════════════════════════════════════════════════════════════════ */
const ID_COQUILLE = 1700000000011;   // ancienne fiche PHOTO, une lettre de travers
const ID_BONNE    = 1700000000012;   // la bonne fiche, promue ce matin
const CODE_GP     = "5449000000996";
const N_COQUILLE  = "Golden Power Energu Drink";
const N_BONNE     = "Golden Power Energy Drink";

await admin(async (db) => {
  await setDoc(doc(db, "catalog", String(ID_COQUILLE)), { id: ID_COQUILLE, name: N_COQUILLE, brand: "Golden Power", cat: "Energy", createdAt: serverTimestamp() });
  await setDoc(doc(db, "catalog", String(ID_BONNE)),    { id: ID_BONNE,    name: N_BONNE,    brand: "Golden Power", cat: "Energy", createdAt: serverTimestamp() });
});
const DRINKS_ALICE = [{ id: ID_COQUILLE, name: N_COQUILLE, brand: "Golden Power", cat: "Energy" }];
const DRINKS_BOB   = [{ id: ID_COQUILLE, name: N_COQUILLE, brand: "Golden Power", cat: "Energy" },
                      { id: ID_BONNE,    name: N_BONNE,    brand: "Golden Power", cat: "Energy" }];
const liensBob = {};
const OFF_GP = { name: N_BONNE, brand: "Golden Power", cat: "Energy" };

const cibleAlice = cibleDeLaChasse(DRINKS_ALICE, OFF_GP);
const cibleBob   = cibleDeLaChasse(DRINKS_BOB,   OFF_GP);
note("3. deux fiches orphelines pour le meme produit, a " +
     levenshtein(_motsNom(N_COQUILLE).join(" "), _motsNom(N_BONNE).join(" ")) +
     " lettre d'ecart : « " + N_COQUILLE + " » / « " + N_BONNE + " ».");
note("3. -> Alice (catalogue d'avant-hier) vise « " + (cibleAlice && cibleAlice.name) + " » ; Bob (catalogue de ce matin) vise « " + (cibleBob && cibleBob.name) + " ».");

await doit("3. la divergence existe : deux telephones honnetes visent deux fiches differentes", async () => {
  if (!cibleAlice || !cibleBob) throw new Error("un des deux n'a rien propose");
  if (cibleAlice.id === cibleBob.id) throw new Error("meme cible, rien a etudier ici");
});
let rBob;
await doit("3. Alice puis Bob confirment, la Cloud Function pose le code", async () => {
  await fbProposerCodeChasse(alice, "alice", cibleAlice.id, cibleAlice.name, CODE_GP);
  rBob = await fbProposerCodeChasse(bob, "bob", cibleBob.id, cibleBob.name, CODE_GP);
  linkBarcodeLocally(liensBob, CODE_GP, cibleBob.id);
  const etat = await poserCodeChasse(CODE_GP);
  const d = await lireChasse(CODE_GP);
  note("3. -> ecran de Bob : « Merci — c'est note » / « " + (rBob.nb >= 2
      ? "Une deuxieme personne l'avait deja vue : le code va etre pose pour tout le monde."
      : "Il manque encore une confirmation...") + " »");
  note("3. -> poserCodeChasse : « " + etat + " » ; le document visait « " + d.drinkName + " ».");
  if (etat !== "pose") throw new Error("etat " + etat);
});
await doit("3. le code atterrit sur la JUMELLE, pas sur la fiche que Bob avait sous les yeux", async () => {
  const coquille = await lireCatalogue(ID_COQUILLE);
  const bonne    = await lireCatalogue(ID_BONNE);
  note("3. -> « " + N_COQUILLE + " ».barcodes = " + JSON.stringify(coquille.barcodes || []) +
       " ; « " + N_BONNE + " ».barcodes = " + JSON.stringify(bonne.barcodes || []));
  if (!(coquille.barcodes || []).includes(CODE_GP)) throw new Error("le code n'est pas sur la jumelle");
});
await doit("3. les deux fiches designent le MEME produit (meme marque, une lettre d'ecart) — le scan ne renvoie pas une autre boisson", async () => {
  const ecart = _ecartMots(_motsNom(N_COQUILLE), _motsNom(N_BONNE));
  note("3. -> _ecartMots(« " + N_COQUILLE + " », « " + N_BONNE + " ») = " + ecart + " (null = deux produits differents).");
  if (ecart === null) throw new Error("les deux fiches sont deux produits differents");
});
await doit("3. apres rechargement, le telephone de Bob et le catalogue partage disent la MEME chose (drinkForBarcode, index.html:9598 : catalogue d'abord, liens locaux ensuite)", async () => {
  const DRINKS_BOB_2 = await chargerCatalogue();
  const trouve = drinkForBarcode(DRINKS_BOB_2, liensBob, CODE_GP);
  const dansLeCatalogue = DRINKS_BOB_2.find((x) => (x.barcodes || []).includes(CODE_GP));
  note("3. -> le lien local de Bob pointe encore sur " + liensBob[CODE_GP] +
       ", mais scanner le code lui renvoie desormais « " + (trouve && trouve.name) + " » (id " + (trouve && trouve.id) + ").");
  if (!trouve || !dansLeCatalogue || Number(trouve.id) !== Number(dansLeCatalogue.id))
    throw new Error("le telephone de Bob repond « " + (trouve && trouve.name) + " », le catalogue « " + (dansLeCatalogue && dansLeCatalogue.name) + " »");
});

/* ════════════════════════════════════════════════════════════════════════════
   4. CE QUI RESTE NON DIT A LA PERSONNE
   ════════════════════════════════════════════════════════════════════════════ */
await doit("4. le document de chasse est lisible par tous (rules:1255) : la boisson deja visee EST connaissable avant d'ecrire", async () => {
  const d = (await getDoc(doc(bob, "chasseCodes", CODE_GP))).data() || {};
  note("4. -> chasseCodes/" + CODE_GP + " lu par Bob : drinkName = « " + d.drinkName + " », par = " + JSON.stringify(d.par));
  if (!d.drinkName) throw new Error("document illisible");
});
note("4. fbProposerCodeChasse fait deja ce getDoc (index.html:2507) : le nom de la boisson visee est sous ses yeux a l'instant ou elle ajoute Bob (index.html:2526), et elle ne le montre jamais a Bob.");
note("4. le chemin ADMIN, lui, le dit : « Ce code est deja sur ... » (index.html:23534). Rien d'equivalent cote chasse.");

await bilan(env);
