// Gabarit parametrique Prime.
// Bouteille sport : bouchon sport gris (bec + capuchon strie), corps transparent
// rempli du liquide couleur parfum (degrade 4 stops), large etiquette BLANCHE :
// goutte couleur parfum, "PRIME" noir enorme, "HYDRATION" fin dessous,
// PARFUM en capitales couleur parfum. d.cat==="Energy" -> canette slim, meme identite.
ART["prime"]=function(d){
  var c=d.color||'#3498db', id=d.id;
  var fl=String(d.name||'').replace(new RegExp('^\\s*'+String(d.brand||'Prime'),'i'),'')
        .replace(/\s+/g,' ').trim();
  var isE=(d.cat==='Energy');
  if(isE) fl=fl.replace(/^energy\s*/i,'');
  fl=(fl||'Original').toUpperCase();
  var cl=(d.formats&&d.formats[0]&&d.formats[0].cl)?d.formats[0].cl+'cl':(isE?'33cl':'50cl');

  function wrap(t,maxC){
    var w=t.split(' '),L=[],cur='';
    for(var i=0;i<w.length;i++){
      if(((cur?cur+' ':'')+w[i]).length<=maxC||!cur) cur=(cur?cur+' ':'')+w[i];
      else{L.push(cur);cur=w[i];}
    }
    if(cur)L.push(cur);
    if(L.length>2){L[1]=L.slice(1).join(' ');L=L.slice(0,2);}
    return L;
  }
  // bloc parfum : capitales couleur parfum (assombrie pour rester lisible sur blanc)
  var flCol=shade(c,-0.12);
  function flavorBlock(cx,yc,maxW,maxC){
    var L=wrap(fl,maxC||13),n=L.length;
    var maxLen=0;for(var i=0;i<n;i++)maxLen=Math.max(maxLen,L[i].length);
    var fs=Math.min(n===1?15:11.2, maxW/(0.62*maxLen));
    fs=Math.max(fs,6.8);
    var gap=fs+2.4, y0=yc-((n-1)*gap)/2, out='';
    for(var j=0;j<n;j++){
      var est=fs*0.68*L[j].length;
      var fit=est>maxW?' textLength="'+maxW+'" lengthAdjust="spacingAndGlyphs"':'';
      out+='<text x="'+cx+'" y="'+(y0+j*gap)+'" text-anchor="middle" font-family="system-ui,sans-serif"'
        +' font-size="'+fs.toFixed(1)+'" font-weight="800" letter-spacing="0.4" fill="'+flCol+'"'+fit+'>'+L[j]+'</text>';
    }
    return out;
  }
  // goutte logo couleur parfum
  function drop(cx,cy,s){
    return '<path d="M'+cx+' '+(cy-s)+' C'+(cx+s*0.9)+' '+(cy+s*0.1)+' '+(cx+s*0.72)+' '+(cy+s)
      +' '+cx+' '+(cy+s)+' C'+(cx-s*0.72)+' '+(cy+s)+' '+(cx-s*0.9)+' '+(cy+s*0.1)+' '+cx+' '+(cy-s)+'Z"'
      +' fill="'+c+'"/><ellipse cx="'+(cx-s*0.22)+'" cy="'+(cy+s*0.3)+'" rx="'+(s*0.16)+'" ry="'+(s*0.3)+'" fill="#ffffff" opacity="0.7"/>';
  }

  // degrades communs
  var defs='<linearGradient id="pLq'+id+'" x1="0" y1="0" x2="1" y2="0">'
    +'<stop offset="0" stop-color="'+shade(c,0.42)+'"/>'
    +'<stop offset="0.28" stop-color="'+shade(c,0.14)+'"/>'
    +'<stop offset="0.62" stop-color="'+c+'"/>'
    +'<stop offset="1" stop-color="'+shade(c,-0.38)+'"/></linearGradient>'
    +'<linearGradient id="pCap'+id+'" x1="0" y1="0" x2="1" y2="0">'
    +'<stop offset="0" stop-color="#d9dde1"/><stop offset="0.35" stop-color="#aeb5bb"/>'
    +'<stop offset="0.7" stop-color="#868d93"/><stop offset="1" stop-color="#5d646a"/></linearGradient>'
    +'<linearGradient id="pLbl'+id+'" x1="0" y1="0" x2="1" y2="0">'
    +'<stop offset="0" stop-color="#e9eaeb"/><stop offset="0.22" stop-color="#ffffff"/>'
    +'<stop offset="0.72" stop-color="#f7f7f7"/><stop offset="1" stop-color="#d8d9da"/></linearGradient>';

  /* ============ CANETTE SLIM (Energy) ============ */
  if(isE){
    var can='<svg viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg">'
      +'<defs>'+defs+'</defs>'
      +'<ellipse cx="120" cy="342" rx="56" ry="9" fill="#000000" opacity="0.16"/>'
      +'<path d="M86 60 Q86 50 98 48 L142 48 Q154 50 154 60 L154 316 Q154 334 138 336 L102 336 Q86 334 86 316 Z" fill="url(#pLq'+id+')"/>'
      +'<ellipse cx="120" cy="49" rx="30" ry="7" fill="#c6cbd0"/>'
      +'<ellipse cx="120" cy="48" rx="26" ry="5.4" fill="#9aa1a7"/>'
      +'<ellipse cx="120" cy="47.4" rx="22" ry="4.2" fill="#b8bec4"/>'
      +'<rect x="113" y="43.6" width="14" height="4.6" rx="2.3" fill="#7d848a"/>'
      +'<rect x="92" y="120" width="56" height="130" fill="#dfe0e1"/>'
      +'<rect x="90" y="120" width="58" height="130" fill="url(#pLbl'+id+')"/>'
      +'<rect x="90" y="120" width="60" height="130" fill="none" stroke="'+shade(c,-0.4)+'" stroke-opacity="0.25" stroke-width="1"/>'
      +drop(120,141,10)
      +'<text x="120" y="187" text-anchor="middle" font-family="system-ui,sans-serif" font-size="27" font-weight="900" fill="#111111" textLength="54" lengthAdjust="spacingAndGlyphs">PRIME</text>'
      +'<text x="120" y="199" text-anchor="middle" font-family="system-ui,sans-serif" font-size="7.4" font-weight="700" letter-spacing="2.4" fill="#333333" textLength="52" lengthAdjust="spacingAndGlyphs">ENERGY</text>'
      +flavorBlock(120,226,54,8)
      +'<text x="120" y="326" text-anchor="middle" font-family="system-ui,sans-serif" font-size="9" font-weight="700" fill="#ffffff" opacity="0.85">'+cl+'</text>'
      +'<rect x="92" y="58" width="10" height="270" rx="5" fill="#ffffff" opacity="0.32"/>'
      +'<path d="M146 52 L152 56 L152 320 Q152 331 141 334 L136 334 Q148 330 148 318 Z" fill="#000000" opacity="0.14"/>'
      +'</svg>';
    return can;
  }

  /* ============ BOUTEILLE SPORT (defaut) ============ */
  var s='<svg viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg">'
    +'<defs>'+defs+'</defs>'
    // ombre au sol
    +'<ellipse cx="120" cy="342" rx="64" ry="9" fill="#000000" opacity="0.16"/>'
    // bec sport
    +'<rect x="108" y="14" width="24" height="15" rx="6" fill="url(#pCap'+id+')"/>'
    +'<rect x="110" y="12" width="20" height="6" rx="3" fill="#e4e7ea"/>'
    // capuchon
    +'<rect x="96" y="27" width="48" height="24" rx="7" fill="url(#pCap'+id+')"/>'
    // base striee du bouchon
    +'<rect x="90" y="49" width="60" height="20" rx="5" fill="url(#pCap'+id+')"/>'
    +'<g stroke="#5a6167" stroke-width="1.4" opacity="0.5">'
    +'<line x1="98" y1="51" x2="98" y2="67"/><line x1="106" y1="51" x2="106" y2="67"/>'
    +'<line x1="114" y1="51" x2="114" y2="67"/><line x1="122" y1="51" x2="122" y2="67"/>'
    +'<line x1="130" y1="51" x2="130" y2="67"/><line x1="138" y1="51" x2="138" y2="67"/></g>'
    // epaule
    +'<path d="M92 69 L148 69 L162 86 Q166 90 166 98 L74 98 Q74 90 78 86 Z" fill="url(#pLq'+id+')"/>'
    +'<path d="M92 69 L148 69 L162 86 Q166 90 166 98 L74 98 Q74 90 78 86 Z" fill="#ffffff" opacity="0.16"/>'
    // corps rempli de liquide
    +'<path d="M74 96 L166 96 L166 314 Q166 332 148 332 L92 332 Q74 332 74 314 Z" fill="url(#pLq'+id+')"/>'
    // surface du liquide (petit espace d air)
    +'<rect x="74" y="96" width="92" height="12" fill="'+shade(c,0.62)+'" opacity="0.9"/>'
    +'<ellipse cx="120" cy="108" rx="46" ry="4" fill="'+shade(c,0.35)+'"/>'
    // contour plastique
    +'<path d="M74 96 L166 96 L166 314 Q166 332 148 332 L92 332 Q74 332 74 314 Z" fill="none" stroke="'+shade(c,-0.5)+'" stroke-opacity="0.5" stroke-width="1.4"/>'
    // etiquette blanche large
    +'<rect x="71" y="138" width="98" height="126" rx="5" fill="url(#pLbl'+id+')"/>'
    +'<rect x="71" y="138" width="98" height="126" rx="5" fill="none" stroke="#c9cacb" stroke-width="0.8"/>'
    // goutte logo couleur parfum
    +drop(120,155,11)
    // wordmark PRIME
    +'<text x="120" y="204" text-anchor="middle" font-family="system-ui,sans-serif" font-size="34" font-weight="900" fill="#111111" textLength="88" lengthAdjust="spacingAndGlyphs">PRIME</text>'
    +'<text x="120" y="217" text-anchor="middle" font-family="system-ui,sans-serif" font-size="7.6" font-weight="700" letter-spacing="2.6" fill="#333333" textLength="84" lengthAdjust="spacingAndGlyphs">HYDRATION</text>'
    // parfum couleur parfum
    +flavorBlock(120,242,88)
    // stries de prise en main sous l etiquette
    +'<rect x="76" y="286" width="88" height="3" rx="1.5" fill="#000000" opacity="0.10"/>'
    +'<rect x="76" y="294" width="88" height="3" rx="1.5" fill="#000000" opacity="0.10"/>'
    +'<rect x="76" y="302" width="88" height="3" rx="1.5" fill="#000000" opacity="0.10"/>'
    // contenance
    +'<text x="120" y="322" text-anchor="middle" font-family="system-ui,sans-serif" font-size="9.5" font-weight="700" fill="#ffffff" opacity="0.88">'+cl+'</text>'
    // reflet vertical clair a gauche
    +'<rect x="80" y="104" width="11" height="220" rx="5.5" fill="#ffffff" opacity="0.34"/>'
    +'<rect x="99" y="30" width="7" height="36" rx="3.5" fill="#ffffff" opacity="0.4"/>'
    // bord droit assombri
    +'<path d="M160 100 L166 104 L166 314 Q166 330 150 332 L144 332 Q160 328 160 312 Z" fill="#000000" opacity="0.15"/>'
    +'</svg>';
  return s;
};
