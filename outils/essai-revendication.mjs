/* ══ LA REVENDICATION D'UN MAGASIN PORTE-T-ELLE SES PREUVES ? ═══════════════
   Un paiement ne prouve pas qui tient une boutique. Trois choses, oui : le
   numero d'entreprise (registre public, cle mod 97), le telephone du magasin,
   et une photo du code du jour prise sur place. Ce controle verifie :

     1. la cle mod 97 : 0477.472.701 passe, 0123.456.789 non, « BE » et les
        points sont toleres ;
     2. le code du jour : six chiffres, le meme pour les memes entrees, un
        autre le lendemain — l'administration le recalcule pour le comparer
        a la photo ;
     3. la feuille de demande montre les trois preuves et le code ;
     4. l'envoi REFUSE sans numero valide, puis sans photo, et transmet les
        preuves quand tout y est ;
     5. dans les sources : la regle serveur, l'index du compteur, le controle
        d'index qui l'exige, et le compteur lui-meme. */
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
const ctx=await nav.newContext({viewport:{width:390,height:844},locale:"fr-BE"});
const pg=await ctx.newPage();
const erreurs=[];
pg.on("pageerror",e=>erreurs.push("ERREUR JS : "+String(e.message).slice(0,140)));
/* Vignettes OpenFoodFacts comprises : des <img> de l'accueil que l'evenement load attend, et qui peuvent trainer sans rien dire de ce qu'on mesure ici. */
await pg.route(/tile\.openstreetmap\.org|basemaps\.cartocdn\.com|images\.openfoodfacts\.org/,r=>r.abort());
await pg.addInitScript(()=>{try{localStorage.setItem("magoOnboard","1");localStorage.setItem("magoob","1");}catch(e){}});
await pg.goto(`http://127.0.0.1:${port}/index.html`);
await pg.waitForFunction(()=>window.DRINKS&&DRINKS.length>100,undefined,{timeout:40000,polling:100});

const etapes=[];
function verifier(nom,cond,detail){etapes.push([nom,!!cond,detail||""]);}

/* ─── 1. Le numero d'entreprise ──────────────────────────────────────────── */
const bce=await pg.evaluate(()=>({
  juste:numeroEntrepriseValide("0477472701"),
  tolere:numeroEntrepriseValide("BE 0477.472.701"),
  faux:numeroEntrepriseValide("0123456789"),
  court:numeroEntrepriseValide("477472701"),
  texte:numeroEntrepriseValide("mon magasin"),
  affiche:numeroEntrepriseAffiche("BE0477472701")
}));
verifier("cle mod 97 : 0477.472.701 est accepte", bce.juste, "");
verifier("« BE », points et espaces sont toleres", bce.tolere, "");
verifier("0123.456.789 (cle fausse) est refuse", !bce.faux, "");
verifier("neuf chiffres ou du texte sont refuses", !bce.court&&!bce.texte, "");
verifier("affichage 0477.472.701", bce.affiche==="0477.472.701", bce.affiche);

/* ─── 2. Le code du jour ─────────────────────────────────────────────────── */
const code=await pg.evaluate(()=>({
  a:codeDuJour("u1","s1","2026-11-01"), b:codeDuJour("u1","s1","2026-11-01"),
  lendemain:codeDuJour("u1","s1","2026-11-02"), autre:codeDuJour("u2","s1","2026-11-01"),
  jour:jourLocal()
}));
verifier("six chiffres, toujours les memes pour les memes entrees", /^\d{6}$/.test(code.a)&&code.a===code.b, code.a);
verifier("un autre code le lendemain, un autre pour un autre compte", code.lendemain!==code.a&&code.autre!==code.a, code.a+" / "+code.lendemain+" / "+code.autre);
verifier("jourLocal au format AAAA-MM-JJ", /^\d{4}-\d{2}-\d{2}$/.test(code.jour), code.jour);

/* ─── 3. La feuille montre les trois preuves ─────────────────────────────── */
const feuille=await pg.evaluate(()=>{
  window._fbUser={uid:"u-test",isAnonymous:false};
  window.fbMyShopClaim=null;
  curStoreDetail={id:"s-test",fbId:"s-test",name:"Night Shop Test",lat:50.88,lng:4.35};
  claimThisShop();
  const q=id=>!!document.getElementById(id);
  return {bce:q("claim-bce"),tel:q("claim-phone"),photo:q("claim-photo"),
    code:(document.getElementById("claim-code")||{}).textContent||"",
    attendu:codeDuJour("u-test","s-test",jourLocal()),
    capture:(document.getElementById("claim-photo")||{}).getAttribute?.("capture")||""};
});
verifier("la feuille a les champs numero d'entreprise, telephone, photo", feuille.bce&&feuille.tel&&feuille.photo, "");
verifier("le code affiche est celui du compte, du magasin et du jour", feuille.code===feuille.attendu, feuille.code+" = "+feuille.attendu);
verifier("la photo s'ouvre sur l'appareil photo (capture=environment)", feuille.capture==="environment", feuille.capture);

/* ─── 4. L'envoi exige les preuves, puis les transmet ────────────────────── */
const envoi=await pg.evaluate(async()=>{
  const appels=[]; window.fbSubmitShopClaim=(s,infos)=>{appels.push(infos);return Promise.resolve(true);};
  const toasts=[]; const _toast=window.toast; window.toast=t=>{toasts.push(String(t));};
  document.getElementById("claim-contact").value="Alice — 0470 00 00 00";
  document.getElementById("claim-bce").value="BE 0123.456.789";          /* cle fausse */
  claimSubmit(); const apresFaux=appels.length;
  document.getElementById("claim-bce").value="BE 0477.472.701";          /* juste, mais pas de photo */
  window._claimPreuve=null; claimSubmit(); const apresSansPhoto=appels.length;
  window._claimPreuve="data:image/jpeg;base64,"+"A".repeat(200);          /* tout y est */
  document.getElementById("claim-phone").value="02 123 45 67";
  claimSubmit(); await new Promise(r=>setTimeout(r,50));
  window.toast=_toast;
  const d=appels[0]||{};
  return {apresFaux,apresSansPhoto,n:appels.length,bce:d.bce,tel:d.telephone,code:d.code,codeJour:d.codeJour,
    preuve:typeof d.preuve==="string"&&d.preuve.startsWith("data:image/"),toasts:toasts.slice(0,2)};
});
verifier("sans numero valide : rien ne part, un toast explique", envoi.apresFaux===0&&/entreprise/.test(envoi.toasts[0]||""), envoi.toasts[0]||"(aucun toast)");
verifier("sans photo : rien ne part, un toast explique", envoi.apresSansPhoto===0&&/photo/.test(envoi.toasts[1]||""), envoi.toasts[1]||"(aucun toast)");
verifier("avec tout : la demande part une fois, avec ses preuves", envoi.n===1&&envoi.bce==="0477472701"&&envoi.tel==="02 123 45 67"&&envoi.preuve, "bce="+envoi.bce+" tel="+envoi.tel);
verifier("le code et sa date partent avec la demande", /^\d{6}$/.test(envoi.code||"")&&/^\d{4}-\d{2}-\d{2}$/.test(envoi.codeJour||""), (envoi.code||"?")+" le "+(envoi.codeJour||"?"));

/* ─── 5. Dans les sources ────────────────────────────────────────────────── */
{
  const regles=await readFile(join(R,"functions-a-deployer/firestore.rules"),"utf8");
  const index=JSON.parse(await readFile(join(R,"functions-a-deployer/firestore.indexes.json"),"utf8"));
  const ctrl=await readFile(join(R,"outils/controle-index.mjs"),"utf8");
  const html=await readFile(join(R,"index.html"),"utf8");
  verifier("regles : revendicationValide existe et verifie la cle mod 97 cote serveur", /function revendicationValide\(\)/.test(regles)&&/% 97/.test(regles)&&/&& revendicationValide\(\)/.test(regles), "");
  verifier("regles : aucun champ inconnu n'entre dans une demande (hasOnly)", /revendicationValide[\s\S]{0,400}hasOnly\(/.test(regles), "");
  verifier("index : reports (type, createdAt) pour le compteur", index.indexes.some(i=>i.collectionGroup==="reports"&&i.fields.map(f=>f.fieldPath).join(",")==="type,createdAt"), "");
  verifier("controle-index exige cet index", /reports\|type:ASCENDING\|createdAt:ASCENDING/.test(ctrl), "");
  verifier("le compteur « confirmations humaines / 7 j » existe", /confirmWeek/.test(html)&&/confirmations humaines \/ 7 j/.test(html), "");
  verifier("l'administration montre le code attendu et la fiche officielle", /Code attendu/.test(html)&&/kbopub\.economie\.fgov\.be/.test(html), "");
}

console.log("\n  LA REVENDICATION D'UN MAGASIN PORTE-T-ELLE SES PREUVES ?\n");
let ko=0;
for(const [nom,ok,det] of etapes){ if(!ok)ko++; console.log("   "+(ok?"ok  ":"ECHEC")+"  "+nom.padEnd(70)+" "+det); }
console.log("\n  erreurs JavaScript : "+erreurs.length);
erreurs.slice(0,4).forEach(e=>console.log("    "+e));
console.log("\n  "+(ko===0&&erreurs.length===0?"TOUT EST VERT":ko+" CONTROLE(S) EN ECHEC"));
await nav.close(); srv.close();
process.exit(ko===0&&erreurs.length===0?0:1);
