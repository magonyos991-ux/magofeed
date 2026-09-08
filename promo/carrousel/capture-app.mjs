import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path';
const SC='/tmp/claude-0/-home-user-magofeed/a4554d7d-14ce-523f-8a9e-0a25d074053d/scratchpad/';
const ROOT='/home/user/magofeed';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg'};
const srv=http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';
  const f=path.join(ROOT,p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});res.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(8181,r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,
  permissions:['geolocation'],geolocation:{latitude:50.8466,longitude:4.3528},locale:'fr-BE',timezoneId:'Europe/Brussels'});
await ctx.route('https://www.gstatic.com/firebasejs/10.12.2/*', r=>{const n=r.request().url().split('/').pop();
  const f=SC+'fbsdk/'+n; if(!fs.existsSync(f))return r.fulfill({status:404,body:''});
  r.fulfill({status:200,contentType:'text/javascript',body:fs.readFileSync(f,'utf8')});});
await ctx.route('**/identitytoolkit.googleapis.com/**', r=>r.abort('failed'));
await ctx.route('**/firestore.googleapis.com/**', r=>r.abort('failed'));
await ctx.route('**/nominatim.openstreetmap.org/**', r=>r.fulfill({status:200,contentType:'application/json',body:'{"address":{"road":"Chaussée d\'Ixelles","city":"Bruxelles"}}'}));
await ctx.route('**/images.openfoodfacts.org/**', r=>r.abort('failed'));
// Leaflet + cluster servis depuis le disque (Chromium n'a pas le proxy reseau)
await ctx.route('**/cdnjs.cloudflare.com/**', r=>{
  const u=r.request().url(); const n=u.split('/').pop();
  const f=SC+'leaflet/'+n;
  if(!fs.existsSync(f))return r.fulfill({status:404,body:''});
  r.fulfill({status:200,contentType:n.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(f,'utf8')});
});
/* Tuiles du fond de carte : telechargees par curl (qui a le proxy), mises en
   cache disque. L'app est passee de CARTO a OpenStreetMap — CARTO barre
   desormais ses tuiles d'un « API KEY REQUIRED » qui se serait retrouve en
   travers des captures promotionnelles. */
import { execFileSync } from 'child_process';
await ctx.route('**/tile.openstreetmap.org/**', r=>{
  const u=new URL(r.request().url());
  const key=u.pathname.replace(/[^a-z0-9]/gi,'_');
  const f=SC+'tiles/'+key+'.png';
  try{
    if(!fs.existsSync(f))execFileSync('curl',['-s','-o',f,'-A','Magofeed/1.0 (+https://github.com/magonyos991-ux/magofeed)','https://tile.openstreetmap.org'+u.pathname],{timeout:15000});
    r.fulfill({status:200,contentType:'image/png',body:fs.readFileSync(f)});
  }catch(e){r.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64')});}
});
const page=await ctx.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(String(e.message).slice(0,120)));
await page.addInitScript(()=>{localStorage.setItem('magoob','1');
  localStorage.setItem('magopseudo','Explorateur');
  localStorage.setItem('magotuto','1');
  localStorage.setItem('magoCoach',JSON.stringify({home:1,search:1,scan:1,discover:1,profile:1,results:1,storedetail:1}));
  localStorage.setItem('magoFeedbackDone','1'); localStorage.setItem('magoFeedbackAsked','1');
  try{Object.defineProperty(navigator,'serviceWorker',{get:()=>({register:()=>new Promise(()=>{}),ready:new Promise(()=>{}),addEventListener(){},controller:null})});}catch(e){}});
await page.goto('http://localhost:8181/',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(4000);
const info=await page.evaluate(()=>{
  userLat=50.8466;userLng=4.3528;
  const md=(window.DRINKS||[]).find(d=>/mountain/i.test(d.name||''));
  const dId=md?md.id:(window.DRINKS&&DRINKS[0]&&DRINKS[0].id);
  const noms=[['Night Shop Agora','night shop',50.8477,4.3550],
              ['Delhaize City','supermarché',50.8452,4.3492],
              ['Épicerie du Centre','épicerie exotique',50.8443,4.3560],
              ['Carrefour Express','supermarché',50.8488,4.3515],
              ['Asia Market','épicerie asiatique',50.8459,4.3585]];
  window.STORES=STORES=noms.map((n,i)=>({id:'d'+i,fbId:'d'+i,name:n[0],type:n[1],lat:n[2],lng:n[3],
    brand:'',drinks:[dId,1,2,3],drinksVerified:i<3?[dId]:[],
    confirmations:{[dId]:i<3?3:0,1:2,2:2,3:2},
    seenAt:{[dId]:Date.now()-86400000*(i+1)},
    certified:i===0}));
  STORES.forEach(s=>{s.dist=Math.round(haversine(userLat,userLng,s.lat,s.lng));});
  // La carte interroge Firestore via fbQueryZone : on la branche sur nos magasins de demo.
  window.fbQueryZone=function(){return Promise.resolve(window.STORES.slice());};
  try{renderNearby();}catch(e){}
  return {drink:md?md.name:'?',dId};
});
const netto=async()=>{await page.evaluate(()=>{
  ['tuto-overlay','coach-bulle','mago-toast'].forEach(id=>{const e=document.getElementById(id);if(e)e.remove();});
  document.querySelectorAll('.coach-tip,.coach-bubble,[id^=coach],.toast').forEach(e=>e.remove());
});};
// ── 1. Recherche avec requete tapee
await page.evaluate(()=>{show('search');});
await page.waitForTimeout(700);
await page.evaluate(()=>{const q=document.getElementById('q');q.value='mountain dew';
  q.dispatchEvent(new Event('input',{bubbles:true}));});
await page.waitForTimeout(900); await netto();
await page.screenshot({path:SC+'capt-1-recherche.png'});
// ── 2. La boisson ouverte -> carte des magasins (pins verts)
await page.evaluate(()=>{const md=(window.DRINKS||[]).find(d=>/mountain/i.test(d.name||''));pick(md||DRINKS[0]);});
await page.waitForTimeout(6000);
await page.evaluate(()=>{try{exploreMap.setView([50.8464,4.3538],15);}catch(e){}});
await page.waitForTimeout(1200);
await page.evaluate(()=>{try{exploreLoadStores(true);}catch(e){}});
await page.waitForTimeout(3500); await netto();
await page.screenshot({path:SC+'capt-2-carte.png'});
// ── 3. La fiche magasin avec "Y aller"
await page.evaluate(()=>{openStoreDetail('d0');});
await page.waitForTimeout(2000); await netto();
await page.screenshot({path:SC+'capt-3-fiche.png'});
console.log(JSON.stringify({info,errs:errs.slice(0,5)}));
await b.close(); srv.close();
