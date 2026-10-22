/* RECOLTE DES VALEURS NUTRITIONNELLES POUR TOUT LE CATALOGUE.
   Interroge OpenFoodFacts, un code-barres a la fois (le point de recherche
   groupee est ferme aux robots), en respectant sa limite de 100 requetes par
   minute. On s'arrete des qu'une fiche a sucre ET calories : inutile
   d'interroger les quatre autres codes d'un Coca-Cola.
   REPRISE : l'avancement est ecrit tous les 40 produits. Relancer la commande
   repart ou elle s'etait arretee, sans refaire ce qui est deja fait.
   Usage : node outils/recolter-nutrition.mjs [--max N] */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const ETAT="/tmp/claude-0/-home-user-magofeed/a4554d7d-14ce-523f-8a9e-0a25d074053d/scratchpad/recolte/etat.json";
const UA={"User-Agent":"Magofeed/1.0 (application communautaire de boissons sans alcool; contact via github.com/magonyos991-ux/magofeed)"};
const PAUSE=620;                       /* ~97 requetes/minute, sous la limite */
const MAX=(()=>{const i=process.argv.indexOf("--max");return i>0?Number(process.argv[i+1]):Infinity;})();

globalThis.window={};
const src=readFileSync("/home/user/magofeed/data/drinks.js","utf8");
const DRINKS=(new Function(src+";return typeof DRINKS!=='undefined'?DRINKS:window.DRINKS;"))();

let etat={faits:{},requetes:0,debut:Date.now()};
if(existsSync(ETAT)){try{etat=JSON.parse(readFileSync(ETAT,"utf8"));}catch(e){}}
const dort=ms=>new Promise(r=>setTimeout(r,ms));

/* Bornes de plausibilite pour une boisson, aux 100 ml. OpenFoodFacts est
   alimente a la main : « 130 kcal/100 ml » pour un soda est une faute de
   saisie, pas une information. */
function garder(n){
  const o={};
  if(typeof n.sucre==="number"&&n.sucre>=0&&n.sucre<=40)o.s=Math.round(n.sucre*10)/10;
  if(typeof n.kcal==="number"&&n.kcal>=0&&n.kcal<=100)o.k=Math.round(n.kcal);
  return (o.s!==undefined||o.k!==undefined)?o:null;
}

const aFaire=DRINKS.filter(d=>(d.barcodes||[]).length&&etat.faits[String(d.id)]===undefined);
console.log("  catalogue : "+DRINKS.length+" boissons");
console.log("  deja traitees : "+Object.keys(etat.faits).length);
console.log("  a traiter maintenant : "+Math.min(aFaire.length,MAX)+"\n");

let n=0, trouves=0, muets=0;
for(const d of aFaire){
  if(n>=MAX)break;
  const codes=(d.barcodes||[]).slice(0,5);
  let acc={};
  for(const c of codes){
    try{
      const r=await fetch("https://world.openfoodfacts.org/api/v0/product/"+encodeURIComponent(c)+".json?fields=nutriments",{headers:UA});
      etat.requetes++;
      if(r.status===200){
        const j=await r.json();
        if(j&&j.status===1&&j.product){
          const nn=j.product.nutriments||{};
          if(acc.sucre===undefined&&typeof nn["sugars_100g"]==="number")acc.sucre=nn["sugars_100g"];
          if(acc.kcal===undefined&&typeof nn["energy-kcal_100g"]==="number")acc.kcal=nn["energy-kcal_100g"];
        }
      }else if(r.status===429){ await dort(12000); }
    }catch(e){}
    await dort(PAUSE);
    if(acc.sucre!==undefined&&acc.kcal!==undefined)break;
  }
  const v=garder(acc);
  etat.faits[String(d.id)]=v;             /* null = cherche, rien trouve */
  if(v)trouves++; else muets++;
  n++;
  if(n%40===0){
    writeFileSync(ETAT,JSON.stringify(etat));
    const vus=Object.keys(etat.faits).length;
    const pc=Math.round(vus/DRINKS.length*100);
    console.log("  "+vus+"/"+DRINKS.length+"  ("+pc+" %)   trouvees cette session : "+trouves+"   muettes : "+muets+"   requetes : "+etat.requetes);
  }
}
writeFileSync(ETAT,JSON.stringify(etat));
const total=Object.values(etat.faits).filter(Boolean).length;
console.log("\n  SESSION TERMINEE");
console.log("    traitees au total : "+Object.keys(etat.faits).length+"/"+DRINKS.length);
console.log("    avec des valeurs  : "+total);
