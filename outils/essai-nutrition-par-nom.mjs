/* MESURER AVANT DE REMPLIR.
   654 fiches n'ont pas de valeurs nutritionnelles. On peut les chercher par
   NOM sur OpenFoodFacts au lieu du code-barres — mais une recherche par nom
   se trompe de produit, et une fausse teneur en sucre est un mensonge.
   Alors on mesure la precision AVANT : on prend des fiches dont on connait
   deja la valeur (obtenue par code-barres, donc sure), on cache cette valeur,
   on lance la recherche par nom, et on compare. Le taux d'accord obtenu est
   la precision de la methode. */
import fs from "node:fs";
const UA={headers:{"User-Agent":"Magofeed/1.0 (github magonyos991-ux/magofeed)"}};
const racine="/home/user/magofeed";
globalThis.window={};
/* eval indirect : un module ESM est en mode strict, ou « var » resterait
   enferme dans l'eval. (0,eval) execute au scope global et pose bien
   DRINKS et NUTRI sur globalThis. */
(0,eval)(fs.readFileSync(racine+"/data/drinks.js","utf8"));
(0,eval)(fs.readFileSync(racine+"/data/nutrition.js","utf8"));
const D=globalThis.DRINKS||globalThis.window.DRINKS;
const N=globalThis.NUTRI||globalThis.window.NUTRI;

const norm=s=>String(s||"").toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g,"")
  .replace(/[ışğüöç]/g,c=>({"ı":"i","ş":"s","ğ":"g","ü":"u","ö":"o","ç":"c"}[c]||c))
  .replace(/[^a-z0-9]+/g," ").trim();

/* Mots qui ne distinguent rien : presents partout, ils ne prouvent pas qu'on
   tient le bon produit. */
const BANALS=new Set("original originale classic classique cola soda jus juice the tea eau water drink boisson zero light max sans sucre bio pur pure nature naturel petillante sparkling de du la le les et and canette bouteille cl ml l pack".split(" "));

function motsUtiles(s){return norm(s).split(" ").filter(m=>m.length>2&&!BANALS.has(m));}

/* UN RESULTAT NE COMPTE QUE S'IL EST CERTAIN.
   Deux conditions, les deux obligatoires :
   1. la marque de la fiche se retrouve dans le resultat (nom ou marque) ;
   2. au moins un mot distinctif du nom de la fiche s'y retrouve aussi.
   Sinon on n'ecrit rien. Mieux vaut une fiche sans chiffre qu'un faux chiffre. */
function accepte(fiche,hit){
  const texteHit=norm((hit.product_name||"")+" "+[].concat(hit.brands||[]).join(" "));
  const marque=norm(fiche.brand||"");
  if(marque&&!texteHit.includes(marque))return false;
  const mots=motsUtiles(fiche.name).filter(m=>m!==marque&&!marque.includes(m));
  if(!mots.length)return false;
  return mots.some(m=>texteHit.includes(m));
}

async function chercher(fiche){
  const q=encodeURIComponent((fiche.brand||"")+" "+(fiche.name||""));
  const u="https://search.openfoodfacts.org/search?q="+q+"&page_size=15"+
    "&fields=code,product_name,brands,sugars_100g,energy-kcal_100g,nutriments";
  const r=await fetch(u,UA);
  if(!r.ok)return {err:r.status};
  const j=await r.json();
  for(const h of (j.hits||[])){
    const n=h.nutriments||{};
    const s=n.sugars_100g, k=n["energy-kcal_100g"];
    if(typeof s!=="number"&&typeof k!=="number")continue;
    if(!accepte(fiche,h))continue;
    return {code:h.code,nom:h.product_name,sucre:typeof s==="number"?s:null,kcal:typeof k==="number"?k:null};
  }
  return null;
}

/* Echantillon de controle : des fiches dont la valeur est DEJA connue. */
const connues=D.filter(d=>N[d.id]&&typeof N[d.id][0]==="number");
const pas=Math.max(1,Math.floor(connues.length/90));
const ech=connues.filter((_,i)=>i%pas===0).slice(0,90);

let teste=0,repondu=0,accord=0,desaccord=0,erreurs=0;
const faux=[];
for(const d of ech){
  teste++;
  let got=null;
  try{got=await chercher(d);}catch(e){erreurs++;continue;}
  if(got&&got.err){erreurs++;await new Promise(r=>setTimeout(r,1500));continue;}
  if(!got){await new Promise(r=>setTimeout(r,900));continue;}
  repondu++;
  const vrai=N[d.id][0];
  const ecart=Math.abs(got.sucre-vrai);
  /* 0,6 g aux 100 ml de tolerance : les formats et les lots varient un peu. */
  if(got.sucre!==null&&ecart<=0.6)accord++;
  else{desaccord++;if(faux.length<10)faux.push({fiche:d.name,attendu:vrai,obtenu:got.sucre,via:got.nom});}
  await new Promise(r=>setTimeout(r,900));
}
console.log("=== PRECISION DE LA RECHERCHE PAR NOM ===");
console.log("fiches testees        :",teste);
console.log("reponse acceptee      :",repondu,"("+Math.round(repondu/teste*100)+"% de couverture)");
console.log("  valeur identique    :",accord);
console.log("  valeur differente   :",desaccord);
console.log("erreurs reseau        :",erreurs);
if(repondu)console.log("PRECISION             :",Math.round(accord/repondu*100)+"%");
console.log("\nexemples de desaccord :");
faux.forEach(f=>console.log("  -",f.fiche,"| attendu",f.attendu,"| obtenu",f.obtenu,"| via:",f.via));
