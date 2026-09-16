/* ============================================================================
   VERIFICATION D'IMPACT — « la confirmation part sur une autre boisson »
   ----------------------------------------------------------------------------
   La trouvaille dit : fbProposerCodeChasse (index.html:2503) n'utilise drinkId
   QUE dans la branche creation (index.html:2509). Si le document
   chasseCodes/<code> existe deja, elle ajoute la personne a `par` sans jamais
   comparer d.drinkId a drinkId (index.html:2526).

   MAIS l'application ne laisse personne CHOISIR la boisson : proposerChasse
   (index.html:23431) la calcule toute seule avec trouverBoissonProche
   (index.html:10310) a partir du nom lu sur OpenFoodFacts. La question
   d'impact est donc : deux personnes honnetes, qui scannent LE MEME produit et
   qui repondent la verite, peuvent-elles viser deux fiches differentes ?

   Ce scenario rejoue le chemin complet, avec le code de l'application :
     - index.html:10265  _motsNom / _formesNom / _ecartMots  (le rapprochement)
     - index.html:10310  trouverBoissonProche()   qui choisit la fiche visee
     - index.html:23431  proposerChasse()         l'ecran « Oui, c'est bien elle »
     - index.html:23491  boissonsOrphelines()     qui entre dans la chasse
     - index.html:2503   fbProposerCodeChasse()   l'ecriture, telle quelle
     - index.html:1961   fbLoadDrinkMerges()      les fusions admin
     - index.html:1971   fbSaveDrinkMerge()       la fusion, telle quelle
     - index.html:21670  le filtre qui retire du catalogue la fiche absorbee
     - index.html:13098  adminMergeDrink()        la fusion cote admin
     - functions-a-deployer/chasse-codes.js       poserCodeChasse(), recopiee

   L'HISTOIRE, celle que le code raconte lui-meme (index.html:23337 :
   « C'est arrive au Golden Power Energy drink ») : une fiche sans code-barre
   fait creer des DOUBLONS. Deux fiches jumelles vivent donc un temps dans le
   catalogue ; l'administrateur finit par en fusionner une dans l'autre.
   Personne ne ment, personne ne se trompe de produit.
============================================================================ */
import { banc, doit, note, bilan } from "../banc.mjs";
import { doc, setDoc, updateDoc, getDoc, getDocs, collection,
         serverTimestamp, increment } from "firebase/firestore";

const env   = await banc("verif-impact-chasse-drinkid");
const alice = env.authenticatedContext("alice").firestore();
const bob   = env.authenticatedContext("bob").firestore();
const carl  = env.authenticatedContext("carl").firestore();
const admin = async (fn) => {
  let sortie;
  await env.withSecurityRulesDisabled(async (c) => { sortie = await fn(c.firestore()); });
  return sortie;
};

/* ══ LE CODE DE L'APPLICATION, RECOPIE ════════════════════════════════════ */

/* index.html:10234 */
function normTxt(s){return(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");}
/* index.html:10217 */
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
/* index.html:12438 */
var OFF_VARIANT_WORDS=["edition","zero","light","diet","sugarfree","ultra","white","blanc","blanche","noir","black","cherry","cerise","vanille","vanilla","mango","mangue","watermelon","pasteque","citron","lemon","lime","peach","peche","tropical","paradise","rosa","gold","punch","exotic","exotique","fraise","strawberry","framboise","raspberry","orange","pomme","apple","raisin","grape","ananas","pineapple","coco","coconut","menthe","mint","mojito","cassis","myrtille","blueberry","grenade","pomegranate","abricot","apricot","poire","pear","kiwi","litchi","lychee","passion","goyave","guava","gingembre","ginger","sans","cafeine","decaf","max","intense","fusion","touch","sparkling","petillante","petillant","plate","green","vert","verte","rouge","red","blue","bleu","yellow","jaune","pink","rose","juiced","juice","assault","khaos","ripper","rehab","pipeline","loco"];
/* index.html:10257 */
function _foldOcr(t){
  return t.replace(/0/g,"o").replace(/1/g,"l").replace(/5/g,"s")
          .replace(/8/g,"b").replace(/rn/g,"m");
}
/* index.html:10265 */
function _motsNom(s){
  return _foldOcr(normTxt(s||"").replace(/[^a-z0-9]+/g," "))
    .split(" ").filter(function(m){return m.length>=2;});
}
/* index.html:10289 */
function _formesNom(nom, marque, marqueOk){
  var out=[_motsNom(nom)];
  if(marque&&marqueOk)out.push(_motsNom(marque+" "+nom));
  return out.filter(function(x){return x.length;});
}
/* index.html:10294 */
function _ecartMots(a,b){
  if(!a.length||a.length!==b.length)return null;
  var total=0, identiques=0;
  for(var i=0;i<a.length;i++){
    var x=a[i],y=b[i];
    if(x===y){identiques++;continue;}
    if(OFF_VARIANT_WORDS.indexOf(x)!==-1&&OFF_VARIANT_WORDS.indexOf(y)!==-1)return null;
    if(levenshtein(x,y)>1)return null;
    total+=1;
    if(total>1)return null;
  }
  if(total>0&&identiques===0)return null;
  return total;
}
/* index.html:10310 — seul changement : DRINKS passe en argument au lieu d'etre
   la variable globale du navigateur. */
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
/* index.html:23491 */
function boissonsOrphelines(DRINKS){
  return (DRINKS||[]).filter(function(d){
    return Number(d.id)>=1e12&&!(d.barcodes&&d.barcodes.length);
  });
}
/* index.html:23431 — la partie qui DECIDE : quelle fiche l'ecran propose. */
function cibleDeLaChasse(DRINKS, best){
  var liste=boissonsOrphelines(DRINKS);
  if(!liste.length)return null;
  var cible=null;
  if(best&&best.name){
    var proche=trouverBoissonProche(DRINKS,best.name,best.brand);
    if(proche&&proche.drink&&liste.indexOf(proche.drink)!==-1&&proche.distance<=1)cible=proche.drink;
  }
  return cible;
}
/* index.html:23461 — le texte exact affiche apres l'envoi. */
function ecranApresEnvoi(r){
  return "Merci — c'est note. " + (r&&r.nb>=2
    ? "Une deuxieme personne l'avait deja vue : le code va etre pose pour tout le monde."
    : "Il manque encore une confirmation d'une autre personne pour que le code compte pour tous. De ton cote, il marche deja.");
}
/* index.html:2503 — recopiee a l'identique (ensureAuthed remplace par uid). */
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
/* index.html:1971 — fbSaveDrinkMerge, cote admin. La fiche absorbee N'EST PAS
   supprimee du catalogue : seule meta/drinkMerges la masque. */
async function fbSaveDrinkMerge(oldId, newId) {
  var upd = {}; upd[String(oldId)] = Number(newId);
  await admin(async (db) => setDoc(doc(db, "meta", "drinkMerges"), upd, { merge: true }));
}
/* index.html:1961 fbLoadDrinkMerges + index.html:21670 le filtre : ce que le
   telephone de quelqu'un a reellement en memoire (DRINKS). */
async function catalogueDuTelephone() {
  const merges = await admin(async (db) => {
    const s = await getDoc(doc(db, "meta", "drinkMerges"));
    return s.exists() ? (s.data() || {}) : {};
  });
  const fiches = await admin(async (db) => {
    const snap = await getDocs(collection(db, "catalog"));
    const out = []; snap.forEach((d) => out.push(d.data()));
    return out;
  });
  return fiches.filter(function(d){ return !merges[Number(d.id)]; });
}
/* functions-a-deployer/chasse-codes.js — poserCodeChasse, meme ordre, meme
   verrou, memes points. */
const CONFIRMATIONS_REQUISES = 2, POINTS_PAR_CONFIRMANT = 5;
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
const lireChasse = (id) => admin(async (db) => (await getDoc(doc(db, "chasseCodes", String(id)))).data() || {});
const lireFiche  = (id) => admin(async (db) => (await getDoc(doc(db, "catalog", String(id)))).data() || {});
const lirePoints = (uid) => admin(async (db) => { const s = await getDoc(doc(db, "users", String(uid))); return s.exists() ? (s.data().pts || 0) : 0; });

/* ══ LE CATALOGUE DE DEPART ═══════════════════════════════════════════════
   Deux fiches JUMELLES nees de deux propositions PHOTO du meme produit (c'est
   le doublon que decrit index.html:23337). Aucune n'a de code-barre : toutes
   les deux sont dans la chasse. */
const ID_VIEILLE = 1700000000001;  // promue le 2 septembre
const ID_GARDEE  = 1700000000002;  // promue le 11 septembre, celle qui a la photo
const CODE       = "5000112637922";
/* Ce que la fiche OpenFoodFacts renvoie au scan (offBestProduct, index.html:7949) :
   la MEME chose pour tout le monde, c'est la meme base publique. */
const OFF = { name: "Golden Power Energy Drink", brand: "Golden Power" };

await admin(async (db) => {
  await setDoc(doc(db, "catalog", String(ID_VIEILLE)),
    { id: ID_VIEILLE, name: "Golden Power Energy Drink", brand: "Golden Power", cat: "Energy", fromBarcode: "", createdAt: serverTimestamp() });
  await setDoc(doc(db, "catalog", String(ID_GARDEE)),
    { id: ID_GARDEE, name: "Golden Power Energy Drink", brand: "Golden Power", cat: "Energy", fromBarcode: "", createdAt: serverTimestamp() });
});

/* ══ 1. ALICE, LUNDI ══════════════════════════════════════════════════════ */

let cibleAlice = null;
await doit("1. le telephone d'Alice designe tout seul une fiche (elle ne choisit rien)", async () => {
  const drinks = await catalogueDuTelephone();
  cibleAlice = cibleDeLaChasse(drinks, OFF);
  if (!cibleAlice) throw new Error("aucune fiche proposee : l'ecran de la chasse ne s'affiche pas");
  note("1. -> l'ecran d'Alice : « " + cibleAlice.name + " » est dans Magofeed mais sans code-barre. C'est bien ce que tu as en main ? (fiche " + cibleAlice.id + ")");
});
await doit("1. Alice a bien ce produit en main et repond « Oui, c'est bien elle »", async () => {
  const r = await fbProposerCodeChasse(alice, "alice", cibleAlice.id, cibleAlice.name, CODE);
  note("1. -> ecran d'Alice : " + ecranApresEnvoi(r));
  if (r.nb !== 1) throw new Error("nb attendu 1, recu " + r.nb);
});

/* ══ 2. MARDI : L'ADMIN FAIT LE MENAGE ════════════════════════════════════
   adminMergeDrink (index.html:13098) : la fiche ouverte est le doublon a
   absorber, la fiche a GARDER est celle qui porte la photo. */
await doit("2. l'admin fusionne le doublon dans la fiche gardee", async () => {
  await fbSaveDrinkMerge(ID_VIEILLE, ID_GARDEE);
  const drinks = await catalogueDuTelephone();
  if (drinks.find((d) => Number(d.id) === ID_VIEILLE)) throw new Error("la fiche absorbee est encore affichee");
  if (await lireFiche(ID_VIEILLE).then((f) => !f.id)) throw new Error("catalog/" + ID_VIEILLE + " a ete supprime");
  note("2. -> la fiche " + ID_VIEILLE + " disparait de tous les telephones (index.html:21670) mais catalog/" + ID_VIEILLE + " existe toujours cote serveur.");
});

/* ══ 3. MERCREDI : BOB, MEME PRODUIT, MEME REPONSE ════════════════════════ */

let cibleBob = null;
await doit("3. le telephone de Bob designe la fiche gardee (la seule qui lui reste)", async () => {
  const drinks = await catalogueDuTelephone();
  cibleBob = cibleDeLaChasse(drinks, OFF);
  if (!cibleBob || Number(cibleBob.id) !== ID_GARDEE)
    throw new Error("fiche proposee a Bob : " + (cibleBob && cibleBob.id));
  note("3. -> l'ecran de Bob : « " + cibleBob.name + " » (fiche " + cibleBob.id + ") — meme produit, meme nom, autre fiche qu'Alice (" + cibleAlice.id + ").");
});
let ecranBob = "";
await doit("3. Bob a le produit en main et repond « Oui, c'est bien elle »", async () => {
  const r = await fbProposerCodeChasse(bob, "bob", cibleBob.id, cibleBob.name, CODE);
  ecranBob = ecranApresEnvoi(r);
  note("3. -> ecran de Bob : " + ecranBob);
  if (r.nb !== 2) throw new Error("nb attendu 2, recu " + r.nb);
});
await doit("3. la confirmation de Bob doit viser la fiche que SON ecran nommait", async () => {
  const d = await lireChasse(CODE);
  if (String(d.drinkId) !== String(cibleBob.id))
    throw new Error("le document vise la fiche " + d.drinkId + " (celle d'Alice), pas la fiche " + cibleBob.id + " que Bob a confirmee");
});

/* ══ 4. CE QUE LA CLOUD FUNCTION EN FAIT ══════════════════════════════════ */

await doit("4. le code doit finir sur la fiche que les deux personnes ont confirmee", async () => {
  const etat = await poserCodeChasse(CODE);
  const gardee  = await lireFiche(ID_GARDEE);
  const absorbee = await lireFiche(ID_VIEILLE);
  note("4. -> poserCodeChasse : « " + etat + " » ; fiche gardee.barcodes = " + JSON.stringify(gardee.barcodes || []) +
       " ; fiche absorbee.barcodes = " + JSON.stringify(absorbee.barcodes || []));
  note("4. -> points verses : alice=" + (await lirePoints("alice")) + " bob=" + (await lirePoints("bob")));
  if (!(gardee.barcodes || []).includes(CODE))
    throw new Error("le code est parti sur la fiche " + ID_VIEILLE + ", celle que l'admin a fait disparaitre");
});
await doit("4. apres la pose, scanner ce produit doit enfin trouver la boisson", async () => {
  const drinks = await catalogueDuTelephone();          // ce que voit n'importe quel telephone
  const trouve = drinks.find((d) => (d.barcodes || []).map(String).includes(CODE));
  if (!trouve) throw new Error("aucune fiche visible ne porte le code : le scan repond toujours « pas encore dans Magofeed »");
});
await doit("4. la boisson doit sortir de la chasse (son code est pose)", async () => {
  const drinks = await catalogueDuTelephone();
  const encore = boissonsOrphelines(drinks).find((d) => Number(d.id) === ID_GARDEE);
  if (encore) throw new Error("« " + encore.name + " » reste affichee dans « cherchent leur code-barre »");
});

/* ══ 5. JEUDI : CARL, TROISIEME PERSONNE, MEME RAYON ══════════════════════ */

await doit("5. ce que l'app dit a Carl doit etre vrai", async () => {
  const drinks = await catalogueDuTelephone();
  const cible = cibleDeLaChasse(drinks, OFF);
  const r = await fbProposerCodeChasse(carl, "carl", cible.id, cible.name, CODE);
  const ecran = ecranApresEnvoi(r);
  note("5. -> ecran de Carl : " + ecran + "  (retour reel : " + JSON.stringify(r) + ")");
  if (/pose pour tout le monde/.test(ecran))
    throw new Error("l'ecran promet une pose qui n'aura jamais lieu : le document est deja etat='pose' sur une autre fiche, et les regles interdisent d'en changer");
});
note("5. le code " + CODE + " est brule : chasseCodes/" + CODE + " ne repassera jamais en 'attente' (update limite a 'par', rules:1264), et la fiche " + ID_GARDEE + " restera dans la chasse indefiniment.");

/* ══ 6. TEMOIN : SANS DIVERGENCE, LE PARCOURS EST IMPECCABLE ══════════════
   Meme code, meme fonctions, une seule fiche visee : si le banc etait truque,
   ceci echouerait aussi. */
const ID_TEMOIN = 1700000000009, CODE_TEMOIN = "5449000000996";
await doit("6. temoin : deux personnes qui visent la meme fiche -> code pose au bon endroit", async () => {
  await admin(async (db) => setDoc(doc(db, "catalog", String(ID_TEMOIN)),
    { id: ID_TEMOIN, name: "Vimto Original", brand: "Vimto", cat: "Soda", createdAt: serverTimestamp() }));
  const drinks = await catalogueDuTelephone();
  const cible = cibleDeLaChasse(drinks, { name: "Vimto Original", brand: "Vimto" });
  if (!cible || Number(cible.id) !== ID_TEMOIN) throw new Error("fiche visee : " + (cible && cible.id));
  await fbProposerCodeChasse(alice, "alice", cible.id, cible.name, CODE_TEMOIN);
  await fbProposerCodeChasse(bob, "bob", cible.id, cible.name, CODE_TEMOIN);
  const etat = await poserCodeChasse(CODE_TEMOIN);
  const fiche = await lireFiche(ID_TEMOIN);
  if (etat !== "pose" || !(fiche.barcodes || []).includes(CODE_TEMOIN))
    throw new Error("le temoin lui-meme echoue (" + etat + ") : le banc serait a revoir");
});

await bilan(env);
