/* Ecrit data/nutrition.js a partir de la recolte.
   Format volontairement compact : un tableau [sucre, calories] aux 100 ml par
   identifiant de boisson, les valeurs manquantes a null. 3800 entrees tiennent
   ainsi en une centaine de kilo-octets, chargees une fois avec le catalogue —
   au lieu de cinq requetes reseau a chaque ouverture de fiche. */
import { readFileSync, writeFileSync } from "node:fs";
const ETAT="/tmp/claude-0/-home-user-magofeed/a4554d7d-14ce-523f-8a9e-0a25d074053d/scratchpad/recolte/etat.json";
const etat=JSON.parse(readFileSync(ETAT,"utf8"));
globalThis.window={};
const src=readFileSync("/home/user/magofeed/data/drinks.js","utf8");
const DRINKS=(new Function(src+";return typeof DRINKS!=='undefined'?DRINKS:window.DRINKS;"))();
const ids=new Set(DRINKS.map(d=>String(d.id)));

const lignes=[];
let n=0,sucre=0,kcal=0;
Object.keys(etat.faits).sort((a,b)=>Number(a)-Number(b)).forEach(id=>{
  if(!ids.has(id))return;                 /* fiche fusionnee depuis la recolte */
  const v=etat.faits[id];
  if(!v)return;
  const s=(v.s===undefined)?"null":v.s;
  const k=(v.k===undefined)?"null":v.k;
  if(v.s!==undefined)sucre++;
  if(v.k!==undefined)kcal++;
  lignes.push(id+":["+s+","+k+"]");
  n++;
});
const entete=`/* VALEURS NUTRITIONNELLES — sucre et calories pour 100 ml.
   Recoltees sur OpenFoodFacts par les codes-barres du catalogue
   (outils/recolter-nutrition.mjs), puis figees ici.

   POURQUOI UN FICHIER ET PAS UN APPEL RESEAU. Interroger OpenFoodFacts a
   l'ouverture de chaque fiche, c'etait jusqu'a cinq requetes, une attente
   visible, et rien du tout hors connexion. Ici tout est deja la.

   FORMAT : identifiant -> [sucre, calories] aux 100 ml. null quand la valeur
   manque. Une fiche absente de cette table n'a pas de valeurs connues : l'app
   n'affiche alors aucun bloc, plutot qu'un tiret.

   LES VALEURS ABERRANTES ONT ETE ECARTEES A LA RECOLTE : OpenFoodFacts est
   alimente a la main et annonce par exemple « 130 kcal/100 ml » pour un soda,
   impossible quand le Coca-Cola en fait 42. Bornes retenues : sucre de 0 a
   40 g, calories de 0 a 100 kcal.

   ${n} boissons sur ${DRINKS.length} — dont ${sucre} avec le sucre et ${kcal} avec les calories.
   Les fiches sans aucun code-barres ne peuvent pas etre interrogees. */
`;
const sortie=entete+"var NUTRI={"+lignes.join(",")+"};\nwindow.NUTRI=NUTRI;\n";
writeFileSync("/home/user/magofeed/data/nutrition.js",sortie);
console.log("  data/nutrition.js ecrit");
console.log("    boissons renseignees : "+n+" / "+DRINKS.length+"   ("+Math.round(n/DRINKS.length*100)+" %)");
console.log("    avec le sucre        : "+sucre);
console.log("    avec les calories    : "+kcal);
console.log("    poids du fichier     : "+Math.round(sortie.length/1024)+" Ko");
