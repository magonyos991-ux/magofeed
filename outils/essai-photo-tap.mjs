/* ══ UN TAP SUR LA VIGNETTE OUVRE LA PHOTO EN GRAND — TOUJOURS ═══════════════
   RETOUR DU FONDATEUR (20/11) : « quand je cherche une boisson, si j'appuie
   sur sa photo c'est censé m'ouvrir direct la photo en plus grand, au lieu
   de rester appuyé — et en plus ça marche même pas tout le temps ».

   Ce qui se passait : la vignette n'ouvrait la photo que si elle etait DEJA
   dans le cache (imgCache). Sinon le tap filait a la ligne et ouvrait la
   boisson, sans un mot. Le meme geste faisait donc deux choses selon un
   cache invisible — « pas tout le temps », exactement. Et sur iOS, seul
   l'appui long sur l'<img> donnait l'apercu natif : le fondateur avait fini
   par l'utiliser.

   Ce controle joue le geste reel (un tap, sur un ecran tactile de 390 px)
   et verrouille :
     1. vignette AVEC photo en cache : la visionneuse s'ouvre, la photo deja
        affichee se pose tout de suite, l'ecran de recherche ne bouge pas ;
     2. un tap n'importe ou referme la visionneuse ;
     3. vignette SANS photo : la visionneuse s'ouvre quand meme (dessin de la
        boisson + « je la cherche… »), et quand Open Food Facts repond, la
        photo se pose d'elle-meme dans la visionneuse ET dans la vignette ;
     4. vignette SANS photo, reseau en panne : la visionneuse le dit, au lieu
        de « je la cherche » pour toujours ;
     5. le reste de la ligne ouvre toujours la boisson, pas la photo ;
     6. le clavier (Entree sur la vignette) fait pareil que le tap ;
     7. la feuille de style tient l'<img> hors du doigt (plus d'apercu natif). */
const { chromium, devices } = (await import("/opt/node22/lib/node_modules/playwright/index.js")).default;
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
const PHOTO_CACHE=`http://127.0.0.1:${port}/icons/favicon-32.png`;
const PHOTO_OFF=`http://127.0.0.1:${port}/icons/apple-touch-icon.png`;

const nav=await chromium.launch({executablePath:"/opt/pw-browsers/chromium"});
const ctx=await nav.newContext({...devices["iPhone 13"],locale:"fr-BE",
  geolocation:{latitude:50.8793,longitude:4.3511},permissions:["geolocation"]});
const pg=await ctx.newPage();
const erreurs=[];
pg.on("pageerror",e=>erreurs.push("ERREUR JS : "+String(e.message).slice(0,140)));

/* Le reseau joue deux roles : Open Food Facts repond pour UNE boisson (celle
   du scenario 3), et tombe en panne pour toutes les autres. */
let offRepondPour=null;
await pg.route(/tile\.openstreetmap\.org|basemaps\.cartocdn\.com|images\.openfoodfacts\.org/,r=>r.abort());
await pg.route(/world\.openfoodfacts\.org/,r=>{
  const u=r.request().url();
  if(offRepondPour&&/search\.pl/.test(u)){
    const d=offRepondPour;
    /* Une reponse un peu lente, comme la vraie : c'est pendant ce temps que
       la visionneuse doit deja montrer quelque chose. */
    return setTimeout(()=>r.fulfill({status:200,contentType:"application/json",body:JSON.stringify({products:[{
      product_name:d.name,brands:d.brand,categories_tags:["en:beverages"],image_front_url:PHOTO_OFF}]})}),1200);
  }
  r.abort();
});

const etapes=[];
function verifier(nom,cond,detail){etapes.push([nom,!!cond,detail||""]);}

/* Trois boissons d'une meme marque, pour que la recherche les montre ensemble.
   Choisies dans le catalogue au demarrage : sans code-barre (la recherche OFF
   passe alors directement par search.pl) et avec un nom simple. */
await pg.addInitScript(()=>{try{localStorage.setItem("magoOnboard","1");}catch(e){}});
await pg.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:"domcontentloaded"});
await pg.waitForFunction(()=>window.DRINKS&&DRINKS.length>100,{timeout:40000});
await pg.evaluate(()=>{try{document.getElementById("onboarding")?.remove();}catch(e){}});

const trio=await pg.evaluate(()=>{
  const parMarque={};
  DRINKS.forEach(d=>{
    if(d.img||(d.barcodes&&d.barcodes.length))return;
    if(!/^[a-z0-9 ]+$/i.test(d.brand||""))return;
    (parMarque[d.brand]=parMarque[d.brand]||[]).push({id:d.id,name:d.name,brand:d.brand});
  });
  const marque=Object.keys(parMarque).find(b=>parMarque[b].length>=3&&b.length>=4);
  return parMarque[marque].slice(0,3);
});
const [avecPhoto,sansPhoto,enPanne]=trio;

/* La photo en cache pour la premiere, et rien pour les deux autres. On passe
   par la page elle-meme (cle de cache et variable), puis on recharge. */
await pg.evaluate(([d,url])=>{
  const cache={}; cache[String(d.id)]={url:url,ts:Date.now()};
  localStorage.setItem(IMG_CACHE_KEY,JSON.stringify(cache));
},[avecPhoto,PHOTO_CACHE]);
await pg.reload({waitUntil:"domcontentloaded"});
await pg.waitForFunction(()=>window.DRINKS&&DRINKS.length>100,{timeout:40000});
await pg.evaluate(()=>{try{document.getElementById("onboarding")?.remove();}catch(e){}});

/* Ouvre la recherche et tape la marque : les trois lignes apparaissent. */
await pg.evaluate(()=>navTo("search"));
await pg.waitForFunction(()=>{const s=document.querySelector(".screen.on");return s&&s.id==="s-search";},{timeout:10000});
await pg.fill("#q",avecPhoto.brand);
await pg.waitForFunction((ids)=>ids.every(id=>document.querySelector('#search-list .rphoto[data-did="'+id+'"]')),trio.map(d=>d.id),{timeout:10000});

const vignette=(d)=>pg.locator('#search-list .rphoto[data-did="'+d.id+'"]');
const etatZoom=()=>pg.evaluate(()=>{
  const ov=document.getElementById("img-zoom"),pic=document.getElementById("img-zoom-pic"),art=document.getElementById("img-zoom-art"),etat=document.getElementById("img-zoom-etat");
  return {ouvert:ov.style.display==="flex"&&ov.classList.contains("in"),
          picSrc:pic.getAttribute("src")||"",picVisible:pic.style.display!=="none",
          artVisible:art.style.display==="flex"&&art.innerHTML.length>50,
          etat:etat.style.display==="none"?"":etat.textContent,
          ecran:(document.querySelector(".screen.on")||{}).id};
});

/* ─── 1. Vignette AVEC photo : un tap, la photo, tout de suite ──────────── */
await vignette(avecPhoto).scrollIntoViewIfNeeded();
await vignette(avecPhoto).tap();
await pg.waitForTimeout(350);
let z=await etatZoom();
verifier("1. un tap sur la vignette ouvre la visionneuse",z.ouvert,JSON.stringify({ouvert:z.ouvert}));
verifier("1. la photo deja connue se pose immediatement",z.picVisible&&z.picSrc===PHOTO_CACHE,z.picSrc.slice(-28));
verifier("1. la recherche ne bouge pas derriere",z.ecran==="s-search",z.ecran);
await pg.screenshot({path:"/tmp/claude-0/-home-user-magofeed/46ee4911-6f1e-5620-8d8a-1645f7faf394/scratchpad/photo-tap-1-photo.png"});

/* ─── 2. Un tap n'importe ou la referme ─────────────────────────────────── */
await pg.tap("#img-zoom",{position:{x:30,y:60}});
await pg.waitForTimeout(400);
z=await etatZoom();
verifier("2. un tap referme la visionneuse",!z.ouvert&&z.ecran==="s-search",JSON.stringify({ouvert:z.ouvert,ecran:z.ecran}));

/* ─── 3. Vignette SANS photo : elle s'ouvre quand meme, puis la photo arrive ─ */
offRepondPour=sansPhoto;
await vignette(sansPhoto).tap();
await pg.waitForTimeout(250);
z=await etatZoom();
verifier("3. sans photo, la visionneuse s'ouvre quand meme",z.ouvert&&z.ecran==="s-search",JSON.stringify({ouvert:z.ouvert,ecran:z.ecran}));
verifier("3. elle montre le dessin de la boisson",z.artVisible&&!z.picVisible,"art="+z.artVisible+" pic="+z.picVisible);
verifier("3. et dit qu'elle cherche",/je la cherche/.test(z.etat),z.etat);
await pg.screenshot({path:"/tmp/claude-0/-home-user-magofeed/46ee4911-6f1e-5620-8d8a-1645f7faf394/scratchpad/photo-tap-3-attente.png"});
await pg.waitForFunction((u)=>{const p=document.getElementById("img-zoom-pic");return p.style.display!=="none"&&p.getAttribute("src")===u;},PHOTO_OFF,{timeout:15000}).catch(()=>{});
z=await etatZoom();
verifier("3. la photo trouvee se pose d'elle-meme dans la visionneuse",z.ouvert&&z.picVisible&&z.picSrc===PHOTO_OFF&&!z.artVisible,z.picSrc.slice(-28)+" etat="+JSON.stringify(z.etat));
const vignetteMaj=await pg.evaluate((d)=>{const v=document.querySelector('#search-list .rphoto[data-did="'+d.id+'"] img');return v?v.getAttribute("src"):"";},sansPhoto);
verifier("3. la vignette de la liste recoit la photo sans retaper",vignetteMaj===PHOTO_OFF,vignetteMaj.slice(-28));
await pg.screenshot({path:"/tmp/claude-0/-home-user-magofeed/46ee4911-6f1e-5620-8d8a-1645f7faf394/scratchpad/photo-tap-3-photo.png"});
await pg.tap("#img-zoom",{position:{x:30,y:60}});
await pg.waitForTimeout(400);
offRepondPour=null;

/* ─── 4. Vignette SANS photo, reseau en panne : elle le dit ─────────────── */
await vignette(enPanne).tap();
await pg.waitForFunction(()=>{const e=document.getElementById("img-zoom-etat");return e.style.display!=="none"&&/Pas encore de photo/.test(e.textContent);},{timeout:15000}).catch(()=>{});
z=await etatZoom();
verifier("4. reseau en panne : la visionneuse reste ouverte sur le dessin",z.ouvert&&z.artVisible,"art="+z.artVisible);
verifier("4. et finit par dire « pas encore de photo »",/Pas encore de photo/.test(z.etat),z.etat);
await pg.screenshot({path:"/tmp/claude-0/-home-user-magofeed/46ee4911-6f1e-5620-8d8a-1645f7faf394/scratchpad/photo-tap-4-panne.png"});
await pg.tap("#img-zoom",{position:{x:30,y:60}});
await pg.waitForTimeout(400);

/* ─── 6. Le clavier fait pareil ─────────────────────────────────────────── */
await vignette(avecPhoto).focus();
await pg.keyboard.press("Enter");
await pg.waitForTimeout(350);
z=await etatZoom();
verifier("6. Entree sur la vignette ouvre aussi la photo",z.ouvert&&z.picSrc===PHOTO_CACHE&&z.ecran==="s-search",JSON.stringify({ouvert:z.ouvert,ecran:z.ecran}));
await pg.keyboard.press("Escape");
await pg.waitForTimeout(400);

/* ─── 5. Le reste de la ligne ouvre la boisson, pas la photo ────────────── */
await pg.locator('#search-list .rphoto[data-did="'+avecPhoto.id+'"]').locator("xpath=..").locator(".rname").tap();
await pg.waitForTimeout(700);
z=await etatZoom();
verifier("5. un tap sur le nom ouvre la boisson (pas la photo)",!z.ouvert&&z.ecran!=="s-search",JSON.stringify({ouvert:z.ouvert,ecran:z.ecran}));

/* ─── 8. Depuis la CARTE ouverte sur une boisson : la vignette de la barre ──
   Capture d'ecran du fondateur (20/11, 06:20) : sur la carte « Minute Maid
   Multivitamines », taper la vignette en haut ne faisait rien, et la photo
   s'ouvrait toute seule en revenant au detail. La visionneuse s'ouvrait bel
   et bien — DERRIERE la carte (z-index 4000 contre 4100 pour la carte). */
await pg.evaluate(()=>{try{closeDrinkZoom();}catch(e){}});
await pg.evaluate((d)=>{const x=DRINKS.find(q=>String(q.id)===String(d.id));pick(x);},avecPhoto);
await pg.waitForTimeout(1500);
const carteDeja=await pg.evaluate(()=>{const h=document.getElementById("explore-map-host");return !!(h&&h.style.display!=="none"&&h.classList.contains("in"));});
if(!carteDeja){await pg.evaluate(()=>openDrinkMapView());await pg.waitForTimeout(1500);}
await pg.waitForFunction(()=>{const t=document.getElementById("explore-thumb");return t&&t.style.display==="flex";},{timeout:10000}).catch(()=>{});
await pg.tap("#explore-thumb");
await pg.waitForTimeout(400);
const dessus=await pg.evaluate(()=>{
  const ov=document.getElementById("img-zoom");
  const el=document.elementFromPoint(window.innerWidth/2,window.innerHeight/2);
  return {ouvert:ov.style.display==="flex"&&ov.classList.contains("in"),
          visible:!!(el&&ov.contains(el)),
          dessusDe:el?(el.id||el.className||el.tagName):"rien",
          carte:!!document.querySelector("#explore-map-host.in")};
});
verifier("8. depuis la carte, la vignette ouvre la visionneuse",dessus.ouvert&&dessus.carte,JSON.stringify({ouvert:dessus.ouvert,carte:dessus.carte}));
verifier("8. et elle est DEVANT la carte, pas derriere",dessus.visible,"au centre de l'ecran : "+dessus.dessusDe);
await pg.screenshot({path:"/tmp/claude-0/-home-user-magofeed/46ee4911-6f1e-5620-8d8a-1645f7faf394/scratchpad/photo-tap-8-carte.png"});

/* ─── 7. La feuille de style tient l'<img> hors du doigt ────────────────── */
const css=await readFile(join(R,"app.css"),"utf8");
verifier("7. l'<img> de la vignette ne capte plus le doigt (pas d'apercu natif)",
  /\.rphoto img[^{]*\{[^}]*pointer-events:none/.test(css)&&/\.rphoto img[^{]*\{[^}]*-webkit-touch-callout:none/.test(css),
  "pointer-events:none + -webkit-touch-callout:none");

console.log("\n  UN TAP SUR LA VIGNETTE OUVRE LA PHOTO EN GRAND — TOUJOURS\n");
console.log("   boissons du scenario : "+trio.map(d=>d.brand+" "+d.name).join(" · ")+"\n");
let ko=0;
for(const [nom,ok,det] of etapes){
  if(!ok)ko++;
  console.log("   "+(ok?"ok  ":"ECHEC")+"  "+nom.padEnd(62)+" "+det);
}
console.log("\n  erreurs JavaScript : "+erreurs.length);
erreurs.slice(0,4).forEach(e=>console.log("    "+e));
console.log("\n  "+(ko===0&&erreurs.length===0?"TOUT EST VERT":ko+" CONTROLE(S) EN ECHEC"));
await nav.close(); srv.close();
process.exit(ko===0&&erreurs.length===0?0:1);
