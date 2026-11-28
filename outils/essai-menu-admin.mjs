/* ══ LA ROUE DENTEE D'UNE FICHE NE PORTE QUE CE QUI CONCERNE CETTE FICHE ════
   Retour terrain : la feuille « Admin » d'une boisson alignait dix actions,
   dont cinq qui touchent TOUTE la base (import de zone, remplissage des
   enseignes, purge Lidl/Aldi/Match, nettoyage du classement, rayon par
   photos), a un doigt d'une correction de photo.
   Ce controle verifie :
     1. un utilisateur ordinaire ne voit pas la roue dentee ;
     2. l'admin n'y trouve plus que les actions de la fiche, et le panneau
        tient dans l'ecran (il defile au lieu de deborder) ;
     3. les actions globales vivent dans l'ecran Administration. */
const { chromium } = (await import("/opt/node22/lib/node_modules/playwright/index.js")).default;
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const R="/home/user/magofeed";
const M={".html":"text/html",".css":"text/css",".js":"text/javascript",".json":"application/json",".svg":"image/svg+xml",".png":"image/png"};
const srv=createServer(async(q,s)=>{
  let u=decodeURIComponent(q.url.split("?")[0]); if(u==="/")u="/index.html";
  try{const b=await readFile(join(R,u));s.writeHead(200,{"content-type":M[extname(u)]||"application/octet-stream"});s.end(b);}
  catch{s.writeHead(404);s.end("");}
});
await new Promise(r=>srv.listen(0,r));
const port=srv.address().port;
const nav=await chromium.launch({executablePath:"/opt/pw-browsers/chromium"});
const ctx=await nav.newContext({viewport:{width:375,height:667},serviceWorkers:"block",locale:"fr-BE"});
const pg=await ctx.newPage();
const erreurs=[];
pg.on("pageerror",e=>erreurs.push("ERREUR JS : "+String(e.message).slice(0,140)));
await pg.route(/tile\.openstreetmap\.org|images\.openfoodfacts\.org|cdnjs\.cloudflare\.com/,r=>r.abort());
await pg.addInitScript(()=>{try{localStorage.setItem("magoOnboard","1");}catch(e){}});
await pg.goto(`http://127.0.0.1:${port}/index.html`);
await pg.waitForFunction(()=>window.DRINKS&&DRINKS.length>100,{timeout:40000});
await pg.evaluate(()=>{try{document.getElementById("onboarding")?.remove();}catch(e){}});

const etapes=[];
function verifier(nom,cond,detail){etapes.push([nom,!!cond,detail||""]);}
const GLOBALES=["Importer magasins","Remplissage enseignes","Purger Lidl","Nettoyer doublons","Rayon par photos"];

/* 1. Utilisateur ordinaire */
const ordinaire=await pg.evaluate(async()=>{
  window.dispatchEvent(new CustomEvent("fbAdminChecked",{detail:false}));
  const d=DRINKS.find(x=>x.name==="Coca-Cola Original")||DRINKS[0];
  pick(d);await new Promise(r=>setTimeout(r,700));
  const b=document.getElementById("res-admin");
  openAdminSheet();
  return {rouage:b?getComputedStyle(b).display:"absent",feuille:!!document.getElementById("admin-sheet")};
});
verifier("ordinaire : pas de roue dentee",ordinaire.rouage==="none",ordinaire.rouage);
verifier("ordinaire : la feuille refuse de s'ouvrir",!ordinaire.feuille,"feuille="+ordinaire.feuille);

/* 2. Admin : la feuille de la fiche */
const admin=await pg.evaluate(async()=>{
  window.dispatchEvent(new CustomEvent("fbAdminChecked",{detail:true}));
  const d=DRINKS.find(x=>x.name==="Coca-Cola Original")||DRINKS[0];
  pick(d);await new Promise(r=>setTimeout(r,700));
  const b=document.getElementById("res-admin");
  openAdminSheet();
  const w=document.getElementById("admin-sheet");
  const p=w&&w.firstElementChild;
  const r=p?p.getBoundingClientRect():{top:-1,bottom:99999};
  return {rouage:b?getComputedStyle(b).display:"absent",texte:w?w.innerText:"",
          dansEcran:r.top>=0&&r.bottom<=innerHeight+1,defile:p?getComputedStyle(p).overflowY:""};
});
verifier("admin : roue dentee visible",admin.rouage!=="none",admin.rouage);
for(const g of GLOBALES)verifier("admin : fiche sans « "+g+" »",admin.texte.indexOf(g)===-1);
for(const f of ["Corriger la photo","Renommer","Fusionner","codes-barres","Assigner"])
  verifier("admin : fiche garde « "+f+" »",admin.texte.indexOf(f)!==-1);
verifier("admin : le panneau tient dans l'ecran",admin.dansEcran&&admin.defile==="auto","defile="+admin.defile);

/* 3. Ecran Administration */
const ecran=await pg.evaluate(async()=>{
  try{document.getElementById("admin-sheet")?.remove();}catch(e){}
  show("admin");await new Promise(r=>setTimeout(r,600));
  const m=document.getElementById("admin-maintenance");
  return {texte:m?m.innerText+" "+m.textContent:"",boutons:m?m.querySelectorAll("[role=button]").length:0,
          pack:typeof window.adminAssignPack==="function"};
});
verifier("Administration : 5 actions globales",ecran.boutons===5,ecran.boutons+" boutons");
verifier("Administration : purge presente et marquee irreversible",/Purger Lidl/.test(ecran.texte)&&/IRR/.test(ecran.texte));
verifier("Administration : pack par enseigne disponible",ecran.pack);

console.log("\n  LA ROUE DENTEE NE PORTE-T-ELLE QUE LA FICHE ?\n");
let ko=0;
for(const [nom,ok,det] of etapes){
  if(!ok)ko++;
  console.log("   "+(ok?"ok  ":"ECHEC")+"  "+nom.padEnd(52)+" "+det);
}
console.log("\n  erreurs JavaScript : "+erreurs.length);
erreurs.slice(0,4).forEach(e=>console.log("    "+e));
console.log("\n  "+(ko===0&&erreurs.length===0?"TOUT EST VERT":ko+" CONTROLE(S) EN ECHEC"));
await nav.close(); srv.close();
process.exit(ko===0&&erreurs.length===0?0:1);
