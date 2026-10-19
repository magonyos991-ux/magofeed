/* ══ L'ATTENTE DIT-ELLE LA VERITE ? — le verre du splash et le sonar ═════════
   Deux symboles remplacent la grille carree de points (« l'onde ») :

     1. LE VERRE, a l'ouverture. Il se remplit des la premiere image, puis
        FINIT de se remplir quand l'app est prete (initSplash -> magoSplashPret),
        et le splash s'efface. Avant, le splash attendait 1 400 ms FIXES apres
        que l'app etait prete. Ce controle mesure l'ecart « pret -> cache » :
        il doit etre d'environ 0,7 s (0,38 s pour finir + 0,3 s plein + une
        image), jamais 1,4 s.

     2. LE SONAR, partout ailleurs. ondeHTML(taille) garde son nom (une
        quinzaine d'appels en dependent, directs ou via magoLoader) mais rend
        l'anneau dore et ses ondes, en trois tailles ; la petite n'a qu'une onde.

   Servie en local, l'app est prete en une demi-seconde : trop vite pour
   surprendre le verre a mi-course. La premiere scene retarde donc
   data/drinks.js (LENT) pour lire le verre PENDANT le remplissage — sans quoi
   l'epreuve passerait aussi avec un saut sans transition.
   Il verifie aussi : fin() appelee une seule fois ; le splash se ferme meme si
   magoSplashPret manque, et meme quand requestAnimationFrame ne tourne pas
   (app en arriere-plan) ; le mouvement reduit ; et que les deux blocs CSS morts
   (.spinner, .mago-skel) ont disparu. */
const { chromium } = (await import("/opt/node22/lib/node_modules/playwright/index.js")).default;
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const R="/home/user/magofeed";
const M={".html":"text/html",".css":"text/css",".js":"text/javascript",".json":"application/json",".svg":"image/svg+xml",".png":"image/png"};
let LENT=0; /* ms de retard sur data/drinks.js : garantit une lecture PENDANT le remplissage */
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

async function ouvrir(options,attente,init){
  const ctx=await nav.newContext(Object.assign({viewport:{width:390,height:844},locale:"fr-BE",
    geolocation:{latitude:50.8793,longitude:4.3511},permissions:["geolocation"]},options||{}));
  const pg=await ctx.newPage();
  pg.on("pageerror",e=>erreurs.push("ERREUR JS : "+String(e.message).slice(0,140)));
  await pg.route(/tile\.openstreetmap\.org|basemaps\.cartocdn\.com/,r=>r.abort());
  await pg.addInitScript(()=>{try{localStorage.setItem("magoOnboard","1");localStorage.setItem("magoob","1");}catch(e){}});
  if(init)await pg.addInitScript(init);
  await pg.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:attente||"load"});
  return {ctx,pg};
}
const cache=(pg,ms)=>pg.waitForFunction(()=>document.getElementById("splash").classList.contains("hidden"),{timeout:ms||20000}).then(()=>true).catch(()=>false);
const ecart=(pg)=>pg.evaluate(()=>(window.__splashCacheAt&&window.__splashPretAt)?(window.__splashCacheAt-window.__splashPretAt):null);

/* ─── 1. Chargement LENT : la phase 1 est observee, puis l'app est prete ──── */
{
  LENT=1500;
  const {ctx,pg}=await ouvrir(null,"commit");
  /* --y n'est pose que par le script inline, qui attend lui-meme app.css :
     l'attendre evite de lire transform « none » si la feuille arrive apres. */
  await pg.waitForFunction(()=>{const l=document.querySelector("#splash-verre .verre-liq");return l&&l.style.getPropertyValue("--y")!=="";},{timeout:20000});
  await pg.waitForTimeout(600);
  const t=await pg.evaluate(()=>{
    const liq=document.querySelector("#splash-verre .verre-liq");
    const m=/matrix\(([^)]+)\)/.exec(getComputedStyle(liq).transform);
    return {y:liq.style.getPropertyValue("--y").trim(),ty:m?Number(m[1].split(",")[5]):null,pret:!!window.__splashPretAt};
  });
  verifier("chargement lent : l'app n'est PAS encore prete quand on lit le verre", !t.pret, t.pret?"deja prete (allonger LENT)":"");
  verifier("chargement lent : le verre vise 24 px", t.y==="24px", "--y = "+t.y);
  verifier("chargement lent : le liquide est EN TRAIN de monter (24 < translateY < 100)", t.ty!==null&&t.ty>24&&t.ty<100, "translateY = "+t.ty);
  const ok=await cache(pg);
  const y=await pg.evaluate(()=>document.querySelector("#splash-verre .verre-liq").style.getPropertyValue("--y").trim());
  const e=await ecart(pg);
  verifier("le splash s'efface une fois l'app prete", ok, ok?"hidden":"TOUJOURS VISIBLE");
  verifier("le verre est plein (9 px) quand le splash part", y==="9px", "--y = "+y);
  verifier("pret -> cache : ~0,7 s (0,38 + 0,3 + une image), plus jamais 1,4 s", e!==null&&e>=650&&e<=800, e+" ms");
  await ctx.close(); LENT=0;
}

/* ─── 2. fin() n'est appelee qu'UNE fois ─────────────────────────────────── */
{
  /* On enveloppe magoSplashPret a l'instant ou le script inline la pose. */
  const {ctx,pg}=await ouvrir(null,"load",()=>{
    let reel;
    Object.defineProperty(window,"magoSplashPret",{configurable:true,
      get(){return reel;},
      set(f){window.__finN=0;reel=function(fin){return f(function(){window.__finN++;fin();});};}});
  });
  await cache(pg); await pg.waitForTimeout(1500);
  const n=await pg.evaluate(()=>window.__finN);
  verifier("fin() est appelee exactement une fois", n===1, "appels = "+n);
  await ctx.close();
}

/* ─── 3. magoSplashPret absente : le splash se ferme quand meme ──────────── */
{
  const {ctx,pg}=await ouvrir(null,"load",()=>{
    Object.defineProperty(window,"magoSplashPret",{configurable:true,get(){return undefined;},set(){}});});
  await pg.waitForFunction(()=>window.DRINKS&&DRINKS.length>100,{timeout:40000});
  const ok=await cache(pg,3000);
  verifier("sans magoSplashPret, le splash se ferme quand meme (repli setTimeout 0)", ok, ok?"hidden":"TOUJOURS VISIBLE");
  await ctx.close();
}

/* ─── 4. App en arriere-plan : requestAnimationFrame ne tourne pas ───────── */
{
  const {ctx,pg}=await ouvrir(null,"load",()=>{window.requestAnimationFrame=function(){return 0;};});
  await pg.waitForFunction(()=>window.DRINKS&&DRINKS.length>100,{timeout:40000});
  const ok=await cache(pg,3000);
  verifier("arriere-plan (rAF muet) : le splash se ferme quand meme en moins de 3 s", ok, ok?"hidden":"TOUJOURS VISIBLE");
  await ctx.close();
}

/* ─── 5. Le sonar : un generateur, trois tailles ─────────────────────────── */
{
  const {ctx,pg}=await ouvrir();
  await pg.waitForFunction(()=>window.DRINKS&&DRINKS.length>100,{timeout:40000});
  const s=await pg.evaluate(()=>{
    const h3=ondeHTML(3),h5=ondeHTML(5),h7=ondeHTML(7),ml=magoLoader(true,"Actualisation…");
    const box=document.createElement("div");box.innerHTML=h7+h5+h3+ml;document.body.appendChild(box);
    const w=sel=>Math.round(box.querySelector(sel).getBoundingClientRect().width);
    const ondes=sel=>[...box.querySelector(sel).querySelectorAll("i")].filter(i=>getComputedStyle(i).display!=="none").length;
    const r={h3,h5,h7,ml,lg:w(".sonar.lg"),md:w(".sonar:not(.lg):not(.xs)"),xs:w(".sonar.xs"),
      ondesMd:ondes(".sonar:not(.lg):not(.xs)"),ondesXs:ondes(".sonar.xs"),
      grilleRestante:!!document.querySelector(".onde")};
    box.remove();return r;
  });
  verifier("ondeHTML(3) rend le sonar en ligne", /class="sonar xs"/.test(s.h3), s.h3.slice(0,40));
  verifier("ondeHTML(5) rend le sonar moyen", /class="sonar"/.test(s.h5), s.h5.slice(0,40));
  verifier("ondeHTML(7) rend le grand sonar", /class="sonar lg"/.test(s.h7), s.h7.slice(0,40));
  verifier("magoLoader(true,…) garde son role=status et son texte", /role="status"/.test(s.ml)&&/Actualisation/.test(s.ml), "");
  verifier("tailles 56 / 40 / 18 px", s.lg===56&&s.md===40&&s.xs===18, s.lg+" / "+s.md+" / "+s.xs);
  verifier("trois ondes en moyen, UNE seule en ligne", s.ondesMd===3&&s.ondesXs===1, s.ondesMd+" / "+s.ondesXs);
  verifier("plus aucune grille de points dans la page", !s.grilleRestante, "");
  await ctx.close();
}

/* ─── 6. Mouvement reduit : l'information sans l'agitation ───────────────── */
{
  const {ctx,pg}=await ouvrir({reducedMotion:"reduce"});
  const r=await pg.evaluate(()=>{
    const liq=document.querySelector("#splash-verre .verre-liq");
    const box=document.createElement("div");box.innerHTML=ondeHTML(5);document.body.appendChild(box);
    const ondes=[...box.querySelectorAll(".sonar i")].map(i=>getComputedStyle(i).animationName);
    box.remove();
    return {y:liq.style.getPropertyValue("--y").trim(),
      vague:getComputedStyle(document.querySelector("#splash-verre .verre-vague")).animationName,
      bulle:getComputedStyle(document.querySelector("#splash-verre .verre-bulle")).opacity,
      ondes};
  });
  verifier("mouvement reduit : le verre est plein tout de suite", r.y==="9px", "--y = "+r.y);
  verifier("mouvement reduit : la houle est figee", r.vague==="none", "animation = "+r.vague);
  verifier("mouvement reduit : les bulles restent visibles", Number(r.bulle)>0, "opacity = "+r.bulle);
  verifier("mouvement reduit : les ondes du sonar sont figees", r.ondes.every(a=>a==="none"), r.ondes.join(","));
  await cache(pg);
  const e=await ecart(pg);
  verifier("mouvement reduit : pret -> cache ~0,3 s", e!==null&&e>=280&&e<=420, e+" ms");
  await ctx.close();
}

/* ─── 7. Dans les sources ────────────────────────────────────────────────── */
{
  const html=await readFile(join(R,"index.html"),"utf8"), css=await readFile(join(R,"app.css"),"utf8");
  const is=html.slice(html.indexOf("function initSplash"),html.indexOf("function initSplash")+2500);
  verifier("magoSplashPret est defini AVANT le gros script",
    html.indexOf("window.magoSplashPret=")>0&&html.indexOf("window.magoSplashPret=")<html.indexOf("function initSplash"), "");
  verifier("initSplash passe par magoSplashPret et n'a plus de minuteur de 1 400 ms",
    /magoSplashPret\(fermer\)/.test(is)&&!/1400/.test(is), "");
  verifier("app.css : l'ancien rond qui tourne a disparu", !/\.spinner[\s{,:.>]/.test(css), "");
  verifier("app.css : le squelette en double a disparu", !/\.mago-skel[\s{,:.>]/.test(css), "");
  verifier("app.css : plus de grille .onde", !/\.onde\b/.test(css), "");
  const tm=/verre-liq\s*\{[^}]*transition\s*:\s*([^;}]*)/.exec(css);
  verifier("le liquide n'anime que transform", !!tm&&/^transform\b/.test(tm[1].trim())&&!/opacity|all/.test(tm[1]), tm?tm[1].trim():"regle introuvable");
}

console.log("\n  L'ATTENTE DIT-ELLE LA VERITE ? — le verre et le sonar\n");
let ko=0;
for(const [nom,ok,det] of etapes){ if(!ok)ko++; console.log("   "+(ok?"ok  ":"ECHEC")+"  "+nom.padEnd(74)+" "+det); }
console.log("\n  erreurs JavaScript : "+erreurs.length);
erreurs.slice(0,4).forEach(e=>console.log("    "+e));
console.log("\n  "+(ko===0&&erreurs.length===0?"TOUT EST VERT":ko+" CONTROLE(S) EN ECHEC"));
await nav.close(); srv.close();
process.exit(ko===0&&erreurs.length===0?0:1);
