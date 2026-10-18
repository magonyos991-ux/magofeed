/* ══ LA CARTE D'UNE FICHE DIT-ELLE LA VERITE ? ═══════════════════════════════
   Deux defauts ont ete trouves sur une capture d'ecran reelle (Uludag
   Portakal, six magasins, aucun confirme) :
     1. la legende etait ECRITE EN DUR. Elle annoncait « L'a en rayon » et
        « Possible » meme quand pas un seul pin vert n'existait ;
     2. la vue faisait setView(ma position, zoom 13) et ne regardait jamais ou
        sont les magasins — ils tombaient hors du cadre de 150 px.
   Ce controle rejoue exactement ces situations avec des magasins fabriques,
   et echoue si la legende promet une couleur absente ou si un seul pin se
   retrouve hors du cadre.
   Leaflet vient normalement d'un CDN : on le telecharge une fois et on le
   sert depuis la memoire, pour que le controle n'ait besoin de rien d'autre. */
const { chromium } = (await import("/opt/node22/lib/node_modules/playwright/index.js")).default;
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const R="/home/user/magofeed";
const M={".html":"text/html",".css":"text/css",".js":"text/javascript",".json":"application/json",".svg":"image/svg+xml",".png":"image/png"};
const CDN=[
  ["/x/leaflet.js","https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js","text/javascript"],
  ["/x/leaflet.css","https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css","text/css"],
  ["/x/cluster.js","https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.js","text/javascript"],
  ["/x/cluster.css","https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.Default.min.css","text/css"]
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
const ctx=await nav.newContext({viewport:{width:390,height:844},
  geolocation:{latitude:50.8793,longitude:4.3511},permissions:["geolocation"],locale:"fr-BE"});
const pg=await ctx.newPage();
const erreurs=[];
pg.on("pageerror",e=>erreurs.push("ERREUR JS : "+String(e.message).slice(0,140)));
/* Les tuiles de carte sortent vers l'exterieur : on les coupe net. La
   geometrie de Leaflet ne depend pas des images. */
/* Les tuiles OpenStreetMap sortent aussi : on les coupe net plutot que
   d'attendre un reseau qui n'existe pas ici. La geometrie de Leaflet ne
   depend pas des images. */
await pg.route(/tile\.openstreetmap\.org|basemaps\.cartocdn\.com/,r=>r.abort());
await pg.addInitScript(()=>{try{localStorage.setItem("magoOnboard","1");}catch(e){}});
await pg.goto(`http://127.0.0.1:${port}/index.html`);
await pg.waitForFunction(()=>window.DRINKS&&DRINKS.length>100,{timeout:40000});
await pg.evaluate(()=>{try{document.getElementById("onboarding")?.remove();}catch(e){}});
/* ON POSE LEAFLET AVANT QUE L'APPLICATION LE DEMANDE.
   Les balises du site portent une empreinte d'integrite et crossorigin :
   une reponse fabriquee par le controle est refusee par le navigateur. On
   sert donc les memes fichiers depuis le serveur local du controle, sous la
   meme origine et sans empreinte. L'application trouve window.L deja en
   place et ne sollicite jamais le CDN. */
await pg.addScriptTag({url:"/x/leaflet.js"});
await pg.addScriptTag({url:"/x/cluster.js"});
await pg.addStyleTag({url:"/x/leaflet.css"});
await pg.addStyleTag({url:"/x/cluster.css"});
if(await pg.evaluate(()=>typeof window.L==="undefined"||!window.L.markerClusterGroup)){
  console.error("  ECHEC : Leaflet ne s'est pas charge dans la page");process.exit(1);
}

/* Magasins fabriques autour de la position : « combien referencent » et
   « combien ont ete confirmes » sont les deux chiffres qui comptent. */
async function scene(nRef,nConfirmes){
  return pg.evaluate(async(a)=>{
    const d=DRINKS.find(x=>x.name==="Coca-Cola Original");
    window.STORES.length=0;
    for(let i=0;i<a.nRef;i++){
      const ang=i*2.4, ray=0.004+i*0.0016;      /* une spirale, jusqu'a ~5 km */
      const s={id:"T"+i,name:"Magasin "+i,brand:"Test",
        lat:50.8793+Math.cos(ang)*ray, lng:4.3511+Math.sin(ang)*ray*1.6,
        dist:Math.round(ray*111000), drinks:[d.id], confirmations:{}};
      if(i<a.nConfirmes)s.confirmations[d.id]=2;
      window.STORES.push(s);
    }
    window._mapInStockOnly=false;
    window.mapRenderedFor=null;
    window.pick(d);
    await new Promise(r=>setTimeout(r,900));
    /* renderMap n'est pas appelee par pick : la carte se construit quand la
       section devient visible. En controle on la demande explicitement. */
    window.renderMap();
    await new Promise(r=>setTimeout(r,2600));
    return true;
  },{nRef,nConfirmes});
}
async function lire(){
  return pg.evaluate(()=>{
    const m=window._leafletMap, cl=window._leafletCluster;
    const pins=(window._mapPins||[]);
    let hors=0;
    if(m)for(const [la,ln] of pins)if(!m.getBounds().contains(window.L.latLng(la,ln)))hors++;
    const lg=document.querySelector("#map-box .map-legend");
    return {pins:pins.length, hors, carte:!!m, grappe:!!cl,
            compte:window._mapCompte||null,
            legende:(lg?lg.textContent:"").replace(/\s+/g," ").trim()};
  });
}
const etapes=[];
function verifier(nom,cond,detail){etapes.push([nom,!!cond,detail||""]);}

/* ─── Scene 1 : le cas de la capture — references, aucun confirme ───────── */
await scene(30,0);
{ const diag=await pg.evaluate(()=>({L:typeof window.L,
    grappe:typeof (window.L&&window.L.markerClusterGroup),
    toile:!!document.getElementById("leaflet-map")}));
  if(diag.L==="undefined")console.log("  diagnostic : "+JSON.stringify(diag)); }
let v=await lire();
verifier("la carte existe",v.carte&&v.grappe,v.carte?"leaflet + grappe":"ABSENTE");
verifier("apercu plafonne a 12 pins",v.pins<=12,v.pins+" pins");
verifier("aucun pin hors du cadre",v.hors===0,v.hors+" hors cadre sur "+v.pins);
verifier("legende sans vert quand aucun confirme",!/en rayon/.test(v.legende),"« "+v.legende+" »");
verifier("legende = comptage reel",v.compte&&(v.compte.sure+v.compte.maybe)===v.pins,
  JSON.stringify(v.compte)+" pour "+v.pins+" pins");
verifier("legende chiffree",/\d/.test(v.legende),"« "+v.legende+" »");

/* ─── Scene 2 : trois confirmes parmi vingt ─────────────────────────────
   pick() allume « en stock seulement » des qu'au moins un magasin a la
   boisson confirmee : la carte ne montre alors que les trois surs, et la
   legende doit le dire sans mentionner d'orange. */
await scene(20,3);
v=await lire();
verifier("filtre automatique : 3 surs seuls",v.pins===3&&v.compte.sure===3,
  JSON.stringify(v.compte)+" pour "+v.pins+" pins");
verifier("pas d'orange annonce s'il n'y en a pas",!/possible/.test(v.legende),"« "+v.legende+" »");
verifier("toujours aucun pin hors cadre",v.hors===0,v.hors+" hors cadre sur "+v.pins);

/* ─── Scene 3 : filtre eteint — les deux couleurs, et le plafond de 12 ─── */
await pg.evaluate(async()=>{window.toggleInStockOnly();await new Promise(r=>setTimeout(r,900));});
const f=await lire();
verifier("filtre eteint : plafond de 12",f.pins===12,f.pins+" pins");
verifier("vert ET orange annonces",/en rayon/.test(f.legende)&&/possible/.test(f.legende),"« "+f.legende+" »");
verifier("les 3 surs sont gardes en priorite",f.compte&&f.compte.sure===3,JSON.stringify(f.compte));
verifier("aucun pin hors cadre apres filtre",f.hors===0,f.hors+" hors cadre sur "+f.pins);

/* ─── Scene 4 : plein ecran — les vingt, toujours cadres ────────────────── */
await pg.evaluate(async()=>{window.toggleDrinkMapFull();await new Promise(r=>setTimeout(r,1600));});
const g=await lire();
verifier("plein ecran leve le plafond",g.pins>f.pins,f.pins+" -> "+g.pins);
verifier("plein ecran cadre ses pins",g.hors===0,g.hors+" hors cadre sur "+g.pins);
verifier("legende suit le plein ecran",g.compte&&(g.compte.sure+g.compte.maybe)===g.pins,
  JSON.stringify(g.compte)+" pour "+g.pins+" pins");

console.log("\n  LA CARTE D'UNE FICHE DIT-ELLE LA VERITE ?\n");
let ko=0;
for(const [nom,ok,det] of etapes){
  if(!ok)ko++;
  console.log("   "+(ok?"ok  ":"ECHEC")+"  "+nom.padEnd(38)+" "+det);
}
console.log("\n  erreurs JavaScript : "+erreurs.length);
erreurs.slice(0,4).forEach(e=>console.log("    "+e));
console.log("\n  "+(ko===0&&erreurs.length===0?"TOUT EST VERT":ko+" CONTROLE(S) EN ECHEC"));
await nav.close(); srv.close();
process.exit(ko===0&&erreurs.length===0?0:1);
