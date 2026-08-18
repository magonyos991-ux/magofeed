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
    else if(type==="err")navigator.vibrate(35);
    else navigator.vibrate(10);
  }catch(e){}
}
function playSound(type){
  haptic(type);
  if(!soundEnabled)return;
  try{
    var ac=getAC();if(!ac)return;
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
  }catch(e){}
}

/* ================================
   TOAST
================================ */
function toast(msg){
  var t=document.getElementById("toast");
  t.textContent=msg;t.classList.add("show");
  setTimeout(function(){t.classList.remove("show");},2500);
}

