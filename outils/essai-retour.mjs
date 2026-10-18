/* ══ « RETOUR », C'EST L'ECRAN D'AVANT — PARTOUT ════════════════════════════
   Ouvrir une boisson appelle show("results") puis ouvre la carte par-dessus,
   soixante millisecondes plus tard. L'utilisateur n'a jamais demande la
   fiche : elle s'est glissee sous la carte. Fermer la carte le deposait donc
   sur cette fiche, et il lui fallait un DEUXIEME retour pour revenir a sa
   recherche.
   Ce controle part de la recherche, ouvre une boisson, et verifie qu'UN SEUL
   retour ramene a la recherche — sans laisser la carte collee par-dessus. */
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
  if(!r.ok){console.error("  ECHEC : telechargement de "+url+" ("+r.status+")");process.exit(1);}
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
await pg.route(/tile\.openstreetmap\.org|basemaps\.cartocdn\.com|quagga/,r=>r.abort());
await pg.addInitScript(()=>{try{localStorage.setItem("magoOnboard","1");}catch(e){}});
await pg.goto(`http://127.0.0.1:${port}/index.html`);
await pg.waitForFunction(()=>window.DRINKS&&DRINKS.length>100,{timeout:40000});
await pg.evaluate(()=>{try{document.getElementById("onboarding")?.remove();}catch(e){}});
await pg.addScriptTag({url:"/x/leaflet.js"});
await pg.addScriptTag({url:"/x/cluster.js"});
await pg.addStyleTag({url:"/x/leaflet.css"});
await pg.addStyleTag({url:"/x/cluster.css"});

const etat=()=>pg.evaluate(()=>{
  const e=document.querySelector(".screen.on");
  const h=document.getElementById("explore-map-host");
  return {ecran:e?e.id.replace(/^s-/,""):"(aucun)",
          carte:!!(h&&getComputedStyle(h).display!=="none"),
          pile:(window.navStack||[]).slice()};
});
/* Part d'un onglet racine, va sur la recherche, ouvre une boisson. */
async function depuis(racine){
  await pg.evaluate(async(a)=>{
    window.STORES.length=0;
    const d=DRINKS.find(x=>x.name==="Coca-Cola Original");
    for(let i=0;i<5;i++)window.STORES.push({id:"R"+i,name:"M"+i,brand:"",
      lat:50.879+i*0.002,lng:4.351+i*0.002,dist:300+i*200,drinks:[d.id],confirmations:{}});
    try{ if(window.closeExploreMap)window.closeExploreMap(); }catch(e){}
    window.navTo(a.racine);
    await new Promise(r=>setTimeout(r,500));
  },{racine});
  await pg.evaluate(async()=>{
    const d=DRINKS.find(x=>x.name==="Coca-Cola Original");
    window.pick(d);
    await new Promise(r=>setTimeout(r,2200));   /* la carte s'ouvre a +60 ms */
  });
}
async function retourCarte(){
  await pg.evaluate(async()=>{
    const b=document.querySelector('#explore-map-host [aria-label="Retour"]');
    if(b)b.click(); else window.closeExploreMap();
    await new Promise(r=>setTimeout(r,900));
  });
}
const etapes=[];
const v=(nom,cond,det)=>etapes.push([nom,!!cond,det||""]);

/* ─── 1. Recherche -> boisson -> carte -> UN SEUL retour ──────────────────── */
await depuis("search");
const surCarte=await etat();
v("la carte s'ouvre sur la boisson",surCarte.carte,"ecran dessous = "+surCarte.ecran+", pile "+JSON.stringify(surCarte.pile));
await retourCarte();
const apres=await etat();
v("UN retour ramene a la recherche",apres.ecran==="search","ecran = "+apres.ecran);
v("et la carte est refermee",!apres.carte,"carte visible = "+apres.carte);

/* ─── 2. Le titre de la carte mene toujours a la fiche ────────────────────── */
await depuis("search");
await pg.evaluate(async()=>{window.openDrinkInfoFromMap();await new Promise(r=>setTimeout(r,900));});
const surFiche=await etat();
v("le titre ouvre bien la fiche",surFiche.ecran==="results"&&!surFiche.carte,
  "ecran = "+surFiche.ecran+", carte = "+surFiche.carte);
await pg.evaluate(async()=>{window.navBack();await new Promise(r=>setTimeout(r,900));});
const depuisFiche=await etat();
v("et le retour de la fiche ramene a la recherche",depuisFiche.ecran==="search","ecran = "+depuisFiche.ecran);

/* ─── 3. Boisson ouverte depuis l'accueil : jamais d'ecran bloque ─────────── */
await depuis("home");
await retourCarte();
const depuisAccueil=await etat();
v("depuis l'accueil : la carte se referme",!depuisAccueil.carte,"carte visible = "+depuisAccueil.carte);
v("depuis l'accueil : un ecran est affiche",depuisAccueil.ecran!=="(aucun)","ecran = "+depuisAccueil.ecran);
v("depuis l'accueil : pas bloque sur la fiche",depuisAccueil.ecran!=="results","ecran = "+depuisAccueil.ecran);

/* ─── 4. Carte ouverte seule (sans boisson) : fermeture simple ────────────── */
await pg.evaluate(async()=>{
  window.navTo("home"); await new Promise(r=>setTimeout(r,400));
  window.openExploreMap(); await new Promise(r=>setTimeout(r,1600));
});
const carteSeule=await etat();
v("la carte seule s'ouvre",carteSeule.carte,"carte = "+carteSeule.carte);
await retourCarte();
const apresSeule=await etat();
v("la carte seule se referme sur l'accueil",!apresSeule.carte&&apresSeule.ecran==="home",
  "ecran = "+apresSeule.ecran+", carte = "+apresSeule.carte);

console.log("\n  « RETOUR », C'EST L'ECRAN D'AVANT\n");
let ko=0;
for(const [nom,ok,det] of etapes){ if(!ok)ko++; console.log("   "+(ok?"ok  ":"ECHEC")+"  "+nom.padEnd(44)+" "+det); }
console.log("\n  erreurs JavaScript : "+erreurs.length);
erreurs.slice(0,4).forEach(e=>console.log("    "+e));
console.log("\n  "+(ko===0&&erreurs.length===0?"TOUT EST VERT":ko+" CONTROLE(S) EN ECHEC"));
await nav.close(); srv.close();
process.exit(ko===0&&erreurs.length===0?0:1);
