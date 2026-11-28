/* ══ LA CARTE D'EXPLORATION NE TOMBE JAMAIS EN « TAS DE PINS » ═══════════════
   Defaut vu sur un iPhone reel, Paris au zoom ville : 1200 pins individuels
   empiles les uns sur les autres. Cause reproduite : quand le greffon de
   regroupement (leaflet.markercluster, servi par un CDN) ne se charge pas a
   temps, la carte se construisait avec une couche SANS regroupement — et la
   gardait toute la session.
   Ce controle rejoue la scene avec 1760 magasins fabriques sur Paris :
     1. greffon injoignable : la carte doit regrouper ELLE-MEME (grille) ;
     2. greffon qui arrive en retard : la carte doit passer seule au vrai
        regroupement ;
     3. dans les deux cas, l'en-tete annonce le VRAI nombre de la zone, pas
        le nombre de marqueurs dessines. */
const { chromium } = (await import("/opt/node22/lib/node_modules/playwright/index.js")).default;
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const R="/home/user/magofeed";
const M={".html":"text/html",".css":"text/css",".js":"text/javascript",".json":"application/json",".svg":"image/svg+xml",".png":"image/png"};
const CDN=[
  ["/x/leaflet.js","https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js","text/javascript"],
  ["/x/leaflet.css","https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css","text/css"],
  ["/x/cluster.js","https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.js","text/javascript"]
];
const cache={};
for(const [chemin,url] of CDN){
  const r=await fetch(url);
  if(!r.ok){console.error("  ECHEC : impossible de telecharger "+url+" ("+r.status+")");process.exit(1);}
  cache[chemin]=await r.text();
}
const srv=createServer(async(q,s)=>{
  let u=decodeURIComponent(q.url.split("?")[0]); if(u==="/")u="/index.html";
  const t=CDN.find(c=>c[0]===u);
  if(t){s.writeHead(200,{"content-type":t[2]});return s.end(cache[u]);}
  try{const b=await readFile(join(R,u));s.writeHead(200,{"content-type":M[extname(u)]||"application/octet-stream"});s.end(b);}
  catch{s.writeHead(404);s.end("");}
});
await new Promise(r=>srv.listen(0,r));
const port=srv.address().port;

const nav=await chromium.launch({executablePath:"/opt/pw-browsers/chromium"});
/* serviceWorkers:"block" : le service worker de l'application va chercher le
   CDN lui-meme, et les requetes qu'il fait echappent a pg.route — la panne
   rejouee ci-dessous ne serait alors pas une panne. */
const ctx=await nav.newContext({viewport:{width:390,height:844},serviceWorkers:"block",
  geolocation:{latitude:48.8566,longitude:2.3522},permissions:["geolocation"],locale:"fr-BE"});
const pg=await ctx.newPage();
const erreurs=[];
pg.on("pageerror",e=>erreurs.push("ERREUR JS : "+String(e.message).slice(0,140)));
/* Le greffon du CDN est rendu INJOIGNABLE : c'est la panne qu'on rejoue. */
await pg.route(/leaflet\.markercluster/,r=>r.abort());
await pg.route(/tile\.openstreetmap\.org|basemaps\.cartocdn\.com|images\.openfoodfacts\.org/,r=>r.abort());
await pg.addInitScript(()=>{try{localStorage.setItem("magoOnboard","1");}catch(e){}});
await pg.goto(`http://127.0.0.1:${port}/index.html`);
await pg.waitForFunction(()=>window.DRINKS&&DRINKS.length>100,{timeout:40000});
await pg.evaluate(()=>{try{document.getElementById("onboarding")?.remove();}catch(e){}});
/* Leaflet seul, sans le greffon. */
await pg.addScriptTag({url:"/x/leaflet.js"});
await pg.addStyleTag({url:"/x/leaflet.css"});

const etapes=[];
function verifier(nom,cond,detail){etapes.push([nom,!!cond,detail||""]);}

const mesure=()=>pg.evaluate(()=>{
  const st=document.getElementById("explore-status");
  return {
    cluster:!!(window.exploreLayer&&exploreLayer.getVisibleParent),
    bulles:document.querySelectorAll("#explore-map .mago-cluster").length,
    pins:document.querySelectorAll("#explore-map .leaflet-marker-icon .mago-dot, #explore-map .leaflet-marker-icon .mago-pin-head").length,
    statut:st?st.textContent:"",
    zone:window._essaiZone||0
  };
});

await pg.evaluate(async()=>{
  const dors=ms=>new Promise(r=>setTimeout(r,ms));
  window.userLat=48.8566;window.userLng=2.3522;
  const L0=[];let x=12345;const rnd=()=>{x=(x*1103515245+12345)%2147483648;return x/2147483648;};
  const marques=["Carrefour City","Franprix","Monoprix","Casino","G20","Night Shop","Epicerie","Proxi","Spar","Relay"];
  for(let i=0;i<1760;i++){
    const m=marques[i%marques.length];
    L0.push({id:"p"+i,fbId:"p"+i,name:m+" "+i,brand:m,type:"superette",
      lat:48.815+rnd()*0.085,lng:2.255+rnd()*0.16,drinks:[1],confirmations:{},dist:0});
  }
  window.STORES.length=0;L0.slice(0,1400).forEach(s=>window.STORES.push(s));
  window.fbQueryZone=function(){return Promise.resolve(L0.slice());};
  openExploreMap({});await dors(2500);
  exploreMap.setView([48.857,2.335],13,{animate:false});await dors(2500);
  /* Le vrai nombre de magasins du cadre affiche (+25 % de marge, comme l'app). */
  const b=exploreMap.getBounds().pad(0.25);
  window._essaiZone=L0.filter(s=>b.contains([s.lat,s.lng])).length;
});
const panne=await mesure();
verifier("greffon absent : couche de secours",!panne.cluster,"cluster="+panne.cluster);
verifier("greffon absent : des bulles, pas un tas",panne.bulles>=20&&panne.pins<150,
  panne.bulles+" bulles, "+panne.pins+" pins");
verifier("greffon absent : le vrai total annonce",panne.zone>0&&panne.statut.indexOf(String(panne.zone))!==-1,
  "zone="+panne.zone+" | "+panne.statut);

/* Le greffon arrive enfin : la carte doit basculer seule au vrai regroupement. */
await pg.addScriptTag({url:"/x/cluster.js"});
await pg.evaluate(async()=>{
  const dors=ms=>new Promise(r=>setTimeout(r,ms));
  window._clusterRetenteT=0;
  exploreLoadStores(true);await dors(2500);
});
const retard=await mesure();
verifier("greffon en retard : bascule au regroupement",retard.cluster,"cluster="+retard.cluster);
verifier("greffon en retard : des bulles, pas un tas",retard.bulles>=10&&retard.pins<150,
  retard.bulles+" bulles, "+retard.pins+" pins");
verifier("greffon en retard : le vrai total annonce",retard.statut.indexOf(String(retard.zone))!==-1,
  "zone="+retard.zone+" | "+retard.statut);

console.log("\n  LA CARTE D'EXPLORATION TOMBE-T-ELLE EN TAS DE PINS ?\n");
let ko=0;
for(const [nom,ok,det] of etapes){
  if(!ok)ko++;
  console.log("   "+(ok?"ok  ":"ECHEC")+"  "+nom.padEnd(44)+" "+det);
}
console.log("\n  erreurs JavaScript : "+erreurs.length);
erreurs.slice(0,4).forEach(e=>console.log("    "+e));
console.log("\n  "+(ko===0&&erreurs.length===0?"TOUT EST VERT":ko+" CONTROLE(S) EN ECHEC"));
await nav.close(); srv.close();
process.exit(ko===0&&erreurs.length===0?0:1);
