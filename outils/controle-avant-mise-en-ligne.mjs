/* CONTROLE AVANT MISE EN LIGNE : on parcourt l'application comme un
   utilisateur, ecran par ecran, et on echoue au moindre accroc. */
const { chromium } = (await import("/opt/node22/lib/node_modules/playwright/index.js")).default;
import { createServer } from "node:http";import { readFile } from "node:fs/promises";import { extname, join } from "node:path";
const R="/home/user/magofeed";const M={".html":"text/html",".css":"text/css",".js":"text/javascript",".json":"application/json",".svg":"image/svg+xml",".png":"image/png"};
const srv=createServer(async(q,s)=>{let u=decodeURIComponent(q.url.split("?")[0]);if(u==="/")u="/index.html";
 try{const b=await readFile(join(R,u));s.writeHead(200,{"content-type":M[extname(u)]||"application/octet-stream"});s.end(b);}catch{s.writeHead(404);s.end("");}});
await new Promise(r=>srv.listen(0,r));const port=srv.address().port;
const nav=await chromium.launch({executablePath:"/opt/pw-browsers/chromium"});
const ctx=await nav.newContext({viewport:{width:390,height:844},
  geolocation:{latitude:50.8793,longitude:4.3511},permissions:["geolocation"],locale:"fr-BE"});
const pg=await ctx.newPage();
const erreurs=[];
pg.on("pageerror",e=>erreurs.push("ERREUR JS : "+String(e.message).slice(0,140)));
pg.on("console",m=>{ if(m.type()==="error"){const t=m.text();
  if(!/ERR_CERT|ERR_FAILED|ERR_TOO_MANY|net::|Failed to load resource|firestore|Firebase/i.test(t))
    erreurs.push("console : "+t.slice(0,140)); }});
await pg.addInitScript(()=>{try{localStorage.setItem("magoOnboard","1");}catch(e){}});
await pg.goto(`http://127.0.0.1:${port}/index.html`);
await pg.waitForFunction(()=>window.DRINKS&&DRINKS.length>100,{timeout:40000});
await pg.evaluate(()=>{try{document.getElementById("onboarding")?.remove();}catch(e){}});
const etapes=[];
async function etape(nom,fn){
  try{ const d=await fn(); etapes.push([nom,true,d||""]); }
  catch(e){ etapes.push([nom,false,String(e.message||e).slice(0,110)]); }
}
await etape("catalogue charge",async()=>{
  const n=await pg.evaluate(()=>DRINKS.length); if(n!==4455)throw new Error("fiches="+n); return n+" boissons";});
await etape("table nutrition chargee",async()=>{
  const n=await pg.evaluate(()=>Object.keys(window.NUTRI||{}).length); if(n<3700)throw new Error("entrees="+n); return n+" entrees";});
await etape("redirections de fusion",async()=>{
  const n=await pg.evaluate(()=>Object.keys(window.DRINK_MERGES||{}).length); if(n<150)throw new Error("n="+n); return n+" redirections";});
await etape("accueil s'affiche",async()=>{
  await pg.evaluate(()=>navTo("home")); await pg.waitForTimeout(500);
  const n=await pg.evaluate(()=>document.querySelectorAll("#s-home .dcard").length);
  if(!n)throw new Error("aucune carte"); return n+" cartes";});
await etape("recherche rend des resultats",async()=>{
  await pg.evaluate(()=>navTo("search")); await pg.waitForTimeout(400);
  const n=await pg.evaluate(async()=>{ document.getElementById("q").value="red bull";
    window.renderList(); await new Promise(r=>setTimeout(r,350));
    return document.querySelectorAll("#search-list .ritem").length; });
  if(!n)throw new Error("aucun resultat"); return n+" resultats";});
await etape("fiche boisson complete",async()=>{
  const r=await pg.evaluate(async()=>{ const d=DRINKS.find(x=>x.name==="Coca-Cola Original"); window.pick(d);
    await new Promise(r=>setTimeout(r,2200));
    return {nutri:!!document.querySelector("#drink-nutri div"),
            rep:!!document.querySelector("#drink-reponse div"),
            outils:!!document.querySelector('#store-list [aria-label="Partager"]')}; });
  if(!r.nutri)throw new Error("bloc nutrition absent");
  return "nutrition "+(r.nutri?"ok":"-")+", reponse "+(r.rep?"ok":"-")+", outils "+(r.outils?"ok":"-");});
await etape("alternatives meme gout",async()=>{
  const n=await pg.evaluate(async()=>{ const d=DRINKS.find(x=>/Red Edition Past/i.test(x.name)); window.pick(d);
    await new Promise(r=>setTimeout(r,1800));
    return (window.alternativesDe(d)||[]).length; });
  if(!n)throw new Error("aucune alternative"); return n+" propositions";});
await etape("l'en-tete compte tous les magasins",async()=>{
  /* La liste n'affiche que six cartes, mais l'en-tete doit annoncer le vrai
     nombre : « 6 magasins - 0 ouvert » quand il y en a trente, c'est faux. */
  const r=await pg.evaluate(async()=>{
    const d=DRINKS.find(x=>x.name==="Coca-Cola Original");
    window.STORES.length=0;
    window._storeListExpanded=false; window.curBudget=null; window.curBrandFilter=null;
    for(let i=0;i<30;i++)window.STORES.push({id:"C"+i,name:"Commerce "+i,brand:"",
      lat:50.879+i*0.001,lng:4.351+i*0.001,dist:200+i*50,
      drinks:[d.id],confirmations:{},hours:"24/7"});
    window.pick(d); await new Promise(r=>setTimeout(r,1800));
    const b=document.getElementById("res-badges");
    const cartes=document.querySelectorAll("#store-list .store-card").length;
    return {badges:(b?b.textContent:"").replace(/\s+/g," ").trim(),cartes};
  });
  const m=/(\d+)\s*magasin/.exec(r.badges), o=/(\d+)\s*ouvert/.exec(r.badges);
  if(!m||Number(m[1])!==30)throw new Error("en-tete = "+r.badges);
  if(!o||Number(o[1])!==30)throw new Error("ouverts = "+r.badges+" (les 30 sont en 24/7)");
  return r.badges+" pour "+r.cartes+" cartes affichees";
});
await etape("profil et reglages",async()=>{
  await pg.evaluate(()=>navTo("profile")); await pg.waitForTimeout(400);
  const v=await pg.evaluate(()=>getComputedStyle(document.getElementById("s-profile")).display);
  if(v==="none")throw new Error("profil masque"); return "visible";});
console.log("  CONTROLE AVANT MISE EN LIGNE\n");
let ko=0;
etapes.forEach(([n,ok,d])=>{ if(!ok)ko++; console.log("   "+(ok?"ok   ":"ECHEC")+" "+n.padEnd(30)+" "+d); });
console.log("\n  erreurs JavaScript : "+erreurs.length);
erreurs.slice(0,5).forEach(e=>console.log("     "+e));
console.log("\n  "+(ko||erreurs.length?"NE PAS DEPLOYER":"TOUT EST VERT"));
await nav.close();srv.close();
process.exit(ko||erreurs.length?1:0);
