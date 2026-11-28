/* ══ UN REPEINT DE FOND N'ABIME JAMAIS CE QUE L'UTILISATEUR REGARDE ═══════
   Relecture adversariale du comblement des horaires (novembre 2026) : trois
   defauts reproduits, tous causes par un rechargement de la carte lance EN
   ARRIERE-PLAN (horaires arrives, greffon de regroupement arrive).
     A. on deplace la carte, la nouvelle zone est en route, les horaires de
        l'ancienne arrivent : la reponse de la nouvelle zone partait a la
        poubelle et l'ecran disait « Aucun magasin » au-dessus de 171 ;
     B. recherche d'une boisson : l'en-tete et le bandeau comptaient tout le
        cercle charge (115), la feuille et la carte le cadre visible (99) ;
     C. doigt pose sur un pin, menu ouvert, rechargement de fond : le menu
        disparaissait et le tap SUIVANT sur un pin etait avale.
   Chaque scenario est compare a son temoin (le meme geste sans le
   rechargement de fond). */
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

// magasins fabriques, ids OSM "o<n>" sans horaires
const STO=[]; let x=777; const rnd=()=>{x=(x*1103515245+12345)%2147483648;return x/2147483648;};
for(let i=0;i<3000;i++){
  STO.push({id:"o"+(990000000+i),fbId:"o"+(990000000+i),name:"Shop "+i,brand:"B"+(i%7),type:"superette",
    lat:48.815+rnd()*0.085,lng:2.255+rnd()*0.16,drinks:[],confirmations:{},dist:0});
}
const parId={}; STO.forEach(s=>parId[s.id.slice(1)]=s);

async function page(nav,{overpassDelai}){
  const ctx=await nav.newContext({viewport:{width:390,height:844},serviceWorkers:"block",
    geolocation:{latitude:48.8566,longitude:2.3522},permissions:["geolocation"],locale:"fr-BE"});
  const pg=await ctx.newPage();
  const erreurs=[];
  pg.on("pageerror",e=>erreurs.push(String(e.message).slice(0,140)));
  await pg.route(/leaflet\.markercluster/,r=>r.abort());
  await pg.route(/tile\.openstreetmap\.org|basemaps\.cartocdn\.com|images\.openfoodfacts\.org/,r=>r.abort());
  let csvRequetes=0; const tenues=[];
  await pg.route(/overpass|maps\.mail\.ru|kumi\.systems/,async r=>{
    const body=decodeURIComponent((r.request().postData()||"").replace(/^data=/,""));
    if(body.indexOf("out:csv")!==-1){
      csvRequetes++;
      const ids=(body.match(/node\(id:([\d,]+)\)/)||[,""])[1].split(",").filter(Boolean);
      const lignes=ids.map(id=>{const s=parId[id];return s?["node",id,s.lat,s.lng,"Mo-Su 00:00-24:00"].join("\t"):"";}).filter(Boolean).join("\n");
      if(overpassDelai==="tenir"){ tenues.push(()=>r.fulfill({status:200,contentType:"text/csv",body:lignes})); return; }
      await new Promise(ok=>setTimeout(ok,overpassDelai));
      return r.fulfill({status:200,contentType:"text/csv",body:lignes});
    }
    return r.fulfill({status:200,contentType:"application/json",body:'{"elements":[]}'});
  });
  await pg.addInitScript(()=>{try{localStorage.setItem("magoOnboard","1");localStorage.removeItem("magoHorairesZone");}catch(e){}});
  await pg.goto(`http://127.0.0.1:${port}/index.html`);
  await pg.waitForFunction(()=>window.DRINKS&&DRINKS.length>100,{timeout:40000});
  await pg.evaluate(()=>{try{document.getElementById("onboarding")?.remove();}catch(e){}});
  await pg.addScriptTag({url:"/x/leaflet.js"});
  await pg.addStyleTag({url:"/x/leaflet.css"});
  await pg.addScriptTag({url:"/x/cluster.js"});
  await pg.evaluate((sto)=>{
    window.userLat=48.8566;window.userLng=2.3522;
    window._L0=sto;
    window._delaiZone=0; window._zoneAppels=0;
    const dist=(a,b,c,d)=>{const dLa=(a-c)*111.32,dLo=(b-d)*111.32*Math.cos(a*Math.PI/180);return Math.sqrt(dLa*dLa+dLo*dLo);};
    window.fbQueryZone=function(lat,lng,rk){
      window._zoneAppels++;
      const out=window._L0.filter(s=>dist(lat,lng,s.lat,s.lng)<=rk).map(s=>Object.assign({},s));
      return new Promise(ok=>setTimeout(()=>ok(out),window._delaiZone));
    };
    window.fbSaveHoursBatch=function(){return Promise.resolve(0);};
    window.STORES.length=0;
  },STO);
  return {pg,ctx,erreurs,csv:()=>csvRequetes,lacher:()=>{const f=tenues.shift();if(f)f();return !!f;}};
}
const nav=await chromium.launch({executablePath:"/opt/pw-browsers/chromium"});
const etapes=[];
function verifier(nom,cond,detail){etapes.push([nom,!!cond,detail||""]);}
let erreursJS=0, mesureA=null;
const nb=(t)=>((String(t).match(/\d+/)||[""])[0]);
const dors=ms=>new Promise(r=>setTimeout(r,ms));
const mesure=(pg)=>pg.evaluate(()=>{
  const b=exploreMap.getBounds().pad(0.25);
  const vrai=window._L0.filter(s=>b.contains([s.lat,s.lng])).length;
  const raw=window._exploreRawList||[];
  const rawDans=raw.filter(s=>b.contains([s.lat,s.lng])).length;
  return {statut:(document.getElementById("explore-status")||{}).textContent,
    sous:(document.getElementById("explore-subtitle")||{}).textContent,
    feuille:(document.getElementById("explore-sheet-title")||{}).textContent,
    vraiDansCadre:vrai, rawTaille:raw.length, rawDansCadre:rawDans,
    centre:exploreMap.getCenter(), zoneAppels:window._zoneAppels};
});

/* ── A ── */
{
  const {pg,erreurs,csv,lacher}=await page(nav,{overpassDelai:"tenir"});
  await pg.evaluate(async()=>{
    const d=ms=>new Promise(r=>setTimeout(r,ms));
    openExploreMap({}); await d(2200);
    exploreMap.setView([48.857,2.335],15,{animate:false}); await d(2500);
  });
  const avant=await mesure(pg);
  await pg.evaluate(()=>{ window._delaiZone=2500; exploreMap.setView([48.857,2.392],15,{animate:false}); });
  await dors(1000);                       // le chargement reseau de B est en vol
  const lache=lacher();                   // Overpass repond (zone A) -> exploreLoadStores(true)
  await dors(700);
  const pendant=await mesure(pg);         // la nouvelle zone est encore en route
  await dors(4300);
  const apres=await mesure(pg);
  verifier("A : la reponse horaires arrive pendant le vol",lache);
  verifier("A : pas de faux « Aucun magasin » en attendant",!/Aucun magasin/.test(pendant.statut),pendant.statut);
  verifier("A : la nouvelle zone est gardee",apres.rawDansCadre>0&&apres.centre.lng>2.38,"raw dans le cadre="+apres.rawDansCadre);
  verifier("A : le bandeau annonce la nouvelle zone",nb(apres.statut)===String(apres.rawDansCadre),apres.statut);
  mesureA=apres;
  erreursJS+=erreurs.length; erreurs.slice(0,3).forEach(e=>console.log("  ERREUR JS (A) : "+e));
  await pg.context().close();
}
/* ── A' temoin : meme deplacement sans Overpass ── */
{
  const {pg}=await page(nav,{overpassDelai:"tenir"});
  await pg.evaluate(async()=>{
    const d=ms=>new Promise(r=>setTimeout(r,ms));
    openExploreMap({}); await d(2200);
    exploreMap.setView([48.857,2.335],15,{animate:false}); await d(2500);
  });
  await pg.evaluate(()=>{ window._delaiZone=2500; exploreMap.setView([48.857,2.392],15,{animate:false}); });
  await dors(6000);
  const temoinA=await mesure(pg);
  verifier("A : meme chiffre que le temoin sans horaires",temoinA.statut===mesureA.statut,temoinA.statut+" | "+mesureA.statut);
  await pg.context().close();
}
/* ── B : mode boisson ── */
{
  const {pg}=await page(nav,{overpassDelai:100});
  await pg.route(/overpass|maps\.mail\.ru|kumi\.systems/,r=>r.abort());
  await pg.evaluate(()=>{ window._L0.forEach((s,i)=>{s.id="p"+i;s.fbId="p"+i;s.drinks=[DRINKS[0].id];}); });
  await pg.evaluate(async()=>{
    const d=ms=>new Promise(r=>setTimeout(r,ms));
    openExploreMap({drinkId:DRINKS[0].id,name:"BoissonTest"}); await d(2200);
    exploreMap.setView([48.857,2.335],15,{animate:false}); await d(2500);
  });
  const mb=await mesure(pg);
  verifier("B : bandeau = feuille",nb(mb.statut)===nb(mb.feuille),mb.statut+" | "+mb.feuille);
  verifier("B : en-tete = feuille",nb(mb.sous)===nb(mb.feuille),mb.sous+" | "+mb.feuille);
  await pg.evaluate(async()=>{
    const d=ms=>new Promise(r=>setTimeout(r,ms));
    closeExploreMap(); await d(500);
    openExploreMap({}); await d(2200);
    exploreMap.setView([48.857,2.335],15,{animate:false}); await d(2500);
  });
  const hf=await mesure(pg);
  verifier("B : meme zone hors filtre, meme chiffre",nb(hf.feuille)===nb(mb.feuille),hf.feuille+" | "+mb.feuille);
  await pg.context().close();
}
/* ── C : menu de pin et rechargement de fond ── */
{
  const {pg}=await page(nav,{overpassDelai:100});
  await pg.route(/overpass|maps\.mail\.ru|kumi\.systems/,r=>r.abort());
  const res=await pg.evaluate(async()=>{
    const d=ms=>new Promise(r=>setTimeout(r,ms));
    openExploreMap({}); await d(2200);
    exploreMap.setView([48.857,2.335],17,{animate:false}); await d(2500);
    window._routes=0; window.showRouteToStore=function(){window._routes++;};
    const pins=()=>[...document.querySelectorAll("#explore-map .leaflet-marker-icon")].filter(e=>e.querySelector(".mago-pin-head"));
    const el=pins()[0];
    const r=el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent("mousedown",{bubbles:true,clientX:r.left+10,clientY:r.top+10}));
    await d(550);
    const menuOuvert=!!document.getElementById("pin-menu");
    const drapeauOuvert=window._pinMenuVientDeSOuvrir;
    exploreLoadStores(true);              // rechargement de fond (horaires ou greffon arrives)
    await d(80);
    document.dispatchEvent(new MouseEvent("mouseup",{bubbles:true}));
    document.dispatchEvent(new PointerEvent("pointerup",{bubbles:true}));
    await d(800);
    const drapeauApres=window._pinMenuVientDeSOuvrir;
    const el2=pins()[1];
    el2.dispatchEvent(new MouseEvent("click",{bubbles:true}));
    await d(200);
    const r1=window._routes;
    el2.dispatchEvent(new MouseEvent("click",{bubbles:true}));
    await d(200);
    const r2=window._routes;
    // temoin : meme geste SANS rechargement de fond
    window._routes=0;
    const el3=pins()[2]; const q=el3.getBoundingClientRect();
    el3.dispatchEvent(new MouseEvent("mousedown",{bubbles:true,clientX:q.left+10,clientY:q.top+10}));
    await d(550);
    const menuT=!!document.getElementById("pin-menu");
    document.dispatchEvent(new MouseEvent("mouseup",{bubbles:true}));
    await d(800);
    const el4=pins()[3]; el4.dispatchEvent(new MouseEvent("click",{bubbles:true})); await d(200);
    return {menuOuvert,drapeauOuvert,drapeauApres,tap1:r1,tap2:r2,temoin:{menu:menuT,drapeau:window._pinMenuVientDeSOuvrir,tap1:window._routes}};
  });
  verifier("C : le menu etait ouvert sous le doigt",res.menuOuvert&&res.drapeauOuvert);
  verifier("C : rien ne reste bloque apres le rechargement",res.drapeauApres===false,"drapeau="+res.drapeauApres);
  verifier("C : le tap suivant agit du premier coup",res.tap1===1,"tap1="+res.tap1);
  verifier("C : temoin sans rechargement",res.temoin.menu&&res.temoin.tap1===1,JSON.stringify(res.temoin));
  await pg.context().close();
}
console.log("\n  UN REPEINT DE FOND ABIME-T-IL CE QU'ON REGARDE ?\n");
let ko=0;
for(const [nom,ok,det] of etapes){
  if(!ok)ko++;
  console.log("   "+(ok?"ok  ":"ECHEC")+"  "+nom.padEnd(48)+" "+det);
}
console.log("\n  erreurs JavaScript : "+erreursJS);
console.log("\n  "+(ko===0&&erreursJS===0?"TOUT EST VERT":ko+" CONTROLE(S) EN ECHEC"));
await nav.close(); srv.close();
process.exit(ko===0&&erreursJS===0?0:1);
