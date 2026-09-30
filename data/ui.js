/* © 2026 Magofeed — Tous droits réservés / All rights reserved.
   Titulaire des droits (mention légale) : Ilias Benabdellah.
   Marqueur de propriété intellectuelle — ne pas retirer. */
/* ============================================================================
   BOÎTE À OUTILS D'INTERFACE — son, vibration, toast, rafraîchissement
   Séparé des traductions et de l'état : ce sont des utilitaires, appelés de
   partout, qui ne dépendent que du DOM.
   ============================================================================ */

/* ================================
   FIREBASE HELPER
================================ */
function renderStoreCount(n){
  // Refresh results si une boisson est sélectionnée
  if(curSel) renderStoreList();
}

/* ================================
   AUDIO
================================ */
var _ac=null;
function getAC(){if(!_ac&&window.AudioContext)_ac=new(window.AudioContext||window.webkitAudioContext)();return _ac;}
/* L'interrupteur du son etait INVERSE : quand le son etait actif, le bouton
   s'affichait a gauche (= eteint), et inversement. Il pilote maintenant la
   classe .sw partagee, comme tous les autres interrupteurs de l'app. */
function applySoundSwitch(){
  var t=document.getElementById("sound-toggle");
  if(t)t.classList.toggle("on",!!soundEnabled);
  // C'est la LIGNE qui porte le role de commutateur (cible tactile pleine
  // largeur) : c'est donc elle qui doit annoncer l'etat aux lecteurs d'ecran.
  var row=document.getElementById("sound-row");
  if(row)row.setAttribute("aria-checked",soundEnabled?"true":"false");
}
function toggleSound(){
  soundEnabled=!soundEnabled;
  localStorage.setItem("magosound",soundEnabled?"1":"0");
  applySoundSwitch();
  if(soundEnabled)setTimeout(function(){playSound("pop");},50);
}
function initSoundToggle(){ applySoundSwitch(); }
function haptic(type,arg){
  try{
    if(!navigator.vibrate)return;
    if(type==="win")navigator.vibrate([15,30,15]);
    else if(type==="can")navigator.vibrate([10,25,45]);
    else if(type==="verser")navigator.vibrate([10,70,10,70,14]);
    /* La vibration TRANSCRIT le son, elle ne l'invente pas : chaque secousse
       tombe sur un evenement reel de l'audio (la canette a 1,52 s, les feux a
       1,80 / 2,22 / 2,68 s). Un telephone ne sait pas vibrer « plus fort » :
       il vibre PLUS DE FOIS, parce qu'il se passe plus de choses. */
    else if(type==="niveau")navigator.vibrate(VIBRE_NIVEAU[arg|0]||VIBRE_NIVEAU[0]);
    else if(type==="gorgee")navigator.vibrate(VIBRE_GORGEE);
    else if(type==="err")navigator.vibrate(35);
    else navigator.vibrate(10);
  }catch(e){}
}
/* LE BRUIT BLANC, FABRIQUE UNE FOIS. Les sons a base de bruit (le pschitt de
   la canette, le versement) partaient d'un tampon tire au hasard a CHAQUE
   appel : a 48 kHz, 1,4 seconde de versement, cela fait 67 000 tirages et
   270 Ko alloues sur le fil principal, juste au moment ou une animation
   demarre. Le tampon est garde et rejoue en boucle. */
var _bruitBuf=null;
function bruitBlanc(ac,duree){
  var n=Math.max(1,Math.floor(ac.sampleRate*duree));
  if(_bruitBuf&&_bruitBuf.sampleRate===ac.sampleRate&&_bruitBuf.length>=n)return _bruitBuf;
  var b=ac.createBuffer(1,n,ac.sampleRate),d=b.getChannelData(0);
  for(var i=0;i<n;i++)d[i]=Math.random()*2-1;
  _bruitBuf=b;return b;
}
/* ════════════════════════════════════════════════════════════════════════════
   LA FETE GRANDIT AVEC LE NIVEAU
   ───────────────────────────────────────────────────────────────────────────
   Passer Curieux et passer Legende ne peuvent pas sonner pareil : on ne se
   souvient pas d'un sommet qui fait le meme bruit que le premier pas.

   CE QUI GRANDIT N'EST JAMAIS LE VOLUME. Une fete plus forte que le reste de
   l'app se fait couper le son une fois, puis pour toujours — et tout part avec,
   y compris le scanner. Ce qui grandit, c'est la hauteur ou le verre arrive, le
   nombre de bulles, la duree ou la boisson petille encore, et, seulement en haut
   de l'echelle, une fete qui s'ajoute APRES que le verre est plein. Les gains de
   chaque couche sont, a la virgule, ceux du versement d'origine.

   CRETES MESUREES hors ligne, mediane de 24 rendus (le bruit est tire au hasard,
   une seule mesure ne dit rien) : 0,262 / 0,264 / 0,267 / 0,296 / 0,338 / 0,381 /
   0,404. Strictement croissantes, et toutes sous la canette de l'app (0,512), qui
   reste le son le plus fort. Rien ne sature.
   ════════════════════════════════════════════════════════════════════════════ */
/* LE SON DE REMPLISSAGE, PARAMETRE. Meme code que sonVersement livre : jet,
   resonance qui glisse, glouglou, petillement. Les parametres ne font que
   deplacer des curseurs, aucune couche n'est ajoutee ni retiree. */
function sonRemplissage(ac,t,p,dest){
  dest=dest||ac.destination;
  var duree=p.duree,f0=p.f0,f1=p.f1,vol=(p.vol==null?1:p.vol);
  var buf=bruitBlanc(ac,1.2);
  function source(){var s=ac.createBufferSource();s.buffer=buf;s.loop=true;return s;}
  // 1. le jet
  var jet=source();
  var bp=ac.createBiquadFilter();bp.type="bandpass";bp.Q.value=0.8;
  bp.frequency.setValueAtTime(f1*0.78,t);
  bp.frequency.linearRampToValueAtTime(f1*1.48,t+duree);
  var jg=ac.createGain();
  jg.gain.setValueAtTime(0.0001,t);
  jg.gain.exponentialRampToValueAtTime(0.26*vol,t+Math.min(0.09,duree*0.22));
  jg.gain.setValueAtTime(0.26*vol,t+duree*0.78);
  jg.gain.exponentialRampToValueAtTime(0.0001,t+duree+0.18);
  jet.connect(bp);bp.connect(jg);jg.connect(dest);
  jet.start(t);jet.stop(t+duree+0.25);
  // 2. la resonance qui monte : le coeur du son. C'EST ELLE QUI GRANDIT.
  var res=source();
  var rp=ac.createBiquadFilter();rp.type="bandpass";rp.Q.value=9;
  rp.frequency.setValueAtTime(f0,t);
  rp.frequency.exponentialRampToValueAtTime(f1,t+duree);
  var rg=ac.createGain();
  rg.gain.setValueAtTime(0.0001,t);
  rg.gain.exponentialRampToValueAtTime(0.95*vol,t+Math.min(0.14,duree*0.35));
  rg.gain.setValueAtTime(0.95*vol,t+duree*0.85);
  rg.gain.exponentialRampToValueAtTime(0.0001,t+duree+0.12);
  res.connect(rp);rp.connect(rg);rg.connect(dest);
  res.start(t);res.stop(t+duree+0.2);
  // 3. le glouglou : des bulles dont la hauteur suit la montee
  var nb=p.bulles;
  for(var i=0;i<nb;i++){
    var pr=i/nb;
    var tb=t+0.06+pr*duree*0.94+(Math.random()-0.5)*0.03;
    var fb=f0*Math.pow(f1/f0,pr)*(0.90+Math.random()*0.28);
    var o=ac.createOscillator(),g=ac.createGain();
    o.type="sine";
    o.frequency.setValueAtTime(fb,tb);
    o.frequency.exponentialRampToValueAtTime(fb*1.45,tb+0.055);
    g.gain.setValueAtTime(0.0001,tb);
    g.gain.exponentialRampToValueAtTime(0.085*vol,tb+0.006);
    g.gain.exponentialRampToValueAtTime(0.0001,tb+0.07);
    o.connect(g);g.connect(dest);
    o.start(tb);o.stop(tb+0.09);
  }
  // 4. le petillement, qui reste apres que le jet s'arrete. SA QUEUE GRANDIT.
  var fz=source();
  var hp=ac.createBiquadFilter();hp.type="highpass";hp.frequency.value=4200;
  var fg=ac.createGain();
  fg.gain.setValueAtTime(0.0001,t);
  fg.gain.linearRampToValueAtTime(0.055*vol,t+duree*0.55);
  fg.gain.setValueAtTime(0.055*vol,t+duree);
  fg.gain.exponentialRampToValueAtTime(0.0001,t+duree+p.queue);
  fz.connect(hp);hp.connect(fg);fg.connect(dest);
  fz.start(t);fz.stop(t+duree+p.queue+0.05);
}

/* LE FEU D'ARTIFICE, EN SYNTHESE. Deux gestes, rien d'autre :
     1. LE COUP SOURD — une sinusoide qui descend vite, de 115 a 38 Hz en
        0,20 s, plus un souffle passe-bas. C'est GRAVE et c'est LONG : un
        bouchon, c'est court et AIGU. Aucune confusion possible, et la regle
        « aucun alcool » est tenue par la physique du son, pas par une promesse.
     2. LA SALVE DE CRAQUEMENTS — une vingtaine d'eclats tires au hasard sur
        0,55 s, dont l'amplitude decroit : ca part en gerbe et ca retombe.

   POURQUOI LA SALVE EST UN TAMPON, ET PAS VINGT PETITS NOEUDS. Ecrite
   naivement, chaque craquement coute trois noeuds audio (source, filtre,
   gain) : le bouquet de Legende en demandait 245 d'un coup, programmes sur le
   fil principal a la seconde meme ou les confettis partent. On fabrique donc
   la salve UNE FOIS dans un tampon, exactement comme data/ui.js le fait deja
   pour le bruit blanc, et chaque tir la rejoue a une vitesse de lecture
   legerement differente — d'ou une gerbe differente a chaque fois, pour trois
   noeuds au lieu de quarante-cinq. Le tampon n'est fabrique qu'au premier feu :
   les trois premiers niveaux ne le paient jamais. */
var _salveBuf=null;
function salveBuf(ac){
  if(_salveBuf&&_salveBuf.sampleRate===ac.sampleRate)return _salveBuf;
  var sr=ac.sampleRate,n=Math.floor(sr*0.62),b=ac.createBuffer(1,n,sr),d=b.getChannelData(0);
  for(var k=0;k<22;k++){
    var deb=Math.floor(Math.pow(Math.random(),0.7)*sr*0.55);
    var len=Math.floor(sr*(0.010+Math.random()*0.016));
    var amp=(0.55+Math.random()*0.45)*(1-0.60*(deb/(sr*0.60)));
    for(var i=0;i<len&&deb+i<n;i++)d[deb+i]+=(Math.random()*2-1)*amp*Math.pow(1-i/len,2.2);
  }
  var pk=0;for(var j=0;j<n;j++){var a=d[j]<0?-d[j]:d[j];if(a>pk)pk=a;}
  if(pk>0)for(var q=0;q<n;q++)d[q]/=pk; // crete du tampon = 1 : le gain seul decide du volume
  _salveBuf=b;return b;
}
/* `force` va de 0,70 (premier tir, a Expert) a 1,00 (bouquet final, Legende). */
function feuFestif(ac,t,force,dest){
  dest=dest||ac.destination;
  // 1a. le coup sourd
  var o=ac.createOscillator(),g=ac.createGain();
  o.type="sine";
  o.frequency.setValueAtTime(115,t);
  o.frequency.exponentialRampToValueAtTime(38,t+0.20);
  g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(0.26*force,t+0.014);
  g.gain.exponentialRampToValueAtTime(0.0001,t+0.40);
  o.connect(g);g.connect(dest);o.start(t);o.stop(t+0.42);
  // 1b. le souffle du coup
  var so=ac.createBufferSource();so.buffer=bruitBlanc(ac,1.2);so.loop=true;
  var lp=ac.createBiquadFilter();lp.type="lowpass";lp.frequency.setValueAtTime(1100,t);
  lp.frequency.exponentialRampToValueAtTime(240,t+0.22);
  var sg=ac.createGain();
  sg.gain.setValueAtTime(0.0001,t);
  sg.gain.exponentialRampToValueAtTime(0.16*force,t+0.010);
  sg.gain.exponentialRampToValueAtTime(0.0001,t+0.26);
  so.connect(lp);lp.connect(sg);sg.connect(dest);so.start(t);so.stop(t+0.30);
  // 2. la salve, rejouee a une vitesse tiree au hasard : jamais deux fois la meme gerbe
  var cs=ac.createBufferSource();cs.buffer=salveBuf(ac);
  cs.playbackRate.value=0.86+Math.random()*0.30;
  var cb=ac.createBiquadFilter();cb.type="bandpass";cb.Q.value=0.9;cb.frequency.value=3400;
  var cg=ac.createGain();cg.gain.setValueAtTime(0.40*force,t+0.045);
  cs.connect(cb);cb.connect(cg);cg.connect(dest);
  cs.start(t+0.045);cs.stop(t+0.80);
}

/* LA PLUIE D'ETINCELLES — seulement a Legende. Ce qui retombe apres le
   bouquet. Deux traits, et AUCUN nouveau tampon : le souffle est le bruit
   blanc deja en cache avec une enveloppe qui s'eteint, et les eclats rares
   sont la SALVE DU FEU relue trois fois moins vite — 0,62 s etiree a 1,5 s,
   donc des craquements espaces au lieu d'une gerbe, pour zero calcul de plus.
   Tres bas en volume : c'est une trainee, pas un son. */
function pluieEtincelles(ac,t,dest){
  dest=dest||ac.destination;
  var s=ac.createBufferSource();s.buffer=bruitBlanc(ac,1.2);s.loop=true;
  var hp=ac.createBiquadFilter();hp.type="highpass";hp.frequency.value=5200;
  var g=ac.createGain();
  g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(0.034,t+0.06);
  g.gain.exponentialRampToValueAtTime(0.0001,t+1.40);
  s.connect(hp);hp.connect(g);g.connect(dest);s.start(t);s.stop(t+1.45);
  var e=ac.createBufferSource();e.buffer=salveBuf(ac);e.playbackRate.value=0.42;
  var eh=ac.createBiquadFilter();eh.type="highpass";eh.frequency.value=3000;
  var eg=ac.createGain();
  eg.gain.setValueAtTime(0.085,t);
  eg.gain.linearRampToValueAtTime(0.028,t+1.40);
  e.connect(eh);eh.connect(eg);eg.connect(dest);e.start(t);e.stop(t+1.48);
}

/* LA CANETTE QU'ON OUVRE — le vocabulaire deja en place dans l'app
   (playSound("can")), rejoue ici a 0,62 de son volume pour qu'elle ponctue la
   derniere goutte sans passer devant le versement. */
function canetteDouce(ac,t,vol,dest){
  dest=dest||ac.destination;
  /* CORRIGE : la version d'origine refabriquait ici un tampon de bruit tire au
     hasard a CHAQUE appel — 22 000 tirages sur le fil principal, au moment
     precis ou la fete demarre. On reprend le bruit blanc deja en cache et on
     lui pose la meme enveloppe en decroissance carree, avec un gain. */
  var _d=0.5;
  var _src=ac.createBufferSource();_src.buffer=bruitBlanc(ac,1.2);_src.loop=true;
  var _hp=ac.createBiquadFilter();_hp.type="highpass";_hp.frequency.value=850;
  var _gn=ac.createGain();_gn.gain.setValueAtTime(.30*vol,t);_gn.gain.exponentialRampToValueAtTime(.001,t+_d);
  _src.connect(_hp);_hp.connect(_gn);_gn.connect(dest);_src.start(t);_src.stop(t+_d);
  var _o=ac.createOscillator(),_g=ac.createGain();_o.connect(_g);_g.connect(dest);
  _o.frequency.setValueAtTime(430,t);_o.frequency.exponentialRampToValueAtTime(170,t+.1);
  _g.gain.setValueAtTime(.22*vol,t);_g.gain.exponentialRampToValueAtTime(.001,t+.13);_o.start(t);_o.stop(t+.13);
}

/* ============================================================================
   LA TABLE DES SEPT PALIERS. Un index = un niveau de LEVELS.
   duree : toujours 1,5 s — collee a l'animation du verre.
   f1    : la hauteur d'arrivee. LE curseur principal.
   ============================================================================ */
var LEVEL_SON=[
/* 0 Curieux           */ {f0:330,f1:900, bulles:12,queue:0.55,canette:0,   tirs:0,etincelles:0},
/* 1 Explorateur       */ {f0:330,f1:980, bulles:14,queue:0.70,canette:0,   tirs:0,etincelles:0},
/* 2 Chasseur          */ {f0:335,f1:1060,bulles:16,queue:0.85,canette:0,   tirs:0,etincelles:0},
/* 3 Connaisseur       */ {f0:340,f1:1150,bulles:17,queue:1.00,canette:0.52,tirs:0,etincelles:0},
/* 4 Expert            */ {f0:340,f1:1250,bulles:18,queue:1.15,canette:0.60,tirs:1,etincelles:0},
/* 5 Maitre des rayons */ {f0:345,f1:1360,bulles:19,queue:1.30,canette:0.68,tirs:2,etincelles:0},
/* 6 Legende           */ {f0:350,f1:1500,bulles:21,queue:1.50,canette:0.75,tirs:3,etincelles:1}
];
var FORCE_TIR=[0.70,0.85,1.00]; // le bouquet monte tir par tir

/* LE SON D'UN PASSAGE DE NIVEAU. Un seul point d'entree.

   TOUT PASSE PAR UN SEUL ROBINET. La fete est programmee a l'avance dans le
   contexte audio : si la personne appuie sur « Continuer » au bout de deux
   secondes, les feux d'artifice continuent de partir sur une carte deja
   fermee. On branche donc les quatre briques sur UN gain commun, et la
   fonction rend de quoi le refermer. Fermer la carte fait descendre la fete en
   0,12 s — une descente, pas une coupure : couper net un son en cours fait un
   « clac » audible (la forme d'onde saute a zero).

   TIMES-CODES, pour que la vibration et l'image se calent dessus :
     0,00 s  le versement commence      (l'animation du verre dure 1,5 s)
     1,52 s  la canette, sur la derniere goutte   (niveaux 3 et plus)
     1,80 s  premier feu                          (niveaux 4 et plus)
     2,22 s  deuxieme feu                         (niveaux 5 et plus)
     2,68 s  troisieme feu                        (Legende)
     3,08 s  la pluie d'etincelles                (Legende) */
function sonPalierNiveau(ac,t,idx,dest){
  var p=LEVEL_SON[idx]||LEVEL_SON[LEVEL_SON.length-1];
  var duree=1.5;
  var sortie=ac.createGain();sortie.gain.value=1;sortie.connect(dest||ac.destination);
  sonRemplissage(ac,t,{duree:duree,f0:p.f0,f1:p.f1,bulles:p.bulles,queue:p.queue,vol:1},sortie);
  if(p.canette)canetteDouce(ac,t+duree+0.02,p.canette,sortie);
  var tf=t+duree+0.30;
  for(var i=0;i<p.tirs;i++){
    feuFestif(ac,tf,FORCE_TIR[i]||1,sortie);
    tf+=0.42+i*0.04;
  }
  if(p.etincelles)pluieEtincelles(ac,t+duree+0.30+1.28,sortie);
  return function(){try{
    var n=ac.currentTime;
    sortie.gain.cancelScheduledValues(n);
    sortie.gain.setValueAtTime(sortie.gain.value,n);
    sortie.gain.linearRampToValueAtTime(0.0001,n+0.12);
  }catch(e){}};
}

/* ============================================================================
   LE SON DES PALIERS INTERMEDIAIRES (25 / 50 / 75 %) — « UNE GORGEE ».
   On l'entend TROIS FOIS par niveau : il doit etre le plus petit son de la
   famille. C'est litteralement le meme code, avec les curseurs au minimum :
   0,34 s au lieu de 1,5 s, une montee courte (520 -> 760 Hz), 3 bulles, une
   queue de 0,30 s, et le volume general a 0,45. Pas de canette, pas de feu.
   Resultat : on reconnait « ca se remplit » en un tiers de seconde, et c'est
   plus discret que le « pop » d'un bouton.
   ============================================================================ */
function sonGorgee(ac,t,idx,dest){
  /* LA GORGEE SUIT LE NIVEAU, elle aussi : sa hauteur est calee sur celle du
     palier en cours (45 % a 70 % de la hauteur d'arrivee du niveau). A Curieux
     elle chuchote a 405-630 Hz, a Legende a 675-1050 Hz. Meme petit son, mais
     dans le registre du niveau ou l'on se trouve : la progression s'entend
     meme dans les trois paliers intermediaires. */
  var p=LEVEL_SON[idx]||LEVEL_SON[0];
  sonRemplissage(ac,t,{duree:0.34,f0:p.f1*0.45,f1:p.f1*0.70,bulles:3,queue:0.30,vol:0.45},dest);
}

/* ============================================================================
   LA VIBRATION SUIT LE SON — pas une invention, une transcription.
   Chaque secousse tombe sur un evenement reel de l'audio, aux temps donnes
   plus haut. On ne vibre pas « plus fort » (le telephone ne sait pas faire) :
   on vibre PLUS DE FOIS, parce qu'il se passe plus de choses.
   Lecture d'une ligne : [actif, pause, actif, pause, ...] en millisecondes.
   Les trois premiers niveaux gardent la vibration du versement livree
   aujourd'hui ([10,70,10,70,14]) ; seule la derniere secousse s'allonge.
   ============================================================================ */
var VIBRE_NIVEAU=[
/* 0 Curieux     */ [10,70,10,70,14],
/* 1 Explorateur */ [10,70,10,70,18],
/* 2 Chasseur    */ [10,70,10,70,22],
/* 3 Connaisseur */ [10,70,10,70,14, 1346,22],                              // + la canette a 1,52 s
/* 4 Expert      */ [10,70,10,70,14, 1346,22, 258,30],                      // + un feu a 1,80 s
/* 5 Maitre      */ [10,70,10,70,14, 1346,22, 258,30, 390,38],              // + un feu a 2,22 s
/* 6 Legende     */ [10,70,10,70,14, 1346,22, 258,30, 390,38, 430,46]       // + le bouquet a 2,68 s
];
/* La gorgee : une seule pichenette, plus courte que le « pop » d'un bouton. */
var VIBRE_GORGEE=[8,40,10];

/* playSound prend desormais un SECOND argument, facultatif : le niveau, pour
   les deux sons qui en dependent. Les 165 appels existants n'en passent qu'un
   et ne changent pas d'un caractere. « niveau » rend une fonction d'arret :
   fermer la carte de fete fait DESCENDRE le son en 0,12 s au lieu de le couper
   net — couper net une forme d'onde en cours fait un « clac » audible. */
function playSound(type,arg){
  haptic(type,arg);
  if(!soundEnabled)return;
  try{
    var ac=getAC();if(!ac)return;
    /* iOS suspend le contexte audio tant qu'aucun geste ne l'a reveille. On
       demande le reveil et on programme quand meme : resume() est asynchrone,
       renoncer ici au motif que l'etat vaut encore "suspended" ferait taire le
       premier son de chaque session, celui-la meme qui suit le geste. */
    if(ac.state==="suspended"&&ac.resume){try{ac.resume();}catch(eR){}}
    var o=ac.createOscillator(),g=ac.createGain();
    o.connect(g);g.connect(ac.destination);
    var t=ac.currentTime;
    if(type==="pop"){o.frequency.setValueAtTime(600,t);o.frequency.exponentialRampToValueAtTime(300,t+.1);g.gain.setValueAtTime(.3,t);g.gain.exponentialRampToValueAtTime(.001,t+.15);o.start(t);o.stop(t+.15);}
    else if(type==="win"){[523,659,784].forEach(function(f,i){var o2=ac.createOscillator(),g2=ac.createGain();o2.connect(g2);g2.connect(ac.destination);o2.frequency.value=f;g2.gain.setValueAtTime(.2,t+i*.1);g2.gain.exponentialRampToValueAtTime(.001,t+i*.1+.15);o2.start(t+i*.1);o2.stop(t+i*.1+.15);});}
    else if(type==="beep"){o.frequency.setValueAtTime(1000,t);g.gain.setValueAtTime(.2,t);g.gain.exponentialRampToValueAtTime(.001,t+.08);o.start(t);o.stop(t+.08);}
    else if(type==="err"){o.frequency.setValueAtTime(200,t);g.gain.setValueAtTime(.2,t);g.gain.exponentialRampToValueAtTime(.001,t+.2);o.start(t);o.stop(t+.2);}
    else if(type==="can"){
      // Ouverture de canette : petit "pop" + pschitt (bruit filtre qui decroit).
      var _d=0.5,_buf=ac.createBuffer(1,Math.max(1,Math.floor(ac.sampleRate*_d)),ac.sampleRate),_dat=_buf.getChannelData(0);
      for(var _i=0;_i<_dat.length;_i++){var _tt=_i/_dat.length;_dat[_i]=(Math.random()*2-1)*Math.pow(1-_tt,2);}
      var _src=ac.createBufferSource();_src.buffer=_buf;
      var _hp=ac.createBiquadFilter();_hp.type="highpass";_hp.frequency.value=850;
      var _gn=ac.createGain();_gn.gain.setValueAtTime(.3,t);_gn.gain.exponentialRampToValueAtTime(.001,t+_d);
      _src.connect(_hp);_hp.connect(_gn);_gn.connect(ac.destination);_src.start(t);_src.stop(t+_d);
      var _o=ac.createOscillator(),_g=ac.createGain();_o.connect(_g);_g.connect(ac.destination);
      _o.frequency.setValueAtTime(430,t);_o.frequency.exponentialRampToValueAtTime(170,t+.1);
      _g.gain.setValueAtTime(.22,t);_g.gain.exponentialRampToValueAtTime(.001,t+.13);_o.start(t);_o.stop(t+.13);
    }
    else if(type==="verser"){ sonRemplissage(ac,t,{duree:1.5,f0:340,f1:1150,bulles:15,queue:0.90,vol:1}); }
    else if(type==="niveau"){ return sonPalierNiveau(ac,t,arg|0); }
    else if(type==="gorgee"){ sonGorgee(ac,t,arg|0); }
  }catch(e){}
}

/* ================================
   TOAST
================================ */
function toast(msg){
  var t=document.getElementById("toast");
  /* La traduction se fait ICI, et pas aux 165 endroits qui appellent toast().
     Le texte francais sert de cle : voir data/textes.js. */
  t.textContent=(typeof tr==="function")?tr(msg):msg;
  t.classList.add("show");
  setTimeout(function(){t.classList.remove("show");},2500);
}

