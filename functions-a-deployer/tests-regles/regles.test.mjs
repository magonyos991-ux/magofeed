/* Magofeed — banc d'essai des regles Firestore.
 *
 * A QUOI CA SERT : une regle Firestore ne previent jamais quand elle laisse
 * passer quelque chose. Ce fichier pose la question a l'envers — il ESSAIE
 * d'attaquer la base, et echoue si l'attaque reussit. Il verifie aussi que les
 * usages normaux passent toujours : une regle trop serree casse l'app aussi
 * surement qu'une regle trop lache la met en danger.
 *
 * C'est ce banc d'essai qui a trouve que « match /{doc=**} » sous users/{uid}
 * couvrait le document lui-meme et annulait en silence toutes les protections
 * du profil, sanction anti-triche comprise.
 *
 * COMMENT LE LANCER (une seule fois : npm install) :
 *     cd functions-a-deployer/tests-regles
 *     npm install
 *     npm test
 * Il faut Java installe (l'emulateur Firestore tourne dessus). Rien n'est
 * envoye en ligne : tout se passe sur ta machine, sur une base jetable.
 *
 * A FAIRE A CHAQUE FOIS QUE TU MODIFIES firestore.rules : relance « npm test »
 * AVANT « firebase deploy --only firestore:rules ». Si une ligne passe de
 * « ok » a « ECHEC », ne deploie pas.
 */
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, getDoc, getDocs, deleteDoc, collection, addDoc,
         writeBatch, increment, arrayUnion, serverTimestamp } from 'firebase/firestore';
import fs from 'fs';

const env = await initializeTestEnvironment({
  projectId: 'magofeed-test',
  firestore: { rules: fs.readFileSync('firestore.rules','utf8'), host:'127.0.0.1', port:8391 },
});
const R=[]; let ko=0;
async function doit(nom, fn){ try{ await fn(); R.push(['ok  ',nom]); }
                              catch(e){ ko++; R.push(['ECHEC',nom+' — '+String(e.message).slice(0,110)]); } }

const ALICE='alice', MALLORY='mallory', ADMIN='admin1';
const a = env.authenticatedContext(ALICE).firestore();
const m = env.authenticatedContext(MALLORY).firestore();
const ad = env.authenticatedContext(ADMIN).firestore();
const anon = env.unauthenticatedContext().firestore();

await env.withSecurityRulesDisabled(async (c)=>{
  const db=c.firestore();
  await setDoc(doc(db,'admins',ADMIN),{ok:true});
  await setDoc(doc(db,'users',ALICE),{pseudo:'Alice',points:10,streak:2,avatar:null,favs:[]});
  await setDoc(doc(db,'stores','s1'),{name:'Night Ixelles',brand:'',lat:50.82,lng:4.37,
      addedBy:ALICE,drinks:[1,2],drinksVerified:[1],confirmations:{1:3},seenAt:{1:1}});
  await setDoc(doc(db,'discoveries','d1'),{by:ALICE,name:'Ramune',votes:1,foundIn:[]});
  await setDoc(doc(db,'stats','drinkRatings'),{'1':{n:5,s:20}});
  await setDoc(doc(db,'hunts','7'),{drinkId:7,seekers:{[ALICE]:{lat:50.8,lng:4.3,at:1}}});
});

/* ── ce qui doit rester POSSIBLE (usages legitimes) ────────────────────── */
await doit('legitime : Alice met a jour son profil',
  ()=>assertSucceeds(setDoc(doc(a,'users',ALICE),{pseudo:'Alice',points:20,streak:3},{merge:true})));
await doit('legitime : avatar photo normal',
  ()=>assertSucceeds(setDoc(doc(a,'users',ALICE),{avatar:{type:'photo',v:'data:image/png;base64,AAAA'}},{merge:true})));
await doit('legitime : quelqu un confirme une boisson en rayon',
  ()=>assertSucceeds(updateDoc(doc(m,'stores','s1'),
      {drinks:arrayUnion(9),'confirmations.9':increment(1),'seenAt.9':Date.now()})));
await doit('legitime : le createur renomme SON magasin',
  ()=>assertSucceeds(updateDoc(doc(a,'stores','s1'),{name:'Night Ixelles bis'})));
await doit('legitime : import OSM cree un magasin (rayon probable, sans « verifie »)',
  ()=>assertSucceeds(setDoc(doc(m,'stores','sNouveau'),
      {name:'Carrefour Flagey',lat:50.8,lng:4.3,drinks:[1,2],osmImport:true})));
await doit('bloque : creer un magasin deja marque verifie',
  ()=>assertFails(setDoc(doc(m,'stores','sTriche'),
      {name:'Faux',lat:50.8,lng:4.3,drinks:[1],drinksVerified:[1]})));
await doit('legitime : un vote de decouverte (lot atomique comme dans l app)',
  ()=>{ const b=writeBatch(m);
        b.update(doc(m,'discoveries','d1'),{votes:increment(1)});
        b.set(doc(m,'discoveries','d1','votedBy',MALLORY),{votedAt:serverTimestamp()});
        return assertSucceeds(b.commit()); });
await doit('legitime : increment d une note communautaire',
  ()=>assertSucceeds(setDoc(doc(m,'stats','drinkRatings'),{'2':{n:1,s:4}},{merge:true})));
await doit('legitime : l admin efface une statistique',
  ()=>assertSucceeds(deleteDoc(doc(ad,'stats','drinkRatings'))));

/* ── ce qui doit etre BLOQUE (attaques) ────────────────────────────────── */
await doit('bloque : Mallory pose la pastille verte sur un magasin',
  ()=>assertFails(updateDoc(doc(m,'stores','s1'),{drinksVerified:arrayUnion(42)})));
await doit('bloque : Mallory se certifie elle-meme',
  ()=>assertFails(updateDoc(doc(m,'stores','s1'),{certified:true})));
await doit('bloque : Mallory s attribue un magasin',
  ()=>assertFails(updateDoc(doc(m,'stores','s1'),{owner:MALLORY})));
await doit('bloque : Mallory deplace le magasin d Alice',
  ()=>assertFails(updateDoc(doc(m,'stores','s1'),{lat:25.2,lng:55.3})));
await doit('bloque : un pseudo de 4000 caracteres',
  ()=>assertFails(setDoc(doc(a,'users',ALICE),{pseudo:'x'.repeat(4000)},{merge:true})));
await doit('bloque : des points en texte piege (XSS stocke)',
  ()=>assertFails(setDoc(doc(a,'users',ALICE),{points:'<img src=x onerror=alert(1)>'},{merge:true})));
await doit('bloque : un avatar avec un champ inconnu',
  ()=>assertFails(setDoc(doc(a,'users',ALICE),{avatar:{type:'photo',v:'x',onload:'alert(1)'}},{merge:true})));
await doit('bloque : 400 favoris publies',
  ()=>assertFails(setDoc(doc(a,'users',ALICE),{favs:Array(400).fill(1)},{merge:true})));
await doit('bloque : Mallory ecrit dans le profil d Alice',
  ()=>assertFails(setDoc(doc(m,'users',ALICE),{points:9999},{merge:true})));
await doit('bloque : Mallory efface ses penalites anti-triche',
  ()=>assertFails(setDoc(doc(m,'users',MALLORY),{penalty:0},{merge:true})));
await doit('bloque : votes:999 en une seule ecriture',
  ()=>assertFails(updateDoc(doc(m,'discoveries','d1'),{votes:999})));
await doit('bloque : deuxieme vote de la meme personne',
  ()=>{ const b=writeBatch(m);
        b.update(doc(m,'discoveries','d1'),{votes:increment(1)});
        b.set(doc(m,'discoveries','d1','votedBy',MALLORY),{votedAt:serverTimestamp()});
        return assertFails(b.commit()); });
await doit('bloque : vote sans passer par votedBy',
  ()=>assertFails(updateDoc(doc(m,'discoveries','d1'),{votes:increment(1)})));
await doit('bloque : foundIn de 500 magasins',
  ()=>assertFails(updateDoc(doc(m,'discoveries','d1'),{foundIn:Array(500).fill('s1')})));
await doit('bloque : un compte anonyme efface toutes les notes',
  ()=>assertFails(deleteDoc(doc(m,'stats','scanCounts'))));
await doit('bloque : lecture des signalements par un tiers',
  ()=>assertFails(getDoc(doc(m,'reports','r1'))));
await doit('bloque : signalement signe du nom d un autre',
  ()=>assertFails(addDoc(collection(m,'reports'),{by:ALICE,type:'rupture',storeId:'s1',drinkId:1})));
await doit('bloque : lecture de la presence par un tiers',
  ()=>assertFails(getDoc(doc(m,'presence',ALICE))));
await doit('bloque : ecriture dans le journal admin par un tiers',
  ()=>assertFails(addDoc(collection(m,'adminLog'),{par:MALLORY,action:'test'})));
await doit('bloque : lecture du journal admin',
  ()=>assertFails(getDoc(doc(m,'adminLog','x'))));
await doit('bloque : un anonyme sans compte ecrit un magasin',
  ()=>assertFails(updateDoc(doc(anon,'stores','s1'),{drinks:arrayUnion(5)})));
await doit('bloque : lecture des sauvegardes (_meta)',
  ()=>assertFails(getDoc(doc(m,'_meta','sauvegardes'))));
await doit('legitime : sous-collection privee d Alice',
  ()=>assertSucceeds(setDoc(doc(a,'users',ALICE,'prive','notes'),{x:1})));
await doit('bloque : Mallory lit la sous-collection privee d Alice',
  ()=>assertFails(getDoc(doc(m,'users',ALICE,'prive','notes'))));
await doit('bloque : profil recree sans penalite apres effacement',
  ()=>assertFails(setDoc(doc(m,'users',MALLORY),{pseudo:'M',penalty:0})));
/* ── chasses de zone et veilles (audit des Cloud Functions) ───────────── */
/* Reproduit fbJoinHunt / fbLeaveHunt A L'IDENTIQUE : updateDoc, pas setDoc.
   Avec setDoc, « seekers.uid » serait un nom de champ litteral et n'entrerait
   jamais dans la carte seekers — c'est le bug que ce banc d'essai a trouve. */
await doit('legitime : rejoindre une chasse',
  ()=>assertSucceeds(updateDoc(doc(m,'hunts','7'),
      {drinkName:'Ramune',emoji:'',['seekers.'+MALLORY]:{lat:50.8,lng:4.3,at:2}})));
await doit('verifie : le chercheur entre bien dans la carte seekers',
  async()=>{ const d=await getDoc(doc(a,'hunts','7'));
             const s=(d.data()||{}).seekers||{};
             if(!s[MALLORY]) throw new Error('seekers ne contient pas le chercheur');
             if(Object.prototype.hasOwnProperty.call(d.data(),'seekers.'+MALLORY))
               throw new Error('champ litteral pointe cree'); });
await doit('legitime : quitter une chasse',
  ()=>assertSucceeds(updateDoc(doc(m,'hunts','7'),{['seekers.'+MALLORY]:null})));
await doit('legitime : creer une chasse neuve sur une autre boisson',
  ()=>assertSucceeds(setDoc(doc(m,'hunts','99'),
      {drinkId:99,drinkName:'Milkis',seekers:{[MALLORY]:{lat:50.8,lng:4.3,at:1}}})));
await doit('bloque : inscrire un chercheur factice',
  ()=>assertFails(setDoc(doc(m,'hunts','123'),
      {drinkId:123,drinkName:'x',seekers:{faux:{lat:null,lng:null,at:1}}})));
await doit('bloque : document de chasse a identifiant libre',
  ()=>assertFails(setDoc(doc(m,'hunts','simtest_9'),
      {drinkId:5,drinkName:'x',seekers:{[MALLORY]:{lat:50.8,lng:4.3,at:1}}})));
await doit('bloque : eteindre les alertes d une boisson (_lastPush)',
  ()=>assertFails(updateDoc(doc(m,'hunts','7'),{_lastPush:Date.now()+1e12})));
await doit('bloque : retirer le chercheur d un autre',
  ()=>assertFails(updateDoc(doc(m,'hunts','7'),{['seekers.'+ALICE]:null})));

await doit('legitime : Alice cree sa veille',
  ()=>assertSucceeds(setDoc(doc(a,'watches',ALICE+'_424'),
      {uid:ALICE,drinkId:424,drinkName:'Ramune',lat:50.8,lng:4.3,radius:10})));
await doit('legitime : Alice regle le rayon de sa veille',
  ()=>assertSucceeds(setDoc(doc(a,'watches',ALICE+'_424'),{uid:ALICE,radius:20},{merge:true})));
await doit('bloque : veille a identifiant fantaisiste',
  ()=>assertFails(setDoc(doc(m,'watches','piege1'),{uid:MALLORY,drinkId:424242})));
await doit('bloque : repointer sa veille sur une victime',
  ()=>{ return setDoc(doc(m,'watches',MALLORY+'_777'),{uid:MALLORY,drinkId:777,drinkName:'x',lat:null,radius:20})
          .then(()=>assertFails(setDoc(doc(m,'watches',MALLORY+'_777'),{uid:ALICE},{merge:true}))); });
await doit('bloque : lire la veille d un autre',
  ()=>assertFails(getDoc(doc(m,'watches',ALICE+'_424'))));
await doit('bloque : lire le compteur global d IA',
  ()=>assertFails(getDoc(doc(m,'_meta','aiQuotaGlobal'))));

/* ── audit adverse complet : decouvertes, identite des magasins ───────── */
await doit('legitime : creer une decouverte par code-barre',
  ()=>assertSucceeds(setDoc(doc(m,'discoveries','4901234567894'),
      {name:'Ramune Original',brand:'Sangaria',votes:1,barcode:'4901234567894',
       by:MALLORY,byPseudo:'Pirate',cat:'soda'})));
await doit('legitime : proposition par photo (identifiant m+horodatage)',
  ()=>assertSucceeds(setDoc(doc(m,'discoveries','m1787946607178'),
      {name:'Milkis',brand:'',votes:1,barcode:'m1787946607178',by:MALLORY,
       hasPhoto:true,manualProposal:true})));
await doit('bloque : decouverte a identifiant piege (guillemet)',
  ()=>assertFails(setDoc(doc(m,'discoveries','x" onmouseover=alert(1) y="'),
      {name:'x',votes:1,barcode:'x',by:MALLORY})));
await doit('bloque : decouverte creee avec 999 votes',
  ()=>assertFails(setDoc(doc(m,'discoveries','4901234567895'),
      {name:'x',votes:999,barcode:'4901234567895',by:MALLORY})));
await doit('bloque : decouverte signee du nom d un autre',
  ()=>assertFails(setDoc(doc(m,'discoveries','4901234567896'),
      {name:'x',votes:1,barcode:'4901234567896',by:ALICE})));
await doit('bloque : decouverte avec un champ invente',
  ()=>assertFails(setDoc(doc(m,'discoveries','4901234567897'),
      {name:'x',votes:1,barcode:'4901234567897',by:MALLORY,adminNote:'coucou'})));
await doit('bloque : nom de decouverte de 500 caracteres',
  ()=>assertFails(setDoc(doc(m,'discoveries','4901234567898'),
      {name:'x'.repeat(500),votes:1,barcode:'4901234567898',by:MALLORY})));

await doit('bloque : s attribuer le magasin d un autre (addedBy)',
  ()=>assertFails(updateDoc(doc(m,'stores','s1'),{addedBy:MALLORY})));
await doit('bloque : deplacer un magasin par son geohash',
  ()=>assertFails(updateDoc(doc(m,'stores','s1'),{geohash:'u0000000000'})));
await doit('bloque : se placer dans la file de certification',
  ()=>assertFails(updateDoc(doc(m,'stores','s1'),{verifiedSource:'photos rayon (08/2026)'})));
await doit('legitime : import OSM ecrit sa source d origine',
  ()=>assertSucceeds(updateDoc(doc(m,'stores','s1'),{verifiedSource:'catalogue enseigne (auto)'})));

await doit('bloque : injecter des magasins dans foundIn (non-auteur)',
  ()=>assertFails(updateDoc(doc(m,'discoveries','d1'),{foundIn:['s1','s2']})));
await doit('legitime : l auteur dit ou il a vu sa decouverte',
  ()=>assertSucceeds(updateDoc(doc(a,'discoveries','d1'),{foundIn:['s1']})));
await doit('bloque : aspirer toutes les photos de decouvertes',
  ()=>assertFails(getDocs(collection(m,'discoveryPhotos'))));
await doit('legitime : lire UNE photo de decouverte',
  ()=>assertSucceeds(getDoc(doc(m,'discoveryPhotos','d1'))));
await doit('bloque : photo de decouverte signee d un autre',
  ()=>assertFails(setDoc(doc(m,'discoveryPhotos','d9'),{data:'x',by:ALICE})));
await doit('bloque : magasin invente au nom de 10000 caracteres',
  ()=>assertFails(setDoc(doc(m,'stores','sLong'),
      {name:'x'.repeat(10000),lat:50.8,lng:4.3})));
await doit('bloque : magasin sans coordonnees valides',
  ()=>assertFails(setDoc(doc(m,'stores','sHorsMonde'),
      {name:'Nulle part',lat:'50.8',lng:4.3})));
await doit('legitime : la communaute cree un night shop',
  ()=>assertSucceeds(setDoc(doc(m,'stores','sNight'),
      {name:'ARARAT Night Shop',lat:50.83,lng:4.36,drinks:[],
       confirmations:{},community:true,addedBy:MALLORY})));

await doit('bloque : s offrir une mise en avant payante',
  ()=>assertFails(updateDoc(doc(m,'stores','s1'),{partner:true})));
await doit('bloque : creer un magasin deja mis en avant',
  ()=>assertFails(setDoc(doc(m,'stores','sPub'),
      {name:'Pub',lat:50.8,lng:4.3,partner:true})));

await doit('bloque : se declarer administrateur',
  ()=>assertFails(setDoc(doc(m,'admins',MALLORY),{ok:true})));

R.forEach(r=>console.log(r[0],'|',r[1]));
console.log('\n'+(R.length-ko)+'/'+R.length+' conformes');
await env.cleanup();
process.exit(ko?1:0);
