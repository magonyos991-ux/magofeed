/* Reproduit, sur l'emulateur, la sequence EXACTE du tout premier message :
   creation de la conversation, envoi en lot, puis LA LECTURE que l'ecouteur
   du fil effectue. C'est cette derniere qui est soupconnee. */
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, query, orderBy, limit,
         writeBatch, serverTimestamp, increment, Timestamp } from 'firebase/firestore';
import fs from 'fs';

const env = await initializeTestEnvironment({
  projectId: 'magofeed-premier',
  firestore: { rules: fs.readFileSync('firestore.rules','utf8'), host:'127.0.0.1', port:8391 },
});
await env.clearFirestore();

const A='alice', B='bob';
const ctxA = env.authenticatedContext(A), ctxB = env.authenticatedContext(B);
const da = ctxA.firestore(), db2 = ctxB.firestore();
const cid = [A,B].sort().join('_');

const etape = async (nom, fn) => {
  try { await fn(); console.log('  ok   | '+nom); return true; }
  catch (e) { console.log('  ECHEC| '+nom+'  ->  '+String(e.code||e.message).slice(0,90)); return false; }
};

console.log('--- 1. Alice ouvre le fil AVANT tout envoi (aucune conversation) ---');
await etape('Alice lit les messages d un fil inexistant (ce que fait l ecouteur)',
  ()=>getDocs(query(collection(da,'conversations',cid,'messages'), orderBy('at','desc'), limit(60))));

console.log('\n--- 2. fbOuvrirConversation : creation ---');
const unread={}; unread[A]=0; unread[B]=0;
await etape('Alice cree la conversation', ()=>setDoc(doc(da,'conversations',cid),{
  members:[A,B].sort(), createdBy:A, createdAt:serverTimestamp(), state:'request',
  requestBy:A, reqCount:0, lastAt:serverTimestamp(), unread}));

console.log('\n--- 3. l ecouteur se branche juste apres la creation ---');
await etape('Alice lit les messages (fil cree, aucun message)',
  ()=>getDocs(query(collection(da,'conversations',cid,'messages'), orderBy('at','desc'), limit(60))));

console.log('\n--- 4. le lot d envoi (apres les 700 ms de rythme) ---');
await new Promise(r=>setTimeout(r,800));
await etape('Alice envoie son premier message', ()=>{
  const b=writeBatch(da);
  b.set(doc(collection(da,'conversations',cid,'messages')),
        {by:A, at:serverTimestamp(), type:'text', text:'Coucou'});
  b.update(doc(da,'conversations',cid),{lastAt:serverTimestamp(),
    lastMsg:{by:A,type:'text',text:'Coucou',at:serverTimestamp()},
    ['unread.'+B]:increment(1), reqCount:1});
  return b.commit();
});

console.log('\n--- 5. LA LECTURE DE L ECOUTEUR, apres envoi ---');
await etape('Alice relit les messages', ()=>getDocs(query(collection(da,'conversations',cid,'messages'), orderBy('at','desc'), limit(60))));
await etape('Bob lit les messages (destinataire)', ()=>getDocs(query(collection(db2,'conversations',cid,'messages'), orderBy('at','desc'), limit(60))));
await etape('Bob lit la conversation', ()=>getDoc(doc(db2,'conversations',cid)));

await env.cleanup();
