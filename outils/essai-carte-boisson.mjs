/* ══ LA CARTE OUVERTE SUR UNE BOISSON CACHE-T-ELLE DES MAGASINS ? ══════════
   DEFAUT SIGNALE SUR CAPTURE D'ECRAN REELLE (Red Bull Pink Edition, 21
   magasins references, aucun confirme). Le fondateur cherchait un magasin
   dont il SAVAIT qu'il avait la boisson. Il n'etait nulle part : ni pin, ni
   ligne de liste. Il a du decouvrir la puce « Tous les magasins » pour le
   retrouver.

   Deux defauts se cumulaient, tous deux introduits le 13 octobre (c9050b9,
   « la carte qui ne parle que de la boisson ») :

     1. LES MAGASINS SANS LA BOISSON ETAIENT EFFACES, pas mis en retrait. Or
        le code qui peint les pins sait les griser depuis toujours
        (opacity:.4;filter:grayscale(1)) : cette branche ne servait plus
        jamais. Sans ces pins, impossible de declarer un stock dans un
        magasin que l'app ignore — le geste meme qui fait vivre Magofeed.

     2. CHERCHER UN MAGASIN PAR SON NOM NE SERVAIT A RIEN. Le filtre par
        boisson s'appliquait AVANT le filtre d'enseigne : taper le nom d'un
        magasin que l'app ne savait pas vendeur rendait une liste vide.

   Ce controle verrouille les deux. Il interroge exploreApplyChips
   directement : c'est elle qui decide, et le rendu Leaflet n'y change rien. */
const { chromium } = (await import("/opt/node22/lib/node_modules/playwright/index.js")).default;
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { createHash } from "node:crypto";

/* MAGO_RACINE : pour essayer une copie de travail (worktree) sans toucher au
   script ; par defaut le depot principal. */
const R=process.env.MAGO_RACINE||"/home/user/magofeed";
const M={".html":"text/html",".css":"text/css",".js":"text/javascript",".json":"application/json",".svg":"image/svg+xml",".png":"image/png"};
const srv=createServer(async(q,s)=>{
  let u=decodeURIComponent(q.url.split("?")[0]); if(u==="/")u="/index.html";
  try{const b=await readFile(join(R,u));s.writeHead(200,{"content-type":M[extname(u)]||"application/octet-stream"});s.end(b);}
  catch{s.writeHead(404);s.end("");}
});
await new Promise(r=>srv.listen(0,r));
const port=srv.address().port;

const nav=await chromium.launch({executablePath:"/opt/pw-browsers/chromium"});
const ctx=await nav.newContext({viewport:{width:390,height:844},
  geolocation:{latitude:50.8793,longitude:4.3511},permissions:["geolocation"],locale:"fr-BE"});
const pg=await ctx.newPage();
const erreurs=[];
pg.on("pageerror",e=>erreurs.push("ERREUR JS : "+String(e.message).slice(0,140)));
/* Vignettes OpenFoodFacts comprises : des <img> de l'accueil que l'evenement load attend, et qui peuvent trainer sans rien dire de ce qu'on mesure ici. */
await pg.route(/tile\.openstreetmap\.org|basemaps\.cartocdn\.com|images\.openfoodfacts\.org/,r=>r.abort());
await pg.addInitScript(()=>{try{localStorage.setItem("magoOnboard","1");}catch(e){}});
await pg.goto(`http://127.0.0.1:${port}/index.html`);
await pg.waitForFunction(()=>window.DRINKS&&DRINKS.length>100,{timeout:40000});
await pg.evaluate(()=>{try{document.getElementById("onboarding")?.remove();}catch(e){}});

const etapes=[];
function verifier(nom,cond,detail){etapes.push([nom,!!cond,detail||""]);}

/* LA SCENE. Cinq magasins autour de la position. Leurs identifiants ne
   commencent PAS par « o » : _stripAutoDrinks ne les touche pas, on isole
   donc bien le filtre par boisson et rien d'autre. */
async function jouer(reglages){
  return pg.evaluate(async(a)=>{
    /* PAS UNE BOISSON COURANTE. Coca-Cola figure dans le rayon PROBABLE de
       tout commerce : magasinALaBoisson repond alors « oui » partout, aucun
       magasin n'est ecarte, et la scene ne teste plus rien. On prend donc la
       boisson du signalement reel (Alpro Barista Cinnamon Roll, 13200), et la
       premisse est verifiee plus bas au lieu d'etre supposee. */
    const d=DRINKS.find(x=>Number(x.id)===13200)||DRINKS.find(x=>x.name==="Alpro Barista Cinnamon Roll");
    const faire=(id,nom,marque,aLaBoisson,confirme)=>({
      id:id,name:nom,brand:marque,lat:50.8793+Math.random()*0.0001,lng:4.3511,
      dist:400,drinks:aLaBoisson?[d.id]:[],
      confirmations:confirme?{[d.id]:2}:{}
    });
    const lot=[
      faire("T1","Night Shop Un","Test",true,true),    /* vend + confirme   */
      faire("T2","Night Shop Deux","Test",true,false), /* vend, non confirme*/
      faire("T3","Night Shop Trois","Test",false,false),
      faire("T4","Night Shop Quatre","Test",false,false),
      faire("T5","Carrefour Jette","Carrefour",false,false) /* celui qu'on cherche */
    ];
    window.exploreFilter={drinkId:d.id,name:d.name};
    window._exploreChips={instock:!!a.instock,open:false,near:0};
    window._exploreTousMagasins=!!a.tous;
    window._exploreBrand=null;
    window._exploreBrandQuery=a.recherche||"";
    window._exploreHorsBoisson=null;
    const gardes=window.exploreApplyChips(lot);
    const retrait=window._exploreHorsBoisson||[];
    /* LA PREMISSE, MESUREE ET NON SUPPOSEE : un magasin sans la boisson doit
       vraiment repondre « je ne l'ai pas ». Si le rayon probable la lui
       attribue quand meme, la scene est invalide et le controle doit le dire
       plutot que de passer en vert pour une mauvaise raison. */
    let premisse=true;
    try{ premisse=!window.magasinALaBoisson(lot[2],d.id); }catch(e){ premisse=false; }
    return {
      gardes:gardes.map(s=>s.id).sort(),
      retrait:retrait.map(s=>s.id).sort(),
      total:lot.length, premisse:premisse, boisson:d?d.name:"INTROUVABLE"
    };
  },reglages);
}

/* ─── 1. Par defaut : on ecarte de la LISTE, on n'efface pas ────────────── */
let v=await jouer({});
verifier("la scene est valide : un non-vendeur dit bien « non »",
  v.premisse, v.premisse?("boisson : "+v.boisson):"LE RAYON PROBABLE L'ATTRIBUE A TOUS");
verifier("liste : seuls les vendeurs",
  JSON.stringify(v.gardes)===JSON.stringify(["T1","T2"]),
  "gardes = "+v.gardes.join(","));
verifier("carte : les autres sont EN RETRAIT, pas effaces",
  JSON.stringify(v.retrait)===JSON.stringify(["T3","T4","T5"]),
  "retrait = "+(v.retrait.join(",")||"AUCUN"));
verifier("AUCUN MAGASIN NE DISPARAIT",
  v.gardes.length+v.retrait.length===v.total,
  v.gardes.length+" + "+v.retrait.length+" = "+v.total);

/* ─── 2. Chercher un magasin par son nom leve le filtre par boisson ─────── */
v=await jouer({recherche:"carrefour"});
verifier("CHERCHER « carrefour » LE TROUVE",
  v.gardes.indexOf("T5")!==-1,
  "gardes = "+(v.gardes.join(",")||"LISTE VIDE"));
verifier("une recherche ne laisse rien en retrait",
  v.retrait.length===0,
  v.retrait.length+" en retrait");

/* ─── 3. Le filtre d'enseigne vaut aussi pour les magasins en retrait ───── */
v=await jouer({});
const deuxTests=await pg.evaluate(async()=>{
  const d=DRINKS.find(x=>x.name==="Coca-Cola Original");
  const lot=[
    {id:"T1",name:"Night Shop Un",brand:"Test",lat:50.8793,lng:4.3511,dist:400,drinks:[d.id],confirmations:{}},
    {id:"T5",name:"Carrefour Jette",brand:"Carrefour",lat:50.8793,lng:4.3511,dist:400,drinks:[],confirmations:{}}
  ];
  window.exploreFilter={drinkId:d.id,name:d.name};
  window._exploreChips={instock:false,open:false,near:0};
  window._exploreTousMagasins=false;
  window._exploreBrand="Test"; window._exploreBrandQuery="";
  window._exploreHorsBoisson=null;
  const g=window.exploreApplyChips(lot);
  const r=window._exploreHorsBoisson||[];
  window._exploreBrand=null;
  return {gardes:g.map(s=>s.id),retrait:r.map(s=>s.id)};
});
verifier("enseigne « Test » : Carrefour ne revient pas en gris",
  deuxTests.retrait.indexOf("T5")===-1,
  "retrait = "+(deuxTests.retrait.join(",")||"AUCUN"));

/* ─── 4. « Tous les magasins » montre tout, sans retrait ────────────────── */
v=await jouer({tous:true});
verifier("« Tous les magasins » montre les cinq",
  v.gardes.length===5,
  v.gardes.length+" magasins");

/* ─── 5. « En stock » reste strict, et ne fabrique pas de retrait ───────── */
v=await jouer({instock:true});
verifier("« En stock » ne garde que le confirme",
  JSON.stringify(v.gardes)===JSON.stringify(["T1"]),
  "gardes = "+(v.gardes.join(",")||"AUCUN"));
verifier("« En stock » garde son propre bandeau (aucun retrait)",
  v.retrait.length===0,
  v.retrait.length+" en retrait");

/* ─── 6. La carte peint reellement le lot mis en retrait ────────────────── */
const source=await readFile(join(R,"index.html"),"utf8");
verifier("la boucle de peinture ajoute le lot en retrait",
  /_pourCarte\s*=\s*_pourCarte\.concat\(_retrait\)/.test(source),
  "_pourCarte.concat(_retrait)");
verifier("le lot en retrait vient du filtre, pas d'ailleurs",
  /var\s+_retrait\s*=\s*\(window\._exploreHorsBoisson\|\|\[\]\)/.test(source),
  "_retrait <- window._exploreHorsBoisson");
verifier("les pins en retrait sont bien grises",
  /exploreFilter&&!hasDrink\)\?"opacity:\.4;filter:grayscale\(1\)"/.test(source),
  "opacity:.4 + grayscale(1)");

/* ─── 7. La carte Explorer d'une boisson n'est pas bloquee a UN pin ─────────
   DEFAUT MESURE (audit, 30 ouvertures, x1 et x4) : 14 fois sur 30, la carte
   annoncait « 720 magasins vendent » et n'affichait qu'un pin ; rouvrir ne
   reparait rien. Cause : la fiche (renderMap) et la carte Explorer
   (openExploreMap) chargeaient CHACUNE le greffon markercluster, sans etat
   partage. Le greffon s'executait deux fois et redefinissait
   L.MarkerClusterGroup ; si exploreLayer naissait entre les deux executions,
   son constructeur n'etait plus la classe en vigueur et le groupe restait
   fige a un marqueur (3 cas effondres sur 3 : exploreLayer.constructor
   !== L.MarkerClusterGroup). Depuis : un seul chargeur (ensureCluster) avec
   etat et file d'attente, une seule balise.
   Chaque ouverture part d'une PAGE NEUVE : le greffon ne se charge qu'une
   fois par page, la course n'existe qu'a la premiere ouverture. Le greffon
   est servi POUR DE VRAI (le navigateur verifie l'empreinte integrity=) :
   copie locale a l'empreinte conforme, sinon telechargement verifie, comme
   dans essai-carte-demontee. MAGO_OUVERTURES regle le nombre d'ouvertures
   (30 par defaut : la taille de la mesure d'origine) ; MAGO_CACHE_LIBS, le
   dossier des copies locales. */
const N_OUVERTURES=Math.max(1,Number(process.env.MAGO_OUVERTURES||30));
const PINS=[];
{
  const re=/(\w+)\.(?:src|href)\s*=\s*"(https:\/\/[^"]+\.(?:js|css))"\s*;?\s*\1\.integrity\s*=\s*"([^"]+)"/g;
  let m; while((m=re.exec(source)))PINS.push({url:m[2],sri:m[3]});
}
const CACHE_LIBS=process.env.MAGO_CACHE_LIBS||join(R,"node_modules/.cache-magofeed");
const sha512=(b)=>"sha512-"+createHash("sha512").update(b).digest("base64");
const libsServies={};
async function servirLibs(page){
  await page.route(/cdnjs\.cloudflare\.com|unpkg\.com/,async(r)=>{
    const u=r.request().url();
    const pin=PINS.find(p=>p.url===u);
    if(!pin)return r.abort();
    const nom=join(CACHE_LIBS,u.split("/").pop());
    let corps=null;
    try{const b=await readFile(nom);if(sha512(b)===pin.sri){corps=b;libsServies[u]="copie locale verifiee";}}catch{}
    if(!corps){
      try{
        const rep=await r.fetch(); const b=Buffer.from(await rep.body());
        if(sha512(b)===pin.sri){corps=b;libsServies[u]="telechargee, empreinte conforme";await mkdir(CACHE_LIBS,{recursive:true}).catch(()=>{});await writeFile(nom,b).catch(()=>{});}
        else libsServies[u]="TELECHARGEE MAIS EMPREINTE DIFFERENTE";
      }catch(e){libsServies[u]="CDN injoignable : "+String(e.message).slice(0,60);}
    }
    if(!corps)return r.abort();
    return r.fulfill({status:200,contentType:/\.css$/i.test(u)?"text/css":"text/javascript",body:corps});
  });
}
/* Une ouverture = une page neuve, 600 magasins fabriques autour de la
   position, Firestore remplace par une doublure qui rend ces magasins apres
   30 ms (c'est ce delai qui placait la naissance d'exploreLayer entre les deux
   executions du greffon dans l'ancien code), puis pick(boisson). */
async function ouvrirDansUnePageNeuve(){
  const c=await nav.newContext({viewport:{width:390,height:844},serviceWorkers:"block",
    geolocation:{latitude:50.8793,longitude:4.3511},permissions:["geolocation"],locale:"fr-BE"});
  const p=await c.newPage(); const errs=[];
  p.on("pageerror",e=>errs.push(String(e.message).slice(0,120)));
  await servirLibs(p);
  await p.route(/tile\.openstreetmap\.org|basemaps\.cartocdn\.com|images\.openfoodfacts\.org|gstatic\.com|googleapis\.com|overpass-api\.de|nominatim/,r=>r.abort());
  await p.addInitScript(()=>{try{["magoOnboard","magoob","magotuto","magoCoach"].forEach(k=>localStorage.setItem(k,"1"));}catch(e){}});
  await p.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:"domcontentloaded",timeout:60000});
  await p.waitForFunction(()=>window.DRINKS&&DRINKS.length>100&&typeof window.pick==="function",{timeout:40000});
  await p.evaluate(()=>{try{document.getElementById("onboarding")?.remove();}catch(e){}});
  const id=await p.evaluate(()=>{
    const d=DRINKS.find(x=>x.name==="Coca-Cola Original")||DRINKS[0];
    window.STORES.length=0; let seed=7; const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
    for(let i=0;i<600;i++){
      const s={id:"T"+i,fbId:"T"+i,name:"Magasin "+i,brand:["Carrefour Express","Delhaize","Proxy","Night Shop",""][i%5],
        lat:50.8793+(rnd()-0.5)*0.045,lng:4.3511+(rnd()-0.5)*0.072,drinks:[],confirmations:{},hours:null,emoji:"",seenAt:{},reports:[]};
      if(i%5<2)s.drinks=[d.id]; if(i%20===0)s.confirmations[d.id]=2; window.STORES.push(s);
    }
    window.fbQueryZone=async function(){await new Promise(r=>setTimeout(r,30));return window.STORES.slice();};
    window._fbReady=true; window._fbLoading=false;
    /* « Juste » = autant de couches que de marqueurs CONFIES au groupe par la
       peinture (addLayers), ni plus ni moins : un groupe effondre en garde 1.
       On ne peut pas lire ce lot autrement : il est local a la peinture. Le
       piege s'installe des que Leaflet existe, AVANT que le greffon (charge
       ensuite, dans une autre balise) ne pose L.markerClusterGroup. */
    window.__piege=setInterval(()=>{
      if(!window.L)return; clearInterval(window.__piege);
      let usine=L.markerClusterGroup;
      const envelopper=(fn)=>{ if(!fn||fn.__env)return fn;
        const e=function(){ const g=fn.apply(this,arguments); const o=g.addLayers;
          if(o)g.addLayers=function(a){ g.__ajoutes=(a||[]).length; return o.apply(this,arguments); };
          return g; };
        e.__env=true; return e; };
      Object.defineProperty(L,"markerClusterGroup",{configurable:true,get(){return usine;},set(v){usine=envelopper(v);}});
    },1);
    return d.id;
  });
  await p.evaluate((id)=>{window.pick(DRINKS.find(x=>x.id===id));},id);
  await p.waitForFunction(()=>window.exploreLayer&&exploreLayer.getLayers&&exploreLayer.getLayers().length>0,{timeout:30000}).catch(()=>{});
  await p.waitForTimeout(1500);
  const etat=await p.evaluate(()=>{
    const g=window.exploreLayer;
    const attendu=(g&&typeof g.__ajoutes==="number")?g.__ajoutes:null;   /* le lot confie par la peinture */
    return {couches:g&&g.getLayers?g.getLayers().length:-1,
      memeClasse:!!(window.L&&L.MarkerClusterGroup&&g&&g.constructor===L.MarkerClusterGroup),
      greffon:!!(window.L&&L.markerClusterGroup),
      balises:document.querySelectorAll('script[src*="markercluster"]').length,
      etatChargeur:window._clusterState||null, attendu};
  });
  await c.close();
  return {...etat,errs};
}
const ouvertures=[];
for(let k=0;k<N_OUVERTURES;k++)ouvertures.push(await ouvrirDansUnePageNeuve());
const greffonLa=ouvertures.every(o=>o.greffon);
const effondrees=ouvertures.filter(o=>o.couches<100||!o.memeClasse);
const balisesMax=Math.max(...ouvertures.map(o=>o.balises));
const exactes=ouvertures.filter(o=>o.attendu!=null&&o.couches===o.attendu).length;
const premiere=ouvertures[0];
verifier("le greffon markercluster est bien servi (sinon la scene ne prouve rien)",
  greffonLa, Object.entries(libsServies).map(([u,v])=>u.split("/").pop()+" : "+v).join(" ; "));
verifier("exploreLayer est bien un L.MarkerClusterGroup en vigueur",
  premiere.memeClasse, "constructor===L.MarkerClusterGroup : "+premiere.memeClasse);
verifier("le nombre de couches est juste (= le lot confie par la peinture)",
  premiere.attendu!=null&&premiere.couches===premiere.attendu, premiere.couches+" couches pour "+premiere.attendu+" marqueurs confies");
verifier("UNE SEULE balise markercluster dans la page", balisesMax===1, balisesMax+" balise(s)");
verifier(N_OUVERTURES+" ouvertures, 0 carte effondree a 1 pin",
  effondrees.length===0, effondrees.length+" effondree(s) sur "+N_OUVERTURES+" ; couches exactes : "+exactes+"/"+N_OUVERTURES);
ouvertures.forEach(o=>o.errs.forEach(e=>erreurs.push("ERREUR JS (ouverture) : "+e)));

console.log("\n  LA CARTE OUVERTE SUR UNE BOISSON CACHE-T-ELLE DES MAGASINS ?\n");
let ko=0;
for(const [nom,ok,det] of etapes){
  if(!ok)ko++;
  console.log("   "+(ok?"ok  ":"ECHEC")+"  "+nom.padEnd(48)+" "+det);
}
console.log("\n  erreurs JavaScript : "+erreurs.length);
erreurs.slice(0,4).forEach(e=>console.log("    "+e));
console.log("\n  "+(ko===0&&erreurs.length===0?"TOUT EST VERT":ko+" CONTROLE(S) EN ECHEC"));
await nav.close(); srv.close();
process.exit(ko===0&&erreurs.length===0?0:1);
