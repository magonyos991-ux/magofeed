/* Magofeed — bande-son générée (Web Audio API), sans fichier externe.
   Version "chaude" : nappe douce + mélodie boîte-à-musique (sinus) + basse ronde
   + pings radar discrets au changement de scène + carillon final.
   Progression : F#m – D – A – E – D – A (vi–IV–I–V–IV–I en La majeur).
   Chaîne master : gain -> passe-bas 7 kHz -> compresseur ; envoi réverb ample. */
(function(){
  var AC = window.AudioContext || window.webkitAudioContext;
  if(!AC){ return; }
  var ctx, master, tone, comp, revGain, started=false, muted=false, loopTimer=null;

  var CHORDS = [
    {bass:92.50,  notes:[185.00,220.00,277.18], top:369.99}, // F#m
    {bass:73.42,  notes:[146.83,185.00,220.00], top:293.66}, // D
    {bass:110.00, notes:[220.00,277.18,329.63], top:440.00}, // A
    {bass:82.41,  notes:[164.81,207.65,246.94], top:329.63}, // E
    {bass:73.42,  notes:[146.83,185.00,220.00], top:293.66}, // D
    {bass:110.00, notes:[220.00,277.18,329.63], top:440.00}  // A
  ];

  function boundaries(){
    if(window.MagoFeedVideo && window.MagoFeedVideo.scenes){
      return window.MagoFeedVideo.scenes.map(function(s){ return s.dur; });
    }
    if(window.__MAGO_BUMPER__){ return [2170,2520,2310]; }
    return [3400,3200,4800,4000,4400,4600];
  }

  // réverb : impulsion douce et longue (3 s) pour de l'espace, pas du métal
  function makeReverb(){
    var len=Math.floor(ctx.sampleRate*3.0), buf=ctx.createBuffer(2,len,ctx.sampleRate);
    for(var c=0;c<2;c++){ var d=buf.getChannelData(c);
      for(var i=0;i<len;i++){ d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.4); } }
    var cv=ctx.createConvolver(); cv.buffer=buf; return cv;
  }

  // note "boîte à musique" : sinus + partiel d'octave, longue décroissance, bien réverbérée
  function bell(t,freq,gain,pan,dec){
    dec=dec||0.9;
    var o=ctx.createOscillator();  o.type='sine'; o.frequency.value=freq;
    var o2=ctx.createOscillator(); o2.type='sine'; o2.frequency.value=freq*2;
    var g=ctx.createGain(), g2=ctx.createGain();
    g.gain.setValueAtTime(0.0001,t);  g.gain.exponentialRampToValueAtTime(gain,t+0.008);  g.gain.exponentialRampToValueAtTime(0.0001,t+dec);
    g2.gain.setValueAtTime(0.0001,t); g2.gain.exponentialRampToValueAtTime(gain*0.28,t+0.006); g2.gain.exponentialRampToValueAtTime(0.0001,t+dec*0.6);
    var p=ctx.createStereoPanner?ctx.createStereoPanner():null;
    o.connect(g); o2.connect(g2);
    if(p){ p.pan.value=pan||0; g.connect(p); g2.connect(p); p.connect(tone); } else { g.connect(tone); g2.connect(tone); }
    g.connect(revGain); g2.connect(revGain);
    o.start(t); o2.start(t); o.stop(t+dec+0.05); o2.stop(t+dec+0.05);
  }

  // nappe : deux triangles légèrement désaccordés, filtrés, attaque lente
  function padChord(t,dur,chord){
    var lp=ctx.createBiquadFilter(); lp.type='lowpass';
    lp.frequency.setValueAtTime(480,t);
    lp.frequency.linearRampToValueAtTime(1150,t+dur*0.5);
    lp.frequency.linearRampToValueAtTime(560,t+dur);
    var g=ctx.createGain();
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(0.085,t+0.7);
    g.gain.setValueAtTime(0.085,Math.max(t+0.7,t+dur-0.7));
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    chord.notes.concat([chord.top]).forEach(function(f){ [-4,4].forEach(function(det){
      var o=ctx.createOscillator(); o.type='triangle'; o.frequency.value=f; o.detune.value=det;
      o.connect(lp); o.start(t); o.stop(t+dur+0.1);
    }); });
    lp.connect(g); g.connect(tone); g.connect(revGain);
  }

  // basse ronde : sinus + partiel, ré-articulée à la blanche pointée (douce)
  function bassLine(t,dur,freq){
    for(var tt=t; tt<t+dur-0.05; tt+=1.2){
      var o=ctx.createOscillator();  o.type='sine';     o.frequency.value=freq;
      var o2=ctx.createOscillator(); o2.type='triangle'; o2.frequency.value=freq; o2.detune.value=-6;
      var g=ctx.createGain();
      g.gain.setValueAtTime(0.0001,tt); g.gain.exponentialRampToValueAtTime(0.14,tt+0.03); g.gain.exponentialRampToValueAtTime(0.0001,tt+1.15);
      o.connect(g); o2.connect(g); g.connect(tone);
      o.start(tt); o2.start(tt); o.stop(tt+1.2); o2.stop(tt+1.2);
    }
  }

  // ping radar : très discret, au changement de scène
  function ping(t,freq){
    var o=ctx.createOscillator(); o.type='sine';
    o.frequency.setValueAtTime(freq,t);
    o.frequency.exponentialRampToValueAtTime(freq*1.34,t+0.16);
    var g=ctx.createGain();
    g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.05,t+0.01); g.gain.exponentialRampToValueAtTime(0.0001,t+0.5);
    o.connect(g); g.connect(revGain); g.connect(tone);
    o.start(t); o.stop(t+0.55);
  }

  function schedulePass(startAt){
    var b=boundaries(), cum=[], acc=0;
    for(var i=0;i<b.length;i++){ cum.push(acc); acc+=b[i]/1000; }
    var total=acc;
    for(var s=0;s<b.length;s++){
      var chord=CHORDS[s%CHORDS.length], st=startAt+cum[s], du=b[s]/1000;
      padChord(st,du,chord); bassLine(st,du,chord.bass); ping(st,chord.notes[1]*2);
      if(s===b.length-1){ // carillon final (CTA)
        [chord.notes[0]*2,chord.notes[2]*2,chord.top*2].forEach(function(f,i){ bell(st+0.2+i*0.16,f,0.11,0,1.8); });
      }
    }
    // mélodie boîte-à-musique : contour doux, une note ~toutes les 0.5 s, octave haute
    var pat=[0,2,3,2,1,3,2,0], k=0, swing=0;
    for(var tt=0; tt<total-0.1; tt+= (swing?0.42:0.5), swing=1-swing){
      var sc=0; for(var j=0;j<cum.length;j++){ if(tt>=cum[j]) sc=j; }
      var ch=CHORDS[sc%CHORDS.length], pool=ch.notes.concat([ch.top]);
      if(k%8===6){ k++; continue; }                 // respiration
      var f=pool[pat[k%pat.length]]*2;               // octave au-dessus (boîte à musique)
      if(k%8===3) f*=2;                              // éclat ponctuel
      var vel=0.075*(0.85+0.15*((k%3)===0?1:0.6));   // légère dynamique
      bell(startAt+tt, f, vel, (k%2?0.22:-0.22), 0.95);
      k++;
    }
    return total;
  }

  function loop(){
    var total=schedulePass(ctx.currentTime+0.06);
    loopTimer=setTimeout(function(){
      if(window.MagoFeedVideo && window.MagoFeedVideo.restart){ try{ window.MagoFeedVideo.restart(); }catch(e){} }
      loop();
    }, total*1000);
  }

  function updateBtn(){
    mbtn.innerHTML = muted
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f5f2ec" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m17 9 4 6M21 9l-4 6"/></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f5f2ec" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a9 9 0 0 1 0 12"/></svg>';
  }
  function setMute(m){ muted=m; if(master){ master.gain.linearRampToValueAtTime(m?0.0001:0.8, ctx.currentTime+0.2); } updateBtn(); }

  function startAudio(){
    if(started){ return; } started=true;
    ctx=new AC(); if(ctx.resume){ ctx.resume(); }
    master=ctx.createGain(); master.gain.value=0.0001;
    tone=ctx.createBiquadFilter(); tone.type='lowpass'; tone.frequency.value=7000; tone.Q.value=0.6;
    comp=ctx.createDynamicsCompressor(); comp.threshold.value=-16; comp.ratio.value=3;
    tone.connect(master); master.connect(comp); comp.connect(ctx.destination);
    var rev=makeReverb(); revGain=ctx.createGain(); revGain.gain.value=0.42;
    revGain.connect(rev); rev.connect(master);
    master.gain.exponentialRampToValueAtTime(0.8, ctx.currentTime+1.0);
    if(window.MagoFeedVideo && window.MagoFeedVideo.restart){ try{ window.MagoFeedVideo.restart(); }catch(e){} }
    loop();
    mbtn.style.display='grid'; updateBtn();
  }

  var stage=document.querySelector('.stage')||document.body;

  var overlay=document.createElement('button');
  overlay.type='button';
  overlay.setAttribute('aria-label','Activer le son et lire la vidéo');
  overlay.style.cssText='position:absolute;inset:0;z-index:80;border:0;cursor:pointer;background:rgba(10,8,6,.5);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);color:#f5f2ec;font:600 16px system-ui,-apple-system,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px';
  overlay.innerHTML='<span style="width:78px;height:78px;border-radius:50%;background:rgba(230,126,34,.16);border:1px solid rgba(240,184,64,.55);display:grid;place-items:center;box-shadow:0 0 0 10px rgba(230,126,34,.07)"><svg width="32" height="32" viewBox="0 0 24 24" fill="#f0b840"><path d="M8 5v14l11-7z"/></svg></span><span>Activer le son 🔊</span>';
  overlay.addEventListener('click',function(){ overlay.remove(); startAudio(); });
  stage.appendChild(overlay);

  var mbtn=document.createElement('button');
  mbtn.type='button'; mbtn.setAttribute('aria-label','Couper / rétablir le son');
  mbtn.style.cssText='position:absolute;top:52px;right:16px;z-index:82;width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(20,17,14,.72);color:#f5f2ec;cursor:pointer;display:none;place-items:center;backdrop-filter:blur(6px)';
  mbtn.addEventListener('click',function(){ setMute(!muted); });
  stage.appendChild(mbtn);
})();
