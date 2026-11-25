/* ══ FIRESTORE SANS RESEAU, ET LA COQUILLE NATIVE ════════════════════════════
   Trois constats de l'audit du 21/11, verrouilles ici :

   1. TRANSPORT. Le canal streaming du SDK faisait monter le tas a 1,1-1,6 Go
      a la reception des magasins (iOS tuait la page : « l'appli redemarre
      toute seule »). Le long polling ramene le pic a ~100 Mo. On verifie que
      c'est bien lui qui est demande, et qu'il n'y a plus d'autre instance.

   2. UNE REPONSE VIDE N'EST PAS UNE ABSENCE DE DONNEES. Hors reseau, le SDK
      resout VIDE sans erreur. Avant : « ✓ 0 magasins a proximite », et entre
      24 h et 48 h de cache, le cache local EFFACE pour le lancement suivant.
      On rejoue exactement ce cas : un magoNearbyCache de 30 h, Firestore
      coupe. Le cache doit survivre et l'accueil rester peuple. Meme logique
      pour le catalogue communautaire : un vide venu du cache ne vaut pas
      « charge ».

   3. LA COQUILLE NATIVE (Capacitor). Google y est impossible : le bouton de
      l'accueil disparait et le chemin Google ouvre le compte par e-mail ;
      le bouton Retour d'Android recule dans l'app au lieu de la quitter ;
      les horaires lisent la copie embarquee d'abord et se rafraichissent en
      silence si le site a plus recent. Et le web a 390 px, qui porte aussi
      la classe html.natif, ne doit RIEN perdre : Google reste.

   Le SDK Firebase est charge depuis gstatic (via le proxy de la session) ;
   tout le reste du reseau est coupe pour la scene 2. Les scenes 3 et 4 ne
   touchent pas au reseau exterieur. */
const { chromium, devices } = (await import("/opt/node22/lib/node_modules/playwright/index.js")).default;
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
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
const BASE=`http://127.0.0.1:${port}`;

const etapes=[];
const v=(nom,cond,det)=>etapes.push([nom,!!cond,det||""]);
const erreurs=[];

/* ── 1. Ce que dit le code lui-meme ──────────────────────────────────────── */
const src=readFileSync(join(R,"index.html"),"utf8");
const nbGetFirestore=(src.match(/getFirestore\(app\)/g)||[]).length;
v("long polling demande au SDK", /initializeFirestore\(app,\s*\{\s*experimentalForceLongPolling:\s*true/.test(src), "initializeFirestore(app,{experimentalForceLongPolling:true})");
v("getFirestore(app) : un seul, en repli", nbGetFirestore===1&&/catch \(e\) \{\s*db = getFirestore\(app\);/.test(src), nbGetFirestore+" occurrence(s)");
v("battement de presence : 5 min", /\}, 300000\);/.test(src)&&!/\}, 45000\);/.test(src), "setInterval(…,300000)");
v("fenetre « en ligne » : 6 min", /Date\.now\(\) - 360000\)/.test(src), "fbCountOnline : lastSeen >= now-360000");
v("verdict admin memorise 24 h", /ADMIN_MEMO_TTL_MS = 24 \* 60 \* 60 \* 1000/.test(src)&&/memo\.uid === user\.uid/.test(src), "magoAdminMemo");
v("meta/drinkNames, drinkMerges : absence memorisee", /_metaAbsent\("drinkMerges"\)/.test(src)&&/_metaAbsent\("drinkNames"\)/.test(src), "magoMetaAbsent, 24 h");
const CACHE_V=(src.match(/const CACHE_DATA_V = "([^"]+)"/)||[])[1]||"";
v("version du cache magasins lue dans la source", !!CACHE_V, "CACHE_DATA_V="+CACHE_V);

/* ── 2. Cache de 30 h, Firestore coupe ───────────────────────────────────── */
const nav=await chromium.launch({executablePath:"/opt/pw-browsers/chromium",args:["--no-sandbox"],
  proxy:process.env.HTTPS_PROXY?{server:process.env.HTTPS_PROXY,bypass:"127.0.0.1,localhost"}:undefined});
const LAT=50.8793, LNG=4.3511;
const TEMOINS=[
  {id:"t1",fbId:"t1",name:"Magasin Temoin Un",brand:"",emoji:"🏪",lat:LAT+0.0012,lng:LNG,type:"superette",dist:130,drinks:[1,2,3],drinksVerified:[],confirmations:{}},
  {id:"t2",fbId:"t2",name:"Magasin Temoin Deux",brand:"",emoji:"🏪",lat:LAT,lng:LNG+0.0025,type:"superette",dist:170,drinks:[1,4],drinksVerified:[],confirmations:{}},
  {id:"t3",fbId:"t3",name:"Magasin Temoin Trois",brand:"",emoji:"🏪",lat:LAT-0.003,lng:LNG,type:"night shop",dist:330,drinks:[2],drinksVerified:[],confirmations:{}}
];
const TS_30H=Date.now()-30*3600*1000;
{
  const ctx=await nav.newContext({...devices["iPhone 13"],locale:"fr-BE",geolocation:{latitude:LAT,longitude:LNG},permissions:["geolocation"],ignoreHTTPSErrors:true});
  const pg=await ctx.newPage();
  pg.on("pageerror",e=>erreurs.push("scene 2 : "+String(e.message).slice(0,140)));
  /* La console dit par quel chemin le code est passe : le catch de
     fbLoadNearbyStores journalise la cause. On veut lire « vide servie par
     le cache » — la preuve que le SDK a bien resolu VIDE et qu'on l'a traite
     comme un echec reseau, pas que la requete n'est jamais partie. */
  const console2=[];
  pg.on("console",m=>{ try{ console2.push(m.text()); }catch(e){} });
  /* Le SDK vient de gstatic ; TOUT le reste du monde exterieur est coupe —
     Firestore, Auth, OSM, Open Food Facts. C'est le tunnel. */
  await pg.route(u=>!/^http:\/\/127\.0\.0\.1/.test(u.href)&&!/gstatic\.com/.test(u.hostname),r=>r.abort());
  await pg.addInitScript(({cacheV,lat,lng,ts,temoins})=>{
    try{
      localStorage.setItem("magoOnboard","1");
      localStorage.setItem("magoLastPos",JSON.stringify({lat:lat,lng:lng,ts:Date.now(),acc:20}));
      localStorage.setItem("magoNearbyCache",JSON.stringify({v:cacheV,lat:lat,lng:lng,radiusKm:10,ts:ts,stores:temoins}));
    }catch(e){}
  },{cacheV:CACHE_V,lat:LAT,lng:LNG,ts:TS_30H,temoins:TEMOINS});
  await pg.goto(BASE+"/index.html",{waitUntil:"commit"});
  /* Le cache de 30 h est servi tout de suite, puis le rafraichissement
     silencieux part vers Firestore (coupe) : on attend qu'il ait rendu
     son verdict (_fbLoading retombe). */
  const sdk=await pg.waitForFunction(()=>typeof window.fbLoadNearbyStores==="function",{timeout:40000}).then(()=>true).catch(()=>false);
  v("scene 2 : le SDK Firebase est charge", sdk, sdk?"module Firebase present":"gstatic injoignable : scene 2 impossible");
  if(sdk){
    await pg.waitForFunction(()=>window._fbReady===true,{timeout:30000}).catch(()=>{});
    const avant=await pg.evaluate(()=>({stores:(window.STORES||[]).length,loading:window._fbLoading}));
    await pg.waitForFunction(()=>window._fbLoading===true,{timeout:10000}).catch(()=>{});
    const t0=Date.now();
    const fini=await pg.waitForFunction(()=>window._fbLoading===false,{timeout:60000}).then(()=>true).catch(()=>false);
    const dur=Date.now()-t0;
    const apres=await pg.evaluate(()=>{
      let cache=null; try{cache=JSON.parse(localStorage.getItem("magoNearbyCache")||"null");}catch(e){}
      const b=document.getElementById("fb-status");
      const nc=document.getElementById("nearby-card");
      return {
        stores:(window.STORES||[]).map(s=>s.name),
        cacheN:cache&&cache.stores?cache.stores.length:-1,
        cacheTs:cache?cache.ts:null,
        banniere:b?b.textContent:"",
        accueil:nc?nc.textContent:"",
        ready:window._fbReady===true
      };
    });
    v("cache 30 h servi avant le reseau", avant.stores===3, avant.stores+" magasins en memoire au depart");
    v("le rafraichissement coupe a rendu la main", fini, (dur/1000).toFixed(1)+" s");
    /* Le SDK a-t-il vraiment repondu VIDE depuis son cache ? (Un simple « la
       requete n'est jamais partie » rendrait tout le reste trivialement vert.) */
    const trace=await pg.waitForFunction(()=>true,{timeout:1000}).then(()=>console2.find(t=>/vide servie par le cache du SDK/.test(t))||"").catch(()=>"");
    v("le SDK a resolu vide, traite comme un echec reseau", !!trace, trace?trace.slice(0,90):"aucune trace « vide servie par le cache » dans la console");
    v("STORES garde les 3 magasins du cache", apres.stores.length===3, apres.stores.join(", "));
    v("magoNearbyCache conserve (3 magasins)", apres.cacheN===3, "stores="+apres.cacheN);
    v("et son horodatage n'a pas bouge", apres.cacheTs===TS_30H, "ts="+apres.cacheTs);
    v("banniere : « cache local », pas « 0 magasins »", /cache local/.test(apres.banniere)&&!/0 magasins/.test(apres.banniere), "« "+apres.banniere+" »");
    v("accueil peuple : un magasin temoin visible", /Magasin Temoin/.test(apres.accueil), (apres.accueil||"").replace(/\s+/g," ").slice(0,80));
    /* Le catalogue communautaire : un vide venu du cache memoire ne vaut pas
       « charge ». On demande la lecture nous-memes (l'auth, coupee, ne la
       declenchera peut-etre jamais) et on attend le verdict. */
    await pg.evaluate(()=>{ window._fbCatalogDepuisServeur=undefined; try{window.fbLoadCatalog();}catch(e){} });
    const cat=await pg.waitForFunction(()=>window._fbCatalogDepuisServeur!==undefined,{timeout:60000}).then(()=>true).catch(()=>false);
    const etatCat=await pg.evaluate(()=>({serveur:window._fbCatalogDepuisServeur,charge:window.communityCatalogLoaded}));
    v("catalogue : la lecture coupee a repondu", cat, cat?"fbCatalogLoaded recu":"pas de reponse en 60 s");
    v("catalogue : vide depuis le cache => PAS « charge »", etatCat.serveur===false&&etatCat.charge===false, JSON.stringify(etatCat));
    /* L'objet Firestore porte-t-il bien l'option ? (champ interne du SDK 10 :
       on le lit sans en dependre — s'il disparait, le controle de source
       ci-dessus reste.) */
    const opt=await pg.evaluate(()=>{ try{ const s=window.db&&(window.db._settings||(window.db._getSettings&&window.db._getSettings())); return s?s.experimentalForceLongPolling:null; }catch(e){ return null; } });
    if(opt!==null)v("l'instance Firestore porte experimentalForceLongPolling", opt===true, String(opt));
  }
  await ctx.close();
}

/* ── 3. Coquille native simulee (Capacitor) ──────────────────────────────── */
{
  const ctx=await nav.newContext({viewport:{width:390,height:844},locale:"fr-BE",geolocation:{latitude:LAT,longitude:LNG},permissions:["geolocation"]});
  const pg=await ctx.newPage();
  pg.on("pageerror",e=>erreurs.push("scene 3 : "+String(e.message).slice(0,140)));
  const requetes=[];
  pg.on("request",r=>{ const u=r.url(); if(/horaires-osm-be/.test(u))requetes.push(u.replace(BASE,"")); });
  /* Le site « publie » a une version plus recente que la copie embarquee. */
  await pg.route(/github\.io\/magofeed\/data\/horaires-osm-be\.meta\.json/,r=>r.fulfill({status:200,contentType:"application/json",body:JSON.stringify({date:"2099-01-01T00:00:00Z",nbCles:2})}));
  await pg.route(/github\.io\/magofeed\/data\/horaires-osm-be\.json/,r=>r.fulfill({status:200,contentType:"application/json",body:JSON.stringify({"999999999":"24/7","__temoin":"Mo-Fr 09:00-17:00"})}));
  await pg.route(u=>!/^http:\/\/127\.0\.0\.1/.test(u.href)&&!/github\.io/.test(u.hostname),r=>r.abort());
  await pg.addInitScript(()=>{
    try{localStorage.setItem("magoOnboard","1");}catch(e){}
    window.__cap={ecoutes:{},sorties:0};
    window.Capacitor={
      isNativePlatform:function(){return true;},
      getPlatform:function(){return "android";},
      Plugins:{App:{
        addListener:function(nom,f){window.__cap.ecoutes[nom]=f;return {remove:function(){}};},
        exitApp:function(){window.__cap.sorties++;}
      }}
    };
  });
  await pg.goto(BASE+"/index.html");
  await pg.waitForFunction(()=>window.DRINKS&&DRINKS.length>100&&typeof window.navBack==="function",{timeout:40000});
  await pg.waitForTimeout(1500);
  const natif=await pg.evaluate(()=>{
    const g=document.getElementById("ob-google"), m=document.getElementById("ob-mail");
    return {
      classe:document.documentElement.classList.contains("natif"),
      googleCache:g?getComputedStyle(g).display==="none":null,
      mailReste:m?getComputedStyle(m).display!=="none":null,
      ecoutes:Object.keys(window.__cap.ecoutes).sort(),
      chemins:typeof window._cheminsHoraires==="function"?window._cheminsHoraires():null
    };
  });
  v("natif : html.natif pose", natif.classe, "");
  v("natif : bouton Google de l'accueil masque", natif.googleCache===true, "display:none");
  v("natif : le compte par e-mail reste", natif.mailReste===true, "#ob-mail visible");
  v("natif : appStateChange ET backButton ecoutes", natif.ecoutes.join(",")==="appStateChange,backButton", natif.ecoutes.join(","));
  v("natif : horaires embarques d'abord, publies en repli", Array.isArray(natif.chemins)&&natif.chemins[0]==="data/horaires-osm-be.json"&&/^https:/.test(natif.chemins[1]||""), (natif.chemins||[]).join(" puis "));

  /* Retour Android : depuis un ecran empile, on recule ; depuis l'accueil, on quitte. */
  const retour=await pg.evaluate(async()=>{
    const ecran=()=>{const c=document.querySelector(".screen.on");return c?c.id:"";};
    const dormir=ms=>new Promise(r=>setTimeout(r,ms));
    window.navTo("settings"); await dormir(700);
    const depuis=ecran();
    window.__cap.ecoutes.backButton(); await dormir(900);
    const apres1=ecran(), sorties1=window.__cap.sorties;
    /* Un onglet (pas l'accueil), pile vide : Retour ramene a l'accueil, ne quitte pas. */
    window.navTo("search"); await dormir(700);
    window.__cap.ecoutes.backButton(); await dormir(900);
    const apres2=ecran(), sorties2=window.__cap.sorties;
    window.__cap.ecoutes.backButton(); await dormir(300);
    return {depuis,apres1,sorties1,apres2,sorties2,sorties3:window.__cap.sorties};
  });
  v("Retour : depuis Reglages, on recule", retour.depuis==="s-settings"&&retour.apres1!=="s-settings"&&retour.sorties1===0, retour.depuis+" -> "+retour.apres1+", exitApp="+retour.sorties1);
  v("Retour : depuis un onglet, on revient a l'accueil", retour.apres2==="s-home"&&retour.sorties2===0, "search -> "+retour.apres2+", exitApp="+retour.sorties2);
  v("Retour : depuis l'accueil, on quitte", retour.sorties3===1, "exitApp="+retour.sorties3);

  /* Google en natif : la feuille e-mail s'ouvre, et on le dit. */
  const google=await pg.evaluate(async()=>{
    window.signInGoogle();
    await new Promise(r=>setTimeout(r,300));
    const sh=document.getElementById("auth-sheet"), t=document.getElementById("toast");
    return {feuille:sh?getComputedStyle(sh).display:null,toast:t?t.textContent:""};
  });
  v("Google en natif : la feuille e-mail s'ouvre", google.feuille==="block", "display="+google.feuille);
  v("Google en natif : le message le dit", /e-mail/.test(google.toast), "« "+google.toast+" »");

  /* Horaires : copie embarquee lue d'abord, puis rafraichissement silencieux. */
  await pg.evaluate(()=>{ try{window.chargerHorairesOSM();}catch(e){} });
  await pg.waitForFunction(()=>window.HORAIRES_OSM&&Object.keys(window.HORAIRES_OSM).length>1000,{timeout:30000}).catch(()=>{});
  const embarque=await pg.evaluate(()=>window.HORAIRES_OSM?Object.keys(window.HORAIRES_OSM).length:0);
  const rafraichi=await pg.waitForFunction(()=>window.HORAIRES_OSM&&window.HORAIRES_OSM.__temoin,{timeout:20000}).then(()=>true).catch(()=>false);
  const garde=await pg.evaluate(()=>new Promise(res=>{ try{ window.idbGet("horaires:osm",d=>res(d?{date:d.date,n:Object.keys(d.data||{}).length}:null)); }catch(e){ res(null); } }));
  const iLocal=requetes.findIndex(u=>u==="/data/horaires-osm-be.json");
  const iMeta=requetes.findIndex(u=>/github\.io.*meta\.json/.test(u));
  const iPub=requetes.findIndex(u=>/github\.io\/magofeed\/data\/horaires-osm-be\.json/.test(u));
  v("horaires natif : la copie embarquee repond d'abord", embarque>1000&&iLocal===0, embarque+" cles, requetes : "+requetes.map(u=>u.replace(/^https:\/\/[^/]+\/magofeed\//,"site:")).join(" ; "));
  v("horaires natif : le meta publie est consulte APRES", iMeta>iLocal, "meta a l'index "+iMeta);
  v("horaires natif : plus recent => rafraichi en silence", rafraichi&&iPub>iMeta, rafraichi?"__temoin present":"pas de rafraichissement");
  v("horaires natif : la copie fraiche est gardee (IndexedDB)", garde&&garde.date==="2099-01-01T00:00:00Z"&&garde.n===2, JSON.stringify(garde));

  /* Lancement SUIVANT (meme appareil : l'IndexedDB survit) : la copie gardee
     prend le pas sur le bundle sans retelecharger les 2,1 Mo — seul le
     meta.json (12 Ko) est redemande, et le site n'a rien de plus recent. */
  requetes.length=0;
  await pg.goto(BASE+"/index.html");
  await pg.waitForFunction(()=>window.DRINKS&&DRINKS.length>100&&typeof window.chargerHorairesOSM==="function",{timeout:40000});
  await pg.evaluate(()=>{ try{window.chargerHorairesOSM();}catch(e){} });
  const relance=await pg.waitForFunction(()=>window.HORAIRES_OSM&&window.HORAIRES_OSM.__temoin,{timeout:20000}).then(()=>true).catch(()=>false);
  await pg.waitForTimeout(1500);
  const metaRedemande=requetes.some(u=>/github\.io.*meta\.json/.test(u));
  const completRedemande=requetes.some(u=>/github\.io\/magofeed\/data\/horaires-osm-be\.json/.test(u));
  v("lancement suivant : la copie gardee prend le pas", relance, relance?"__temoin present sans telechargement":"copie gardee non reprise");
  v("lancement suivant : meta consulte, fichier complet NON retelecharge", metaRedemande&&!completRedemande, requetes.map(u=>u.replace(/^https:\/\/[^/]+\/magofeed\//,"site:")).join(" ; "));
  await ctx.close();
}

/* ── 4. Le web a 390 px : html.natif aussi, mais rien ne doit disparaitre ── */
{
  const ctx=await nav.newContext({viewport:{width:390,height:844},locale:"fr-BE"});
  const pg=await ctx.newPage();
  pg.on("pageerror",e=>erreurs.push("scene 4 : "+String(e.message).slice(0,140)));
  const requetes=[];
  pg.on("request",r=>{ const u=r.url(); if(/horaires-osm-be/.test(u))requetes.push(u.replace(BASE,"")); });
  await pg.route(u=>!/^http:\/\/127\.0\.0\.1/.test(u.href),r=>r.abort());
  await pg.addInitScript(()=>{try{localStorage.setItem("magoOnboard","1");}catch(e){}});
  await pg.goto(BASE+"/index.html");
  await pg.waitForFunction(()=>window.DRINKS&&DRINKS.length>100&&typeof window.chargerHorairesOSM==="function",{timeout:40000});
  await pg.waitForTimeout(1200);
  await pg.evaluate(()=>{ try{window.chargerHorairesOSM();}catch(e){} });
  await pg.waitForFunction(()=>window.HORAIRES_OSM&&Object.keys(window.HORAIRES_OSM).length>1000,{timeout:30000}).catch(()=>{});
  await pg.waitForTimeout(800);
  const web=await pg.evaluate(()=>{
    const g=document.getElementById("ob-google");
    return {classe:document.documentElement.classList.contains("natif"),googleVisible:g?getComputedStyle(g).display!=="none":null,chemins:window._cheminsHoraires()};
  });
  v("web 390 px : html.natif pose (plein ecran)", web.classe, "");
  v("web 390 px : le bouton Google RESTE", web.googleVisible===true, "display="+(web.googleVisible?"visible":"none"));
  v("web : horaires = le chemin relatif, rien de plus", web.chemins.length===1&&web.chemins[0]==="data/horaires-osm-be.json", web.chemins.join(" puis "));
  v("web : aucune requete vers le site publie", !requetes.some(u=>/github\.io/.test(u)), requetes.join(" ; "));
  await ctx.close();
}

console.log("\n  FIRESTORE SANS RESEAU, ET LA COQUILLE NATIVE\n");
let ko=0;
for(const [nom,ok,det] of etapes){ if(!ok)ko++; console.log("   "+(ok?"ok  ":"ECHEC")+"  "+nom.padEnd(52)+" "+det); }
console.log("\n  erreurs JavaScript : "+erreurs.length);
erreurs.slice(0,5).forEach(e=>console.log("    "+e));
console.log("\n  "+(ko===0&&erreurs.length===0?"TOUT EST VERT":ko+" CONTROLE(S) EN ECHEC"));
await nav.close(); srv.close();
process.exit(ko===0&&erreurs.length===0?0:1);
