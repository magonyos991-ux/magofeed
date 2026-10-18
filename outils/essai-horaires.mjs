/* ══ L'APPLICATION NE SE CONTREDIT PLUS SUR LES HORAIRES ════════════════════
   Capture d'ecran recue : « Istanbul Night Shop - Sans doute ferme - 0h (24/7) ».
   Un commerce ouvert 24h/24 annonce ferme, a deux centimetres de sa propre
   donnee. Cause : parseOSMHours ne lisait pas « 0h (24/7) », la devinette
   d'enseigne prenait la main, et un nom contenant « night » valait 18h-4h.
   Ce controle rejoue ce magasin et quelques voisins, a une heure fixee. */
const { chromium } = (await import("/opt/node22/lib/node_modules/playwright/index.js")).default;
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const R="/home/user/magofeed";
const M={".html":"text/html",".css":"text/css",".js":"text/javascript",".json":"application/json",".svg":"image/svg+xml",".png":"image/png"};
const srv=createServer(async(q,s)=>{let u=decodeURIComponent(q.url.split("?")[0]);if(u==="/")u="/index.html";
 try{const b=await readFile(join(R,u));s.writeHead(200,{"content-type":M[extname(u)]||"application/octet-stream"});s.end(b);}
 catch{s.writeHead(404);s.end("");}});
await new Promise(r=>srv.listen(0,r));
const port=srv.address().port;

const nav=await chromium.launch({executablePath:"/opt/pw-browsers/chromium"});
const ctx=await nav.newContext({viewport:{width:390,height:844},locale:"fr-BE"});
const pg=await ctx.newPage();
const erreurs=[];
pg.on("pageerror",e=>erreurs.push("ERREUR JS : "+String(e.message).slice(0,140)));
await pg.addInitScript(()=>{try{localStorage.setItem("magoOnboard","1");}catch(e){}});
await pg.goto(`http://127.0.0.1:${port}/index.html`);
await pg.waitForFunction(()=>window.DRINKS&&DRINKS.length>100&&typeof window.horaireTexte==="function",{timeout:40000});
/* Le fichier d'horaires se charge paresseusement : on le reclame et on attend. */
await pg.evaluate(()=>{try{window.chargerHorairesOSM&&window.chargerHorairesOSM();}catch(e){}});
await pg.waitForFunction(()=>window.HORAIRES_OSM&&Object.keys(window.HORAIRES_OSM).length>1000,{timeout:30000})
  .catch(()=>{});

const r=await pg.evaluate(()=>{
  /* Mardi 14 h : en pleine journee, pour qu'un « ferme » soit significatif. */
  window.__forceNow="2026-10-20T14:00:00";
  const H=window.HORAIRES_OSM||{};
  const cleOsm=Object.keys(H).find(k=>/^Mo-Sa \d\d:\d\d-\d\d:\d\d$/.test(H[k]))||Object.keys(H)[0];
  const cleVirgule=Object.keys(H).find(k=>/\d\d:\d\d\s*,\s*(Mo|Tu|We|Th|Fr|Sa|Su)\b/.test(H[k]));
  const mk=o=>Object.assign({id:"T",name:"Magasin",lat:50.88,lng:4.35,dist:500},o);
  const info=s=>window.openInfo(s);
  return {
    nuit24:      info(mk({name:"Istanbul Night Shop",type:"night shop",hours:"0h (24/7)"})),
    nuit24Label: window.openLabel(mk({name:"Istanbul Night Shop",type:"night shop",hours:"0h (24/7)"})),
    rdv:         info(mk({name:"Istanbul Night Shop",type:"night shop",hours:"Sur rendez-vous"})),
    rdvTexte:    window.horaireTexte(mk({hours:"Sur rendez-vous"})),
    lidlSansRien:info(mk({name:"Lidl Jette",type:"supermarche"})),
    parOsmId:    cleOsm?info(mk({name:"Inconnu Sans Enseigne",osmId:cleOsm})):null,
    parOsm:      cleOsm?info(mk({name:"Inconnu Sans Enseigne",osm:cleOsm})):null,
    osmTexte:    cleOsm?H[cleOsm]:null,
    virguleLue:  cleVirgule?!!window.parseOSMHours(window._reparerSeparateur?window._reparerSeparateur(H[cleVirgule]):H[cleVirgule]):null,
    virguleBrute:cleVirgule?!!window.parseOSMHours(H[cleVirgule]):null,
    virguleTexte:cleVirgule?H[cleVirgule]:null,
    echappe:     window.horaireTexte(mk({hours:'<img src=x onerror=alert(1)>'})),
    fr24:        window.normaliserHoraires("0h (24/7)")
  };
});

const etapes=[];
const v=(nom,cond,det)=>etapes.push([nom,!!cond,det||""]);
v("« 0h (24/7) » se lit",            r.fr24==="24/7", "normaliserHoraires -> "+r.fr24);
v("night shop 24/7 = OUVERT",        r.nuit24.open===true, JSON.stringify(r.nuit24));
v("et la source est un FAIT",        r.nuit24.src==="saisi", "src="+r.nuit24.src);
v("plus de « sans doute ferme »",    !/doute/i.test(r.nuit24Label||""), "« "+r.nuit24Label+" »");
v("« sur rendez-vous » : aucun verdict", r.rdv.open===null&&r.rdv.src===null, JSON.stringify(r.rdv));
v("la phrase du commercant survit",  r.rdvTexte==="Sur rendez-vous", "« "+r.rdvTexte+" »");
v("sans horaire, la devinette reste",r.lidlSansRien.src==="devine", "src="+r.lidlSansRien.src);
v("rapprochement par champ osmId",   r.parOsmId&&r.parOsmId.src==="osm", JSON.stringify(r.parOsmId)+" ["+r.osmTexte+"]");
v("rapprochement par champ osm",     r.parOsm&&r.parOsm.src==="osm", JSON.stringify(r.parOsm));
if(r.virguleTexte!==null&&r.virguleTexte!==undefined){
  v("virgule OSM : illisible avant",  r.virguleBrute===false, "« "+r.virguleTexte+" »");
  v("virgule OSM : lisible apres",    r.virguleLue===true,  "« "+r.virguleTexte+" »");
}
v("HTML dans les horaires : echappe", r.echappe.indexOf("<img")===-1&&r.echappe.indexOf("&lt;")!==-1, r.echappe.slice(0,46));

console.log("\n  L'APPLICATION NE SE CONTREDIT PLUS SUR LES HORAIRES\n");
let ko=0;
for(const [nom,ok,det] of etapes){ if(!ok)ko++; console.log("   "+(ok?"ok  ":"ECHEC")+"  "+nom.padEnd(38)+" "+det); }
console.log("\n  erreurs JavaScript : "+erreurs.length);
erreurs.slice(0,3).forEach(e=>console.log("    "+e));
console.log("\n  "+(ko===0&&erreurs.length===0?"TOUT EST VERT":ko+" CONTROLE(S) EN ECHEC"));
await nav.close(); srv.close();
process.exit(ko===0&&erreurs.length===0?0:1);
