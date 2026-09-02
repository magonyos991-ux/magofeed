// Gabarit parametrique Sumol — canette standard 33cl.
// Haut blanc avec "SUMOL" vert incline souligne d'une virgule orange,
// moitie basse = grande zone de la couleur du parfum (degrade) avec fruit stylise
// (cercle + quartier dans des teintes du parfum), parfum en capitales blanches.
// Variantes Zero : badge noir "ZERO" au-dessus du parfum.
ART["sumol"]=function(d){
  var c=d.color||'#e67e22', id=d.id;
  // Parfum = nom sans le prefixe de marque
  var fl=String(d.name||'').replace(new RegExp('^\\s*'+String(d.brand||'Sumol'),'i'),'')
        .replace(/\s+/g,' ').trim()||'Original';
  fl=fl.toUpperCase();
  // variante Zero -> badge distinct, on retire le mot du nom
  var zero=/^Z[ÉE]RO\b/.test(fl);
  if(zero) fl=fl.replace(/^Z[ÉE]RO\s*/,'')||'ORIGINAL';
  // decoupe en 1 ou 2 lignes si trop long
  var lines=[fl];
  if(fl.length>12 && fl.indexOf(' ')>=0){
    var w=fl.split(' '), l1='', i=0;
    while(i<w.length && (l1+' '+w[i]).trim().length<fl.length/2){ l1=(l1+' '+w[i]).trim(); i++; }
    if(!l1){ l1=w[0]; i=1; }
    lines=[l1, w.slice(i).join(' ')];
  }
  var maxLen=Math.max(lines[0].length,(lines[1]||'').length);
  var fs=maxLen<=6?17:(maxLen<=9?14.5:(maxLen<=12?12.5:11));
  function ftxt(t,y){
    var est=fs*0.68*t.length;
    var fit=est>96?' textLength="96" lengthAdjust="spacingAndGlyphs"':'';
    return '<text x="120" y="'+y+'" text-anchor="middle" font-size="'+fs+'" font-weight="800" fill="#fff"'
      +' stroke="'+shade(c,-0.42)+'" stroke-width="2.4" paint-order="stroke" stroke-linejoin="round"'+fit+'>'+t+'</text>';
  }
  var flavorTxt = lines.length===1 ? ftxt(lines[0],293)
    : ftxt(lines[0],283)+ftxt(lines[1],283+fs+4);
  // badge ZERO (pastille noire) pour les variantes sans sucre
  var zeroBadge = zero
    ? '<rect x="94" y="255" width="52" height="17" rx="8.5" fill="#1c1c1e" stroke="#fff" stroke-width="1.4"/>'
      +'<text x="120" y="267.5" text-anchor="middle" font-size="11" font-weight="800" fill="#fff" letter-spacing="1">ZÉRO</text>'
    : '';
  // sur les Zero, on remonte le fruit pour laisser la place au badge
  var fy=zero?-9:0;

  var body='M66,58 L66,64 C60,70 58,76 58,84 L58,300 C58,312 61,318 68,323 L74,328 L166,328 L172,323 C179,318 182,312 182,300 L182,84 C182,76 180,70 174,64 L174,58 Z';

  return '<svg viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">'
  +'<defs>'
  // corps blanc (leger degrade metal)
  +'<linearGradient id="smw'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="#ffffff"/>'
  +'<stop offset="0.8" stop-color="#f2f3f5"/><stop offset="1" stop-color="#dde0e4"/>'
  +'</linearGradient>'
  // zone parfum : degrade vertical 4 stops
  +'<linearGradient id="smz'+id+'" x1="0" y1="0" x2="0" y2="1">'
  +'<stop offset="0" stop-color="'+shade(c,0.22)+'"/>'
  +'<stop offset="0.35" stop-color="'+c+'"/>'
  +'<stop offset="0.75" stop-color="'+shade(c,-0.14)+'"/>'
  +'<stop offset="1" stop-color="'+shade(c,-0.3)+'"/>'
  +'</linearGradient>'
  // fruit entier : degrade radial dans les teintes du parfum
  +'<radialGradient id="smf'+id+'" cx="0.35" cy="0.3" r="0.95">'
  +'<stop offset="0" stop-color="'+shade(c,0.45)+'"/>'
  +'<stop offset="0.55" stop-color="'+shade(c,0.08)+'"/>'
  +'<stop offset="1" stop-color="'+shade(c,-0.3)+'"/>'
  +'</radialGradient>'
  // couvercle aluminium
  +'<linearGradient id="sml'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#eef0f3"/><stop offset="0.45" stop-color="#c6ccd3"/>'
  +'<stop offset="0.75" stop-color="#9aa2ab"/><stop offset="1" stop-color="#7e868f"/>'
  +'</linearGradient>'
  +'<clipPath id="smc'+id+'"><path d="'+body+'"/></clipPath>'
  +'</defs>'
  // ombre au sol
  +'<ellipse cx="120" cy="335" rx="68" ry="9" fill="#000" opacity="0.14"/>'
  // corps
  +'<path d="'+body+'" fill="url(#smw'+id+')" stroke="#b7bec6" stroke-width="2"/>'
  +'<g clip-path="url(#smc'+id+')">'
  // grande zone couleur du parfum, bord superieur en vague
  +'<path d="M58,208 C86,182 138,198 182,172 L182,332 L58,332 Z" fill="url(#smz'+id+')"/>'
  // filet clair le long de la vague
  +'<path d="M58,208 C86,182 138,198 182,172" fill="none" stroke="'+shade(c,0.55)+'" stroke-width="3" opacity="0.75"/>'
  // fruit entier + petite feuille (teintes du parfum)
  +'<g transform="translate(0,'+fy+')">'
  +'<circle cx="104" cy="228" r="25" fill="url(#smf'+id+')"/>'
  +'<path d="M95,215 A13,13 0 0 1 113,210" stroke="'+shade(c,0.6)+'" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.85"/>'
  +'<path d="M104,204 C105,196 112,192 119,193 C117,200 112,205 105,205 Z" fill="'+shade(c,-0.45)+'"/>'
  // quartier coupe : interieur clair, ecorce couleur, segments
  +'<circle cx="147" cy="238" r="19" fill="'+shade(c,0.82)+'" stroke="'+shade(c,-0.18)+'" stroke-width="4"/>'
  +'<g stroke="'+c+'" stroke-width="1.9" stroke-linecap="round">'
  +'<path d="M147,238 L147,224 M147,238 L159,230.5 M147,238 L159.5,243 M147,238 L152,251 M147,238 L140,250.5 M147,238 L135,242.5 M147,238 L136.5,229"/>'
  +'</g>'
  +'<circle cx="147" cy="238" r="3" fill="'+c+'"/>'
  +'</g>'
  // badge ZERO eventuel + PARFUM en capitales blanches
  +zeroBadge
  +flavorTxt
  // contenance
  +'<text x="120" y="318" text-anchor="middle" font-size="9.5" font-weight="600" fill="#fff" opacity="0.85">33cl</text>'
  // reflet vertical clair a gauche + bord droit assombri
  +'<rect x="66" y="66" width="11" height="258" rx="5.5" fill="#fff" opacity="0.5"/>'
  +'<rect x="166" y="60" width="16" height="270" fill="#000" opacity="0.13"/>'
  +'</g>'
  // logo SUMOL vert incline + virgule orange
  +'<g transform="rotate(-8 120 120)">'
  +'<text x="120" y="128" text-anchor="middle" font-size="30" font-weight="800" font-style="italic" fill="#1a9e4b" textLength="96" lengthAdjust="spacingAndGlyphs">SUMOL</text>'
  +'<circle cx="74" cy="138" r="5.5" fill="#f0821e"/>'
  +'<path d="M74,143 C102,153 142,148 166,132 C142,144 106,146 75,134 Z" fill="#f0821e"/>'
  +'</g>'
  // couvercle aluminium
  +'<path d="M66,58 L66,50 Q66,46 71,46 L169,46 Q174,46 174,50 L174,58 Z" fill="url(#sml'+id+')" stroke="#8b939c" stroke-width="1.6"/>'
  +'<ellipse cx="120" cy="46.5" rx="54" ry="8" fill="#d5dae0" stroke="#8b939c" stroke-width="1.6"/>'
  +'<ellipse cx="120" cy="46.5" rx="43" ry="5.8" fill="#b9c0c8"/>'
  +'<rect x="108" y="43" width="24" height="6" rx="3" fill="#98a0a9"/>'
  +'</svg>';
};
