// Gabarit parametrique TRIO : Pocari Sweat (canette bleu roi, vague blanche),
// Inca Kola (bouteille verre, liquide dore, etiquette bleu roi) et
// Guarana Antarctica (canette verte, cercle rouge cercle de blanc).
// Chaque parfum prend d.color (degrade 3+ stops via shade) et son nom est ecrit sur le produit.
(function(){
  // ---- helpers locaux ----
  function px(h){h=String(h||'#888888').replace('#','');if(h.length===3)h=h.replace(/./g,function(x){return x+x;});
    return [parseInt(h.substr(0,2),16),parseInt(h.substr(2,2),16),parseInt(h.substr(4,2),16)];}
  function mix(a,b,t){var A=px(a),B=px(b);
    return '#'+A.map(function(v,i){return Math.round(v+(B[i]-v)*t).toString(16).padStart(2,'0');}).join('');}
  function lum(c){var p=px(c);return (p[0]*0.299+p[1]*0.587+p[2]*0.114)/255;}
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function fit(t,maxW,fs){var est=fs*0.62*String(t).length;
    if(est<=maxW)return ' font-size="'+fs+'"';
    var f2=Math.max(7,maxW/(0.62*String(t).length));
    return ' font-size="'+f2.toFixed(1)+'" textLength="'+maxW+'" lengthAdjust="spacingAndGlyphs"';}
  function flavorOf(d){
    var s=String(d.name||''),b=String(d.brand||'');
    var rx=function(w){return new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'ig');};
    s=s.replace(rx(b),' ');
    b.split(/\s+/).forEach(function(w){if(w.length>2)s=s.replace(rx(w),' ');});
    s=s.replace(/\s+/g,' ').trim();
    // nom nu (= la marque seule) -> "Classique", pour que chaque parfum ait un nom distinct
    return s||'Classique';
  }
  function pill(cx,y,w,txt,fg,bg){
    return '<rect x="'+(cx-w/2)+'" y="'+y+'" width="'+w+'" height="17" rx="8.5" fill="'+(bg||'#fff')+'" opacity="0.95" stroke="#000" stroke-opacity="0.16" stroke-width="1"/>'
      +'<text x="'+cx+'" y="'+(y+12.5)+'" text-anchor="middle" font-weight="700" fill="'+fg+'"'+fit(txt,w-12,10.5)+'>'+esc(txt)+'</text>';
  }
  // ---- canette commune ----
  var CAN='M77,57 Q74,62 74,74 L74,286 Q74,300 84,307 L90,313 Q94,316 102,316 L138,316 Q146,316 150,313 L156,307 Q166,300 166,286 L166,74 Q166,62 163,57 Z';
  function canTop(id){
    return '<linearGradient id="'+id+'sl" x1="0" y1="0" x2="1" y2="0">'
      +'<stop offset="0" stop-color="#d8dde2"/><stop offset="0.45" stop-color="#f2f5f7"/><stop offset="1" stop-color="#9aa4ad"/></linearGradient>';
  }
  function canLid(id){
    return '<rect x="76" y="44" width="88" height="13" rx="5" fill="url(#'+id+'sl)"/>'
      +'<ellipse cx="120" cy="46" rx="42" ry="5.5" fill="#e8ecef" stroke="#aab3bb" stroke-width="1.5"/>'
      +'<ellipse cx="120" cy="46.5" rx="29" ry="3.4" fill="#cfd6db"/>'
      +'<rect x="112" y="44.2" width="16" height="4" rx="2" fill="#b6bfc7"/>';
  }
  function canShine(){
    return '<rect x="80" y="60" width="10" height="248" rx="5" fill="#fff" opacity="0.3"/>'
      +'<rect x="151" y="60" width="10" height="248" rx="5" fill="#000" opacity="0.17"/>'
      +'<rect x="74" y="58" width="92" height="5" fill="#fff" opacity="0.2"/>';
  }
  var CAN_FOOT='<path d="M98,316 L142,316 L138,322 L102,322 Z" fill="#8b949c"/>';
  var GROUND='<ellipse cx="120" cy="332" rx="58" ry="9" fill="#000" opacity="0.13"/>';

  // ================= POCARI SWEAT =================
  function drawPocari(d){
    var id='pk'+d.id, c=d.color||'#5dade2';
    var fl=flavorOf(d);
    var ion=/ion\s*water/i.test(String(d.name||''));
    var body=ion? mix(c,'#7db8e8',0.6) : mix(c,'#2456a8',0.75);
    var s='<svg viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">';
    s+='<defs>'+canTop(id)
      +'<linearGradient id="'+id+'b" x1="0" y1="0" x2="1" y2="0">'
      +(ion
        ? '<stop offset="0" stop-color="'+shade(body,0.68)+'"/><stop offset="0.4" stop-color="'+shade(body,0.42)+'"/><stop offset="0.8" stop-color="'+body+'"/><stop offset="1" stop-color="'+shade(body,-0.16)+'"/>'
        : '<stop offset="0" stop-color="'+shade(body,0.28)+'"/><stop offset="0.45" stop-color="'+body+'"/><stop offset="1" stop-color="'+shade(body,-0.32)+'"/>')
      +'</linearGradient>'
      +'<clipPath id="'+id+'cl"><path d="'+CAN+'"/></clipPath></defs>';
    s+=GROUND+CAN_FOOT;
    s+='<path d="'+CAN+'" fill="url(#'+id+'b)"/>';
    s+='<g clip-path="url(#'+id+'cl)">';
    if(ion){
      // vague fine
      s+='<path d="M70,206 C100,186 140,226 170,198" stroke="#fff" stroke-width="6" fill="none" opacity="0.95"/>'
        +'<path d="M70,222 C100,202 140,242 170,214" stroke="#fff" stroke-width="2.5" fill="none" opacity="0.7"/>';
    }else{
      // grande vague blanche diagonale
      s+='<path d="M74,262 C110,252 128,190 166,148 L166,224 C132,258 106,290 74,304 Z" fill="#fff"/>';
    }
    s+=canShine()+'</g>';
    if(ion){
      var dk=shade(body,-0.55);
      s+='<rect x="87" y="74" width="66" height="15" rx="7.5" fill="'+shade(body,-0.45)+'"/>'
        +'<text x="120" y="85" text-anchor="middle" font-size="8.5" font-weight="700" fill="#fff" textLength="54" lengthAdjust="spacingAndGlyphs">POCARI SWEAT</text>'
        +'<text x="120" y="152" text-anchor="middle" font-size="33" font-weight="800" fill="'+dk+'">ION</text>'
        +'<text x="120" y="178" text-anchor="middle" font-size="19" font-weight="800" fill="'+dk+'" textLength="76" lengthAdjust="spacingAndGlyphs">WATER</text>';
      // le parfum ("Ion Water") est deja ecrit en grand : pas de pastille redondante
    }else{
      s+='<text x="120" y="112" text-anchor="middle" font-size="26" font-weight="800" fill="#fff" textLength="82" lengthAdjust="spacingAndGlyphs">POCARI</text>'
        +'<text x="120" y="141" text-anchor="middle" font-size="26" font-weight="800" fill="#fff" textLength="82" lengthAdjust="spacingAndGlyphs">SWEAT</text>'
        +pill(120,248,66,fl,shade(body,-0.35));
    }
    return s+'</svg>';
  }

  // ================= INCA KOLA =================
  function drawInca(d){
    var id='ik'+d.id, c=d.color||'#f4d03f';
    var fl=flavorOf(d);
    var zero=/z[ée]ro/i.test(String(d.name||''))||lum(c)<0.22;
    var L=zero?'#f4d03f':c;                 // liquide dore (le Zero garde le cola dore)
    var lab=zero?c:'#1d4f8a';               // etiquette bleu roi, noire pour le Zero
    var s='<svg viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">';
    s+='<defs>'
      +'<linearGradient id="'+id+'g" x1="0" y1="0" x2="1" y2="0">'
      +'<stop offset="0" stop-color="#f3f6f8"/><stop offset="0.55" stop-color="#dfe8ee"/><stop offset="1" stop-color="#b9c9d4"/></linearGradient>'
      +'<linearGradient id="'+id+'q" x1="0" y1="0" x2="0" y2="1">'
      +'<stop offset="0" stop-color="'+shade(L,0.38)+'"/><stop offset="0.5" stop-color="'+L+'"/><stop offset="1" stop-color="'+shade(L,-0.2)+'"/></linearGradient>'
      +'<linearGradient id="'+id+'l" x1="0" y1="0" x2="1" y2="0">'
      +'<stop offset="0" stop-color="'+shade(lab,0.22)+'"/><stop offset="0.5" stop-color="'+lab+'"/><stop offset="1" stop-color="'+shade(lab,-0.32)+'"/></linearGradient>'
      +'<linearGradient id="'+id+'c" x1="0" y1="0" x2="0" y2="1">'
      +'<stop offset="0" stop-color="#f0d060"/><stop offset="0.5" stop-color="#d4a72c"/><stop offset="1" stop-color="#9a7418"/></linearGradient>'
      +'</defs>';
    s+='<ellipse cx="120" cy="330" rx="52" ry="8" fill="#000" opacity="0.13"/>';
    // verre
    s+='<path d="M108,44 L108,82 C108,102 97,113 91,129 C87,140 85,150 85,162 L85,300 Q85,318 103,318 L137,318 Q155,318 155,300 L155,162 C155,150 153,140 149,129 C143,113 132,102 132,82 L132,44 Z"'
      +' fill="url(#'+id+'g)" stroke="#93a8b6" stroke-width="2.5" stroke-linejoin="round"/>';
    // liquide jaune dore fluo
    s+='<path d="M111.5,64 L111.5,83 C111.5,103 100,114 94.5,130 C90.8,140.6 88.8,150.4 88.8,162 L88.8,299 Q88.8,314.5 104,314.5 L136,314.5 Q151.2,314.5 151.2,299 L151.2,162 C151.2,150.4 149.2,140.6 145.5,130 C140,114 128.5,103 128.5,83 L128.5,64 Z"'
      +' fill="url(#'+id+'q)" opacity="0.96"/>';
    s+='<ellipse cx="120" cy="64.5" rx="8.5" ry="2.4" fill="'+shade(L,0.5)+'" opacity="0.9"/>';
    // bulles
    s+='<circle cx="104" cy="150" r="2" fill="#fff" opacity="0.55"/>'
      +'<circle cx="136" cy="172" r="2.4" fill="#fff" opacity="0.5"/>'
      +'<circle cx="112" cy="118" r="1.6" fill="#fff" opacity="0.6"/>'
      +'<circle cx="130" cy="292" r="2.2" fill="#fff" opacity="0.45"/>'
      +'<circle cx="100" cy="288" r="1.7" fill="#fff" opacity="0.45"/>';
    // etiquette
    s+='<rect x="85" y="196" width="70" height="62" rx="4" fill="url(#'+id+'l)" stroke="#e6c34f" stroke-width="2"/>'
      +'<text x="120" y="222" text-anchor="middle" font-size="16.5" font-weight="800" fill="#f2c94c" textLength="54" lengthAdjust="spacingAndGlyphs">INCA</text>'
      +'<text x="120" y="241" text-anchor="middle" font-size="16.5" font-weight="800" fill="#f2c94c" textLength="54" lengthAdjust="spacingAndGlyphs">KOLA</text>'
      +'<rect x="94" y="247" width="52" height="2" fill="#f2c94c" opacity="0.8"/>';
    // variante "Original" : ruban dore en coin d'etiquette + pastille doree (la distingue du Classique)
    var orig=/original/i.test(fl);
    if(orig){
      // ruban dore en coin, decoupe aux limites de l'etiquette
      s+='<clipPath id="'+id+'rb"><rect x="85" y="196" width="70" height="62" rx="4"/></clipPath>'
        +'<g clip-path="url(#'+id+'rb)"><g transform="rotate(-38 96 206)">'
        +'<rect x="70" y="200" width="52" height="12" fill="#e6b91e" stroke="#9a7418" stroke-width="1"/></g></g>';
    }
    // parfum
    s+=pill(120,266,62,fl,zero?'#26221e':shade(lab,-0.1),orig?'#f6dd7a':'#fff');
    // reflet gauche / bord droit / brillance col
    s+='<rect x="90" y="168" width="7" height="132" rx="3.5" fill="#fff" opacity="0.5"/>'
      +'<path d="M104,58 Q100,74 103,90" stroke="#fff" stroke-width="3.5" fill="none" opacity="0.6" stroke-linecap="round"/>'
      +'<rect x="146" y="168" width="5.5" height="132" rx="2.75" fill="'+shade(L,-0.55)+'" opacity="0.28"/>';
    // capsule couronne doree
    s+='<rect x="104" y="30" width="32" height="12" rx="3" fill="url(#'+id+'c)"/>'
      +'<path d="M104,40 l3.5,6 4.5,-6 4,6 4,-6 4,6 4,-6 4.5,6 3.5,-6" fill="#b8891f"/>'
      +'<rect x="107" y="32" width="5" height="7" rx="2.5" fill="#fff" opacity="0.4"/>';
    return s+'</svg>';
  }

  // ================= GUARANA ANTARCTICA =================
  function drawGuarana(d){
    var id='ga'+d.id, c=d.color||'#1e8c4a';
    var fl=flavorOf(d);
    // variante Zero : canette vert sombre presque noire (pas un noir pur)
    if(lum(c)<0.2) c=mix(c,'#0e4425',0.42);
    var s='<svg viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">';
    s+='<defs>'+canTop(id)
      +'<linearGradient id="'+id+'b" x1="0" y1="0" x2="1" y2="0">'
      +'<stop offset="0" stop-color="'+shade(c,0.26)+'"/><stop offset="0.45" stop-color="'+c+'"/><stop offset="1" stop-color="'+shade(c,-0.4)+'"/></linearGradient>'
      +'<linearGradient id="'+id+'r" x1="0" y1="0" x2="0" y2="1">'
      +'<stop offset="0" stop-color="#e64545"/><stop offset="0.5" stop-color="#cc2424"/><stop offset="1" stop-color="#921313"/></linearGradient>'
      +'<clipPath id="'+id+'cl"><path d="'+CAN+'"/></clipPath></defs>';
    s+=GROUND+CAN_FOOT;
    s+='<path d="'+CAN+'" fill="url(#'+id+'b)"/>';
    s+='<g clip-path="url(#'+id+'cl)">'
      // fines ondulations claires en haut
      +'<path d="M70,84 C100,76 140,92 170,82" stroke="#fff" stroke-width="2.5" fill="none" opacity="0.4"/>'
      +canShine()+'</g>';
    // cercle rouge cercle de blanc
    s+='<circle cx="120" cy="158" r="41" fill="url(#'+id+'r)" stroke="#fff" stroke-width="4.5"/>'
      +'<path d="M92,140 A34,34 0 0 1 132,126" stroke="#fff" stroke-width="3" fill="none" opacity="0.4" stroke-linecap="round"/>'
      +'<text x="120" y="163" text-anchor="middle" font-size="13" font-weight="800" fill="#fff" textLength="62" lengthAdjust="spacingAndGlyphs">GUARANÁ</text>';
    s+='<text x="120" y="224" text-anchor="middle" font-size="12" font-weight="800" fill="#fff" letter-spacing="1" textLength="80" lengthAdjust="spacingAndGlyphs">ANTARCTICA</text>';
    s+=pill(120,246,68,fl,shade(c,-0.45));
    return s+'</svg>';
  }

  // ---- dispatch par marque (le previewer n'utilise que la 1re cle) ----
  function dispatch(d){
    var b=(String(d.brand||'')+' '+String(d.name||'')).toLowerCase();
    if(b.indexOf('inca')>=0)return drawInca(d);
    if(b.indexOf('guaran')>=0||b.indexOf('antarctica')>=0)return drawGuarana(d);
    return drawPocari(d);
  }
  ART["pocari sweat"]=dispatch;
  ART["inca kola"]=dispatch;
  ART["guarana antarctica"]=dispatch;
})();
