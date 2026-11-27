/* ══ IMAGES ET STOCKAGE : CE QUE L'APP DEMANDE AU RÉSEAU, CE QU'ELLE GARDE ═══
   Deux constats de l'audit du 21/11, mesurés sur iPhone 13 émulé :

   1. Une recherche (« cola ») créait 110 à 164 <img> d'un coup, sans
      loading="lazy" : les vignettes visibles attendaient derrière cent
      invisibles. Et sans crossorigin="anonymous", la réponse d'Open Food Facts
      est OPAQUE : le service worker ne peut pas la ranger, donc aucune photo
      déjà vue ne survit hors ligne.

   2. Le cache photo (imgCache) était réécrit EN ENTIER dans localStorage à
      chaque photo trouvée (jusqu'à 40 fois par session), photos communautaires
      en base64 comprises (250 Ko l'une) : 60-200 ms de gel par écriture, et le
      quota iOS (~2,5 M de caractères) atteint en silence — à partir de là,
      favoris, notes, prix et votes ne s'écrivaient plus, sans un mot.

   Ce contrôle verrouille les deux correctifs :
     1. première recherche : < 30 requêtes d'images ; les <img> Open Food Facts
        portent crossorigin / lazy / async, les 8 premières fetchpriority=high,
        les vignettes de liste demandent la taille .200 ; une photo en data:
        n'a JAMAIS de crossorigin ;
     2. dix photos résolues d'affilée = UNE écriture d'imgCache (différée) ;
     3. une photo base64 reste en mémoire pour la session mais n'est pas
        sérialisée ; l'écriture en attente part sur pagehide et sur
        visibilitychange (hidden) ;
     4. localStorage rempli à 2,4 M de caractères : un favori ajouté est là au
        rechargement, et renderFavs a bien été appelé ;
     5. stockage au bord du quota : le favori passe quand même (le cache photo
        est purgé pour lui faire place) ; quand il n'y a plus rien à purger,
        l'app le DIT (toast « Stockage plein ») au lieu de planter ;
     6. visionneuse : la .400 suffit ; la .full (jusqu'à 740 Ko) ne part que
        sur demande ;
     7. la ligne Notifications des Réglages se rafraîchit à l'ouverture de
        l'écran, plus par un minuteur à vie.

   Lancer :  MAGO_RACINE=$PWD node outils/essai-images-stockage.mjs
   (sans MAGO_RACINE, le dépôt principal est testé). */
const { chromium, devices } = (await import("/opt/node22/lib/node_modules/playwright/index.js")).default;
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const R=process.env.MAGO_RACINE||"/home/user/magofeed";
const M={".html":"text/html",".css":"text/css",".js":"text/javascript",".json":"application/json",".svg":"image/svg+xml",".png":"image/png"};
const srv=createServer(async(q,s)=>{
  let u=decodeURIComponent(q.url.split("?")[0]); if(u==="/")u="/index.html";
  try{const b=await readFile(join(R,u));s.writeHead(200,{"content-type":M[extname(u)]||"application/octet-stream"});s.end(b);}
  catch{s.writeHead(404);s.end("");}
});
await new Promise(r=>srv.listen(0,r));
const port=srv.address().port;

/* Un PNG d'un pixel : chaque <img> Open Food Facts « charge » vraiment, avec
   l'en-tête CORS que le vrai serveur envoie (access-control-allow-origin: *).
   Sans lui, un <img crossorigin> échouerait — ce qui vérifie au passage que
   l'attribut est compatible avec ce que renvoie OFF. */
const PNG=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==","base64");
const OFF_IMG=(id,taille)=>"https://images.openfoodfacts.org/images/products/000/000/000/"+String(id).slice(-4).padStart(4,"0")+"/front_fr."+id+"."+(taille||400)+".jpg";

const nav=await chromium.launch({executablePath:"/opt/pw-browsers/chromium"});
/* serviceWorkers:"block" : une fois sw.js aux commandes, les requêtes d'images
   passent par lui et page.route ne les voit plus (on compterait 0 requête pour
   113 vignettes). Ici on mesure ce que la PAGE demande ; le service worker a
   ses propres contrôles. */
const ctx=await nav.newContext({...devices["iPhone 13"],locale:"fr-BE",serviceWorkers:"block",
  geolocation:{latitude:50.8793,longitude:4.3511},permissions:["geolocation"]});
const pg=await ctx.newPage();
const erreurs=[];
pg.on("pageerror",e=>erreurs.push("ERREUR JS : "+String(e.message).slice(0,140)));

let reqOFF=[];
await pg.route(/images\.openfoodfacts\.org/,r=>{
  reqOFF.push(r.request().url());
  r.fulfill({status:200,contentType:"image/png",headers:{"access-control-allow-origin":"*"},body:PNG});
});
await pg.route(/tile\.openstreetmap\.org|basemaps\.cartocdn\.com/,r=>r.abort());
/* Open Food Facts répond pour les boissons annoncées (attendusOFF), avec une
   fiche qui passe le filtre strict (même nom, même marque, catégorie boisson),
   et tombe en panne pour tout le reste. */
let attendusOFF=[];
await pg.route(/world\.openfoodfacts\.org/,r=>{
  const u=new URL(r.request().url());
  const termes=u.searchParams.get("search_terms")||"";
  const d=attendusOFF.find(x=>(x.brand+" "+x.name).slice(0,60)===termes);
  if(d&&/search\.pl/.test(u.pathname)){
    return r.fulfill({status:200,contentType:"application/json",body:JSON.stringify({products:[{
      product_name:d.name,brands:d.brand,categories_tags:["en:beverages"],image_front_url:OFF_IMG(d.id,400)}]})});
  }
  r.abort();
});

const etapes=[];
function verifier(nom,cond,detail){etapes.push([nom,!!cond,detail||""]);}
const attendre=(ms)=>pg.waitForTimeout(ms);

await pg.addInitScript(()=>{try{localStorage.setItem("magoOnboard","1");}catch(e){}});
async function demarrer(){
  await pg.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>window.DRINKS&&DRINKS.length>100&&typeof toggleFav==="function",{timeout:40000});
  await pg.evaluate(()=>{try{document.getElementById("onboarding")?.remove();}catch(e){}});
  /* Compteur d'écritures : chaque setItem est compté par clé. */
  await pg.evaluate(()=>{
    window.__ecritures={};
    const orig=Storage.prototype.setItem;
    Storage.prototype.setItem=function(k,v){window.__ecritures[k]=(window.__ecritures[k]||0)+1;return orig.call(this,k,v);};
  });
}
await demarrer();

/* ─── 1. Première recherche : peu de requêtes, les bons attributs ─────────── */
await pg.evaluate(()=>navTo("search"));
await pg.waitForFunction(()=>{const s=document.querySelector(".screen.on");return s&&s.id==="s-search";},{timeout:10000});
reqOFF=[];
await pg.fill("#q","cola");
await pg.waitForFunction(()=>document.querySelectorAll("#search-list .ritem").length>50,{timeout:15000});
/* Les attributs se lisent TOUT DE SUITE après le premier rendu : si Firebase
   répond entre-temps (catalogue, photos communautaires), la liste est
   reconstruite dans la même tâche que l'accueil, et le compteur de salve
   d'imgOFF attribue alors ses 8 « high » aux vignettes de l'accueil — sans
   conséquence (ces images sont déjà en cache), mais le contrôle doit viser le
   rendu que la personne déclenche en tapant. */
const liste=await pg.evaluate(()=>{
  const imgs=[...document.querySelectorAll('#search-list img')].filter(i=>/^https:\/\/images\.openfoodfacts\.org\//.test(i.getAttribute("src")||""));
  const a=(i,n)=>i.getAttribute(n);
  return {
    lignes:document.querySelectorAll("#search-list .ritem").length,
    imgOFF:imgs.length,
    cross:imgs.filter(i=>a(i,"crossorigin")==="anonymous").length,
    lazy:imgs.filter(i=>a(i,"loading")==="lazy").length,
    asyn:imgs.filter(i=>a(i,"decoding")==="async").length,
    hautes:imgs.slice(0,8).filter(i=>a(i,"fetchpriority")==="high").length,
    hautesApres:imgs.slice(8).filter(i=>a(i,"fetchpriority")==="high").length,
    en200:imgs.filter(i=>/\.200\.jpg/.test(a(i,"src"))).length,
    en400:imgs.filter(i=>/\.400\.jpg/.test(a(i,"src"))).length
  };
});
await attendre(2500);
const requetesPremierRendu=reqOFF.length;
verifier("1. première recherche : moins de 30 requêtes d'images",requetesPremierRendu<30,requetesPremierRendu+" requêtes pour "+liste.imgOFF+" <img> OFF sur "+liste.lignes+" lignes");
verifier("1. toutes les <img> OFF portent crossorigin=anonymous",liste.imgOFF>0&&liste.cross===liste.imgOFF,liste.cross+"/"+liste.imgOFF);
verifier("1. toutes portent loading=lazy et decoding=async",liste.lazy===liste.imgOFF&&liste.asyn===liste.imgOFF,"lazy "+liste.lazy+" · async "+liste.asyn);
verifier("1. les 8 premières portent fetchpriority=high, pas les suivantes",liste.hautes===8&&liste.hautesApres===0,liste.hautes+" hautes, puis "+liste.hautesApres);
verifier("1. les vignettes de liste demandent la taille .200",liste.en200===liste.imgOFF&&liste.en400===0,".200 : "+liste.en200+" · .400 : "+liste.en400);
const dataAttr=await pg.evaluate(()=>{
  const modele=DRINKS.find(x=>!x.img)||DRINKS[0];
  const d=Object.assign({},modele,{id:"essai-data-attr"});
  imgCache[String(d.id)]={url:"data:image/png;base64,iVBORw0KGgo=",ts:Date.now(),community:true};
  const html=drinkIconHTML(d);
  delete imgCache[String(d.id)];
  return {src:/<img [^>]*src="data:/.test(html),cross:/crossorigin/.test(html),asyn:/decoding="async"/.test(html)};
});
verifier("1. une photo en data: n'a jamais de crossorigin (mais decoding=async)",dataAttr.src&&!dataAttr.cross&&dataAttr.asyn,JSON.stringify(dataAttr));

/* ─── 2. Dix photos résolues d'affilée = UNE écriture d'imgCache ──────────── */
const dix=await pg.evaluate(()=>{
  const ok=[];
  for(const d of DRINKS){
    if(d.img||(d.barcodes&&d.barcodes.length))continue;
    if(!/^[a-z0-9 ]+$/i.test(d.brand||"")||!/^[a-z0-9 ]+$/i.test(d.name||""))continue;
    if(imgCache[String(d.id)])continue;
    ok.push({id:d.id,name:d.name,brand:d.brand});
    if(ok.length===10)break;
  }
  return ok;
});
attendusOFF=dix;
await pg.evaluate((ids)=>{
  window.__ecritures[IMG_CACHE_KEY]=0;
  ids.forEach(id=>{const d=DRINKS.find(x=>String(x.id)===String(id));fetchVerifiedOFFImage(d);});
},dix.map(d=>d.id));
const dixResolues=await pg.waitForFunction((ids)=>ids.every(id=>imgCache[String(id)]&&imgCache[String(id)].url),dix.map(d=>d.id),{timeout:20000}).then(()=>true).catch(()=>false);
await attendre(2500);
const ecr=await pg.evaluate((ids)=>{
  const stocke=JSON.parse(localStorage.getItem(IMG_CACHE_KEY)||"{}");
  return {ecritures:window.__ecritures[IMG_CACHE_KEY]||0,stockees:ids.filter(id=>stocke[String(id)]&&stocke[String(id)].url).length};
},dix.map(d=>d.id));
verifier("2. les 10 photos sont résolues",dixResolues,dix.length+" boissons : "+dix.slice(0,3).map(d=>d.brand+" "+d.name).join(" · ")+"…");
verifier("2. une seule écriture d'imgCache pour 10 photos (différée 1,5 s)",ecr.ecritures===1,ecr.ecritures+" écriture(s)");
verifier("2. et les 10 sont bien dans localStorage après le délai",ecr.stockees===10,ecr.stockees+"/10");
/* Coût d'UNE écriture avec un cache réaliste (600 URL + 10 photos base64 de
   250 Ko en mémoire), CPU bridé x4 comme un iPhone moyen. Avant : 60 à 200 ms
   par écriture, 2,6 M de caractères ; les photos ne sont plus sérialisées. */
const cdp=await ctx.newCDPSession(pg);
await cdp.send("Emulation.setCPUThrottlingRate",{rate:4});
const cout=await pg.evaluate(()=>{
  for(let i=0;i<600;i++)imgCache["cout-u"+i]={url:"https://images.openfoodfacts.org/images/products/500/011/254/5326/front."+i+".400.jpg",ts:Date.now()};
  const photo="data:image/jpeg;base64,"+"A".repeat(250*1024);
  for(let i=0;i<10;i++)imgCache["cout-p"+i]={url:photo,ts:Date.now(),community:true};
  const nouveau=typeof _imgCacheEcrireMaintenant==="function";
  const ecrit=()=>{if(nouveau)_imgCacheEcrireMaintenant();else localStorage.setItem(IMG_CACHE_KEY,JSON.stringify(imgCache));};
  const t=[];
  for(let k=0;k<5;k++){const t0=performance.now();ecrit();t.push(+(performance.now()-t0).toFixed(1));}
  const taille=(localStorage.getItem(IMG_CACHE_KEY)||"").length;
  Object.keys(imgCache).forEach(k=>{if(/^cout-/.test(k))delete imgCache[k];});
  ecrit();
  return {ms:t,mediane:t.slice().sort((a,b)=>a-b)[2],taille};
});
await cdp.send("Emulation.setCPUThrottlingRate",{rate:1});
verifier("2. une écriture du cache (600 URL + 10 photos base64 en RAM) < 10 ms à CPU x4",cout.mediane<10&&cout.taille<200000,"médiane "+cout.mediane+" ms ("+cout.ms.join(" / ")+") · "+cout.taille+" car. écrits");

/* ─── 3. Le base64 reste en mémoire, pas dans localStorage ; vidage au départ ─ */
const r3=await pg.evaluate((off)=>{
  const KEY=IMG_CACHE_KEY, nouveau=typeof sauverImgCache==="function";
  imgCache["essai-data"]={url:"data:image/png;base64,iVBORw0KGgo=",ts:Date.now(),community:true};
  imgCache["essai-url"]={url:off,ts:Date.now()};
  if(nouveau)sauverImgCache();else localStorage.setItem(KEY,JSON.stringify(imgCache));
  const avantFlush=(localStorage.getItem(KEY)||"").indexOf("essai-url")!==-1;
  window.dispatchEvent(new Event("pagehide"));
  const stocke=localStorage.getItem(KEY)||"";
  return {nouveau,avantFlush,urlStockee:stocke.indexOf("essai-url")!==-1,dataStockee:stocke.indexOf("essai-data")!==-1,
    enRam:!!(imgCache["essai-data"]&&imgCache["essai-data"].url.indexOf("data:")===0),
    affichee:getCachedDrinkImage({id:"essai-data"})===imgCache["essai-data"].url};
},OFF_IMG("essai-url",400));
verifier("3. l'écriture est différée (rien d'écrit tout de suite)",r3.nouveau&&!r3.avantFlush,JSON.stringify({nouveau:r3.nouveau,ecritTout_de_suite:r3.avantFlush}));
verifier("3. pagehide vide l'écriture en attente",r3.urlStockee,"essai-url stockée : "+r3.urlStockee);
verifier("3. la photo base64 n'est pas sérialisée mais reste affichable",!r3.dataStockee&&r3.enRam&&r3.affichee,JSON.stringify({stockee:r3.dataStockee,enRam:r3.enRam,affichee:r3.affichee}));
const r3b=await pg.evaluate((off)=>{
  imgCache["essai-vis"]={url:off,ts:Date.now()};
  if(typeof sauverImgCache==="function")sauverImgCache();
  Object.defineProperty(document,"visibilityState",{value:"hidden",configurable:true});
  document.dispatchEvent(new Event("visibilitychange"));
  delete document.visibilityState;
  return (localStorage.getItem(IMG_CACHE_KEY)||"").indexOf("essai-vis")!==-1;
},OFF_IMG("essai-vis",400));
verifier("3. visibilitychange (hidden) vide aussi l'écriture en attente",r3b,"essai-vis stockée : "+r3b);

/* ─── 4. localStorage à 2,4 M de caractères, puis un favori ─────────────────── */
const idFav1=await pg.evaluate(()=>{
  const taille=Object.keys(localStorage).reduce((s,k)=>s+k.length+(localStorage.getItem(k)||"").length,0);
  localStorage.setItem("essai-lest","x".repeat(Math.max(0,2400000-taille)));
  window.__renderFavs=0;const o=window.renderFavs;window.renderFavs=function(){window.__renderFavs++;return o.apply(this,arguments);};
  const d=DRINKS.find(x=>favorites.indexOf(x.id)===-1);
  toggleFav(d.id);
  return {id:d.id,renderFavs:window.__renderFavs,taille:Object.keys(localStorage).reduce((s,k)=>s+k.length+(localStorage.getItem(k)||"").length,0)};
});
await demarrer();
const favApres=await pg.evaluate((id)=>favorites.indexOf(id)!==-1,idFav1.id);
verifier("4. à 2,4 M de caractères, le favori est là au rechargement",favApres,"taille totale "+idFav1.taille+" car.");
verifier("4. et renderFavs a été appelé",idFav1.renderFavs>=1,idFav1.renderFavs+" appel(s)");

/* ─── 5. Au bord du quota : le cache photo cède la place ; sinon on le dit ──── */
/* Remplit jusqu'au quota, puis au caractère près : le dernier bloc grossit
   d'un caractère à la fois jusqu'au refus. Sans cette finition, il restait
   quelques dizaines de caractères libres — assez pour un identifiant de favori,
   et le scénario ne prouvait rien. */
const remplir=`(function(){var n=0;[500000,100000,20000,4000,800,160,32,8].forEach(function(t){for(;;){try{localStorage.setItem("essai-plein-"+(n++),"y".repeat(t));}catch(e){break;}}});
  var k="essai-plein-0",v=localStorage.getItem(k)||"";for(var i=0;i<4000;i++){try{localStorage.setItem(k,v+"y");v+="y";}catch(e){break;}}return n;})()`;
/* toggleFav affiche son propre toast (« En favori · … ») APRÈS l'écriture : on
   note donc tous les toasts émis, au lieu de lire le dernier affiché. */
const espionnerToasts=`(function(){window.__toasts=[];var o=window.toast;window.toast=function(m){window.__toasts.push(String(m));return o.apply(this,arguments);};})()`;
const r5=await pg.evaluate(([code,espion])=>{
  eval(espion);
  /* Un cache photo bien garni (300 URL), écrit maintenant. */
  for(let i=0;i<300;i++)imgCache["essai-u"+i]={url:"https://images.openfoodfacts.org/images/products/000/000/000/"+String(i).padStart(4,"0")+"/front_fr."+i+".400.jpg",ts:Date.now()-i*1000};
  if(typeof sauverImgCache==="function"){sauverImgCache();window.dispatchEvent(new Event("pagehide"));}
  else localStorage.setItem(IMG_CACHE_KEY,JSON.stringify(imgCache));
  const cacheAvant=(localStorage.getItem(IMG_CACHE_KEY)||"").length;
  const blocs=eval(code);
  const d=DRINKS.find(x=>favorites.indexOf(x.id)===-1);
  let lance=null;
  try{toggleFav(d.id);}catch(e){lance=String(e&&e.name||e);}
  return {id:d.id,blocs,lance,cacheAvant,cacheApres:(localStorage.getItem(IMG_CACHE_KEY)||"").length,
    favStocke:JSON.parse(localStorage.getItem("magofavs")||"[]").indexOf(d.id)!==-1,
    plein:window.__toasts.some(m=>/Stockage plein/.test(m))};
},[remplir,espionnerToasts]);
verifier("5. au bord du quota, l'ajout d'un favori ne lève plus d'exception",!r5.lance,"exception : "+(r5.lance||"aucune")+" · "+r5.blocs+" blocs de lest");
verifier("5. le cache photo a été purgé pour lui faire place",r5.cacheApres<r5.cacheAvant,"imgCache "+r5.cacheAvant+" -> "+r5.cacheApres+" car.");
verifier("5. le favori est écrit, sans « Stockage plein »",r5.favStocke&&!r5.plein,"stocké : "+r5.favStocke+" · toast Stockage plein : "+r5.plein);
await demarrer();
const fav2Apres=await pg.evaluate((ids)=>ids.map(id=>favorites.indexOf(id)!==-1),[idFav1.id,r5.id]);
verifier("5. les deux favoris sont là au rechargement",fav2Apres.every(Boolean),JSON.stringify(fav2Apres));
const r5b=await pg.evaluate(([code,espion])=>{
  eval(espion);
  Object.keys(imgCache).forEach(k=>{delete imgCache[k];});
  try{localStorage.removeItem(IMG_CACHE_KEY);}catch(e){}
  eval(code);
  const d=DRINKS.find(x=>favorites.indexOf(x.id)===-1);
  let lance=null;
  try{toggleFav(d.id);}catch(e){lance=String(e&&e.name||e);}
  return {lance,plein:window.__toasts.some(m=>/Stockage plein/.test(m)),
    favStocke:JSON.parse(localStorage.getItem("magofavs")||"[]").indexOf(d.id)!==-1};
},[remplir,espionnerToasts]);
verifier("5. plus rien à purger : l'app dit « Stockage plein » au lieu de planter",!r5b.lance&&r5b.plein&&!r5b.favStocke,"exception : "+(r5b.lance||"aucune")+" · toast Stockage plein : "+r5b.plein+" · favori stocké : "+r5b.favStocke);
await pg.evaluate(()=>{Object.keys(localStorage).filter(k=>/^essai-/.test(k)).forEach(k=>localStorage.removeItem(k));});
await demarrer();

/* ─── 6. Visionneuse : la .400 d'abord, la .full seulement à la demande ─────── */
const avecImg=await pg.evaluate(()=>{const d=DRINKS.find(x=>x.img&&/\.400\.jpg$/.test(x.img));return {id:d.id,img:d.img};});
reqOFF=[];
await pg.evaluate((id)=>openDrinkZoom(DRINKS.find(x=>String(x.id)===String(id))),avecImg.id);
await attendre(1500);
const fullAuto=reqOFF.filter(u=>/\.full\.jpg/.test(u)).length;
const z6=await pg.evaluate(()=>{
  const pic=document.getElementById("img-zoom-pic"),hd=document.getElementById("img-zoom-hd");
  return {pic:pic.getAttribute("src")||"",hdVisible:!!(hd&&hd.style.display!=="none"&&hd.offsetParent!==null)};
});
verifier("6. ouvrir la visionneuse ne charge plus la .full toute seule",fullAuto===0&&/\.400\.jpg$/.test(z6.pic),fullAuto+" requête(s) .full · affichée : …"+z6.pic.slice(-22));
verifier("6. un bouton propose la haute résolution",z6.hdVisible,"visible : "+z6.hdVisible);
if(z6.hdVisible){
  await pg.tap("#img-zoom-hd");
  await pg.waitForFunction(()=>/\.full\.jpg/.test(document.getElementById("img-zoom-pic").getAttribute("src")||""),null,{timeout:8000}).catch(()=>{});
  const z6b=await pg.evaluate(()=>{
    const ov=document.getElementById("img-zoom");
    return {pic:document.getElementById("img-zoom-pic").getAttribute("src")||"",ouvert:ov.style.display==="flex"&&ov.classList.contains("in")};
  });
  verifier("6. un tap sur le bouton charge la .full, visionneuse toujours ouverte",/\.full\.jpg/.test(z6b.pic)&&z6b.ouvert&&reqOFF.some(u=>/\.full\.jpg/.test(u)),"…"+z6b.pic.slice(-22)+" · ouverte : "+z6b.ouvert);
}
await pg.evaluate(()=>closeDrinkZoom());

/* ─── 7. Réglages : rafraîchi à l'ouverture, plus de minuteur à vie ─────────── */
const src=await readFile(join(R,"index.html"),"utf8");
verifier("7. plus de setInterval de 1,5 s pour la ligne Notifications",!/setInterval\(function\(\)\{var el=document\.getElementById\("notif-state"\)/.test(src),"grep setInterval notif-state");
const r7=await pg.evaluate(()=>{
  window.__rns=0;const o=window.refreshNotifState;window.refreshNotifState=function(){window.__rns++;return o.apply(this,arguments);};
  navTo("settings");
  return window.__rns;
});
verifier("7. ouvrir les Réglages rafraîchit la ligne Notifications",r7>=1,r7+" appel(s) synchrones");

console.log("\n  IMAGES ET STOCKAGE : CE QUE L'APP DEMANDE AU RÉSEAU, CE QU'ELLE GARDE\n");
console.log("   dépôt testé : "+R+"\n");
let ko=0;
for(const [nom,ok,det] of etapes){
  if(!ok)ko++;
  console.log("   "+(ok?"ok  ":"ECHEC")+"  "+nom.padEnd(72)+" "+det);
}
console.log("\n  erreurs JavaScript : "+erreurs.length);
erreurs.slice(0,6).forEach(e=>console.log("    "+e));
console.log("\n  "+(ko===0&&erreurs.length===0?"TOUT EST VERT":ko+" CONTROLE(S) EN ECHEC"));
await nav.close(); srv.close();
process.exit(ko===0&&erreurs.length===0?0:1);
