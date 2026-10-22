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

/* ─── TROISIEME SERIE — l'app annonce ce que le serveur versera ──────────
   Elle annoncait « +3 pts » partout. Le serveur, lui, applique une regle de
   distance : plein tarif a moins de 500 m, UN point pour un « je l'ai vue »
   plus loin, ZERO pour une rupture signalee de loin. Le commentaire serveur
   racontait deja le probleme — « une personne a vu deux fois +3 pts et garde
   un profil a zero point » — mais seul le serveur avait ete corrige. */
const pts=await pg.evaluate(async()=>{
  const d=DRINKS.find(x=>x.name==="Coca-Cola Original");
  window.curSel=d;
  const faire=async(distM,type)=>{
    window.STORES.length=0;
    /* On place le magasin a la distance voulue depuis la position. */
    const st={id:"S"+distM+type,fbId:"S"+distM+type,name:"Magasin "+distM+"m",brand:"",
      lat:50.8793+(distM/111000), lng:4.3511, dist:distM,
      drinks:[d.id], confirmations:{}, hours:"24/7"};
    window.STORES.push(st);
    window.userLat=50.8793; window.userLng=4.3511;
    try{ localStorage.removeItem("magoAwards"); window.awardLog={}; }catch(e){}
    const avant=window.userStats.pts;
    const toasts=[]; const vrai=window.toast;
    window.toast=function(t){toasts.push(String(t));};
    const vraiRep=window.fbAddReport; window.fbAddReport=function(){return Promise.resolve();};
    if(type==="stock") window.enregistrerStock(st.id,d.id,null);
    else { var faux={parentElement:document.createElement("div")};
           window.doConfirm(faux,st.id,d.id,-1); }
    window.toast=vrai; window.fbAddReport=vraiRep;
    return {surPlace:window._surPlaceSignalement(st), gain:window.userStats.pts-avant,
            toast:toasts.join(" | ")};
  };
  return {
    stockPres: await faire(200,"stock"),
    stockLoin: await faire(3000,"stock"),
    ruptPres:  await faire(200,"rupture"),
    ruptLoin:  await faire(3000,"rupture"),
    bareme:{pres:window.pointsVerses("stock",true), loin:window.pointsVerses("stock",false),
            ruptPres:window.pointsVerses("rupture",true), ruptLoin:window.pointsVerses("rupture",false)}
  };
});
v("bareme recopie du serveur : stock 3 / 1, rupture 3 / 0",
  pts.bareme.pres===3&&pts.bareme.loin===1&&pts.bareme.ruptPres===3&&pts.bareme.ruptLoin===0,
  JSON.stringify(pts.bareme));
v("stock a 200 m : 3 points annonces et comptes",
  pts.stockPres.surPlace===true&&pts.stockPres.gain===3&&/\+3 pt/.test(pts.stockPres.toast),
  "gain "+pts.stockPres.gain+" — « "+pts.stockPres.toast+" »");
v("stock a 3 km : UN point, pas trois",
  pts.stockLoin.surPlace===false&&pts.stockLoin.gain===1&&/\+1 pt/.test(pts.stockLoin.toast),
  "gain "+pts.stockLoin.gain+" — « "+pts.stockLoin.toast+" »");
v("rupture a 200 m : 3 points",
  pts.ruptPres.gain===3&&/\+3 pt/.test(pts.ruptPres.toast),
  "gain "+pts.ruptPres.gain+" — « "+pts.ruptPres.toast+" »");
v("rupture a 3 km : AUCUN point, et l'ecran ne ment plus",
  pts.ruptLoin.gain===0&&!/\+\d+ pt/.test(pts.ruptLoin.toast),
  "gain "+pts.ruptLoin.gain+" — « "+pts.ruptLoin.toast+" »");

/* ─── QUATRIEME SERIE — aucun point promis la ou le serveur n'en verse ───
   Six gestes annonçaient des points qu'aucun declencheur serveur ne credite :
   la photo d'une decouverte, l'ajout d'un format, le vote sur une decouverte
   deja proposee, l'ajout en lot depuis le scan de frigo, le partage, la note,
   la serie quotidienne et la mission du jour. Le « +N » local ne survivait
   meme pas : adopterScoreServeur ecrase userStats.pts avec le score serveur. */
const zero=await pg.evaluate(async()=>{
  const d=DRINKS.find(x=>x.name==="Coca-Cola Original");
  window.curSel=d;
  const mesure=(nom,fn)=>{
    try{ localStorage.removeItem("magoAwards"); window.awardLog={}; }catch(e){}
    const avant=window.userStats.pts; const t=[]; const vrai=window.toast;
    window.toast=function(x){t.push(String(x));};
    let err=null; try{ fn(); }catch(e){ err=String(e.message).slice(0,60); }
    window.toast=vrai;
    return {nom, gain:window.userStats.pts-avant, toast:t.join(" | "), err};
  };
  const res=[];
  /* La note d'une boisson : aucun rapport n'est ecrit. */
  res.push(mesure("note",()=>{ window.userRatings={}; window.setRating(4); }));
  /* La serie quotidienne : localStorage, rien d'autre. */
  res.push(mesure("serie",()=>{
    /* « hier » exactement : sinon bumpStreak repart a 1 et n'atteint jamais
       le seuil de deux jours — le controle passerait sans rien exercer. */
    window.userStreak={streak:4,best:4,last:window.yesterdayKey()};
    window.bumpStreak();
  }));
  return res;
});
zero.forEach(z=>{
  v("« "+z.nom+" » : aucun point fantome", z.gain===0, "gain "+z.gain+(z.err?" (erreur: "+z.err+")":""));
  v("« "+z.nom+" » : rien n'est promis a l'ecran", !/\+\s*\d+\s*(pts?|points?)/i.test(z.toast),
    "« "+z.toast+" »");
});

/* Controle de source pour les gestes qu'on ne peut pas declencher ici. */
import { readFile as _lire } from "node:fs/promises";
/* On retire les commentaires AVANT de chercher : ce fichier en contient des
   milliers, et plusieurs CITENT les phrases fautives pour expliquer pourquoi
   elles ont ete retirees. Chercher dedans ferait echouer le controle sur sa
   propre explication. */
const srcBrut=await _lire("/home/user/magofeed/index.html","utf8");
const src=srcBrut.replace(/\/\*[\s\S]*?\*\//g,"").replace(/^\s*\/\/.*$/gm,"");
const interdits=[
  ["photo de decouverte","Photo envoy"],
  ["format ajoute","Format ajout"],
  ["vote sur une decouverte","vote ajout"],
  ["scan de frigo","boissons ajout"],
  ["mission du jour","Mission accomplie"],
  ["missions du jour","Missions du jour accomplies"],
  ["carte mission accomplie","Mission du jour accomplie"],
  ["carte mission a trouver","On ne sait pas encore o"],
];
/* Filet large : plus AUCUN « +30 pts » nulle part dans le code vivant. La
   mission ne rapporte rien, quel que soit l'ecran qui en parle — deux cartes
   de l'accueil l'annonçaient encore en HTML, hors de portee d'un controle qui
   ne regardait que les toasts. */
{
  const lignes=src.split("\n").filter(l=>/\+30 pts/.test(l));
  v("plus aucun « +30 pts » dans le code vivant", lignes.length===0,
    lignes.length?lignes[0].trim().slice(0,80):"aucun");
}
interdits.forEach(([nom,motif])=>{
  /* La ligne qui porte ce message ne doit plus annoncer de points. */
  const lignes=src.split("\n").filter(l=>l.indexOf(motif)!==-1);
  const coupable=lignes.find(l=>/\+\s*\d+\s*pts/.test(l));
  v("« "+nom+" » ne promet plus de points", !coupable, coupable?coupable.trim().slice(0,70):"aucune promesse");
});

/* ─── CINQUIEME SERIE — ne jamais annoncer un enregistrement qui n'a pas eu
   lieu. Le desabonnement e-mail, l'interrupteur des reglages, le prix saisi
   depuis la carte et la re-note d'une boisson annonçaient tous un succes sans
   avoir rien ecrit. ──────────────────────────────────────────────────────── */
const prom=await pg.evaluate(async()=>{
  const out={};
  const capter=async(fn,ms)=>{
    const t=[]; const vrai=window.toast;
    window.toast=function(x){t.push(String(x));};
    try{ await fn(); }catch(e){ t.push("ERREUR:"+e.message); }
    await new Promise(r=>setTimeout(r,ms||500));
    window.toast=vrai; return t.join(" | ");
  };
  const vraiSet=window.fbSetEmailOptIn;

  /* 1. Le module n'est pas encore la : rien ne doit etre promis. */
  window.fbSetEmailOptIn=undefined;
  out.sansModule=await capter(()=>{ window.couperLesMails(39); },600);

  /* 2. L'ecriture echoue : on l'avoue et on remet l'interrupteur. */
  window._emailOptIn=true;
  window.fbSetEmailOptIn=function(){return Promise.reject(new Error("refus"));};
  out.echec=await capter(()=>{ window.couperLesMails(0); },600);
  out.apresEchec=window._emailOptIn;

  /* 3. L'ecriture reussit : la, on peut le dire. */
  let recu=null;
  window.fbSetEmailOptIn=function(v){recu=v;return Promise.resolve();};
  out.succes=await capter(()=>{ window.couperLesMails(0); },600);
  out.valeurEcrite=recu;

  /* 4. L'interrupteur des reglages, quand l'ecriture echoue. */
  window._fbUser={isAnonymous:false,email:"x@y.z"};
  window._emailOptIn=false;
  window.fbSetEmailOptIn=function(){return Promise.reject(new Error("refus"));};
  out.toggleEchec=await capter(()=>{ window.toggleEmailOptIn(); },600);
  out.toggleApres=window._emailOptIn;
  window.fbSetEmailOptIn=vraiSet;

  /* 5. Le prix saisi depuis la carte doit partir vers la communaute. */
  const d=DRINKS.find(x=>x.name==="Coca-Cola Original");
  window.STORES.length=0;
  window.STORES.push({id:"Q1",fbId:"Q1",name:"Magasin Prix",brand:"",lat:50.88,lng:4.35,
                      dist:300,drinks:[d.id],confirmations:{}});
  const envoyes=[];
  const vp=window.fbSavePrice, vr=window.fbAddReport, vprompt=window.prompt;
  window.fbSavePrice=function(){envoyes.push("prix-partage");return Promise.resolve();};
  window.fbAddReport=function(a,b,t){envoyes.push("rapport:"+t);return Promise.resolve();};
  window.prompt=function(){return "1,50";};
  try{ localStorage.removeItem("magoAwards"); window.awardLog={}; }catch(e){}
  const avantPts=window.userStats.pts;
  await capter(()=>{ window.quickPrice("Q1",d.id); },400);
  window.fbSavePrice=vp; window.fbAddReport=vr; window.prompt=vprompt;
  out.prixEnvoye=envoyes.slice();
  out.prixPoints=window.userStats.pts-avantPts;

  /* 6. Une re-note doit partir, avec l'ecart et sans nouveau votant. */
  const notes=[];
  const vra=window.fbAddRating;
  window.fbAddRating=function(id,val,prev){notes.push({val,prev});return Promise.resolve();};
  window.curSel=d; window.userRatings={};
  window.setRating(2);
  window.setRating(5);
  window.fbAddRating=vra;
  out.notes=notes;
  return out;
});
v("module absent : aucune promesse de desabonnement",
  !/plus d/i.test(prom.sansModule)&&/réessaie/i.test(prom.sansModule),"« "+prom.sansModule+" »");
v("ecriture refusee : on l'avoue",
  /non enregistr/i.test(prom.echec)&&!/plus d.e-mails/i.test(prom.echec),"« "+prom.echec+" »");
v("ecriture refusee : l'interrupteur revient en arriere",
  prom.apresEchec===true,"_emailOptIn = "+prom.apresEchec);
v("ecriture reussie : la, on peut le dire",
  /plus d/i.test(prom.succes)&&prom.valeurEcrite===false,
  "« "+prom.succes+" », valeur ecrite = "+prom.valeurEcrite);
v("reglages : un refus ne s'annonce pas comme un succes",
  /non enregistr/i.test(prom.toggleEchec)&&!/activés|désactivés/i.test(prom.toggleEchec),
  "« "+prom.toggleEchec+" »");
v("reglages : l'interrupteur revient a son etat reel",
  prom.toggleApres===false,"_emailOptIn = "+prom.toggleApres);
v("le prix part vraiment a la communaute",
  prom.prixEnvoye.indexOf("prix-partage")!==-1&&prom.prixEnvoye.indexOf("rapport:prix")!==-1,
  JSON.stringify(prom.prixEnvoye));
v("le prix credite 2 points, le bareme du serveur", prom.prixPoints===2,"gain "+prom.prixPoints);
v("la premiere note part sans note precedente",
  prom.notes[0]&&prom.notes[0].val===2&&!prom.notes[0].prev,JSON.stringify(prom.notes[0]));
v("la RE-note part, avec l'ancienne valeur",
  prom.notes[1]&&prom.notes[1].val===5&&prom.notes[1].prev===2,JSON.stringify(prom.notes[1]));

console.log("\n  L'APPLICATION N'AFFIRME QUE CE QU'ELLE SAIT\n");
let ko=0;
for(const [nom,ok,det] of etapes){ if(!ok)ko++; console.log("   "+(ok?"ok  ":"ECHEC")+"  "+nom.padEnd(46)+" "+det); }
console.log("\n  erreurs JavaScript : "+erreurs.length);
erreurs.slice(0,4).forEach(e=>console.log("    "+e));
console.log("\n  "+(ko===0&&erreurs.length===0?"TOUT EST VERT":ko+" CONTROLE(S) EN ECHEC"));
await nav.close(); srv.close();
process.exit(ko===0&&erreurs.length===0?0:1);
