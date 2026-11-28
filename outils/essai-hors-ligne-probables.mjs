/* ══ HORS LIGNE, LES MAGASINS « PROBABLES » DISPARAISSAIENT ════════════════
   Constat du contradicteur rendu (audit) : sans reseau, l'app repart des 300
   magasins photographies dans IndexedDB (stores:last). Ces magasins portent
   deja leur _cleRayon — la petite chaine (« e:Delhaize ») qui dit lequel des
   vingt-deux rayons probables les concerne — persistee lors d'une session
   precedente. Mais les vingt-deux ENSEMBLES (_setsRayon) ne sont pas
   persistes : au demarrage ils sont vides. rayonProbableCle faisait pourtant
   confiance a la cle seule, et rayonProbableContient repondait « non » a
   chaque magasin : la fiche d'une boisson d'enseigne ne listait plus aucun
   probable — exactement quand on n'a que le cache pour s'orienter.

   Le controle rejoue la scene de bout en bout : Firestore coupe, un
   instantane stores:last avec des cles persistees (calculees par l'app
   elle-meme, pas ecrites a la main), rechargement, puis la fiche.

   MAGO_RACINE=/chemin/du/depot node outils/essai-hors-ligne-probables.mjs */
const { chromium } = (await import("/opt/node22/lib/node_modules/playwright/index.js")).default;
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
const url=`http://127.0.0.1:${port}/index.html`;

const nav=await chromium.launch({executablePath:"/opt/pw-browsers/chromium"});
const ctx=await nav.newContext({viewport:{width:390,height:844},serviceWorkers:"block",
  geolocation:{latitude:50.8793,longitude:4.3511},permissions:["geolocation"],locale:"fr-BE"});
const pg=await ctx.newPage();
const erreurs=[];
pg.on("pageerror",e=>erreurs.push("ERREUR JS : "+String(e.message).slice(0,140)));
/* Firebase, Firestore et tout l'exterieur sont COUPES : c'est la scene meme
   (un magasin sans reseau). Leaflet aussi : la carte n'est pas l'objet ici. */
await pg.route(/gstatic\.com|googleapis\.com|firebase|openfoodfacts\.org|tile\.openstreetmap\.org|basemaps\.cartocdn\.com|cdnjs\.cloudflare\.com|unpkg\.com|overpass-api\.de|nominatim/,r=>r.abort());
await pg.addInitScript(()=>{try{["magoOnboard","magoob","magotuto","magoCoach"].forEach(k=>localStorage.setItem(k,"1"));}catch(e){}});

const etapes=[];
const verifier=(nom,cond,detail)=>etapes.push([nom,!!cond,detail||""]);

/* ─── 1. La session « d'avant » : l'app calcule les cles, puis photographie ─
   Deux magasins : un Delhaize (rayon probable d'enseigne) et un night shop
   sans enseigne connue. Les cles sont posees par rayonProbableCle, comme en
   usage reel, puis l'instantane est ecrit comme l'app le fait (idbSet). */
await pg.goto(url,{waitUntil:"domcontentloaded"});
await pg.waitForFunction(()=>window.DRINKS&&DRINKS.length>100&&typeof window.rayonProbableCle==="function"&&typeof window.idbSet==="function",{timeout:40000});
const scene=await pg.evaluate(async()=>{
  const delhaize={id:"HL1",fbId:"HL1",name:"Delhaize Jette",brand:"Delhaize",type:"supermarché",lat:50.8795,lng:4.3515,dist:120,drinks:[],confirmations:{},hours:null,emoji:""};
  const nightshop={id:"HL2",fbId:"HL2",name:"Night Shop Essai",brand:"",type:"",lat:50.8791,lng:4.3509,dist:90,drinks:[],confirmations:{},hours:null,emoji:""};
  const cle=window.rayonProbableCle(delhaize);
  window.rayonProbableCle(nightshop);
  const ids=window.rayonProbableIds(delhaize);
  /* Une boisson du rayon Delhaize, presente au catalogue, que le night shop
     n'a PAS dans son propre rayon : sinon « probable » ne distinguerait rien. */
  const did=ids.find(i=>DRINKS.some(d=>Number(d.id)===i)&&!window.rayonProbableContient(nightshop,i));
  const d=DRINKS.find(x=>Number(x.id)===did);
  window.idbSet("stores:last",{ts:Date.now(),stores:[delhaize,nightshop]});
  await new Promise(r=>setTimeout(r,800));
  return {cle:cle,cleNight:nightshop._cleRayon,did:did==null?null:did,nom:d?d.name:null,nbIds:ids.length};
});
verifier("la scene est valide : un Delhaize porte une cle de rayon d'enseigne",
  scene.cle&&scene.cle.indexOf("e:")===0, "cle = "+JSON.stringify(scene.cle)+", "+scene.nbIds+" boissons dans ce rayon");
verifier("et une boisson de ce rayon que le night shop n'a pas",
  scene.did!=null, scene.nom?("boisson : "+scene.nom+" ("+scene.did+")"):"AUCUNE");

/* ─── 2. Nouvelle session, toujours sans reseau ──────────────────────────── */
await pg.goto(url,{waitUntil:"domcontentloaded"});
await pg.waitForFunction(()=>window.DRINKS&&DRINKS.length>100&&typeof window.pick==="function",{timeout:40000});
const reprise=await pg.waitForFunction(()=>window.STORES&&STORES.some(s=>String(s.id)==="HL1"),{timeout:25000}).then(()=>true).catch(()=>false);
verifier("l'app repart de l'instantane hors ligne (stores:last)",
  reprise, reprise?"STORES contient le Delhaize":"STORES ne contient pas le Delhaize apres 25 s");

const avant=await pg.evaluate((did)=>{
  const s=STORES.find(x=>String(x.id)==="HL1"), n=STORES.find(x=>String(x.id)==="HL2");
  return {clePersistee:s?s._cleRayon:undefined,
    probable:!!(s&&window.rayonProbableContient(s,did)),
    nightshop:!!(n&&window.rayonProbableContient(n,did)),
    aLaBoisson:!!(s&&window.magasinALaBoisson(s,did)),
    confirme:!!(s&&typeof window.magasinConfirmePour==="function"&&window.magasinConfirmePour(s,did))};
},scene.did);
verifier("le Delhaize revient avec sa cle persistee (la scene reproduit bien le cas)",
  avant.clePersistee===scene.cle, "cle relue : "+JSON.stringify(avant.clePersistee));
verifier("LE RAYON PROBABLE REPOND ENCORE « OUI » HORS LIGNE",
  avant.probable, "rayonProbableContient = "+avant.probable);
verifier("le night shop, lui, dit toujours « non »",
  !avant.nightshop, "rayonProbableContient = "+avant.nightshop);
verifier("magasinALaBoisson suit (c'est lui qui remplit la fiche)",
  avant.aLaBoisson, "magasinALaBoisson = "+avant.aLaBoisson);
verifier("mais rien n'est invente : « probable » n'est pas « confirme »",
  !avant.confirme, "magasinConfirmePour = "+avant.confirme);

/* ─── 3. La fiche de la boisson liste le magasin probable ────────────────── */
/* La carte Explorer (Leaflet, CDN coupe) s'ouvre 60 ms apres pick : elle
   n'est pas l'objet du controle, on la neutralise pour lire la fiche. */
await pg.evaluate(()=>{window.openDrinkMapView=function(){};});
await pg.evaluate((did)=>{window.pick(DRINKS.find(x=>Number(x.id)===did));},scene.did);
const fiche=await pg.waitForFunction(()=>{const el=document.getElementById("store-list");return el&&/Delhaize Jette/.test(el.textContent);},{timeout:15000}).then(()=>true).catch(()=>false);
const liste=await pg.evaluate(()=>((document.getElementById("store-list")||{}).textContent||"").replace(/\s+/g," ").trim().slice(0,220));
verifier("LA FICHE LISTE LE MAGASIN PROBABLE",
  fiche, fiche?"« Delhaize Jette » est dans #store-list":"absent ; liste = « "+liste+" »");

console.log("\n  HORS LIGNE, LES MAGASINS « PROBABLES » SONT-ILS TOUJOURS LA ?\n");
let ko=0;
for(const [nom,ok,det] of etapes){
  if(!ok)ko++;
  console.log("   "+(ok?"ok  ":"ECHEC")+"  "+nom.padEnd(62)+" "+det);
}
console.log("\n  erreurs JavaScript : "+erreurs.length);
erreurs.slice(0,4).forEach(e=>console.log("    "+e));
console.log("\n  "+(ko===0&&erreurs.length===0?"TOUT EST VERT":ko+" CONTROLE(S) EN ECHEC"));
await nav.close(); srv.close();
process.exit(ko===0&&erreurs.length===0?0:1);
