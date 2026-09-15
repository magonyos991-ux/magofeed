/* Rejoue EXACTEMENT ce que fait fbJoinHunt, a deux comptes, sur l'emulateur.
   But : savoir si « papa lance une chasse » ecrit vraiment dans hunts/, et si
   le deuxieme telephone peut la lire. On ne devine pas, on regarde. */
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, getDoc, getDocs, collection, serverTimestamp, query, limit } from 'firebase/firestore';
import fs from 'fs';

const env = await initializeTestEnvironment({
  projectId: 'magofeed-chasse',
  firestore: { rules: fs.readFileSync('firestore.rules','utf8'), host:'127.0.0.1', port:8391 },
});
const PAPA='papa1', MOI='moi1';
const p = env.authenticatedContext(PAPA).firestore();
const m = env.authenticatedContext(MOI).firestore();
const anon = env.unauthenticatedContext().firestore();

const _coarse = x => Math.round(x*10)/10;
/* copie conforme de window.fbJoinHunt */
async function joinHunt(db, uid, drinkId, drinkName, emoji, lat, lng){
  const pos={lat:lat!=null?_coarse(lat):null,lng:lng!=null?_coarse(lng):null};
  const moi={lat:pos.lat,lng:pos.lng,at:Date.now()};
  const ref=doc(db,'hunts',String(drinkId));
  const commun={drinkName:String(drinkName||'').slice(0,60),emoji:String(emoji||'').slice(0,4),updatedAt:serverTimestamp()};
  const maj=Object.assign({},commun); maj['seekers.'+uid]=moi;
  const trace=[];
  try{ await updateDoc(ref,maj); trace.push('updateDoc direct OK'); return trace; }
  catch(e){ trace.push('updateDoc direct -> '+(e.code||e.message)); }
  try{
    const bouge=Object.assign({},commun);
    bouge['seekers.'+uid+'.lat']=pos.lat; bouge['seekers.'+uid+'.lng']=pos.lng;
    await updateDoc(ref,bouge); trace.push('updateDoc imbrique OK'); return trace;
  }catch(e2){ trace.push('updateDoc imbrique -> '+(e2.code||e2.message)); }
  try{
    await setDoc(ref,Object.assign({drinkId:Number(drinkId)||drinkId,
      seekers:(()=>{const o={};o[uid]=moi;return o;})()},commun));
    trace.push('setDoc creation OK'); return trace;
  }catch(e3){ trace.push('setDoc creation -> '+(e3.code||e3.message)); return trace; }
}

const l=(t)=>console.log(t);
l('\n1) PAPA lance la chasse sur Mountain Dew Spark (id 7), a Bruxelles');
(await joinHunt(p,PAPA,7,'Mountain Dew Spark','',50.8676,4.3436)).forEach(t=>l('   '+t));

l('\n2) le document existe-t-il, et que contient-il ?');
{
  const s=await getDoc(doc(anon,'hunts','7'));
  l('   existe : '+s.exists());
  if(s.exists()){const d=s.data();
    l('   drinkId : '+JSON.stringify(d.drinkId)+'  drinkName : '+JSON.stringify(d.drinkName));
    l('   seekers : '+JSON.stringify(d.seekers));
    l('   champs  : '+Object.keys(d).join(', '));}
}

l('\n3) MOI, sur un autre telephone, je lis la collection (fbLoadNearbyHunts)');
{
  const snap=await getDocs(query(collection(m,'hunts'),limit(200)));
  l('   documents lus : '+snap.docs.length);
  snap.forEach(d=>{const h=d.data();
    l('   -> '+d.id+' : '+h.drinkName+' · '+Object.keys(h.seekers||{}).length+' chercheur(s)');});
}

l('\n4) MOI je rejoins la MEME chasse (deuxieme chercheur sur un doc existant)');
(await joinHunt(m,MOI,7,'Mountain Dew Spark','',50.8676,4.3436)).forEach(t=>l('   '+t));
{
  const s=await getDoc(doc(anon,'hunts','7'));
  l('   seekers apres : '+JSON.stringify(s.data().seekers));
}

l('\n5) PAPA relance la MEME chasse (deja chercheur : le chemin « bouge »)');
(await joinHunt(p,PAPA,7,'Mountain Dew Spark','',50.8676,4.3436)).forEach(t=>l('   '+t));

l('\n6) une boisson du CATALOGUE, identifiant long en chaine');
(await joinHunt(p,PAPA,'1783516926221','Lidl Colossus','',50.8676,4.3436)).forEach(t=>l('   '+t));
{
  const s=await getDoc(doc(anon,'hunts','1783516926221'));
  l('   existe : '+s.exists()+(s.exists()?'  drinkId='+JSON.stringify(s.data().drinkId):''));
}
await env.cleanup();
