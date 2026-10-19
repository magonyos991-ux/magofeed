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
    /* « dessine » = ce que populateClusterMarkers a pose. « visible » = ce qui
       tombe dans le cadre, c'est-a-dire ce que la legende a le droit
       d'annoncer. Les deux ne sont plus censes etre egaux : l'apercu cadre
       sur le magasin le plus proche, et compte les autres a part. */
    return {pins:pins.length, hors, carte:!!m, grappe:!!cl,
            compte:window._mapDessine||null,
            visible:(window.compterPinsVisibles?window.compterPinsVisibles():null),
            zoom:(m&&m._loaded)?m.getZoom():null,
            pastilles:document.querySelectorAll("#map-box .mago-cluster").length,
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
verifier("AUCUNE pastille de regroupement",v.pastilles===0,v.pastilles+" pastille(s)");
verifier("l'apercu ne descend pas sous le plancher",v.zoom>=11,"zoom "+v.zoom);
verifier("legende sans vert quand aucun confirme",!/en rayon/.test(v.legende),"« "+v.legende+" »");
verifier("legende = ce qui est DANS le cadre",
  v.visible&&(v.visible.sure+v.visible.maybe+v.visible.autour+v.visible.loin)===v.pins,
  JSON.stringify(v.visible)+" pour "+v.pins+" dessines");
verifier("ce qui depasse est annonce a part",
  v.visible.loin===0||/plus loin/.test(v.legende),
  v.visible.loin+" hors cadre, « "+v.legende+" »");
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
verifier("toujours aucune pastille",v.pastilles===0,v.pastilles+" pastille(s)");

/* ─── Scene 3 : filtre eteint — les deux couleurs, et le plafond de 12 ─── */
await pg.evaluate(async()=>{window.toggleInStockOnly();await new Promise(r=>setTimeout(r,900));});
const f=await lire();
verifier("filtre eteint : plafond de 12",f.pins===12,f.pins+" pins");
verifier("vert ET orange annonces",/en rayon/.test(f.legende)&&/possible/.test(f.legende),"« "+f.legende+" »");
verifier("les 3 surs sont gardes en priorite",f.compte&&f.compte.sure===3,JSON.stringify(f.compte));
verifier("aucune pastille apres filtre",f.pastilles===0,f.pastilles+" pastille(s)");

/* ─── Scene 4 : plein ecran — les vingt, toujours cadres ────────────────── */
await pg.evaluate(async()=>{window.toggleDrinkMapFull();await new Promise(r=>setTimeout(r,1600));});
const g=await lire();
verifier("plein ecran leve le plafond",g.pins>f.pins,f.pins+" -> "+g.pins);
verifier("plein ecran cadre tous ses pins",g.hors===0,g.hors+" hors cadre sur "+g.pins);
verifier("plein ecran : aucune pastille",g.pastilles===0,g.pastilles+" pastille(s)");
verifier("legende suit le plein ecran",
  g.visible&&(g.visible.sure+g.visible.maybe+g.visible.autour+g.visible.loin)===g.pins,
  JSON.stringify(g.visible)+" pour "+g.pins+" pins");

/* ─── Scene 5 : LES MAGASINS ARRIVENT APRES LE CADRAGE ───────────────────
   C'est le defaut de la capture d'ecran, et l'ancien controle ne savait pas
   le jouer : sa scene remplissait STORES AVANT de construire la carte, donc
   les pins existaient toujours au moment du cadrage. Ici on construit la
   carte VIDE, on cadre, puis on fait arriver les magasins loin de la
   position — exactement ce que fait l'elargissement Firestore a 25 km. */
await pg.evaluate(async()=>{
  const d=DRINKS.find(x=>x.name==="Coca-Cola Original");
  window.STORES.length=0;                 /* aucun magasin au depart */
  window._mapInStockOnly=false;
  window.mapRenderedFor=null;
  const bx=document.getElementById("map-box");
  if(bx&&bx.classList.contains("map-fullscreen"))window.toggleDrinkMapFull();
  window.pick(d);
  await new Promise(r=>setTimeout(r,900));
  window.renderMap();
  await new Promise(r=>setTimeout(r,2200));   /* le cadrage a eu lieu, a vide */
});
const vide=await lire();
verifier("carte vide : aucun pin annonce",vide.pins===0&&!/en rayon|possible/.test(vide.legende),
  vide.pins+" pins, « "+vide.legende+" »");
await pg.evaluate(async()=>{
  const d=DRINKS.find(x=>x.name==="Coca-Cola Original");
  /* Les magasins arrivent, a 4 km au nord : hors du cadre initial. */
  for(let i=0;i<7;i++)window.STORES.push({id:"L"+i,name:"Loin "+i,brand:"",
    lat:50.9150+i*0.002, lng:4.3511+i*0.002, dist:4000+i*200,
    drinks:[d.id], confirmations:{}});
  window.populateClusterMarkers(window._leafletCluster);
  await new Promise(r=>setTimeout(r,700));
});
const tard=await lire();
verifier("magasins tardifs : pins dessines",tard.pins===7,tard.pins+" pins");
verifier("magasins tardifs : legende juste",tard.compte&&tard.compte.maybe===7,JSON.stringify(tard.compte));
verifier("MAGASINS TARDIFS : LE PLUS PROCHE EST CADRE",
  tard.visible&&(tard.visible.sure+tard.visible.maybe+tard.visible.autour)>0,
  JSON.stringify(tard.visible));

/* ─── Scene 6 : le bouton agrandir ouvre bien le plein ecran ─────────────── */
const btn=await pg.evaluate(()=>{
  const b=document.getElementById("map-full-btn");
  return b?{onclick:b.getAttribute("onclick")||"",aria:b.getAttribute("aria-label")||""}:null;
});
verifier("le bouton appelle le plein ecran",
  btn&&/toggleDrinkMapFull/.test(btn.onclick)&&!/openExploreMap/.test(btn.onclick),
  btn?btn.onclick.slice(0,40):"bouton absent");
await pg.evaluate(async()=>{document.getElementById("map-full-btn").click();await new Promise(r=>setTimeout(r,1500));});
const apresClic=await pg.evaluate(()=>{
  const bx=document.getElementById("map-box"),m=window._leafletMap;
  return {plein:!!(bx&&bx.classList.contains("map-fullscreen")),
          glisse:!!(m&&m.dragging&&m.dragging.enabled())};
});
verifier("un appui ouvre le plein ecran",apresClic.plein,"map-fullscreen="+apresClic.plein);
verifier("et la carte devient deplacable",apresClic.glisse,"dragging="+apresClic.glisse);
await pg.evaluate(async()=>{document.getElementById("map-full-btn").click();await new Promise(r=>setTimeout(r,1200));});

/* ─── Scene 7 : « voir les magasins autour de moi » dessine ses pins ─────── */
const repli=await pg.evaluate(async()=>{
  const d=DRINKS.find(x=>x.name==="Coca-Cola Original");
  window.STORES.length=0;
  for(let i=0;i<9;i++)window.STORES.push({id:"A"+i,name:"Autour "+i,brand:"",
    lat:50.8793+i*0.003, lng:4.3511+i*0.002, dist:300+i*200, drinks:[], confirmations:{}});
  window._nearbyFallback={}; window._nearbyFallback[d.id]=true;
  window._mapInStockOnly=false;
  window.populateClusterMarkers(window._leafletCluster);
  await new Promise(r=>setTimeout(r,700));
  const lg=document.querySelector("#map-box .map-legend");
  return {pins:(window._mapPins||[]).length,compte:window._mapCompte,
          legende:(lg?lg.textContent:"").replace(/\s+/g," ").trim()};
});
verifier("repli « autour de moi » : des pins",repli.pins>0,repli.pins+" pins");
verifier("repli : la legende dit « autour »",/autour/.test(repli.legende),"« "+repli.legende+" »");
verifier("repli : jamais « en rayon »",!/en rayon/.test(repli.legende),"« "+repli.legende+" »");

/* ─── Scene 8 : LA CAPTURE « CARESSE ANTILLAISE » ────────────────────────
   Douze magasins etales de 2,5 a 20 km, aucun confirme, apercu de 150 px.
   Avant correction : zoom 7, 274 km de large, zero pin individuel et une
   pastille blanche portant « 12 ». Mesure, pas estimation. */
const etale=await pg.evaluate(async()=>{
  const d=DRINKS.find(x=>x.name==="Coca-Cola Original");
  /* La position est posee a la main : sans elle le cadrage ne peut pas
     choisir « le plus proche », et la scene ne jouerait pas le bon chemin. */
  window.userLat=50.8793; window.userLng=4.3511;
  window.STORES.length=0;
  for(let i=0;i<12;i++){
    const km=2.5+i*1.6, ang=i*1.1;
    window.STORES.push({id:"E"+i,name:"Carrefour "+i,brand:"Carrefour",
      lat:50.8793+Math.cos(ang)*km/111, lng:4.3511+Math.sin(ang)*km/71,
      dist:km*1000, drinks:[d.id], confirmations:{}});
  }
  window._mapInStockOnly=false; window.mapRenderedFor=null;
  const bx=document.getElementById("map-box");
  if(bx&&bx.classList.contains("map-fullscreen"))window.toggleDrinkMapFull();
  window.pick(d); await new Promise(r=>setTimeout(r,900));
  window.renderMap(); await new Promise(r=>setTimeout(r,2800));
  const m=window._leafletMap, b=m.getBounds();
  const lg=document.querySelector("#map-box .map-legend");
  /* Le magasin le plus proche est-il dans le cadre ? C'est la question que
     pose cet apercu, et la carte-reponse juste en dessous le nomme. */
  let dmin=Infinity,proche=null;
  for(const p of (window._mapPins||[])){
    const dd=window.haversine(window.userLat,window.userLng,p[0],p[1]);
    if(dd<dmin){dmin=dd;proche=p;}
  }
  return {zoom:m.getZoom(),
    largeurKm:+(m.distance(b.getNorthWest(),b.getNorthEast())/1000).toFixed(1),
    pastilles:document.querySelectorAll("#map-box .mago-cluster").length,
    dessines:(window._mapPins||[]).length,
    visible:window.compterPinsVisibles(),
    procheCadre:!!(proche&&b.contains(window.L.latLng(proche[0],proche[1]))),
    procheKm:+(dmin/1000).toFixed(1),
    legende:(lg?lg.textContent:"").replace(/\s+/g," ").trim()};
});
verifier("capture : aucune pastille « 12 »",etale.pastilles===0,etale.pastilles+" pastille(s)");
verifier("capture : zoom remonte au plancher",etale.zoom>=11,"zoom "+etale.zoom);
verifier("capture : la carte reste a l'echelle d'une ville",etale.largeurKm<=40,etale.largeurKm+" km de large");
verifier("capture : le plus proche est dans le cadre",etale.procheCadre,"a "+etale.procheKm+" km");
verifier("capture : les absents sont comptes a part",
  etale.visible.loin===0||/plus loin/.test(etale.legende),
  JSON.stringify(etale.visible)+" « "+etale.legende+" »");

/* ─── Scene 9 : la puce « En rayon » ─────────────────────────────────────
   Elle ne doit pas etre proposee quand elle ne peut que vider la carte, et
   son point doit dire son etat et non le contraire. */
const puceSansSur=await pg.evaluate(()=>{
  const b=document.getElementById("map-instock-btn");
  if(!b)return null;
  const pt=b.querySelector(".pt"), st=getComputedStyle(pt);
  return {affichee:getComputedStyle(b).display!=="none",
          allumee:b.classList.contains("on"),
          fondDuPoint:st.backgroundColor,
          dessine:window._mapDessine};
});
verifier("puce masquee quand aucun magasin confirme",
  puceSansSur&&!puceSansSur.affichee,JSON.stringify(puceSansSur));

await scene(20,4);              /* quatre confirmes : la puce redevient utile */
const puceAvecSur=await pg.evaluate(()=>{
  const b=document.getElementById("map-instock-btn");
  const pt=b.querySelector(".pt");
  return {affichee:getComputedStyle(b).display!=="none",
          allumee:b.classList.contains("on"),
          fondDuPoint:getComputedStyle(pt).backgroundColor};
});
verifier("puce affichee quand il y a du confirme",puceAvecSur.affichee,
  JSON.stringify(puceAvecSur));
verifier("allumee : le point est plein",
  !puceAvecSur.allumee||puceAvecSur.fondDuPoint==="rgb(255, 255, 255)",
  "allumee="+puceAvecSur.allumee+", point="+puceAvecSur.fondDuPoint);
await pg.evaluate(async()=>{window.toggleInStockOnly();await new Promise(r=>setTimeout(r,900));});
const puceEteinte=await pg.evaluate(()=>{
  const b=document.getElementById("map-instock-btn");
  return {allumee:b.classList.contains("on"),
          fondDuPoint:getComputedStyle(b.querySelector(".pt")).backgroundColor};
});
verifier("eteinte : le point n'est plus vert plein",
  puceEteinte.allumee||puceEteinte.fondDuPoint!=="rgb(22, 163, 74)",
  "allumee="+puceEteinte.allumee+", point="+puceEteinte.fondDuPoint);

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
