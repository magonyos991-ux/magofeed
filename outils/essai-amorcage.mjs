/* ══ L'AMORCAGE NE MENT PLUS : cle corrompue, reseau lent, journal des plantages ═
   Trois constats de l'audit du 21/11, mesures et rejoues :

     1. UNE cle localStorage qui n'est pas du JSON (« [oops ») tuait l'app a
        chaque lancement — ecran « Un instant… », bouton Recharger qui rejoue
        la boucle, seule issue : desinstaller. data/state.js lit maintenant
        ces onze cles par lireJSON : la valeur illisible est retiree, l'app
        demarre, et le journal garde la trace de la cle fautive.
     2. Sur reseau lent (120 Ko/s), l'accueil marchait a 15 s et, a 20 s, le
        panneau « L'appli n'a pas reussi a demarrer » le recouvrait pour
        toujours : le compte a rebours partait au premier octet de la page et
        personne ne retirait le panneau. Il part a DOMContentLoaded, et
        __magoBootOK (fin de l'INIT, fermeture du splash) le desarme et le
        retire. Un rejet de promesse (Firestore unavailable, auth reseau…)
        ne l'affiche plus du tout.
     3. Rien n'etait enregistre nulle part : une erreur ne vivait que sur
        l'ecran du telephone. window.magoJournal range chaque erreur dans une
        file locale (magoErrFile, 10 lignes, 20 par jour, dedoublonnee), que
        le module Firebase vide dans erreursClient des que l'identite est
        connue. Anonyme par construction.

   Et la recuperation automatique, qui vidait TOUS les caches puis
   rechargeait : hors ligne, c'etait la page d'erreur du navigateur a la place
   d'une app qui demarrait tres bien avec son cache. Elle ne jette plus que
   les caches de code (jamais les vignettes), a la deuxieme erreur
   consecutive, et seulement si le serveur repond.

   Ce controle joue chaque cas dans un vrai Chromium (iPhone 13 emule), sur un
   serveur statique local, Firebase injoignable sauf dans la derniere scene,
   qui parle a l'emulateur Firestore (jamais a la production) pour voir la
   ligne arriver dans erreursClient, regles comprises.

   Lancer :  MAGO_RACINE=$PWD node outils/essai-amorcage.mjs
   La scene emulateur demande firebase-tools (npm install dans
   functions-a-deployer/tests-regles) ; sans lui, elle est dite « non jouee ». */
const { chromium, devices } = (await import("/opt/node22/lib/node_modules/playwright/index.js")).default;
import { createServer } from "node:http";
import { readFile, writeFile, copyFile, mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { extname, join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer as serveurNet } from "node:net";

const R=process.env.MAGO_RACINE||"/home/user/magofeed";
const M={".html":"text/html",".css":"text/css",".js":"text/javascript",".json":"application/json",".svg":"image/svg+xml",".png":"image/png"};
const PROJET="magofeed-7f621";   /* celui de firebaseConfig : l'app en mode repetition parle a cet espace */

/* ─── Outils ──────────────────────────────────────────────────────────────── */
function serveur(gzip){
  const srv=createServer(async(q,s)=>{
    let u=decodeURIComponent(q.url.split("?")[0]); if(u==="/")u="/index.html";
    try{
      let b=await readFile(join(R,u));
      const h={"content-type":M[extname(u)]||"application/octet-stream"};
      if(gzip){b=gzipSync(b);h["content-encoding"]="gzip";}
      h["content-length"]=b.length; s.writeHead(200,h); s.end(b);
    }catch{s.writeHead(404);s.end("");}
  });
  return new Promise(r=>srv.listen(0,"127.0.0.1",()=>r(srv)));
}
function serveurSur(port){
  const srv=createServer(async(q,s)=>{
    let u=decodeURIComponent(q.url.split("?")[0]); if(u==="/")u="/index.html";
    try{const b=await readFile(join(R,u));s.writeHead(200,{"content-type":M[extname(u)]||"application/octet-stream"});s.end(b);}
    catch{s.writeHead(404);s.end("");}
  });
  return new Promise(r=>srv.listen(port,"127.0.0.1",()=>r(srv)));
}
function couper(srv){ srv.closeAllConnections(); return new Promise(r=>srv.close(()=>r())); }
function portLibre(depart){
  return new Promise(ok=>{const s=serveurNet();s.once("error",()=>ok(portLibre(depart+1)));
    s.once("listening",()=>{const p=s.address().port;s.close(()=>ok(p));});s.listen(depart,"127.0.0.1");});
}
const proxy=process.env.HTTPS_PROXY?{server:process.env.HTTPS_PROXY,bypass:"127.0.0.1,localhost"}:undefined;
const nav=await chromium.launch({executablePath:"/opt/pw-browsers/chromium",args:["--no-sandbox"],proxy});

/* Le telephone : iPhone 13, CPU ralenti, tuiles et photos abortees, Firebase
   injoignable (API, SDK) sauf demande contraire, intro deja vue. */
async function ouvrir({cpu=1,init,sdk=false,api=false,lent=null,sw=true}={}){
  const ctx=await nav.newContext({...devices["iPhone 13"],locale:"fr-BE",ignoreHTTPSErrors:true,
    geolocation:{latitude:50.8793,longitude:4.3511},permissions:["geolocation"]});
  const pg=await ctx.newPage();
  const j={pageerror:[],console:[]};
  pg.on("pageerror",e=>j.pageerror.push(String(e.message).slice(0,140)));
  pg.on("console",m=>j.console.push(m.text().slice(0,200)));
  await pg.route(/tile\.openstreetmap\.org|basemaps\.cartocdn\.com|openfoodfacts\.org|nominatim/,r=>r.abort());
  await pg.route(u=>{const h=u.hostname;
    if(!sdk&&/gstatic\.com$|cdnjs\.cloudflare\.com$/.test(h))return true;
    if(!api&&/googleapis\.com$|firebaseapp\.com$|firebaseio\.com$/.test(h))return true;
    return false;},r=>r.abort());
  if(!sw)await pg.route(/\/sw\.js$/,r=>r.abort());
  await pg.addInitScript(()=>{try{localStorage.setItem("magoOnboard","1");localStorage.setItem("magoob","1");}catch(e){}});
  if(init)await pg.addInitScript(init);
  const cdp=await ctx.newCDPSession(pg);
  if(cpu>1)await cdp.send("Emulation.setCPUThrottlingRate",{rate:cpu});
  if(lent){await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions",{offline:false,latency:lent.latence,downloadThroughput:lent.kos*1024,uploadThroughput:20*1024});}
  return {ctx,pg,j};
}
const etat=(pg)=>pg.evaluate(()=>{
  const ls=k=>{try{return localStorage.getItem(k);}catch(e){return "(inaccessible)";}};
  let file=[];try{file=JSON.parse(ls("magoErrFile")||"[]");}catch(e){}
  return {boot:!!window.__MAGO_BOOTED__,crash:!!document.getElementById("mago-crash"),
    recover:!!document.getElementById("mago-recover"),reset:!!document.getElementById("mago-reset"),
    diag:((document.getElementById("mago-diag")||{}).textContent||"").slice(0,200),
    splashCache:!!(document.getElementById("splash")&&document.getElementById("splash").classList.contains("hidden")),
    ecransOn:document.querySelectorAll(".screen.on").length,drinks:!!window.DRINKS,
    file,jour:ls("magoErrJour"),bootErr:ls("magoBootErreurs"),url:location.href};
}).catch(e=>({err:String(e.message).slice(0,120),file:[]}));
const attendre=async(pg,fn,ms)=>{try{await pg.waitForFunction(fn,undefined,{timeout:ms,polling:100});return true;}catch(e){return false;}};

const etapes=[];
function verifier(nom,cond,detail){etapes.push([nom,!!cond,detail||""]);}
/* Le bug a injecter dans l'INIT : window.addEventListener("appinstalled", …)
   n'est appele qu'une fois, DANS le bloc INIT. Le faire lever une exception,
   c'est exactement « une nouvelle version qui plante au demarrage ». */
const BOUM_INIT=()=>{var o=window.addEventListener;window.addEventListener=function(t){if(t==="appinstalled")throw new Error("boum INIT (essai)");return o.apply(window,arguments);};};

/* ═══ SCENE EMULATEUR (relancee par firebase emulators:exec) ═══════════════ */
if(process.env.MAGO_SCENE_JOURNAL){
  const F=Number(process.env.MAGO_PORT_FS),A=Number(process.env.MAGO_PORT_AUTH);
  const srv=await serveur(false); const port=srv.address().port;
  const {ctx,pg,j}=await ouvrir({sdk:true,api:true,init:()=>{try{localStorage.setItem("magoRepetition","1");}catch(e){}}});
  /* Les ports, choisis libres par le lanceur : l'app en mode repetition les lit
     dans magoRepetitionPorts et branche le SDK sur les emulateurs. */
  await pg.addInitScript(`try{localStorage.setItem("magoRepetitionPorts",JSON.stringify({firestore:${F},auth:${A},functions:1}));}catch(e){}`);
  await pg.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:"commit"});
  const sdkLa=await attendre(pg,()=>!!window.db&&!!window.__magoRepetition,40000);
  if(!sdkLa){
    console.log("   NON JOUE  scene emulateur : le SDK Firebase (gstatic) n'est pas joignable d'ici");
    await ctx.close();await nav.close();await couper(srv);process.exit(0);
  }
  const auth=await attendre(pg,()=>!!window._fbUser,30000);
  verifier("emulateur : l'auth anonyme donne une identite",auth,"window._fbUser");
  await pg.waitForFunction(()=>window.__MAGO_BOOTED__,undefined,{timeout:30000}).catch(()=>{});
  await pg.evaluate(()=>{setTimeout(function(){throw new Error("boum journal (essai)");},0);});
  const lire=async()=>{
    const r=await fetch(`http://127.0.0.1:${F}/v1/projects/${PROJET}/databases/(default)/documents/erreursClient`,{headers:{Authorization:"Bearer owner"}});
    const js=await r.json().catch(()=>({}));
    return (js.documents||[]).map(d=>Object.fromEntries(Object.entries(d.fields||{}).map(([k,v])=>[k,Object.values(v)[0]])));
  };
  let docs=[],trouve=null;
  for(let i=0;i<60&&!trouve;i++){await pg.waitForTimeout(500);docs=await lire().catch(()=>[]);trouve=docs.find(d=>String(d.m||"").indexOf("boum journal")!==-1);}
  verifier("emulateur : l'erreur injectee est devenue un document erreursClient",!!trouve,trouve?JSON.stringify(trouve).slice(0,160):(docs.length+" document(s), aucun ne porte le message ; console : "+j.console.filter(t=>/erreursClient|permission|Journal/i.test(t)).slice(0,3).join(" | ")));
  if(trouve){
    verifier("emulateur : type, ecran, navigateur, natif, horodatage serveur",
      trouve.k==="error"&&/^s-/.test(String(trouve.e))&&String(trouve.n).length>10&&trouve.natif===false&&typeof trouve.t==="string"&&String(trouve.v).length>0,
      "k="+trouve.k+" e="+trouve.e+" v="+trouve.v+" natif="+trouve.natif);
    verifier("emulateur : ni uid, ni position, ni pseudo dans la ligne",!("uid" in trouve)&&!("lat" in trouve)&&!("pseudo" in trouve),Object.keys(trouve).join(","));
    const e=await etat(pg);
    verifier("emulateur : la file locale est videe une fois envoyee",e.file.length===0,"magoErrFile = "+e.file.length+" ligne(s)");
  }
  await ctx.close();await nav.close();await couper(srv);
  let ko=0;for(const [nom,ok,det] of etapes){if(!ok)ko++;console.log("   "+(ok?"ok  ":"ECHEC")+"  "+nom.padEnd(66)+" "+det);}
  process.exit(ko?1:0);
}

/* ═══ 1. Cle corrompue : l'app demarre, la cle est retiree, le journal le dit ═ */
{
  const srv=await serveur(false); const port=srv.address().port;
  const {ctx,pg,j}=await ouvrir({cpu:4,init:()=>{try{
    localStorage.setItem("magofavs","[oops");                    /* pas du JSON */
    localStorage.setItem("magoPrices",'{"1":{"a":2.5');          /* ecriture coupee */
    localStorage.setItem("magoStreak","undefined");              /* le classique */
    localStorage.setItem("magoVotedDisc","{}");                  /* lisible, mais pas une liste */
  }catch(e){}}});
  await pg.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:"commit"});
  const demarre=await attendre(pg,()=>window.__MAGO_BOOTED__&&document.getElementById("splash")&&document.getElementById("splash").classList.contains("hidden"),30000);
  await pg.waitForTimeout(800);
  const e=await etat(pg);
  const types=await pg.evaluate(()=>({favs:Array.isArray(favorites),votes:Array.isArray(votedDiscoveries),prix:storePrices&&typeof storePrices==="object",streak:userStreak&&typeof userStreak.streak==="number",
    cles:["magofavs","magoPrices","magoStreak","magoVotedDisc"].map(k=>localStorage.getItem(k))})).catch(()=>({}));
  verifier("1. cle corrompue : l'app demarre (splash efface, __MAGO_BOOTED__)",demarre&&e.boot&&e.splashCache&&e.ecransOn===1,"boot="+e.boot+" splash="+e.splashCache+" ecrans="+e.ecransOn);
  verifier("1. ni panneau gris, ni ecran doux",!e.crash&&!e.recover,"crash="+e.crash+" recover="+e.recover);
  verifier("1. les valeurs par defaut ont pris la place (favoris = liste, prix = objet, serie = objet)",types.favs&&types.votes&&types.prix&&types.streak,JSON.stringify(types).slice(0,120));
  verifier("1. les quatre cles illisibles sont retirees",types.cles&&types.cles.every(v=>v===null),JSON.stringify(types.cles));
  const boots=e.file.filter(l=>l.k==="boot"&&/localStorage corrompu/.test(l.m));
  verifier("1. le journal porte une ligne « boot » par cle fautive",boots.length===4&&boots.some(l=>/magofavs/.test(l.m)),boots.map(l=>l.m).join(" | "));
  verifier("1. aucune erreur JavaScript",j.pageerror.length===0,j.pageerror.slice(0,2).join(" | "));
  await ctx.close(); await couper(srv);
}

/* ═══ 2. Reseau lent (120 Ko/s) : l'accueil arrive, le panneau jamais ═══════ */
{
  const srv=await serveur(true); const port=srv.address().port;
  const {ctx,pg,j}=await ouvrir({cpu:4,sw:false,lent:{kos:120,latence:200}});
  const t0=Date.now();
  pg.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:"commit",timeout:120000}).catch(()=>{});
  let tSplash=null,tBoot=null,tCrash=null,s={};
  for(let i=0;i<200;i++){
    await pg.waitForTimeout(500);
    s=await etat(pg); if(s.err)continue;
    const t=Date.now()-t0;
    if(s.splashCache&&tSplash==null)tSplash=t;
    if(s.boot&&tBoot==null)tBoot=t;
    if(s.crash&&tCrash==null)tCrash=t;
    if((tSplash!=null&&(tCrash!=null||t>tSplash+22000))||t>95000)break;
  }
  verifier("2. 120 Ko/s : l'accueil est visible",tSplash!=null,"splash efface a "+tSplash+" ms");
  verifier("2. 120 Ko/s : le drapeau de demarrage est pose avec l'accueil",tBoot!=null&&tSplash!=null&&tBoot<=tSplash+1500,"__MAGO_BOOTED__ a "+tBoot+" ms");
  verifier("2. 120 Ko/s : aucun panneau « L'appli n'a pas reussi a demarrer », meme 22 s apres",tCrash==null,tCrash==null?"jamais":"a "+tCrash+" ms — "+s.diag);
  verifier("2. aucune erreur JavaScript",j.pageerror.length===0,j.pageerror.slice(0,2).join(" | "));
  await ctx.close(); await couper(srv);
}

/* ═══ 3. Une erreur injectee apres le demarrage -> une ligne dans la file ═══ */
{
  const srv=await serveur(false); const port=srv.address().port;
  const {ctx,pg}=await ouvrir({});
  await pg.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:"commit"});
  await attendre(pg,()=>window.__MAGO_BOOTED__&&document.getElementById("splash")&&document.getElementById("splash").classList.contains("hidden"),30000);
  await pg.evaluate(()=>{
    setTimeout(function(){throw new Error("boum essai 1");},0);
    setTimeout(function(){throw new Error("boum essai 1");},20);                      /* le meme : dedoublonne */
    Promise.reject(Object.assign(new Error("Le service est indisponible"),{code:"unavailable"}));   /* reseau : ignore */
    Promise.reject(Object.assign(new Error("x"),{code:"auth/network-request-failed"}));               /* reseau : ignore */
    Promise.reject(Object.assign(new Error("Missing or insufficient permissions."),{code:"permission-denied"}));  /* celui-la compte */
    window.dispatchEvent(new ErrorEvent("error",{message:"Script error."}));           /* un autre domaine : ignore */
  });
  await pg.waitForTimeout(800);
  let e=await etat(pg);
  const err=e.file.filter(l=>l.k==="error"),rej=e.file.filter(l=>l.k==="rejection");
  verifier("3. l'erreur injectee est dans la file magoErrFile (type error, ecran courant)",err.length===1&&/boum essai 1/.test(err[0].m)&&/^s-/.test(err[0].e),JSON.stringify(err[0]||{}).slice(0,140));
  verifier("3. la meme erreur deux fois = une seule ligne",err.length===1,err.length+" ligne(s)");
  verifier("3. le rejet permission-denied est note, les rejets reseau et « Script error. » non",rej.length===1&&/permission-denied/.test(rej[0].m)&&!e.file.some(l=>/unavailable|network-request-failed|Script error/.test(l.m)),e.file.map(l=>l.k+":"+l.m.slice(0,40)).join(" | "));
  verifier("3. un rejet de promesse n'affiche plus le panneau",!e.crash&&e.boot,"crash="+e.crash);
  /* Le plafond : 25 erreurs distinctes de plus, 20 lignes au plus dans la journee. */
  await pg.evaluate(()=>{for(let i=0;i<25;i++)setTimeout(function(){throw new Error("boum serie "+i);},i*5);});
  await pg.waitForTimeout(1000);
  e=await etat(pg);
  let jour={};try{jour=JSON.parse(e.jour);}catch(x){}
  verifier("3. plafond : 20 lignes par jour, file bornee a 10",jour.n===20&&e.file.length<=10,"magoErrJour.n="+jour.n+" file="+e.file.length);
  const avant=e.file.length;
  await pg.reload({waitUntil:"commit"});
  await attendre(pg,()=>window.__MAGO_BOOTED__,30000);
  await pg.waitForTimeout(500);
  e=await etat(pg);
  verifier("3. la file survit au rechargement (Firebase injoignable : rien n'est envoye)",e.file.length===avant&&avant>0,avant+" -> "+e.file.length);
  await ctx.close(); await couper(srv);
}

/* ═══ 4. Un bug dans l'INIT : l'ecran doux dit lequel, et offre la remise a zero ═ */
{
  const srv=await serveur(false); const port=srv.address().port;
  const {ctx,pg}=await ouvrir({init:BOUM_INIT});
  await pg.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:"load"});
  await pg.waitForTimeout(400);
  /* Deux temoins poses une fois (pas par un script d'amorcage, qui les
     remettrait a chaque rechargement) : un vrai compte, et une cle a nous. */
  await pg.evaluate(()=>{localStorage.setItem("magoAuthProvider","google");localStorage.setItem("magoTemoinEssai","x");}).catch(()=>{});
  let e=await etat(pg);
  verifier("4. l'ecran doux s'affiche, et il montre le texte de l'erreur",e.recover&&/boum INIT/.test(e.diag),e.diag.slice(0,60));
  verifier("4. le journal a une ligne « boot » avec le message",e.file.some(l=>l.k==="boot"&&/boum INIT/.test(l.m)),e.file.map(l=>l.k+":"+l.m.slice(0,30)).join(" | "));
  verifier("4. premier passage : pas encore de bouton de remise a zero",!e.reset,"reset="+e.reset);
  /* La recuperation automatique (1,3 s) recharge ; le bug est toujours la. */
  await pg.waitForTimeout(3500);
  e=await etat(pg);
  verifier("4. deuxieme passage : l'ecran doux ne boucle plus et propose « Reinitialiser les donnees locales »",e.recover&&e.reset&&e.bootErr==="2",`reset=${e.reset} erreurs consecutives=${e.bootErr}`);
  await pg.click("#mago-reset");
  await pg.waitForTimeout(1200);
  const cles=await pg.evaluate(()=>({temoin:localStorage.getItem("magoTemoinEssai"),auth:localStorage.getItem("magoAuthProvider"),file:localStorage.getItem("magoErrFile")})).catch(()=>({}));
  verifier("4. la remise a zero efface nos cles (mago*) mais garde le compte (magoAuthProvider) et le journal",cles.temoin===null&&cles.auth==="google"&&!!cles.file,JSON.stringify(cles).slice(0,100));
  await ctx.close(); await couper(srv);
}

/* ═══ 5. Service worker installe, HORS LIGNE, bug au demarrage : jamais la page d'erreur ═ */
{
  const srv=await serveur(false); const port=srv.address().port;
  const {ctx,pg,j}=await ouvrir({});
  await pg.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:"load"});
  const sw=await pg.evaluate(async()=>{try{
    const reg=await Promise.race([navigator.serviceWorker.ready,new Promise(r=>setTimeout(()=>r(null),15000))]); if(!reg)return "pas de SW";
    for(let i=0;i<150;i++){const c=await caches.match("./index.html");const d=await caches.match("./data/state.js");if(c&&d)break;await new Promise(r=>setTimeout(r,200));}
    const img=await caches.open("magofeed-img-v1"); await img.put("https://images.openfoodfacts.org/essai.jpg",new Response("x",{headers:{"content-type":"image/jpeg"}}));
    return {keys:await caches.keys(),index:!!(await caches.match("./index.html")),ctrl:!!navigator.serviceWorker.controller};}catch(e){return "err "+e.message;}});
  verifier("5. le service worker a mis l'app en cache",sw&&sw.index&&sw.ctrl,JSON.stringify(sw).slice(0,120));
  await pg.addInitScript(BOUM_INIT);
  await couper(srv);                                   /* plus de reseau */
  let r1;try{await pg.reload({waitUntil:"load",timeout:20000});await pg.waitForTimeout(400);r1=await etat(pg);}catch(err){r1={err:err.message.slice(0,80)};}
  verifier("5. hors ligne, l'app part du cache et l'ecran doux s'affiche",r1.recover&&/boum INIT/.test(r1.diag||""),JSON.stringify(r1).slice(0,120));
  /* Recuperation auto a 1,3 s (1re erreur : mise a jour du SW, puis rechargement), toujours hors ligne. */
  await pg.waitForTimeout(4000);
  let r2=await etat(pg); const caches2=await pg.evaluate(()=>caches.keys()).catch(e=>"err");
  verifier("5. apres la recuperation auto : toujours l'app (pas chrome-error), ecran doux avec remise a zero",/^http:\/\/127\.0\.0\.1/.test(r2.url||"")&&r2.recover&&r2.reset,(r2.url||r2.err||"").slice(0,60)+" reset="+r2.reset);
  verifier("5. les caches sont intacts (code ET vignettes)",Array.isArray(caches2)&&caches2.some(k=>/^magofeed-/.test(k)&&k!=="magofeed-img-v1")&&caches2.includes("magofeed-img-v1"),JSON.stringify(caches2));
  /* Deuxieme erreur consecutive, le serveur ne repond toujours pas : « Recharger » ne doit rien jeter. */
  await pg.evaluate(()=>{const od=caches.delete.bind(caches);caches.delete=function(k){console.log("[essai] purge "+k);return od(k);};}).catch(()=>{});
  await pg.click("#mago-recover").catch(()=>{});
  await pg.waitForTimeout(5500);
  let r3=await etat(pg); const caches3=await pg.evaluate(()=>caches.keys()).catch(()=>"err");
  const imgReste=await pg.evaluate(async()=>!!(await caches.match("https://images.openfoodfacts.org/essai.jpg"))).catch(()=>false);
  verifier("5. 2e erreur, serveur muet : rien n'est purge, l'app revient du cache",!j.console.some(t=>/\[essai\] purge/.test(t))&&/^http:\/\/127\.0\.0\.1/.test(r3.url||"")&&Array.isArray(caches3)&&caches3.length===caches2.length&&imgReste,"purges="+j.console.filter(t=>/\[essai\] purge/.test(t)).length+" caches="+JSON.stringify(caches3)+" img="+imgReste);
  /* Le reseau revient : la 2e erreur consecutive jette le cache de CODE, pas les vignettes. */
  const srv2=await serveurSur(port);
  await pg.evaluate(()=>{const od=caches.delete.bind(caches);caches.delete=function(k){console.log("[essai] purge "+k);return od(k);};}).catch(()=>{});
  await pg.click("#mago-recover").catch(()=>{});
  await pg.waitForTimeout(5500);
  const purges=j.console.filter(t=>/\[essai\] purge/.test(t)).map(t=>t.replace("[essai] purge ",""));
  const imgReste2=await pg.evaluate(async()=>!!(await caches.match("https://images.openfoodfacts.org/essai.jpg"))).catch(()=>false);
  verifier("5. le reseau revenu : le cache de code est jete, le cache des vignettes jamais",purges.length>=1&&purges.every(k=>/^magofeed-/.test(k)&&k!=="magofeed-img-v1")&&imgReste2,"purges="+JSON.stringify(purges)+" img="+imgReste2);
  await ctx.close(); await couper(srv2);
}

/* ═══ 6. Ce que le code promet, noir sur blanc ═════════════════════════════ */
{
  const html=await readFile(join(R,"index.html"),"utf8");
  const premier=html.slice(html.indexOf("FILET DE SECURITE"),html.indexOf("</script>",html.indexOf("FILET DE SECURITE")));
  const rejet=premier.slice(premier.indexOf('addEventListener("unhandledrejection"'));
  verifier("6. le premier script ne montre plus le panneau sur un rejet de promesse",rejet.indexOf("panel(")===-1||rejet.indexOf("panel(")>rejet.indexOf("});"),"");
  verifier("6. le compte a rebours part a DOMContentLoaded et __magoBootOK retire le panneau",/DOMContentLoaded/.test(premier)&&/mago-crash"\)\s*;?\s*if\s*\(c\)\s*c\.remove\(\)/.test(premier),"");
  const st=await readFile(join(R,"data/state.js"),"utf8");
  verifier("6. data/state.js : les onze lectures passent par lireJSON, plus une seule a nu",(st.match(/lireJSON\("/g)||[]).length===11&&!/JSON\.parse\(localStorage\.getItem\("mago(favs|Prices|searchhist|scans|VotedDisc|GeocodeCache|PriceHist|Streak|ScanHist)"/.test(st)&&!/JSON\.parse\(localStorage\.getItem\("mago_(ratings|recs)"/.test(st),(st.match(/lireJSON\("/g)||[]).length+" appels");
  const regles=await readFile(join(R,"functions-a-deployer/firestore.rules"),"utf8");
  const bloc=regles.slice(regles.indexOf("match /erreursClient/{id}"));
  verifier("6. regles : erreursClient se cree avec un compte, se relit par l'admin seul, ne se modifie pas",bloc.indexOf("match /erreursClient")===0&&/allow read: if isAdmin\(\)/.test(bloc.slice(0,1400))&&/hasOnly\(\['k','m','p','v','e','n','natif','t'\]\)/.test(bloc)&&/allow update: if false/.test(bloc.slice(0,1400)),"");
  const sw=await readFile(join(R,"sw.js"),"utf8");
  verifier("6. les noms de cache que la recuperation epargne sont ceux du service worker",/IMG_CACHE = "magofeed-img-v1"/.test(sw)&&/CACHE_NAME = "magofeed-/.test(sw),"");
}

/* ═══ 7. La scene emulateur : la ligne arrive dans erreursClient, regles comprises ═ */
{
  const TESTS=join(R,"functions-a-deployer","tests-regles");
  const FIREBASE=join(TESTS,"node_modules",".bin","firebase");
  if(!existsSync(FIREBASE)){
    console.log("   NON JOUE  7. scene emulateur : firebase-tools absent (npm install dans functions-a-deployer/tests-regles)");
  }else{
    const base=await portLibre(8600+Math.floor(Math.random()*300)); const pAuth=await portLibre(base+1000);
    const tmp=await mkdtemp(join(tmpdir(),"mago-amorcage-"));
    await copyFile(join(R,"functions-a-deployer","firestore.rules"),join(tmp,"firestore.rules"));
    await writeFile(join(tmp,"firebase.json"),JSON.stringify({firestore:{rules:"firestore.rules",port:base,websocketPort:base+10000},
      emulators:{firestore:{port:base,websocketPort:base+10000},auth:{port:pAuth},hub:{port:base+20000},logging:{port:base+30000},ui:{enabled:false}}},null,2));
    const code=await new Promise(res=>{
      const enfant=spawn(FIREBASE,["emulators:exec","--only","firestore,auth","--project",PROJET,"--config",join(tmp,"firebase.json"),
        process.execPath+" "+JSON.stringify(fileURLToPath(import.meta.url))],
        {cwd:TESTS,stdio:["ignore","pipe","pipe"],env:Object.assign({},process.env,{MAGO_SCENE_JOURNAL:"1",MAGO_PORT_FS:String(base),MAGO_PORT_AUTH:String(pAuth),MAGO_RACINE:R})});
      let sortie="";enfant.stdout.on("data",d=>{sortie+=d;});enfant.stderr.on("data",d=>{sortie+=d;});
      enfant.on("exit",c=>{process.stdout.write(sortie.split("\n").filter(l=>/^\s+(ok|ECHEC|NON JOUE)/.test(l)).join("\n")+"\n");res(c);});
    });
    await rm(tmp,{recursive:true,force:true}).catch(()=>{});
    verifier("7. scene emulateur : terminee sans echec (details ci-dessus)",code===0,"code "+code);
  }
}

console.log("\n  L'AMORCAGE NE MENT PLUS — cle corrompue, reseau lent, journal des plantages\n");
let ko=0;
for(const [nom,ok,det] of etapes){
  if(!ok)ko++;
  console.log("   "+(ok?"ok  ":"ECHEC")+"  "+nom.padEnd(92)+" "+det);
}
console.log("\n  "+(ko===0?"TOUT EST VERT":ko+" CONTROLE(S) EN ECHEC"));
await nav.close();
process.exit(ko===0?0:1);
