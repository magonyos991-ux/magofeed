/* Teste par PAIRES, la seule chose qui compte : ces deux fiches fusionnent-
   elles ? Deux recettes identiques et meme marque et meme categorie = fusion. */
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

/* [marque, catA, nomA, catB, nomB, doivent-elles fusionner ?] */
const PAIRES=[
 ["Red Bull","Energy","Red Bull Original","Energy","Red Bull Energy Drink",true],
 ["Red Bull","Energy","Red Bull Original","Energy","Red Bull Boisson énergisante",true],
 ["Red Bull","Energy","Red Bull Original","Energy","Red Bull Original (355 ml)",true],
 ["Red Bull","Energy","Red Bull Original","Energy","Red Bull grande Energy Drink",true],
 ["Golden Power","Energy","Golden Power Classic","Energy","Golden Power regular",true],
 ["Crazy Tiger","Energy","Crazy Tiger","Energy","Crazy Tiger Energy Drink",true],
 ["Coca-Cola","Soda","Coca-Cola Original","Soda","Coca-Cola Classique",true],
 ["Rockstar","Energy","Rockstar Original","Energy","Rockstar Energy Drink",true],
 ["Monster","Energy","Monster Ultra Red","Energy","Monster Energy Ultra Red",true],
 ["Lipton","Ice Tea","Lipton Lemon Ice Tea","Ice Tea","Lipton Ice Tea : Lemon",true],
 /* ── celles qui ne doivent JAMAIS fusionner ── */
 ["Red Bull","Energy","Red Bull Sans Sucre","Energy","Red Bull Zero",false],
 ["Red Bull","Energy","Red Bull Original","Energy","Red Bull Sans Sucre",false],
 ["Red Bull","Energy","Red Bull Red Edition Pastèque","Energy","Red Bull Apricot Edition",false],
 ["Monster","Energy","Monster Ultra Red","Energy","Monster Ultra White",false],
 ["Monster","Energy","Monster Ultra Red","Energy","Monster Ultra Violet",false],
 ["Coca-Cola","Soda","Coca-Cola Original","Soda","Coca-Cola Energy",false],
 ["Coca-Cola","Soda","Coca-Cola Original","Soda","Coca-Cola Cherry",false],
 ["Irn-Bru","Soda","Irn-Bru Original","Soda","Irn-Bru 1901",false],
 ["Alpro","Lacté","Alpro Not Milk 3,5 %","Lacté","Alpro Not Milk 1,8 %",false],
 ["Joker","Jus","Joker Le Pur Jus Multifruits","Jus","Joker Le Pur Jus -30% Multifruits",false],
 ["Chaudfontaine","Eau","Chaudfontaine Plate","Eau","Chaudfontaine Pétillante",false],
 ["Vimto","Exotique","Vimto Original","Energy","Vimto Energy",false],
 ["U","Jus","Pur jus d'orange a/p flash pasteurisé","Jus","Pur jus d'orange s/p flash pasteurisé",false],
 ["Lipton","Ice Tea","Lipton Ice tea peach","Ice Tea","Lipton Ice tea peach zero sugar",false],
 ["Red Bull","Energy","Red Bull Original","Energy","Red Bull Pink Edition",false],
 ["Red Bull","Energy","Red Bull Pink Edition","Energy","Red Bull Blue Edition Myrtille",false],
 /* AUCUNE REGLE ne peut savoir que la Pink Edition EST celle aux fruits des
    bois : c'est une connaissance produit. La separation est donc le bon
    comportement du code ; le rapprochement, s'il a lieu, passera par la liste
    de fusions jugee a la main. */
 ["Red Bull","Energy","Red Bull Pink Edition","Energy","Red Bull Pink Edition Fruits des Bois",false],
 ["Red Bull","Energy","Red Bull Yellow Edition Tropical","Energy","Red Bull Tropical",true],
 ["Red Bull","Energy","Red Bull Winter Edition","Energy","Red Bull Winter",true],
 /* « nature » ne vaut plus identite : sur une eau il designe bien la version
    plate, mais chez La Vie Claire « Soja nature » est sans sucres ajoutes la
    ou « Boisson au soja » contient du sirop de ble. Le cas de l'eau passe par
    la table de fusions, decide a la main. */
 ["Volvic","Eau","Volvic","Eau","Volvic Nature",false],
 ["La Vie Claire","Lacté","La Vie Claire Soja nature","Lacté","La Vie Claire Boisson au soja",false],
 /* « pur jus » et « jus » sont deux denominations legales distinctes : le
    second peut etre reconstitue a partir de concentre. Vingt groupes du
    catalogue en dependaient. */
 ["Marque Repère","Jus","Marque Repère Pur jus de pomme","Jus","Marque Repère Jus de pomme",false],
 ["Solevita","Jus","Solevita Pur jus multifruits","Jus","Solevita Jus multifruits",false],
 ["Belle France","Jus","Belle France Pur jus d'orange","Jus","Belle France Jus d'orange",false],
 ["Carrefour","Jus","Carrefour Pur Jus d'orange","Jus","Carrefour Jus d'orange",false],
 ["Réa","Jus","Réa Pur Jus d'Orange","Jus","Réa Jus d'Orange",false],
 ["Pressade","Jus","Pressade Pur Jus Orange","Jus","Pressade Jus d'Orange",false],
 /* ...mais deux ecritures du MEME pur jus restent le meme produit. */
 ["Maison Meneau","Jus","Maison Meneau Meneau Pur jus tomate bio","Jus","Maison Meneau Pur Jus Tomate Bio",true],
 /* « sans sucre » et « sugarfree » : meme mot, deux langues. « zero » reste
    une recette a part — c'est tout l'interet de ne traduire que cette
    famille-la. */
 ["Red Bull","Energy","Red Bull Sugarfree","Energy","Red Bull Sans Sucre",true],
 ["Red Bull","Energy","Red Bull Sugarfree","Energy","Red Bull Sugar Free Energy Drink",true],
 ["Red Bull","Energy","Red Bull Sugarfree","Energy","Red Bull Zero",false],
 ["Red Bull","Energy","Red Bull Sans Sucre","Energy","Red Bull Zero",false],
 ["Monster","Energy","Monster Absolutely Zero","Energy","Monster Sans Sucre",false],
 ["Coca-Cola","Soda","Coca-Cola Zéro","Soda","Coca-Cola Original",false],
];
let ko=0;
console.log("  FUSIONNENT-ELLES ? (meme marque + meme recette + meme categorie)\n");
for(const [mq,cA,nA,cB,nB,attendu] of PAIRES){
  const r = await pg.evaluate(a=>{
    const ra=window._motsDeRecette(a[2],a[0],a[1]);
    const rb=window._motsDeRecette(a[4],a[0],a[3]);
    let fusion;
    if(!ra||!rb) fusion = (!ra && !rb && a[1]===a[3]);   /* regle du produit phare */
    else fusion = (ra===rb) || (ra.replace(/ /g,"")===rb.replace(/ /g,""));
    return {ra,rb,fusion};
  },[mq,cA,nA,cB,nB]);
  const ok = (r.fusion===attendu);
  if(!ok)ko++;
  console.log("   "+(ok?"ok   ":"ECHEC")+" "+(r.fusion?"fusion   ":"separees ")
    +nA.slice(0,32).padEnd(33)+" | "+nB.slice(0,32).padEnd(33)
    +(ok?"":"   [« "+r.ra+" » vs « "+r.rb+" »]"));
}
console.log("\n  "+(ko?(ko+" PAIRE(S) EN ECHEC sur "+PAIRES.length):("les "+PAIRES.length+" paires se comportent comme voulu")));
await nav.close();srv.close();
process.exit(ko?1:0);
