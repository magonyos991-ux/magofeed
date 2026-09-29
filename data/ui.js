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
function haptic(type){
  try{
    if(!navigator.vibrate)return;
    if(type==="win")navigator.vibrate([15,30,15]);
    else if(type==="can")navigator.vibrate([10,25,45]);
    else if(type==="verser")navigator.vibrate([10,70,10,70,14]);
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
/* LE VERSEMENT — synthese pure, aucun fichier audio, donc aucun telechargement
   et aucune question de droits.

   CE QUI REND UN VERSEMENT RECONNAISSABLE A L'OREILLE, ce n'est pas le bruit du
   jet : c'est que la RESONANCE MONTE. Le verre est un tube ferme par le
   liquide ; a mesure qu'il se remplit, la colonne d'air raccourcit, donc la
   note monte. C'est ce glissement, et lui seul, qui fait entendre « ca se
   remplit » plutot que « ca coule ». Quatre couches :
     1. le jet          bruit passe-bande large, attaque quand il touche le fond
     2. la resonance    bruit passe-bande etroit (Q=9) qui GLISSE de 340 a 1150 Hz
     3. le glouglou     des blips sinus dont la hauteur suit la meme montee
     4. le petillement  bruit passe-haut qui survit a la fin du versement
   Les volumes sont cales sur ceux des autres sons de l'app (crete ~0,3, la
   canette monte a 0,52) : une fete deux fois plus forte que le reste de
   l'application se fait couper le son une fois, puis pour toujours. */
function sonVersement(ac,t,duree){
  var f0=340,f1=1150;
  var buf=bruitBlanc(ac,1.2);
  function source(){var s=ac.createBufferSource();s.buffer=buf;s.loop=true;return s;}
  // 1. le jet
  var jet=source();
  var bp=ac.createBiquadFilter();bp.type="bandpass";bp.Q.value=0.8;
  bp.frequency.setValueAtTime(900,t);
  bp.frequency.linearRampToValueAtTime(1700,t+duree);
  var jg=ac.createGain();
  jg.gain.setValueAtTime(0.0001,t);
  jg.gain.exponentialRampToValueAtTime(0.26,t+0.09);
  jg.gain.setValueAtTime(0.26,t+duree*0.78);
  jg.gain.exponentialRampToValueAtTime(0.0001,t+duree+0.18);
  jet.connect(bp);bp.connect(jg);jg.connect(ac.destination);
  jet.start(t);jet.stop(t+duree+0.25);
  // 2. la resonance qui monte : le coeur du son
  var res=source();
  var rp=ac.createBiquadFilter();rp.type="bandpass";rp.Q.value=9;
  rp.frequency.setValueAtTime(f0,t);
  rp.frequency.exponentialRampToValueAtTime(f1,t+duree);
  var rg=ac.createGain();
  rg.gain.setValueAtTime(0.0001,t);
  rg.gain.exponentialRampToValueAtTime(0.95,t+0.14);
  rg.gain.setValueAtTime(0.95,t+duree*0.85);
  rg.gain.exponentialRampToValueAtTime(0.0001,t+duree+0.12);
  res.connect(rp);rp.connect(rg);rg.connect(ac.destination);
  res.start(t);res.stop(t+duree+0.2);
  // 3. le glouglou : des bulles dont la hauteur suit la montee
  var nb=Math.round(duree*10);
  for(var i=0;i<nb;i++){
    var pr=i/nb;
    var tb=t+0.06+pr*duree*0.94+(Math.random()-0.5)*0.03;
    var fb=f0*Math.pow(f1/f0,pr)*(0.90+Math.random()*0.28);
    var o=ac.createOscillator(),g=ac.createGain();
    o.type="sine";
    o.frequency.setValueAtTime(fb,tb);
    o.frequency.exponentialRampToValueAtTime(fb*1.45,tb+0.055);
    g.gain.setValueAtTime(0.0001,tb);
    g.gain.exponentialRampToValueAtTime(0.085,tb+0.006);
    g.gain.exponentialRampToValueAtTime(0.0001,tb+0.07);
    o.connect(g);g.connect(ac.destination);
    o.start(tb);o.stop(tb+0.09);
  }
  // 4. le petillement, qui reste apres que le jet s'arrete
  var fz=source();
  var hp=ac.createBiquadFilter();hp.type="highpass";hp.frequency.value=4200;
  var fg=ac.createGain();
  fg.gain.setValueAtTime(0.0001,t);
  fg.gain.linearRampToValueAtTime(0.055,t+duree*0.55);
  fg.gain.setValueAtTime(0.055,t+duree);
  fg.gain.exponentialRampToValueAtTime(0.0001,t+duree+0.9);
  fz.connect(hp);hp.connect(fg);fg.connect(ac.destination);
  fz.start(t);fz.stop(t+duree+0.95);
}
function playSound(type){
  haptic(type);
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
    else if(type==="verser"){ sonVersement(ac,t,1.5); }
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

