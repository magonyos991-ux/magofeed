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

/* ══ 23 H, A LILLE, AVEC DES AMIS ═══════════════════════════════════════════
   Le fondateur a cherche un commerce ouvert a 23 h. La puce « Ouvert » gardait
   alors les magasins seulement DEVINES ouverts d'apres leur enseigne (mesure :
   118 gardes sur 600, dont 100 devinettes) et ecartait sans un mot ceux dont
   l'horaire est inconnu. Ces controles rejouent cette heure-la. */
const nuit=await pg.evaluate(()=>{
  window.__forceNow="2026-10-23T23:00:00";   // un vendredi, 23 h
  const H=window.HORAIRES_OSM||{};
  const cle24=Object.keys(H).find(k=>H[k]==="24/7");
  const mk=o=>Object.assign({id:"T",name:"Magasin",lat:50.88,lng:4.35,dist:500},o);
  const nightDevine=mk({name:"Istanbul Night Shop",type:"night shop"});           // aucun horaire : devinette 18h-4h
  const inconnu=mk({name:"Inconnu Sans Enseigne"});                               // ni horaire ni devinette
  const ouvertSur=cle24?mk({name:"Inconnu Sans Enseigne",osmId:cle24}):null;      // fait : 24/7
  const fermeSur=mk({name:"Inconnu Sans Enseigne",hours:"Mo-Fr 09:00-17:00"});    // fait : ferme a 23 h
  const lot=[nightDevine,inconnu,fermeSur].concat(ouvertSur?[ouvertSur]:[]);
  const t=window.trierParOuverture(lot);
  const dedans=(a,s)=>a.indexOf(s)!==-1;
  return {
    aUneCle24:!!cle24,
    devineOuvert:window.openInfo(nightDevine),
    devineDansOuverts:dedans(t.ouverts,nightDevine),
    devineDansInconnus:dedans(t.inconnus,nightDevine),
    inconnuDansInconnus:dedans(t.inconnus,inconnu),
    inconnuDansFermes:dedans(t.fermes,inconnu),
    surDansOuverts:ouvertSur?dedans(t.ouverts,ouvertSur):null,
    surSrc:ouvertSur?window.openInfo(ouvertSur).src:null,
    fermeDansFermes:dedans(t.fermes,fermeSur),
    /* LA PREUVE QUE LE DEFAUT EXISTAIT. On rejoue ici les DEUX anciennes
       regles sur le meme magasin. Si ces deux lignes cessent d'etre vraies,
       c'est que le defaut n'etait pas celui qu'on croit — et il faudra
       recrire ce controle avant de le declarer vert.
       Ancienne puce : `storeOpenState(s)===true`, sans regarder la source.
       Ancien openScore : `o===true?2:(o===null?1:0)`, qui classait donc la
       devinette (2) AU-DESSUS de l'inconnu (1). */
    ancienneRegleGardaitLaDevinette:window.storeOpenState(nightDevine)===true,
    ancienScoreDevine:(function(o){return o===true?2:(o===null?1:0);})(window.storeOpenState(nightDevine)),
    ancienScoreInconnu:(function(o){return o===true?2:(o===null?1:0);})(window.storeOpenState(inconnu)),
    scores:{
      sur:ouvertSur?window.openScore(ouvertSur):null,
      inconnu:window.openScore(inconnu),
      devine:window.openScore(nightDevine),
      ferme:window.openScore(fermeSur)
    }
  };
});

/* La puce « Ouvert » de la carte, appelee directement : pas besoin de Leaflet,
   et c'est la fonction qui decide ce que la carte montre. */
const puce=await pg.evaluate(()=>{
  if(typeof window.exploreApplyChips!=="function")return{absente:true};
  window.__forceNow="2026-10-23T23:00:00";
  const H=window.HORAIRES_OSM||{};
  const cle24=Object.keys(H).find(k=>H[k]==="24/7");
  const mk=(n,o)=>Object.assign({id:"t"+n,fbId:"t"+n,name:n,lat:50.88,lng:4.35},o);
  const devine=mk(1,{name:"Night Shop Yildiz",type:"night shop"});
  const sansRien=mk(2,{name:"Inconnu Sans Enseigne"});
  const sur=cle24?mk(3,{name:"Inconnu Sans Enseigne",osmId:cle24}):null;
  const lot=[devine,sansRien].concat(sur?[sur]:[]);
  try{window.exploreFilter=null;}catch(e){}
  window._exploreBrand=null;window._exploreBrandQuery="";window._exploreTousMagasins=false;
  window._exploreChips={instock:false,open:true,near:0};
  let gardes;
  try{gardes=window.exploreApplyChips(lot);}catch(e){return{erreur:String(e.message)};}
  return{
    aUneCle24:!!cle24,
    nbGardes:gardes.length,
    gardeLaDevinette:gardes.indexOf(devine)!==-1,
    gardeLeFait:sur?gardes.indexOf(sur)!==-1:null,
    inconnusComptes:Number(window._exploreInconnus)||0
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

/* 23 h : une devinette n'est jamais comptee parmi les ouverts. */
v("23h : la devinette dit « ouvert »", nuit.devineOuvert.open===true&&nuit.devineOuvert.src==="devine", JSON.stringify(nuit.devineOuvert));
v("23h : mais PAS dans les ouverts",   nuit.devineDansOuverts===false, "ouverts ne la contient pas");
v("23h : elle va dans les inconnus",   nuit.devineDansInconnus===true, "inconnus la contient");
v("un horaire inconnu n'est pas ferme",nuit.inconnuDansInconnus===true&&nuit.inconnuDansFermes===false, "inconnus oui, fermes non");
v("un fait ouvert EST dans ouverts",   nuit.aUneCle24?nuit.surDansOuverts===true:true, nuit.aUneCle24?("src="+nuit.surSrc):"aucune valeur 24/7 dans le jeu");
v("un fait ferme EST dans fermes",     nuit.fermeDansFermes===true, "Mo-Fr 09:00-17:00 a 23 h");
v("openScore : fait avant inconnu",    nuit.aUneCle24?(nuit.scores.sur>nuit.scores.inconnu):true, JSON.stringify(nuit.scores));
v("openScore : inconnu avant devinette",nuit.scores.inconnu>nuit.scores.devine, "inconnu="+nuit.scores.inconnu+" devine="+nuit.scores.devine);
v("openScore : fermeture certaine en dernier", nuit.scores.ferme<nuit.scores.devine, "ferme="+nuit.scores.ferme);
/* Le defaut lui-meme, rejoue : sans ces deux lignes, les controles ci-dessus
   pourraient passer sur du code qui n'a jamais eu le probleme. */
v("l'ANCIENNE puce gardait la devinette", nuit.ancienneRegleGardaitLaDevinette===true, "storeOpenState seul rend true a 23 h");
v("l'ANCIEN openScore la classait trop haut", nuit.ancienScoreDevine>nuit.ancienScoreInconnu, "ancien : devine="+nuit.ancienScoreDevine+" > inconnu="+nuit.ancienScoreInconnu);
/* La puce « Ouvert » de la carte. */
if(puce.absente||puce.erreur){
  v("puce « Ouvert » : joignable", false, puce.erreur||"exploreApplyChips introuvable");
}else{
  v("puce « Ouvert » : jette la devinette", puce.gardeLaDevinette===false, puce.nbGardes+" garde(s)");
  v("puce « Ouvert » : garde le fait",      puce.aUneCle24?puce.gardeLeFait===true:true, puce.aUneCle24?"24/7 garde":"aucune valeur 24/7");
  v("puce « Ouvert » : compte les inconnus",puce.inconnusComptes===2, "_exploreInconnus="+puce.inconnusComptes+" (devinette + sans horaire)");
}

console.log("\n  L'APPLICATION NE SE CONTREDIT PLUS SUR LES HORAIRES\n");
let ko=0;
for(const [nom,ok,det] of etapes){ if(!ok)ko++; console.log("   "+(ok?"ok  ":"ECHEC")+"  "+nom.padEnd(38)+" "+det); }
console.log("\n  erreurs JavaScript : "+erreurs.length);
erreurs.slice(0,3).forEach(e=>console.log("    "+e));
console.log("\n  "+(ko===0&&erreurs.length===0?"TOUT EST VERT":ko+" CONTROLE(S) EN ECHEC"));
await nav.close(); srv.close();
process.exit(ko===0&&erreurs.length===0?0:1);
