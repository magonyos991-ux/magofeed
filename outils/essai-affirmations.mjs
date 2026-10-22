/* ══ L'APPLICATION N'AFFIRME QUE CE QU'ELLE SAIT ═══════════════════════════
   Balayage systematique du 22 octobre : trente-huit endroits ou l'ecran
   affirmait quelque chose qu'il ne savait pas. Ce controle garde ceux qui ont
   ete corriges, pour qu'ils ne reviennent pas.

   PREMIERE SERIE — le champ `open` d'un magasin, lu a trois endroits et ecrit
   NULLE PART. Les trois branches « ouvert » etaient inatteignables :
     - le bouton Waze repondait « Position de ce magasin inconnue » a chaque
       fois, pour toutes les boissons ;
     - l'etiquette lue par les lecteurs d'ecran annoncait « ferme » sur chaque
       magasin, y compris a cote d'une pastille disant « Ouvert » ;
     - la vignette de la feuille de carte etait peinte en rouge « ferme » pour
       tous les magasins, a toute heure. */
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
const ctx=await nav.newContext({viewport:{width:390,height:844},
  geolocation:{latitude:50.8793,longitude:4.3511},permissions:["geolocation"],locale:"fr-BE"});
const pg=await ctx.newPage();
const erreurs=[];
pg.on("pageerror",e=>erreurs.push("ERREUR JS : "+String(e.message).slice(0,140)));
await pg.addInitScript(()=>{try{localStorage.setItem("magoOnboard","1");}catch(e){}});
await pg.goto(`http://127.0.0.1:${port}/index.html`);
await pg.waitForFunction(()=>window.DRINKS&&DRINKS.length>100&&typeof window.openLabel==="function",{timeout:40000});
await pg.evaluate(()=>{try{document.getElementById("onboarding")?.remove();}catch(e){}});

const r=await pg.evaluate(async()=>{
  /* Mardi 11 h : un magasin « Mo-Sa 08:00-20:00 » est ouvert, sans la moindre
     deduction — la source est un fait ecrit par le commercant. */
  window.__forceNow="2026-10-20T11:00:00";
  const d=DRINKS.find(x=>x.name==="Coca-Cola Original");
  window.userLat=50.8793; window.userLng=4.3511;
  window.STORES.length=0;
  window.STORES.push({id:"W1",name:"Carrefour Jette",brand:"Carrefour",
    lat:50.8810,lng:4.3530,dist:300,drinks:[d.id],confirmations:{},hours:"Mo-Sa 08:00-20:00"});
  /* Un magasin charge en mode allege : il n'a PAS de tableau drinks. L'ancien
     openWaze faisait x.drinks.includes(...) dessus et levait une erreur. */
  window.STORES.push({id:"W2",name:"Magasin Allege",brand:"",
    lat:50.8800,lng:4.3500,dist:500,_pins:true,confirmations:{}});

  const toasts=[]; const vrai=window.toast;
  window.toast=function(t){toasts.push(String(t));};
  let urlNav=null; const vraiNav=window.openNavApp;
  window.openNavApp=function(u){urlNav=u;};

  window.curSel=d;
  let planteWaze=null;
  try{ window.openWaze(); }catch(e){ planteWaze=String(e.message).slice(0,90); }

  window.toast=vrai; window.openNavApp=vraiNav;

  /* L'etiquette vocale d'une carte de magasin, comparee a la pastille. */
  window.pick(d);
  await new Promise(res=>setTimeout(res,1800));
  const ligne=document.querySelector('#store-list [onclick^="openStoreDetail"]');
  const carte=ligne?ligne.closest(".store-card")||ligne.parentElement:null;
  const pastille=carte?carte.querySelector(".status"):null;

  const s1=window.STORES[0];
  return {
    planteWaze, toasts, urlNav,
    waze:{attendu:"50.881,4.353"},
    etiquette:ligne?(ligne.getAttribute("aria-label")||""):"(aucune ligne)",
    pastilleVisible:pastille?pastille.textContent.replace(/\s+/g," ").trim():"(aucune)",
    ouvertSelonApp:window.openLabel(s1),
    etatSur:window.openSur(s1),
    /* Les VRAIES couleurs, lues dans le DOM : recalculer la formule du code
       reviendrait a tester ma formule et non l'ecran. */
    vignetteListe:(function(){
      var ic=carte?carte.querySelector(".store-ico"):null;
      return ic?ic.style.background||getComputedStyle(ic).backgroundColor:"(aucune)";
    })(),
    vignetteFeuille:await (async function(){
      try{
        window.openStoreSheet("W1");
        await new Promise(res=>setTimeout(res,700));
        var ic=document.querySelector("#store-sheet .store-ico, .store-sheet .store-ico");
        if(!ic){
          var tous=[...document.querySelectorAll(".store-ico")];
          ic=tous[tous.length-1];
        }
        return ic?(ic.style.background||getComputedStyle(ic).backgroundColor):"(aucune)";
      }catch(e){ return "(echec: "+String(e.message).slice(0,40)+")"; }
    })()
  };
});

const etapes=[];
const v=(nom,cond,det)=>etapes.push([nom,!!cond,det||""]);
v("openWaze ne plante pas sur un magasin allege", r.planteWaze===null, r.planteWaze||"aucune erreur");
v("openWaze ne dit plus « position inconnue »",
  !r.toasts.some(t=>/position.*inconnue/i.test(t)), JSON.stringify(r.toasts));
v("openWaze ouvre bien un itineraire", !!r.urlNav, String(r.urlNav).slice(0,52));
v("il mene au magasin ouvert, pas a l'allege",
  String(r.urlNav||"").indexOf("50.881")!==-1, String(r.urlNav||""));
v("le magasin d'essai est ouvert, sur un FAIT", r.ouvertSelonApp==="Ouvert"&&r.etatSur===true,
  "« "+r.ouvertSelonApp+" », source sure : "+r.etatSur);
v("l'etiquette vocale ne dit plus « ferme »",
  !/ferm/i.test(r.etiquette), "« "+r.etiquette+" »");
v("l'etiquette vocale reprend le mot affiche",
  r.ouvertSelonApp?r.etiquette.toLowerCase().indexOf(r.ouvertSelonApp.toLowerCase())!==-1:true,
  "« "+r.etiquette+" » contre pastille « "+r.pastilleVisible+" »");
v("vignette de la liste : pas rouge sur un magasin ouvert",
  String(r.vignetteListe).indexOf("254, 226, 226")===-1&&String(r.vignetteListe).indexOf("#fee2e2")===-1,
  String(r.vignetteListe));
v("vignette de la feuille : pas rouge sur un magasin ouvert",
  String(r.vignetteFeuille).indexOf("254, 226, 226")===-1&&String(r.vignetteFeuille).indexOf("#fee2e2")===-1,
  String(r.vignetteFeuille));

/* ─── DEUXIEME SERIE — une contribution ne doit jamais se perdre ─────────
   « Je l'ai vue » depuis le menu en arc d'un pin appelait doConfirm avec une
   barre de boutons FABRIQUEE et jamais inseree dans la page. Or doConfirm
   n'enregistre rien pour un stock : il y ecrit un champ « Prix vu ? », et
   c'est le OK de ce champ qui enregistre. Le champ naissait donc dans le
   vide, et la confirmation etait perdue sans un mot. */
const pin=await pg.evaluate(async()=>{
  const d=DRINKS.find(x=>x.name==="Coca-Cola Original");
  window.STORES.length=0;
  const st={id:"P1",fbId:"P1",name:"Night Shop Pin",brand:"",lat:50.8800,lng:4.3520,
            dist:400,drinks:[d.id],confirmations:{},hours:"24/7"};
  window.STORES.push(st);
  window.curSel=d;
  window.exploreFilter={drinkId:d.id,name:d.name};
  /* On remet les compteurs d'anti-rejeu a zero pour que le geste compte. */
  try{ localStorage.removeItem("magoAwards"); window.awardLog={}; }catch(e){}
  const envoyes=[];
  const vraiRep=window.fbAddReport, vraiConf=window.fbConfirmStock;
  window.fbAddReport=function(a,b,type){envoyes.push("rapport:"+type);return Promise.resolve();};
  window.fbConfirmStock=function(a,b,v){envoyes.push("stock:"+v);return Promise.resolve();};
  const avant=(window.userStats&&window.userStats.confirms)||0;
  let plante=null;
  try{ window.executerActionPin("stock",st); }catch(e){ plante=String(e.message).slice(0,90); }
  await new Promise(r=>setTimeout(r,600));
  window.fbAddReport=vraiRep; window.fbConfirmStock=vraiConf;
  return {plante, confirmations:st.confirmations[d.id]||0, envoyes,
          confirmsAvant:avant, confirmsApres:(window.userStats&&window.userStats.confirms)||0};
});
v("un appui « en stock » sur un pin ne plante pas", pin.plante===null, pin.plante||"aucune erreur");
v("la confirmation est bien enregistree", pin.confirmations===1, "confirmations = "+pin.confirmations);
v("la preuve part vers le serveur", pin.envoyes.indexOf("rapport:stock")!==-1, JSON.stringify(pin.envoyes));
v("le stock est pousse vers la base", pin.envoyes.indexOf("stock:1")!==-1, JSON.stringify(pin.envoyes));
v("la contribution est comptee", pin.confirmsApres===pin.confirmsAvant+1,
  pin.confirmsAvant+" -> "+pin.confirmsApres);

console.log("\n  L'APPLICATION N'AFFIRME QUE CE QU'ELLE SAIT\n");
let ko=0;
for(const [nom,ok,det] of etapes){ if(!ok)ko++; console.log("   "+(ok?"ok  ":"ECHEC")+"  "+nom.padEnd(46)+" "+det); }
console.log("\n  erreurs JavaScript : "+erreurs.length);
erreurs.slice(0,4).forEach(e=>console.log("    "+e));
console.log("\n  "+(ko===0&&erreurs.length===0?"TOUT EST VERT":ko+" CONTROLE(S) EN ECHEC"));
await nav.close(); srv.close();
process.exit(ko===0&&erreurs.length===0?0:1);
