/* ══ RETOUR, « VOIR PLUS », CATALOGUE, SPLASH : CE QUI NE DOIT PLUS FIGER ═══
   Quatre lenteurs mesurees par l'audit du 21/11 (iPhone 13 emule, CPU x4) :
     1. retour d'une fiche vers la liste : renderList() reconstruisait les 120
        lignes (266-300 ms), la liste revenait tout en haut, le champ reprenait
        le focus — le clavier remontait alors qu'on venait de LIRE ;
     2. « Voir plus » reconstruisait tout : 0,5-0,6 s au premier clic, puis
        0,75-1,05 s, puis 0,8-1,1 s (37 844 noeuds au troisieme) ;
     3. mergeCatalog comparait chaque fiche communautaire a chacune des 4 450
        fiches (108 x 4 450 x 2 normTxt) : 0,86-1,5 s de gel sept a dix
        secondes apres l'ouverture, pendant qu'on commence a se servir de l'app ;
     4. le splash tenait l'accueil cache jusqu'a T0 + 1,8 s, meme app prete a
        0,5 s.
   Ce controle verrouille les quatre corrections :
     - retour fiche -> liste : premier noeud identique, renderList pas rappelee,
       defilement restaure, #q non focalise ; liste perimee pendant la fiche
       (autre requete) : reconstruite, et repartie du haut ; aller VERS la
       recherche depuis l'accueil garde son comportement (liste, focus) ;
     - « Voir plus » : 200 lignes ajoutees d'un bloc sans toucher aux
       precedentes, moins cher (JavaScript + mise en page) que l'ancienne
       reconstruction a la meme taille, compteur juste, meme contenu qu'une
       reconstruction ;
     - mergeCatalog de 108 fiches (36 noms connus, 36 memes recettes, 36
       nouvelles) : < 150 ms a CPU x4 hors rendu du rail des marques et des
       tendances (toujours synchrones, en attendant scheduleHomeRender), 36
       ajouts et 72 fusions au bon endroit ;
     - splash : cache ≤ 0,35 s apres « pret » a froid, ≤ 0,1 s a chaud.
   Se lance contre la copie de son choix :
       MAGO_RACINE=$PWD node outils/essai-recherche-rendu.mjs
   (CPU=1 pour debrayer le ralentissement). */
const { chromium } = (await import("/opt/node22/lib/node_modules/playwright/index.js")).default;
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const R=process.env.MAGO_RACINE||"/home/user/magofeed";
const CPU=Number(process.env.CPU||4);
const M={".html":"text/html",".css":"text/css",".js":"text/javascript",".json":"application/json",".svg":"image/svg+xml",".png":"image/png"};
let LENT=0; /* ms de retard sur data/drinks.js : force un lancement « a froid » (app prete apres le plancher du splash) */
const srv=createServer(async(q,s)=>{
  let u=decodeURIComponent(q.url.split("?")[0]); if(u==="/")u="/index.html";
  if(LENT&&u.endsWith("data/drinks.js"))await new Promise(r=>setTimeout(r,LENT));
  try{const b=await readFile(join(R,u));s.writeHead(200,{"content-type":M[extname(u)]||"application/octet-stream"});s.end(b);}
  catch{s.writeHead(404);s.end("");}
});
await new Promise(r=>srv.listen(0,r));
const port=srv.address().port;
const nav=await chromium.launch({executablePath:"/opt/pw-browsers/chromium"});

const etapes=[];
function verifier(nom,cond,detail){etapes.push([nom,!!cond,detail||""]);}
const erreurs=[];

async function ouvrir(init,cpu){
  const ctx=await nav.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,
    userAgent:"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    locale:"fr-BE",geolocation:{latitude:50.8793,longitude:4.3511},permissions:["geolocation"]});
  const pg=await ctx.newPage();
  pg.on("pageerror",e=>erreurs.push("ERREUR JS : "+String(e.message).slice(0,160)));
  /* Pas de reseau exterieur : tuiles, vignettes, Firebase. La carte Leaflet
     (cdnjs) peut passer ou non ; le retour depuis la carte marche dans les
     deux cas, et c'est le retour qu'on mesure. */
  await pg.route(/tile\.openstreetmap\.org|basemaps\.cartocdn\.com|images\.openfoodfacts\.org|gstatic\.com|googleapis\.com|firebase|nominatim|quagga/,r=>r.abort());
  await pg.addInitScript(()=>{try{localStorage.setItem("magoOnboard","1");localStorage.setItem("magoob","1");localStorage.setItem("magolang","fr");}catch(e){}});
  if(init)await pg.addInitScript(init);
  const cdp=await ctx.newCDPSession(pg);
  await cdp.send("Emulation.setCPUThrottlingRate",{rate:cpu||CPU});
  await pg.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:"commit",timeout:120000});
  await pg.waitForFunction(()=>window.DRINKS&&window.DRINKS.length>1000&&document.getElementById("splash")&&document.getElementById("splash").classList.contains("hidden"),undefined,{timeout:120000,polling:100});
  return {ctx,pg};
}

const {ctx,pg}=await ouvrir();
await pg.waitForTimeout(1500);

/* ─── 1. Retour fiche -> liste ───────────────────────────────────────────── */
{
  const avant=await pg.evaluate(()=>new Promise(res=>{
    show("search");
    setTimeout(()=>{
      const qi=document.getElementById("q"); qi.value="c"; renderList();
      const sc=document.querySelector("#s-search .scroll"); sc.scrollTop=1500;
      const el=document.getElementById("search-list"); el.firstElementChild.__marque=1;
      /* renderList enveloppee : on compte ses appels et leur duree. */
      const reel=window.renderList; window.__rl=[];
      window.renderList=function(){const a=performance.now();const r=reel.apply(this,arguments);window.__rl.push(Math.round(performance.now()-a));return r;};
      requestAnimationFrame(()=>res({scrollTop:sc.scrollTop,rows:el.children.length}));
    },700);
  }));
  verifier("depart : liste « c » defilee a 1 500 px", avant.scrollTop===1500&&avant.rows>50, avant.rows+" enfants, scrollTop "+avant.scrollTop);
  await pg.evaluate(()=>{pick(DRINKS[5]);});
  await pg.waitForTimeout(1500);
  /* La carte s'est ouverte par-dessus la fiche a +60 ms : la fermer, c'est
     le retour (closeExploreMap -> navBack -> history.back -> popstate). */
  await pg.evaluate(()=>{try{closeExploreMap();}catch(e){}});
  await pg.waitForTimeout(1500);
  const apres=await pg.evaluate(()=>{
    const sc=document.querySelector("#s-search .scroll"),el=document.getElementById("search-list");
    return {ecran:(document.querySelector(".screen.on")||{}).id,scrollTop:sc.scrollTop,rows:el.children.length,
      premierIdentique:!!(el.firstElementChild&&el.firstElementChild.__marque),
      qFocalise:!!(document.activeElement&&document.activeElement.id==="q"),renderList_ms:window.__rl.slice()};
  });
  verifier("retour : on est revenu sur la recherche", apres.ecran==="s-search", "ecran = "+apres.ecran);
  verifier("retour : la liste n'est PAS reconstruite (premier noeud identique, renderList jamais rappelee)", apres.premierIdentique&&apres.renderList_ms.length===0, "renderList appelee "+apres.renderList_ms.length+" fois ("+apres.renderList_ms.join("/")+" ms), "+apres.rows+" enfants");
  verifier("retour : le defilement est restaure (1 500 px)", Math.abs(apres.scrollTop-1500)<=2, "scrollTop = "+apres.scrollTop);
  verifier("retour : le champ ne reprend pas le focus (pas de clavier)", !apres.qFocalise, "activeElement = "+(apres.qFocalise?"#q":"autre"));

  /* Liste PERIMEE pendant la fiche (la requete a change) : la reconstruire. */
  await pg.evaluate(()=>{pick(DRINKS[6]);});
  await pg.waitForTimeout(1200);
  await pg.evaluate(()=>{document.getElementById("q").value="co";window.__rl=[];});
  await pg.evaluate(()=>{try{closeExploreMap();}catch(e){}});
  await pg.waitForTimeout(1500);
  const perime=await pg.evaluate(()=>{
    const sc=document.querySelector("#s-search .scroll"),el=document.getElementById("search-list");
    return {ecran:(document.querySelector(".screen.on")||{}).id,scrollTop:sc.scrollTop,marque:!!(el.firstElementChild&&el.firstElementChild.__marque),appels:window.__rl.length};
  });
  verifier("retour avec requete changee : la liste est reconstruite une fois et repart du haut", perime.ecran==="s-search"&&perime.appels===1&&!perime.marque&&perime.scrollTop===0, "renderList x"+perime.appels+", scrollTop "+perime.scrollTop);

  /* Aller VERS la recherche : rien ne change (liste rendue, champ focalise). */
  await pg.evaluate(()=>{window.__rl=[];navTo("home");});
  await pg.waitForTimeout(600);
  await pg.evaluate(()=>{document.getElementById("q").value="";navTo("search");});
  await pg.waitForTimeout(700);
  const vers=await pg.evaluate(()=>({ecran:(document.querySelector(".screen.on")||{}).id,enfants:document.getElementById("search-list").children.length,
    qFocalise:!!(document.activeElement&&document.activeElement.id==="q"),appels:window.__rl.length}));
  verifier("aller vers la recherche depuis l'accueil : liste rendue et champ focalise, comme avant", vers.ecran==="s-search"&&vers.enfants>0&&vers.qFocalise&&vers.appels>=1, "ecran "+vers.ecran+", "+vers.enfants+" enfants, focus #q = "+vers.qFocalise+", renderList x"+vers.appels);
}

/* ─── 2. « Voir plus » incremental ───────────────────────────────────────── */
{
  /* Le cout d'un clic, c'est le JavaScript (200 lignes de 3 Ko de SVG a
     analyser) PLUS la mise en page de la liste entiere, qu'on force ici
     (offsetHeight) pour la compter : c'est elle que l'oeil attend, et elle
     croit avec la liste (mesure : 85-170 ms pour 300-500 lignes a x4). On
     compare donc chaque clic a l'ancien chemin, rejoue dans la meme page a la
     meme limite (renderList complete) : l'incrementiel doit couter moins.
     Les lignes de la queue (suggestions de la communaute) sont reposees
     apres le lot : on ne compte que les boissons. */
  const vp=await pg.evaluate(()=>new Promise(res=>{
    const qi=document.getElementById("q"); qi.value="a"; renderList();
    setTimeout(()=>{
      const el=document.getElementById("search-list"),sc=document.querySelector("#s-search .scroll");
      const lignes=()=>[...el.querySelectorAll(".ritem")].filter(r=>r.querySelector(".rname")&&!r.closest(".search-list-fin"));
      const noms=()=>lignes().map(r=>r.querySelector(".rname").textContent);
      const bouton=()=>[...el.querySelectorAll(".ritem")].find(r=>/Voir plus/.test(r.textContent));
      const n0=noms(), b0=bouton();
      const total=n0.length+Number((/\((\d+)\)/.exec(b0?b0.textContent:"")||[0,0])[1]);
      const premier=lignes()[0], dernier=lignes()[n0.length-1];
      const t0=performance.now(); b0.click(); const js1=Math.round(performance.now()-t0); void sc.offsetHeight; const ms1=Math.round(performance.now()-t0);
      const n1=noms(), b1=bouton();
      const t1=performance.now(); b1.click(); const js2=Math.round(performance.now()-t1); void sc.offsetHeight; const ms2=Math.round(performance.now()-t1);
      const n2=noms(), b2=bouton();
      const garde=lignes()[0]===premier&&lignes()[n0.length-1]===dernier;
      const noeuds=el.querySelectorAll("*").length;
      /* References : l'ancien chemin, la liste entiere reconstruite a 320 puis
         a 520 lignes (ce que faisaient le premier et le deuxieme clic). */
      window._listLimit=n1.length; window._listCache=null; const t2=performance.now(); renderList(); void sc.offsetHeight; const ref1=Math.round(performance.now()-t2);
      window._listLimit=n2.length; window._listCache=null; const t3=performance.now(); renderList(); void sc.offsetHeight; const ref2=Math.round(performance.now()-t3); const ref=noms();
      res({js1,ms1,js2,ms2,ref1,ref2,n0:n0.length,n1:n1.length,n2:n2.length,total,compteur1:b1?b1.textContent.trim():"(absent)",compteur2:b2?b2.textContent.trim():"(absent)",
        garde,identique:JSON.stringify(n2)===JSON.stringify(ref),noeuds});
    },500);
  }));
  verifier("« Voir plus » : chaque clic (JavaScript + mise en page) coute moins que l'ancienne reconstruction a la meme taille", vp.ms1<vp.ref1&&vp.ms2<vp.ref2, "clics : "+vp.ms1+" ms (dont "+vp.js1+" de JavaScript) puis "+vp.ms2+" ms ("+vp.js2+") ; reconstructions : "+vp.ref1+" ms a "+vp.n1+" lignes, "+vp.ref2+" ms a "+vp.n2);
  verifier("« Voir plus » : 200 lignes ajoutees a chaque clic", vp.n1===vp.n0+200&&vp.n2===vp.n0+400, vp.n0+" -> "+vp.n1+" -> "+vp.n2+" lignes sur "+vp.total);
  verifier("« Voir plus » : les lignes deja a l'ecran ne sont pas touchees", vp.garde, "");
  verifier("« Voir plus » : le compteur dit ce qui reste", vp.compteur1==="Voir plus ("+(vp.total-vp.n1)+")"&&vp.compteur2==="Voir plus ("+(vp.total-vp.n2)+")", vp.compteur1+" / "+vp.compteur2);
  verifier("« Voir plus » : meme contenu, meme ordre qu'une reconstruction complete", vp.identique, vp.noeuds+" noeuds apres deux clics");
}

/* ─── 3. mergeCatalog : 108 fiches communautaires ────────────────────────── */
{
  /* Comme a l'arrivee du catalogue : on est sur l'accueil. (Sur l'ecran de
     recherche, mergeCatalog relance aussi renderList — c'est voulu, la liste
     est perimee — et c'est elle qu'on mesurerait.) */
  await pg.evaluate(()=>{navTo("home");});
  await pg.waitForTimeout(1000);
  const mc=await pg.evaluate(()=>{
    var avecMarque=DRINKS.filter(function(d){return d.brand&&d.brand!=="Autre"&&d.name;});
    var rows=[],code=9000000000001,idBase=1790000000000;
    function pas(i){return avecMarque[(i*37+7)%avecMarque.length];}
    var attendu=[];
    for(var i=0;i<36;i++){var d=pas(i);rows.push({id:idBase+i,name:d.name,brand:d.brand,cat:d.cat,barcodes:[String(code)]});attendu.push({code:String(code++),nom:d.name,genre:"meme nom"});}
    for(var j=0;j<36;j++){var d2=pas(100+j);rows.push({id:idBase+100+j,name:d2.name+" 500 ml",brand:d2.brand,cat:d2.cat,barcodes:[String(code)]});attendu.push({code:String(code++),marque:d2.brand,genre:"meme recette"});}
    for(var k=0;k<36;k++){rows.push({id:idBase+200+k,name:"Banc Boisson "+k,brand:"BancMarque "+k,cat:"Soda",barcodes:[String(code)]});attendu.push({code:String(code++),nom:"Banc Boisson "+k,genre:"nouvelle"});}
    var avant=DRINKS.length;
    /* Le rail des marques et les tendances restent redessines en synchrone a
       la fin de mergeCatalog (c'est le lot scheduleHomeRender qui les
       differera) : on les mesure a part pour juger la fusion elle-meme. */
    var rbr=window.renderBrandsRail,rtr=window.renderTrends;window.renderBrandsRail=function(){};window.renderTrends=function(){};
    var t0=performance.now();var added=mergeCatalog(rows);var ms=Math.round(performance.now()-t0);
    window.renderBrandsRail=rbr;window.renderTrends=rtr;
    var t1=performance.now();renderBrandsRail();renderTrends();var msRendus=Math.round(performance.now()-t1);
    var mal=[];
    attendu.forEach(function(a){
      var p=DRINKS.find(function(d){return (d.barcodes||[]).indexOf(a.code)!==-1;});
      if(!p){mal.push(a.genre+" : code "+a.code+" perdu");return;}
      if(a.genre==="meme nom"&&p.name!==a.nom)mal.push("meme nom : "+a.nom+" -> "+p.name);
      if(a.genre==="meme recette"&&(normTxt(p.brand||"")!==normTxt(a.marque)||p.id>=idBase))mal.push("meme recette : "+a.marque+" -> "+p.name);
      if(a.genre==="nouvelle"&&(p.name!==a.nom||p.id<idBase))mal.push("nouvelle : "+a.nom+" -> "+p.name);
    });
    return {ms:ms,msRendus:msRendus,added:added,fusions:rows.length-added,ajoutes:DRINKS.length-avant,mal:mal};
  });
  verifier("mergeCatalog : 108 fiches fusionnees en < 150 ms a CPU x"+CPU+" (hors rail des marques et tendances)", mc.ms<150, mc.ms+" ms (+ "+mc.msRendus+" ms de rail et tendances)");
  verifier("mergeCatalog : 36 ajouts, 72 fusions", mc.added===36&&mc.fusions===72&&mc.ajoutes===36, mc.added+" ajouts, "+mc.fusions+" fusions, DRINKS +"+mc.ajoutes);
  verifier("mergeCatalog : chaque code a rejoint la bonne fiche", mc.mal.length===0, mc.mal.slice(0,3).join(" ; "));
}

/* ─── 4. Splash : « pret » -> cache ──────────────────────────────────────── */
{
  /* A CPU x4 le fil principal est encore pris par l'amorcage quand « pret »
     arrive : le minuteur de 0,3 s part en retard de ce qui reste a faire
     (c'est le chantier B5, pas celui-ci). On le note sans en faire un
     verdict ; la regle se juge a x1, a froid (drinks.js retarde) et a chaud. */
  const x4=await pg.evaluate(()=>({pret:window.__splashPretAt-window.__splashT0,ecart:window.__splashCacheAt-window.__splashPretAt,anc:1400}));
  verifier("splash a CPU x"+CPU+" : bien en dessous des 0,68 s + remplissage d'avant (note, pas un verdict : < 0,6 s)", x4.ecart<600, "prete a T0 + "+x4.pret+" ms, cachee "+x4.ecart+" ms plus tard");
  await ctx.close();
  LENT=1500;
  const c1=await ouvrir(null,1);
  LENT=0;
  const froid=await c1.pg.evaluate(()=>({pret:window.__splashPretAt-window.__splashT0,ecart:window.__splashCacheAt-window.__splashPretAt,min:window.__splashMinimum,y:document.querySelector("#splash-verre .verre-liq").style.getPropertyValue("--y").trim()}));
  verifier("splash a froid (prete apres le plancher) : cache ≤ 0,35 s apres « pret », verre plein", froid.pret>=froid.min&&froid.ecart<=350&&froid.y==="9px", "prete a T0 + "+froid.pret+" ms (plancher "+froid.min+"), cachee "+froid.ecart+" ms plus tard, --y = "+froid.y);
  await c1.ctx.close();
  const c2=await ouvrir(()=>{try{sessionStorage.setItem("mago_sw_reloaded","1");}catch(e){}},1);
  const relance=await c2.pg.evaluate(()=>({ecart:window.__splashCacheAt-window.__splashPretAt,y:document.querySelector("#splash-verre .verre-liq").style.getPropertyValue("--y").trim()}));
  verifier("splash a chaud (page rechargee par le service worker) : cache ≤ 0,1 s apres « pret », verre plein", relance.ecart<=100&&relance.y==="9px", relance.ecart+" ms, --y = "+relance.y);
  await c2.ctx.close();
}

console.log("\n  RETOUR, « VOIR PLUS », CATALOGUE, SPLASH : CE QUI NE DOIT PLUS FIGER (CPU x"+CPU+")\n");
let ko=0;
for(const [nom,ok,det] of etapes){ if(!ok)ko++; console.log("   "+(ok?"ok  ":"ECHEC")+"  "+nom.padEnd(96)+" "+det); }
console.log("\n  erreurs JavaScript : "+erreurs.length);
erreurs.slice(0,4).forEach(e=>console.log("    "+e));
console.log("\n  "+(ko===0&&erreurs.length===0?"TOUT EST VERT":ko+" CONTROLE(S) EN ECHEC"));
await nav.close(); srv.close();
process.exit(ko===0&&erreurs.length===0?0:1);
