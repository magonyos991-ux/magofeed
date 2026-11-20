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
/* CE QU'ON IGNORE, ET POURQUOI — chaque exclusion est un risque de cecite,
   donc chacune doit se justifier par une MESURE, pas par une impression.
   Le conteneur n'a pas de reseau sortant pour le navigateur : toute requete
   vers l'exterieur echoue au niveau transport, et la reponse d'echec ne porte
   evidemment aucun en-tete CORS — Chromium rapporte alors « blocked by CORS
   policy » la ou il n'y a qu'une absence de reseau. Verifie a la main :
   world.openfoodfacts.org repond « access-control-allow-origin: * », donc en
   production cette erreur n'existe pas. On n'ignore que les hotes EXTERNES :
   un blocage CORS sur 127.0.0.1 serait un vrai defaut et reste bruyant. */
const CIBLE=t=>(/^Access to \S+ at '([^']+)'/.exec(t)||[])[1]||"";
const EXTERIEUR=t=>/blocked by CORS policy/i.test(t)&&!/^https?:\/\/127\.0\.0\.1/.test(CIBLE(t));
pg.on("console",m=>{ if(m.type()==="error"){const t=m.text();
  if(!/ERR_CERT|ERR_FAILED|ERR_TOO_MANY|net::|Failed to load resource|firestore|Firebase/i.test(t)&&!EXTERIEUR(t))
    erreurs.push("console : "+t.slice(0,140)); }});
await pg.addInitScript(()=>{try{localStorage.setItem("magoOnboard","1");}catch(e){}});
await pg.goto(`http://127.0.0.1:${port}/index.html`);
await pg.waitForFunction(()=>window.DRINKS&&DRINKS.length>100,{timeout:40000});
await pg.evaluate(()=>{try{document.getElementById("onboarding")?.remove();}catch(e){}});
/* ATTENDRE UNE CONDITION, PAS UN NOMBRE DE MILLISECONDES.
   Ce controle dormait 1 800 ou 2 200 ms puis regardait. Quand la machine est
   lente — ou quand l'application attend legitimement Firebase avant de
   dessiner la liste des magasins — le reveil tombait avant le rendu et le
   controle accusait l'application d'un defaut qu'elle n'avait pas. Un
   garde-fou qui accuse a tort finit ignore, exactement comme celui qui crie
   au loup. On attend donc la CHOSE, avec une limite franche : passe ce delai,
   l'echec est reel et il le dit. */
await pg.evaluate(()=>{
  window._attendre=function(test,limite){
    return new Promise(function(res){
      var t0=Date.now();
      (function boucle(){
        var v=null; try{ v=test(); }catch(e){ v=null; }
        if(v)return res({ok:true,ms:Date.now()-t0,v:v});
        if(Date.now()-t0>=(limite||8000))return res({ok:false,ms:Date.now()-t0});
        setTimeout(boucle,60);
      })();
    });
  };
});
const etapes=[];
async function etape(nom,fn){
  try{ const d=await fn(); etapes.push([nom,true,d||""]); }
  catch(e){ etapes.push([nom,false,String(e.message||e).slice(0,110)]); }
}
/* COMBIEN DE FICHES LE FICHIER CONTIENT-IL VRAIMENT ? C'est la seule
   reference honnete. Un nombre ecrit en dur ici se trompe dans les DEUX
   sens : il criait au loup quand le catalogue grossissait (il exigeait
   EXACTEMENT 4455 fiches), et il aurait crie encore quand un dedoublonnage
   legitime en a retire cinq. La question a laquelle on veut repondre est :
   le fichier du catalogue s'est-il CHARGE EN ENTIER ? On la pose au fichier. */
const SOURCE=await readFile(join(R,"data/drinks.js"),"utf8");
const N_FICHIER=(SOURCE.match(/\bid:\s*\d+/g)||[]).length;
await etape("catalogue charge",async()=>{
  if(N_FICHIER<4000)throw new Error("data/drinks.js n'en contient que "+N_FICHIER+" : le fichier lui-meme a fondu");
  const n=await pg.evaluate(()=>DRINKS.length);
  /* Au-dela du fichier viennent les boissons de la communaute (Firestore) :
     plus, c'est normal ; moins, c'est un chargement incomplet. */
  if(n<N_FICHIER)throw new Error("chargees="+n+" alors que data/drinks.js en contient "+N_FICHIER);
  return n+" boissons, dont "+N_FICHIER+" du fichier";});
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
    const a=await window._attendre(()=>document.querySelector("#drink-nutri div"),8000);
    return {ms:a.ms,nutri:!!document.querySelector("#drink-nutri div"),
            rep:!!document.querySelector("#drink-reponse div"),
            outils:!!document.querySelector('#store-list [aria-label="Partager"]')}; });
  if(!r.nutri)throw new Error("bloc nutrition toujours absent apres 8 s");
  return "nutrition en "+r.ms+" ms, reponse "+(r.rep?"ok":"-")+", outils "+(r.outils?"ok":"-");});
await etape("alternatives meme gout",async()=>{
  const n=await pg.evaluate(async()=>{ const d=DRINKS.find(x=>/Red Edition Past/i.test(x.name)); window.pick(d);
    await window._attendre(()=>(window.alternativesDe(d)||[]).length,8000);
    return (window.alternativesDe(d)||[]).length; });
  if(!n)throw new Error("aucune alternative"); return n+" propositions";});
await etape("l'en-tete compte tous les magasins",async()=>{
  /* CE QUE CETTE ETAPE DOIT PROUVER, ET POURQUOI ELLE A ETE REECRITE.
     Le defaut d'origine : la liste n'affiche que six cartes, et l'en-tete
     comptait les six au lieu du total — « 6 magasins, 0 ouvert » quand il y
     en avait trente, ce qui est faux.
     La premiere version posait trente magasins de test et dormait 1 800 ms.
     Mais Firestore verse des magasins dans STORES pendant ce temps : les
     trente devenaient 2 026, et l'en-tete annonçait « 290 en rayon » — le
     controle accusait alors l'application d'un defaut qu'elle n'avait pas.
     Couper les chargeurs ne suffit pas : STORES est aussi REMPLACE en bloc
     (index.html ~13788, STORES=data.stores).
     Donc on ne fixe plus les donnees : on attend qu'elles se TAISENT, on
     redessine, et on compare l'en-tete a la verite RECALCULEE sur ces memes
     donnees, quelles qu'elles soient. Ce controle ne depend plus du reseau,
     et il attrape toujours le defaut d'origine : un en-tete qui compterait
     les cartes affichees ne pourrait pas egaler un total plus grand. */
  const r=await pg.evaluate(async()=>{
    const d=DRINKS.find(x=>x.name==="Coca-Cola Original");
    window._storeListExpanded=false; window.curBudget=null; window.curBrandFilter=null;
    window.pick(d);
    /* Trente magasins de test, pour garantir qu'il y a PLUS de magasins que
       de cartes meme si le reseau ne donne rien. Ils rejoignent ce qui est
       deja la, ils ne le remplacent pas. */
    for(let i=0;i<30;i++){
      const st={id:"C"+i,name:"Commerce "+i,brand:"",
        lat:50.879+i*0.001,lng:4.351+i*0.001,dist:200+i*50,
        drinks:[d.id],confirmations:{},hours:"24/7"};
      if(i<4)st.confirmations[d.id]=2;
      window.STORES.push(st);
    }
    /* On attend le SILENCE : trois mesures de suite avec le meme nombre de
       magasins. Sans ca, le total change entre le rendu et le recomptage. */
    const calme=await window._attendre((()=>{let n=-1,fois=0;return()=>{
      const m=(window.STORES||[]).length;
      if(m===n){fois++;}else{n=m;fois=0;}
      return fois>=3?m:null;};})(),12000);
    window.renderStoreList();
    await new Promise(r=>setTimeout(r,250));
    const did=d.id;
    const tous=(window.STORES||[]).filter(s=>window.magasinALaBoisson(s,did));
    const surs=tous.filter(s=>window.magasinConfirmePour(s,did)).length;
    const ouverts=tous.filter(s=>{try{return window.storeOpenState(s)===true&&window.openSur(s);}catch(e){return false;}}).length;
    const b=document.getElementById("res-badges");
    return {calme:calme.ok,total:tous.length,surs,possibles:tous.length-surs,ouverts,
      badges:(b?b.textContent:"").replace(/\s+/g," ").trim(),
      cartes:document.querySelectorAll("#store-list .store-card").length};
  });
  if(!r.calme)throw new Error("les magasins n'ont jamais cesse d'arriver en 12 s");
  const lu=(re)=>{const m=re.exec(r.badges);return m?Number(m[1]):null;};
  const ray=lu(/(\d+)\s*en rayon/), pos=lu(/(\d+)\s*possible/), ouv=lu(/(\d+)\s*ouvert/);
  if(ray===null||pos===null||ouv===null)throw new Error("en-tete illisible : "+r.badges);
  /* LE DEFAUT D'ORIGINE : compter les cartes affichees au lieu du total. */
  if(r.total<=r.cartes)throw new Error("pas plus de magasins que de cartes ("+r.total+" vs "+r.cartes+") : rien n'est eprouve");
  if(ray!==r.surs)throw new Error("en rayon : l'en-tete dit "+ray+", la verite est "+r.surs);
  if(pos!==r.possibles)throw new Error("possibles : l'en-tete dit "+pos+", la verite est "+r.possibles);
  if(ouv!==r.ouverts)throw new Error("ouverts : l'en-tete dit "+ouv+", la verite est "+r.ouverts);
  /* ET L'HONNETETE : « en rayon » ne compte que ce qu'un humain a vu. */
  if(ray>r.total)throw new Error("en rayon ("+ray+") depasse le total ("+r.total+")");
  return r.badges+" — verifie contre "+r.total+" magasins pour "+r.cartes+" cartes";
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
