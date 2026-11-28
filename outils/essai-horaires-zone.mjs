/* ══ LES HORAIRES QUE L'IMPORT AVAIT PERDUS REVIENNENT-ILS ? ═══════════════
   Mesure sur la production : a Paris, 18 % des magasins avaient des
   horaires, alors qu'OpenStreetMap en connait pour la majorite de ceux qui
   n'en ont pas, sous leur propre identifiant. Le filtre « Ouvert » ecartait
   donc presque tout Paris comme « horaire inconnu ».
   Ce controle rejoue la scene avec de VRAIES lignes Overpass (Paris,
   novembre 2026, outils/donnees-essai/overpass-paris-horaires.tsv) :
     1. le serveur principal est sature (sa vraie reponse « at capacity ») :
        l'app doit passer au miroir ;
     2. les magasins a moins de 250 m de leur element OSM recoivent ses
        horaires ; un magasin au MEME identifiant mais a 3 km n'en recoit pas ;
     3. les horaires trouves partent vers la base (un seul lot) et restent
        sur l'appareil ;
     4. « N ouvert(s) · M horaire(s) inconnu(s) » compte les deux sur la
        meme zone, et le nombre d'inconnus baisse. */
const { chromium } = (await import("/opt/node22/lib/node_modules/playwright/index.js")).default;
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
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
const TSV=readFileSync(join(R,"outils/donnees-essai/overpass-paris-horaires.tsv"),"utf8");
const LIGNES=TSV.split("\n").filter(l=>l.split("\t").length>=5).map(l=>{const c=l.split("\t");return {tp:c[0],id:c[1],la:+c[2],lo:+c[3]};});

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
const ctx=await nav.newContext({viewport:{width:390,height:844},serviceWorkers:"block",
  geolocation:{latitude:48.83,longitude:2.33},permissions:["geolocation"],locale:"fr-BE"});
const pg=await ctx.newPage();
const erreurs=[];
pg.on("pageerror",e=>erreurs.push("ERREUR JS : "+String(e.message).slice(0,140)));
/* Le serveur principal SATURE : sa vraie reponse, en 200 avec un texte. */
let principal=0,miroir=0;
await pg.route(/overpass-api\.de/,r=>{principal++;r.fulfill({status:200,contentType:"text/plain",
  body:"# 502 Gateway Timeout\n\nThis Overpass API server is currently at capacity."});});
await pg.route(/maps\.mail\.ru/,r=>{miroir++;r.fulfill({status:200,contentType:"text/csv",body:TSV,
  headers:{"access-control-allow-origin":"*"}});});
await pg.route(/overpass\.kumi\.systems/,r=>r.abort());
/* Firebase coupe : le module reinstallerait sa vraie ecriture vers la base
   par-dessus la capture du controle s'il arrivait apres elle. */
await pg.route(/tile\.openstreetmap\.org|images\.openfoodfacts\.org|cdnjs\.cloudflare\.com|gstatic\.com|googleapis\.com/,r=>r.abort());
await pg.addInitScript(()=>{try{localStorage.setItem("magoOnboard","1");localStorage.removeItem("magoHorairesZone");}catch(e){}
  // samedi 10 h : la plupart des commerces dont on connait l'horaire sont ouverts
  window.__forceNow=new Date(2026,10,28,10,0).getTime();});
await pg.goto(`http://127.0.0.1:${port}/index.html`);
await pg.waitForFunction(()=>window.DRINKS&&DRINKS.length>100,{timeout:40000});
await pg.evaluate(()=>{try{document.getElementById("onboarding")?.remove();}catch(e){}});
await pg.addScriptTag({url:"/x/leaflet.js"});
await pg.addScriptTag({url:"/x/cluster.js"});
await pg.addStyleTag({url:"/x/leaflet.css"});

const etapes=[];
function verifier(nom,cond,detail){etapes.push([nom,!!cond,detail||""]);}

const r=await pg.evaluate(async(LIGNES)=>{
  const dors=ms=>new Promise(r=>setTimeout(r,ms));
  window.userLat=48.83;window.userLng=2.33;
  /* Capture de l'ecriture vers la base. */
  window.__ecrits=[];
  window.fbSaveHoursBatch=function(p){window.__ecrits.push(p.length);return Promise.resolve(p.length);};
  const zone=[];
  LIGNES.slice(1).forEach((l,i)=>{
    /* a ~20 m de l'element OSM, sans horaires, identifiant « o<num> » */
    zone.push({id:"o"+l.id,fbId:"o"+l.id,name:"Commerce "+i,lat:l.la+0.00015,lng:l.lo+0.0001,drinks:[1],confirmations:{},dist:0});
  });
  /* Un magasin dont l'identifiant EXISTE dans OSM, mais a 3 km de l'element
     qui le porte (coincidence de numeros noeud/chemin, ou fiche mal placee) :
     il ne doit RIEN recevoir. */
  zone.push({id:"o"+LIGNES[0].id,fbId:"o"+LIGNES[0].id,name:"Homonyme lointain",lat:LIGNES[0].la+0.027,lng:LIGNES[0].lo,drinks:[1],confirmations:{},dist:0});
  /* Magasins sans identifiant OSM : hors champ, ils gardent leur etat. */
  for(let i=0;i<5;i++)zone.push({id:"m"+i,fbId:"m"+i,name:"Saisi "+i,lat:48.832+i*0.0003,lng:2.335,drinks:[1],confirmations:{},dist:0});
  window.STORES.length=0;
  window.fbQueryZone=function(){return Promise.resolve(zone.slice());};
  openExploreMap({});await dors(2000);
  /* Toute la zone du jeu d'essai a l'ecran (il couvre ~8 km de large). */
  exploreMap.fitBounds(L.latLngBounds(zone.map(s=>[s.lat,s.lng])),{animate:false});await dors(1500);
  /* « Ouvert » allume AVANT le comblement */
  window._exploreChips=window._exploreChips||{};window._exploreChips.open=true;
  exploreLoadStores(true);await dors(600);
  const avant={inc:window._exploreInconnus,titre:(document.getElementById("explore-sheet-title")||{}).textContent};
  await dors(6000);       // 1,2 s de pause + la requete + le nouveau rendu
  exploreLoadStores(true);await dors(800);
  const apres={inc:window._exploreInconnus,titre:(document.getElementById("explore-sheet-title")||{}).textContent};
  const raw=window._exploreRawList||[];
  const homonyme=raw.find(s=>s.name==="Homonyme lointain");
  const avecHeures=raw.filter(s=>/^o\d+$/.test(String(s.id))&&s.hours).length;
  const cacheLocal=JSON.parse(localStorage.getItem("magoHorairesZone")||"{}");
  return {avant,apres,avecHeures,total:LIGNES.length-1,homonyme:homonyme?(homonyme.hours||null):"absent",
    ecrits:window.__ecrits,cache:Object.keys(cacheLocal.trouves||{}).length};
},LIGNES);

verifier("serveur sature : on a bien essaye le principal",principal>=1,"principal="+principal);
verifier("serveur sature : le miroir a repondu",miroir>=1,"miroir="+miroir);
verifier("horaires retrouves sur les magasins proches",r.avecHeures>=Math.floor(r.total*0.95),r.avecHeures+"/"+r.total);
verifier("meme identifiant a 3 km : rien recu",r.homonyme===null,"homonyme="+r.homonyme);
verifier("tout ce qui est trouve part vers la base",r.ecrits.reduce((a,b)=>a+b,0)===r.avecHeures,JSON.stringify(r.ecrits));
verifier("gardes sur l'appareil",r.cache===r.avecHeures,"cache="+r.cache);
verifier("le nombre d'inconnus baisse",r.apres.inc<r.avant.inc,r.avant.inc+" -> "+r.apres.inc);
verifier("la phrase du titre suit",String(r.apres.titre).indexOf(String(r.apres.inc))!==-1,r.apres.titre);

/* Deuxieme passage : plus aucune requete (tout est connu ou deja essaye). */
const avantRequetes=principal+miroir;
await pg.evaluate(async()=>{exploreLoadStores(true);await new Promise(r=>setTimeout(r,3000));});
verifier("une zone deja comblee ne redemande rien",principal+miroir===avantRequetes,(principal+miroir-avantRequetes)+" requete(s) de plus");

console.log("\n  LES HORAIRES PERDUS A L'IMPORT REVIENNENT-ILS ?\n");
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
