// Gabarit parametrique Vimto.
// Bouteille verre galbee SYMETRIQUE : capsule violet fonce, liquide pourpre #3d1257,
// etiquette violette #5c2a8a, grand V blanc, "VIMTO" rouge contoure blanc,
// PARFUM en petites capitales claires + LISERES d.color en haut/bas d'etiquette.
// d.cat==="Energy" -> canette slim violette, meme identite.
ART["vimto"]=function(d){
  var c=d.color||'#6c3483', id=d.id, V='#5c2a8a', LQ='#3d1257';
  var fl=String(d.name||'').replace(new RegExp('^\\s*'+String(d.brand||'Vimto'),'i'),'')
        .replace(/\s+/g,' ').trim()||'Original';
  fl=fl.toUpperCase();
  var cl=(d.formats&&d.formats[0]&&d.formats[0].cl)?d.formats[0].cl+'cl':(d.cat==='Energy'?'33cl':'60cl');
  // decoupe du parfum en 1 a 3 lignes
  function wrap(t,maxC){
    var w=t.split(' '),L=[],cur='';
    for(var i=0;i<w.length;i++){
      if(((cur?cur+' ':'')+w[i]).length<=maxC||!cur) cur=(cur?cur+' ':'')+w[i];
      else{L.push(cur);cur=w[i];}
    }
    if(cur)L.push(cur);
    if(L.length>3){L[2]=L.slice(2).join(' ');L=L.slice(0,3);}
    return L;
  }
  // texte de parfum clair teinte parfum, contour violet fonce (lisible sur le V blanc)
  var flFill=shade(c,0.85), flStroke=shade(V,-0.55);
  function flavorBlock(cx,yc,maxW,maxC){
    var L=wrap(fl,maxC),n=L.length;
    var maxLen=0;for(var i=0;i<n;i++)maxLen=Math.max(maxLen,L[i].length);
    var fs=Math.min(n===1?9.5:(n===2?8.4:7.4), maxW/(0.62*maxLen));
    fs=Math.max(fs,6.4);
    var gap=fs+2.6, y0=yc-((n-1)*gap)/2, out='';
    for(var j=0;j<n;j++){
      var est=fs*0.66*L[j].length+0.6*(L[j].length-1);
      var fit=' textLength="'+Math.min(maxW,est).toFixed(1)+'" lengthAdjust="spacingAndGlyphs"';
      out+='<text x="'+cx+'" y="'+(y0+j*gap)+'" text-anchor="middle" font-size="'+fs+'"'
        +' font-weight="700" letter-spacing="0.6" fill="'+flFill+'"'
        +' stroke="'+flStroke+'" stroke-width="2" paint-order="stroke" stroke-linejoin="round"'+fit+'>'+L[j]+'</text>';
    }
    return out;
  }
  // wordmark VIMTO rouge contoure blanc
  function wordmark(y,fsz,tl){
    return '<g transform="rotate(-4 120 '+(y-6)+')">'
      +'<text x="120" y="'+y+'" text-anchor="middle" font-size="'+fsz+'" font-weight="800"'
      +' fill="#e02d2d" stroke="#ffffff" stroke-width="3.4" paint-order="stroke" stroke-linejoin="round"'
      +' textLength="'+tl+'" lengthAdjust="spacingAndGlyphs">VIMTO</text></g>';
  }
  // degrade liseré parfum (3 stops via shade)
  var lisGrad='<linearGradient id="vLs'+id+'" x1="0" y1="0" x2="1" y2="0">'
    +'<stop offset="0" stop-color="'+shade(c,0.3)+'"/>'
    +'<stop offset="0.5" stop-color="'+c+'"/>'
    +'<stop offset="1" stop-color="'+shade(c,-0.35)+'"/></linearGradient>';
  // degrade etiquette violette (cylindre)
  var lblGrad='<linearGradient id="vLb'+id+'" x1="0" y1="0" x2="1" y2="0">'
    +'<stop offset="0" stop-color="'+shade(V,-0.22)+'"/>'
    +'<stop offset="0.3" stop-color="'+shade(V,0.16)+'"/>'
    +'<stop offset="0.62" stop-color="'+V+'"/>'
    +'<stop offset="1" stop-color="'+shade(V,-0.42)+'"/></linearGradient>';

  /* ============ CANETTE SLIM (Energy) ============ */
  if(d.cat==='Energy'){
    var body='M96,54 L96,60 C90,65 89,71 89,79 L89,299 C89,310 92,316 98,321 L103,325 L137,325 L142,321 C148,316 151,310 151,299 L151,79 C151,71 150,65 144,60 L144,54 Z';
    return '<svg viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">'
    +'<defs>'+lisGrad+lblGrad
    +'<linearGradient id="vAl'+id+'" x1="0" y1="0" x2="1" y2="0">'
    +'<stop offset="0" stop-color="#eef0f3"/><stop offset="0.45" stop-color="#c6ccd3"/>'
    +'<stop offset="0.75" stop-color="#9aa2ab"/><stop offset="1" stop-color="#7e868f"/></linearGradient>'
    +'<clipPath id="vCl'+id+'"><path d="'+body+'"/></clipPath>'
    +'</defs>'
    +'<ellipse cx="120" cy="333" rx="46" ry="7.5" fill="#000" opacity="0.15"/>'
    +'<path d="'+body+'" fill="url(#vLb'+id+')" stroke="'+shade(V,-0.55)+'" stroke-width="1.6"/>'
    +'<g clip-path="url(#vCl'+id+')">'
    // liserés parfum haut et bas
    +'<rect x="89" y="60" width="62" height="11" fill="url(#vLs'+id+')"/>'
    +'<rect x="89" y="290" width="62" height="10" fill="url(#vLs'+id+')"/>'
    +'<rect x="89" y="300" width="62" height="26" fill="'+shade(V,-0.5)+'"/>'
    // reflet gauche / bord droit assombri (SOUS les textes)
    +'<rect x="95" y="60" width="7" height="260" rx="3.5" fill="#fff" opacity="0.35"/>'
    +'<rect x="141" y="56" width="10" height="272" fill="#000" opacity="0.2"/>'
    // grand V blanc
    +'<path d="M103,86 L120,158 L137,86" fill="none" stroke="#ffffff" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>'
    +'<path d="M103,86 L120,158 L137,86" fill="none" stroke="#e2ccf4" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" opacity="0.22"/>'
    +wordmark(152,17,54)
    // PARFUM
    +flavorBlock(120,198,56,12)
    // eclair energetique couleur parfum
    +'<path d="M126,218 L110,248 L119,248 L114,274 L132,240 L122,240 Z" fill="url(#vLs'+id+')" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round"/>'
    +'<text x="120" y="316" text-anchor="middle" font-size="8" font-weight="600" fill="#d8c2ef" opacity="0.9">'+cl+'</text>'
    +'</g>'
    // couvercle aluminium
    +'<path d="M96,54 L96,48 Q96,44 101,44 L139,44 Q144,44 144,48 L144,54 Z" fill="url(#vAl'+id+')" stroke="#8b939c" stroke-width="1.5"/>'
    +'<ellipse cx="120" cy="44.5" rx="26" ry="5.5" fill="#d5dae0" stroke="#8b939c" stroke-width="1.5"/>'
    +'<ellipse cx="120" cy="44.5" rx="19" ry="3.8" fill="#b9c0c8"/>'
    +'<rect x="113" y="41.8" width="14" height="4.6" rx="2.3" fill="#98a0a9"/>'
    +'</svg>';
  }

  /* ============ BOUTEILLE VERRE GALBEE (defaut) ============ */
  var body='M107,48 L133,48 C133,70 133,85 134,100 C138,122 158,132 164,152 C167,170 163,185 162,205 C161,235 166,260 168,288 C169,308 163,318 152,323 C142,327 131,328 120,328 C109,328 98,327 88,323 C77,318 71,308 72,288 C74,260 79,235 78,205 C77,185 73,170 76,152 C82,132 102,122 106,100 C107,85 107,70 107,48 Z';
  return '<svg viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">'
  +'<defs>'+lisGrad+lblGrad
  // liquide pourpre profond
  +'<linearGradient id="vLq'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#12051f"/><stop offset="0.25" stop-color="#33104c"/>'
  +'<stop offset="0.45" stop-color="#471861"/><stop offset="0.7" stop-color="'+LQ+'"/>'
  +'<stop offset="0.88" stop-color="#1d0a2e"/><stop offset="1" stop-color="#0e0418"/></linearGradient>'
  // verre vide du col
  +'<linearGradient id="vGl'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#3d2158"/><stop offset="0.3" stop-color="#cdb2e8"/>'
  +'<stop offset="0.5" stop-color="#e8dcf6"/><stop offset="0.75" stop-color="#b494d8"/>'
  +'<stop offset="1" stop-color="#2a1440"/></linearGradient>'
  // capsule metal violet fonce
  +'<linearGradient id="vCp'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#241038"/><stop offset="0.3" stop-color="#7a54ae"/>'
  +'<stop offset="0.55" stop-color="#4a2a78"/><stop offset="1" stop-color="#1a0a32"/></linearGradient>'
  +'<clipPath id="vCl'+id+'"><path d="'+body+'"/></clipPath>'
  +'</defs>'
  // ombre au sol
  +'<ellipse cx="120" cy="336" rx="58" ry="8" fill="#000" opacity="0.15"/>'
  // corps rempli de liquide
  +'<path d="'+body+'" fill="url(#vLq'+id+')" stroke="#1d0a2e" stroke-width="1.6"/>'
  +'<g clip-path="url(#vCl'+id+')">'
  // col vide au-dessus du liquide + surface
  +'<rect x="104" y="46" width="32" height="42" fill="url(#vGl'+id+')"/>'
  +'<ellipse cx="120" cy="88" rx="13.5" ry="3.4" fill="'+V+'"/>'
  +'<ellipse cx="120" cy="87.4" rx="9.5" ry="2.1" fill="#7d44ae" opacity="0.8"/>'
  // fond de bouteille : verre epais
  +'<path d="M72,298 Q120,330 168,298 L168,330 L72,330 Z" fill="#160724" opacity="0.55"/>'
  +'<path d="M92,318 Q120,328 148,318 Q120,311 92,318 Z" fill="#4a2570" opacity="0.55"/>'
  // fines bulles
  +'<g fill="#c9a0ee">'
  +'<circle cx="102" cy="164" r="1.9" opacity="0.5"/><circle cx="134" cy="150" r="1.5" opacity="0.45"/>'
  +'<circle cx="117" cy="184" r="1.3" opacity="0.4"/><circle cx="141" cy="192" r="1.8" opacity="0.45"/>'
  +'<circle cx="97" cy="309" r="1.4" opacity="0.4"/><circle cx="142" cy="311" r="1.6" opacity="0.42"/>'
  +'</g>'
  // reflet vertical clair a gauche + gloss epaule + bord droit assombri (SOUS l'etiquette)
  +'<rect x="85" y="150" width="7" height="164" rx="3.5" fill="#fff" opacity="0.32"/>'
  +'<rect x="109" y="52" width="4" height="34" rx="2" fill="#fff" opacity="0.55"/>'
  +'<path d="M97,128 C90,136 84,144 80,154 L86,158 C91,148 97,140 104,133 Z" fill="#fff" opacity="0.4"/>'
  +'<rect x="150" y="100" width="18" height="228" fill="#000" opacity="0.18"/>'
  // condensation
  +'<circle cx="94" cy="176" r="2" fill="#eaf0ff" opacity="0.5"/>'
  +'<circle cx="147" cy="162" r="1.7" fill="#eaf0ff" opacity="0.5"/>'
  +'<circle cx="146" cy="314" r="1.7" fill="#eaf0ff" opacity="0.45"/>'
  +'<circle cx="99" cy="141" r="1.4" fill="#eaf0ff" opacity="0.45"/>'
  +'</g>'
  // ===== GRANDE ETIQUETTE VIOLETTE (clippee sur la silhouette) =====
  +'<g clip-path="url(#vCl'+id+')">'
  +'<path d="M66,206 Q120,215 174,206 L174,296 Q120,305 66,296 Z" fill="url(#vLb'+id+')"/>'
  // liserés couleur du parfum haut et bas
  +'<path d="M66,206 Q120,215 174,206 L174,215 Q120,224 66,215 Z" fill="url(#vLs'+id+')"/>'
  +'<path d="M66,287 Q120,296 174,287 L174,296 Q120,305 66,296 Z" fill="url(#vLs'+id+')"/>'
  // ombre portee de l'etiquette
  +'<path d="M66,203.5 Q120,212.5 174,203.5 L174,206 Q120,215 66,206 Z" fill="#0e0318" opacity="0.5"/>'
  +'<path d="M66,296 Q120,305 174,296 L174,298.5 Q120,307.5 66,298.5 Z" fill="#0e0318" opacity="0.5"/>'
  // semis de bulles teinte parfum + blanc
  +'<circle cx="88" cy="224" r="2.8" fill="'+shade(c,0.15)+'" opacity="0.9"/>'
  +'<circle cx="95" cy="233" r="1.8" fill="#ffffff" opacity="0.8"/>'
  +'<circle cx="152" cy="227" r="2.4" fill="'+shade(c,0.15)+'" opacity="0.85"/>'
  +'<circle cx="146" cy="236" r="1.6" fill="#ffffff" opacity="0.75"/>'
  // grand V blanc
  +'<path d="M97,222 L120,264 L143,222" fill="none" stroke="#ffffff" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>'
  +'<path d="M97,222 L120,264 L143,222" fill="none" stroke="#e2ccf4" stroke-width="13" stroke-linecap="round" stroke-linejoin="round" opacity="0.22"/>'
  // VIMTO rouge contoure blanc
  +wordmark(256,21,78)
  // PARFUM en petites capitales claires
  +flavorBlock(120,278,82,15)
  +'</g>'
  +'<g clip-path="url(#vCl'+id+')">'
  // contenance sous l'etiquette
  +'<text x="120" y="315" text-anchor="middle" font-size="8" font-weight="600" fill="#c9a0ee" opacity="0.85">'+cl+'</text>'
  // voile doux de sheen par-dessus l'etiquette (courbure cylindre)
  +'<rect x="85" y="204" width="7" height="98" rx="3.5" fill="#fff" opacity="0.12"/>'
  +'<rect x="152" y="204" width="14" height="98" fill="#000" opacity="0.1"/>'
  +'</g>'
  // ===== ETIQUETTE DE COL =====
  +'<rect x="104" y="104" width="32" height="31" rx="4.5" fill="url(#vLb'+id+')" stroke="#e9d6fa" stroke-width="0.8" opacity="0.97"/>'
  +'<path d="M112,111 L120,124 L128,111" fill="none" stroke="#ffffff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>'
  +'<text x="120" y="132.5" text-anchor="middle" font-size="5.6" font-weight="700" letter-spacing="0.8" fill="#ffffff">VIMTO</text>'
  // ===== CAPSULE METAL violet fonce =====
  +'<path d="M103,37 Q120,31 137,37 L137,54 Q120,57 103,54 Z" fill="url(#vCp'+id+')"/>'
  +'<path d="M103,37 Q120,30 137,37 L137,40.5 Q120,34 103,40.5 Z" fill="#8a62ba" opacity="0.9"/>'
  +'<g stroke="#0e0420" stroke-width="1.1" opacity="0.55">'
  +'<line x1="108" y1="38.5" x2="108" y2="54.6"/><line x1="114" y1="36.6" x2="114" y2="55.4"/>'
  +'<line x1="120" y1="36" x2="120" y2="55.8"/><line x1="126" y1="36.6" x2="126" y2="55.4"/>'
  +'<line x1="132" y1="38.5" x2="132" y2="54.6"/>'
  +'</g>'
  +'<rect x="105.5" y="38" width="4" height="15" rx="2" fill="#fff" opacity="0.3"/>'
  +'<path d="M103,54 Q120,57 137,54 L137,58 Q120,61 103,58 Z" fill="#22093e"/>'
  +'</svg>';
};
