/* QUELLE REGLE D'ACCEPTATION ? On telecharge UNE fois les resultats de
   recherche pour un echantillon de fiches dont la valeur est deja connue,
   puis on evalue plusieurs regles hors ligne sur ce meme lot. Chaque regle
   donne un couple couverture/precision ; on ne retient une regle que si sa
   precision est assez haute pour ne pas mentir. */
import fs from "node:fs";
const UA={headers:{"User-Agent":"Magofeed/1.0 (github magonyos991-ux/magofeed)"}};
const racine="/home/user/magofeed";
const cacheFic="/tmp/claude-0/-home-user-magofeed/a4554d7d-14ce-523f-8a9e-0a25d074053d/scratchpad/off-hits.json";
globalThis.window={};
(0,eval)(fs.readFileSync(racine+"/data/drinks.js","utf8"));
(0,eval)(fs.readFileSync(racine+"/data/nutrition.js","utf8"));
const D=globalThis.DRINKS||globalThis.window.DRINKS;
const N=globalThis.NUTRI||globalThis.window.NUTRI;

const norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"")
  .replace(/[ışğüöç]/g,c=>({"ı":"i","ş":"s","ğ":"g","ü":"u","ö":"o","ç":"c"}[c]||c))
  .replace(/[^a-z0-9]+/g," ").trim();
const BANALS=new Set("original originale classic classique soda drink boisson de du la le les et and canette bouteille cl ml pack".split(" "));
const motsUtiles=s=>norm(s).split(" ").filter(m=>m.length>2&&!BANALS.has(m));

const connues=D.filter(d=>N[d.id]&&typeof N[d.id][0]==="number");
const pas=Math.max(1,Math.floor(connues.length/150));
const ech=connues.filter((_,i)=>i%pas===0).slice(0,150);

let cache={};
if(fs.existsSync(cacheFic))cache=JSON.parse(fs.readFileSync(cacheFic,"utf8"));
let aChercher=ech.filter(d=>!cache[d.id]);
console.log("echantillon",ech.length,"| a telecharger",aChercher.length);
for(const d of aChercher){
  const q=encodeURIComponent((d.brand||"")+" "+(d.name||""));
  const u="https://search.openfoodfacts.org/search?q="+q+"&page_size=15&fields=code,product_name,brands,nutriments";
  try{
    const r=await fetch(u,UA);
    cache[d.id]=r.ok?((await r.json()).hits||[]):[];
  }catch(e){cache[d.id]=[];}
  await new Promise(r=>setTimeout(r,850));
}
fs.writeFileSync(cacheFic,JSON.stringify(cache));

function evalue(nom,regle){
  let repondu=0,accord=0,desaccord=0;
  const faux=[];
  for(const d of ech){
    const hits=cache[d.id]||[];
    let pris=null;
    for(const h of hits){
      const n=h.nutriments||{};
      if(typeof n.sugars_100g!=="number")continue;
      if(!regle(d,h))continue;
      pris={s:n.sugars_100g,nom:h.product_name};break;
    }
    if(!pris)continue;
    repondu++;
    if(Math.abs(pris.s-N[d.id][0])<=0.6)accord++;
    else{desaccord++;if(faux.length<4)faux.push(d.name+" : "+N[d.id][0]+" -> "+pris.s+" (via "+pris.nom+")");}
  }
  const couv=Math.round(repondu/ech.length*100), prec=repondu?Math.round(accord/repondu*100):0;
  console.log(nom.padEnd(42),"couverture",String(couv+"%").padStart(4),"| precision",String(prec+"%").padStart(4),"|",accord+"/"+repondu);
  if(faux.length&&prec<95)faux.forEach(f=>console.log("      x",f));
}
const texte=h=>norm((h.product_name||"")+" "+[].concat(h.brands||[]).join(" "));

evalue("A. marque + 1 mot distinctif",(d,h)=>{
  const t=texte(h),mq=norm(d.brand||"");
  if(mq&&!t.includes(mq))return false;
  const m=motsUtiles(d.name).filter(x=>!mq.includes(x));
  return m.length?m.some(x=>t.includes(x)):false;
});
evalue("B. marque + TOUS les mots distinctifs",(d,h)=>{
  const t=texte(h),mq=norm(d.brand||"");
  if(mq&&!t.includes(mq))return false;
  const m=motsUtiles(d.name).filter(x=>!mq.includes(x));
  return m.length?m.every(x=>t.includes(x)):false;
});
evalue("C. B + aucun mot en trop cote OFF",(d,h)=>{
  const t=texte(h),mq=norm(d.brand||"");
  if(mq&&!t.includes(mq))return false;
  const m=motsUtiles(d.name).filter(x=>!mq.includes(x));
  if(!m.length||!m.every(x=>t.includes(x)))return false;
  const fiche=new Set(motsUtiles(d.brand+" "+d.name));
  const surplus=motsUtiles(t).filter(x=>!fiche.has(x)&&!mq.includes(x));
  return surplus.length===0;
});
evalue("D. C mais tolere 1 mot en trop",(d,h)=>{
  const t=texte(h),mq=norm(d.brand||"");
  if(mq&&!t.includes(mq))return false;
  const m=motsUtiles(d.name).filter(x=>!mq.includes(x));
  if(!m.length||!m.every(x=>t.includes(x)))return false;
  const fiche=new Set(motsUtiles(d.brand+" "+d.name));
  return motsUtiles(t).filter(x=>!fiche.has(x)&&!mq.includes(x)).length<=1;
});
