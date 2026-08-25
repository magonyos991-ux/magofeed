// Simulation adverse : on rejoue la logique de choix exactement comme dans
// code-agent1.txt, et on cherche a la faire produire un doublon.
import fs from 'fs';
const src = fs.readFileSync('/home/user/magofeed/promo/n8n/code-agent1.txt','utf8');

const MENU = [...src.matchAll(/\{ slug: "([^"]+)", nom: "([^"]+)"/g)].map(m=>({slug:m[1],nom:m[2]}));
const ORDRE = JSON.parse('['+src.match(/const ORDRE = \[([\s\S]*?)\];/)[1].replace(/\s+/g,'')+']');
if (MENU.length !== ORDRE.length) { console.log('!! MENU', MENU.length, 'vs ORDRE', ORDRE.length); }
const manquants = ORDRE.filter(s=>!MENU.find(m=>m.slug===s));
if (manquants.length) console.log('!! slugs de ORDRE absents du MENU :', manquants);

const CLES = (()=>{ const m=src.match(/const CLES = \{([\s\S]*?)\n\};/)[1];
  const o={}; for(const r of m.matchAll(/"([^"]+)":\s*\[([^\]]*)\]/g)){
    o[r[1]] = [...r[2].matchAll(/"([^"]+)"/g)].map(x=>x[1]); } return o; })();
const sansAccent = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
function choisir({execId, jour, hUTC, memoire}) {
  const creneau = hUTC < 10 ? 0 : (hUTC < 15 ? 1 : 2);
  let base = NaN;
  if (execId !== undefined && execId !== null) base = Number(String(execId).replace(/\D/g,''));
  if (!Number.isFinite(base) || base <= 0) base = jour*3 + creneau;
  let idx = ((base % ORDRE.length) + ORDRE.length) % ORDRE.length;
  const dejaHay = sansAccent(memoire || '');
  const pub = s => (CLES[s]||[]).some(k=>dejaHay.includes(k));
  for (let t=0;t<ORDRE.length && pub(ORDRE[idx]); t++) idx=(idx+1)%ORDRE.length;
  return ORDRE[idx];
}
const nom = s => (MENU.find(m=>m.slug===s)||{}).nom || s;

const echecs = [];
const check = (titre, suite) => {
  const dbl = suite.length !== new Set(suite).size;
  // on ne s'inquiete que des repetitions RAPPROCHEES (dans une fenetre de 13)
  let proche = false;
  for (let i=1;i<suite.length;i++) if (suite[i]===suite[i-1]) proche = true;
  const ko = proche || (suite.length<=ORDRE.length && dbl);
  console.log((ko?'ECHEC ':'ok    ')+titre.padEnd(52), suite.slice(0,6).join(', ')+(suite.length>6?'…':''));
  if (ko) echecs.push(titre);
};

// 1. Marche normale : 3 passages/jour sur 10 jours, memoire cumulative, ids croissants
{ let mem=[],out=[],id=1000;
  for(let j=0;j<10;j++) for(const h of [7,11,17]){
    const s=choisir({execId:id++, jour:20000+j, hUTC:h, memoire:mem.join(' | ')});
    mem.push(nom(s)+' — texte du post'); out.push(s);
  }
  check('marche normale, 30 passages', out); }

// 2. LE BUG DES MILKIS : 9h repart en image, donc 9h et 13h tous deux images
{ let mem=[],out=[],id=2000;
  for(let j=0;j<8;j++) for(const h of [7,11,17]){
    const s=choisir({execId:id++, jour:20000+j, hUTC:h, memoire:mem.join(' | ')});
    mem.push(nom(s)); out.push(s);
  }
  check('9h et 13h tous deux en image', out); }

// 3. DEUX PASSAGES SIMULTANES : meme jour, meme heure, MEME memoire (pas encore ecrite)
{ const a=choisir({execId:3001, jour:20000, hUTC:11, memoire:''});
  const b=choisir({execId:3002, jour:20000, hUTC:11, memoire:''});
  check('deux passages simultanes (memoire non ecrite)', [a,b]); }

// 4. Relances manuelles en rafale, memoire jamais mise a jour
{ let out=[]; for(let k=0;k<6;k++) out.push(choisir({execId:4000+k, jour:20000, hUTC:11, memoire:''}));
  check('6 relances manuelles, memoire vide', out); }

// 5. $execution indisponible -> repli calendrier
{ let mem=[],out=[];
  for(let j=0;j<6;j++) for(const h of [7,11,17]){
    const s=choisir({execId:null, jour:20000+j, hUTC:h, memoire:mem.join(' | ')});
    mem.push(nom(s)); out.push(s);
  }
  check('sans identifiant d execution (repli calendrier)', out); }

// 6. Memoire SATUREE (toutes les boissons deja publiees) : la boucle s epuise
{ const toutes = MENU.map(m=>m.nom).join(' | ');
  let out=[]; for(let k=0;k<5;k++) out.push(choisir({execId:6000+k, jour:20000, hUTC:11, memoire:toutes}));
  check('memoire saturee (13 boissons deja sorties)', out); }

// 7. Memoire tronquee aux 3 derniers sujets
{ let mem=[],out=[],id=7000;
  for(let j=0;j<10;j++) for(const h of [7,11,17]){
    const s=choisir({execId:id++, jour:20000+j, hUTC:h, memoire:mem.slice(-3).join(' | ')});
    mem.push(nom(s)); out.push(s);
  }
  check('memoire tronquee aux 3 derniers', out); }

// 8. Le modele ecrit les noms autrement dans la memoire
{ const variantes = {'Mountain Dew':'Mtn Dew','Chupa Chups Sparkling':'Chupa Chups','Guaraná Antarctica':'Guarana'};
  let mem=[],out=[],id=8000;
  for(let j=0;j<8;j++) for(const h of [7,11,17]){
    const s=choisir({execId:id++, jour:20000+j, hUTC:h, memoire:mem.join(' | ')});
    const n=nom(s); mem.push(variantes[n]||n); out.push(s);
  }
  check('noms ecrits en variantes dans la memoire', out); }

// 9. Identifiants d execution qui sautent (branche Reel + echecs intercales)
{ let mem=[],out=[],id=9000;
  for(let j=0;j<10;j++) for(const h of [7,11,17]){
    id += 1 + Math.floor(((j*3+h)%4)); // sauts irreguliers de 1 a 4
    const s=choisir({execId:id, jour:20000+j, hUTC:h, memoire:mem.join(' | ')});
    mem.push(nom(s)); out.push(s);
  }
  check('identifiants qui sautent (branche video, echecs)', out); }

// 10. Changement d heure ete/hiver le meme jour
{ const e=[7,11,17].map(h=>choisir({execId:null,jour:20000,hUTC:h,memoire:''}));
  const w=[8,12,18].map(h=>choisir({execId:null,jour:20000,hUTC:h,memoire:''}));
  check('bornes horaires ete', e); check('bornes horaires hiver', w); }

console.log('\n' + (echecs.length ? 'ECHECS : '+echecs.join(' | ') : 'AUCUN DOUBLON SUR LES 11 SCENARIOS'));
