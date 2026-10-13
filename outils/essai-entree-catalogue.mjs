/* QUAND UNE NOUVELLE FICHE ARRIVE, REJOINT-ELLE LA BONNE ?
   C'est la question qui compte pour l'avenir : le menage d'aujourd'hui ne vaut
   rien si demain un scan recree un doublon. On simule donc des fiches qui
   arrivent du serveur — comme le fait mergeCatalog avec la collection
   « catalog » — et on verifie que :
     - celles qui sont le MEME produit ne creent pas de ligne, et cedent leur
       code-barres a la fiche qui existe deja ;
     - celles qui sont un AUTRE produit creent bien leur propre ligne.
   Un code-barres inedit sur un produit connu doit enrichir la fiche, jamais
   la dupliquer : c'est tout l'objet du regroupement. */
const { chromium } = (await import("/opt/node22/lib/node_modules/playwright/index.js")).default;
import { createServer } from "node:http";import { readFile } from "node:fs/promises";import { extname, join } from "node:path";
const R="/home/user/magofeed";const M={".html":"text/html",".css":"text/css",".js":"text/javascript",".json":"application/json",".svg":"image/svg+xml",".png":"image/png"};
const srv=createServer(async(q,s)=>{let u=decodeURIComponent(q.url.split("?")[0]);if(u==="/")u="/index.html";
 try{const b=await readFile(join(R,u));s.writeHead(200,{"content-type":M[extname(u)]||"application/octet-stream"});s.end(b);}catch{s.writeHead(404);s.end("");}});
await new Promise(r=>srv.listen(0,r));const port=srv.address().port;
const nav=await chromium.launch({executablePath:"/opt/pw-browsers/chromium"});
const pg=await nav.newPage({viewport:{width:390,height:844}});
await pg.addInitScript(()=>{try{localStorage.setItem("magoOnboard","1");}catch(e){}});
await pg.goto(`http://127.0.0.1:${port}/index.html`);
await pg.waitForFunction(()=>window.DRINKS&&DRINKS.length>100,{timeout:40000});

/* [nom, marque, categorie, code-barres inedit, fiche sur laquelle le code DOIT
    atterrir]. Dans tous les cas le code doit se retrouver quelque part : un
    code-barres qui disparait, c'est une canette qui ne scanne plus. */
const ARRIVEES=[
  /* ── ecrit autrement : le code doit rejoindre la fiche de reference ── */
  ["Red Bull Energy Drink",            "Red Bull","Energy","0000000000101","Red Bull Original"],
  ["Red Bull Boisson énergisante",     "Red Bull","Energy","0000000000102","Red Bull Original"],
  ["Red Bull grande Energy Drink",     "Red Bull","Energy","0000000000103","Red Bull Original"],
  ["Red Bull Original (473 ml)",       "Red Bull","Energy","0000000000104","Red Bull Original"],
  ["Red Bull Sugar Free",              "Red Bull","Energy","0000000000105","Red Bull Sugarfree"],
  ["Red Bull Sans Sucre",              "Red Bull","Energy","0000000000106","Red Bull Sugarfree"],
  ["Rockstar Energy Drink",            "Rockstar","Energy","0000000000107","Rockstar Original"],
  ["Coca-Cola Classique",              "Coca-Cola","Soda","0000000000108","Coca-Cola Original"],
  ["Monster Energy Ultra Red",         "Monster","Energy","0000000000109","Monster Ultra Red"],
  /* ── produits VOISINS mais distincts : le code doit atterrir sur le bon, et
       surtout pas sur l'original ni sur le voisin ── */
  ["Red Bull Zero",                    "Red Bull","Energy","0000000000201","Red Bull Zero"],
  ["Red Bull Pink Edition",            "Red Bull","Energy","0000000000202","Red Bull Pink Edition"],
  ["Coca-Cola Energy",                 "Coca-Cola","Soda","0000000000203","Coca-Cola Energy"],
  ["Monster Ultra White",              "Monster","Energy","0000000000204","Monster Ultra White"],
  ["Carrefour Jus d'orange",           "Carrefour","Jus","0000000000205","Carrefour Jus d'orange"],
  ["Alpro Not Milk 1,8 %",             "Alpro","Lacté","0000000000206","Alpro Not Milk 1,8 %"],
  /* ── vraiment inconnue : une nouvelle fiche doit naitre ── */
  ["Mago Test Boisson Inexistante",    "MagoTest","Soda","0000000000301","Mago Test Boisson Inexistante"],
];
let ko=0;
console.log("  UNE NOUVELLE FICHE ARRIVE DU SERVEUR, AVEC UN CODE-BARRES INEDIT\n");
for(const [nom,marque,cat,code,attendue] of ARRIVEES){
  const r=await pg.evaluate(a=>{
    const [nom,marque,cat,code]=a;
    const avant=DRINKS.length;
    const idMax=Math.max(...DRINKS.map(d=>Number(d.id)||0));
    window.mergeCatalog([{id:idMax+1,name:nom,brand:marque,cat:cat,barcodes:[code]}]);
    const apres=DRINKS.length;
    const porteuse=DRINKS.find(d=>(d.barcodes||[]).some(c=>String(c)===String(code)));
    return {creee:apres>avant, chez:porteuse?porteuse.name:"(code perdu)"};
  },[nom,marque,cat,code]);
  const ok=(r.chez===attendue);
  if(!ok)ko++;
  console.log("   "+(ok?"ok   ":"ECHEC")+(r.creee?" nouvelle":" rejoint ")+"  "+nom.slice(0,34).padEnd(35)+" -> "+r.chez);
}
console.log("\n  "+(ko?(ko+" cas en echec sur "+ARRIVEES.length):("les "+ARRIVEES.length+" arrivees se comportent comme voulu")));
await nav.close();srv.close();
process.exit(ko?1:0);
