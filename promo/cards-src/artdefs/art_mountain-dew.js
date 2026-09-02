// Gabarit parametrique Mountain Dew — canette 33cl : corps degrade dans la
// couleur du parfum, bande diagonale sombre #0f260c portant "MTN" blanc
// italique au-dessus de "DEW" rouge contoure blanc, PARFUM en capitales
// blanches sous la bande, eclats anguleux discrets, couvercle aluminium.
ART["mountain dew"]=function(d){
  var c=d.color||'#39b54a', id=d.id;
  var dk=shade(c,-0.45), lt=shade(c,0.55);
  // Parfum = nom sans le prefixe de marque
  var fl=String(d.name||'').replace(new RegExp('^\\s*'+String(d.brand||'Mountain Dew'),'i'),'').replace(/\s+/g,' ').trim()||'Original';
  var FL=fl.toUpperCase();
  // decoupe en 2 lignes si trop long
  var lines=[FL];
  if(FL.length>12 && FL.indexOf(' ')>-1){
    var ws=FL.split(' '), a='', b='';
    for(var i=0;i<ws.length;i++){ if(a.length<=FL.length/2-1) a+=(a?' ':'')+ws[i]; else b+=(b?' ':'')+ws[i]; }
    if(!b){ b=a.split(' ').pop(); a=a.split(' ').slice(0,-1).join(' '); }
    lines=[a,b];
  }
  var mx=0; for(var j=0;j<lines.length;j++) if(lines[j].length>mx) mx=lines[j].length;
  var fs=mx<=7?15:(mx<=10?13:(mx<=13?11.5:10.5));
  function tsp(t,y){
    var est=t.length*fs*0.72;
    var fit=est>112?' textLength="112" lengthAdjust="spacingAndGlyphs"':'';
    return '<text x="120" y="'+y+'" text-anchor="middle" font-size="'+fs+'" font-weight="800" letter-spacing="1.2" fill="#ffffff" paint-order="stroke" stroke="'+shade(c,-0.55)+'" stroke-width="2.6" stroke-linejoin="round"'+fit+'>'+t+'</text>';
  }
  var flavorTxt= lines.length===1 ? tsp(lines[0],252) : tsp(lines[0],245)+tsp(lines[1],261);
  // silhouette de la canette (33cl : large, epaule haute, base retrecie)
  var body='M64,66 L176,66 L188,90 L188,284 Q188,298 176,304 L171,309 Q164,313 152,313 L88,313 Q76,313 69,309 L64,304 Q52,298 52,284 L52,90 Z';
  return '<svg viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">'
  +'<defs>'
  // corps : degrade horizontal 5 stops dans la couleur du parfum
  +'<linearGradient id="mdb'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="'+shade(c,0.42)+'"/>'
  +'<stop offset="0.28" stop-color="'+shade(c,0.12)+'"/>'
  +'<stop offset="0.55" stop-color="'+c+'"/>'
  +'<stop offset="0.85" stop-color="'+shade(c,-0.28)+'"/>'
  +'<stop offset="1" stop-color="'+shade(c,-0.45)+'"/>'
  +'</linearGradient>'
  // couvercle aluminium
  +'<linearGradient id="mdl'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#f2f4f5"/>'
  +'<stop offset="0.5" stop-color="#c2c7cb"/>'
  +'<stop offset="1" stop-color="#878d92"/>'
  +'</linearGradient>'
  +'<clipPath id="mdc'+id+'"><path d="'+body+'"/></clipPath>'
  +'</defs>'
  // ombre au sol
  +'<ellipse cx="120" cy="331" rx="76" ry="10" fill="#000" opacity="0.15"/>'
  // corps de la canette
  +'<path d="'+body+'" fill="url(#mdb'+id+')" stroke="'+shade(c,-0.55)+'" stroke-width="2" stroke-linejoin="round"/>'
  +'<g clip-path="url(#mdc'+id+')">'
  // eclats anguleux discrets (teintes du parfum)
  +'<path d="M80,100 L110,85 L94,113 Z" fill="'+lt+'" opacity="0.45"/>'
  +'<path d="M150,92 L174,103 L157,121 Z" fill="'+lt+'" opacity="0.32"/>'
  +'<path d="M120,120 L136,112 L128,128 Z" fill="'+lt+'" opacity="0.35"/>'
  +'<path d="M84,272 L112,259 L97,287 Z" fill="'+shade(c,-0.35)+'" opacity="0.45"/>'
  +'<path d="M146,266 L174,278 L153,295 Z" fill="'+shade(c,-0.35)+'" opacity="0.4"/>'
  // bande diagonale sombre + logo
  +'<g transform="rotate(-12 120 180)">'
  +'<rect x="4" y="138" width="232" height="82" fill="#0f260c" stroke="'+lt+'" stroke-width="2.5"/>'
  +'<text x="120" y="172" text-anchor="middle" font-size="30" font-weight="900" font-style="italic" letter-spacing="2.5" fill="#ffffff">MTN</text>'
  +'<text x="120" y="209" text-anchor="middle" font-size="34" font-weight="900" font-style="italic" letter-spacing="3" fill="#e03131" paint-order="stroke" stroke="#ffffff" stroke-width="2.2" stroke-linejoin="round">DEW</text>'
  // PARFUM en capitales blanches sous la bande
  +flavorTxt
  +'</g>'
  // base : assombrissement + lisere aluminium
  +'<rect x="52" y="294" width="136" height="20" fill="'+shade(c,-0.5)+'" opacity="0.35"/>'
  +'<path d="M56,297 Q120,322 184,297" stroke="#d7dadd" stroke-width="4" fill="none" opacity="0.8"/>'
  // bord droit assombri
  +'<rect x="176" y="66" width="12" height="248" fill="'+shade(c,-0.55)+'" opacity="0.3"/>'
  // reflet vertical clair a gauche
  +'<rect x="60" y="78" width="14" height="222" rx="7" fill="#fff" opacity="0.3"/>'
  +'<rect x="64" y="84" width="5" height="210" rx="2.5" fill="#fff" opacity="0.5"/>'
  +'</g>'
  // couvercle aluminium
  +'<path d="M64,66 L52,90 L188,90 L176,66 Z" fill="url(#mdl'+id+')" opacity="0.28"/>'
  +'<ellipse cx="120" cy="66" rx="57" ry="11.5" fill="url(#mdl'+id+')" stroke="#767c81" stroke-width="1.6"/>'
  +'<ellipse cx="120" cy="66" rx="44" ry="8" fill="#b7bcc1" stroke="#8f959a" stroke-width="1.2"/>'
  +'<rect x="103" y="62" width="20" height="5.5" rx="2.7" fill="#cdd2d6" stroke="#8f959a" stroke-width="1"/>'
  +'<circle cx="131" cy="65" r="4.6" fill="#c4c9cd" stroke="#8f959a" stroke-width="1.2"/>'
  +'<path d="M66,63 Q120,52 174,63" stroke="#f4f6f7" stroke-width="1.6" fill="none" opacity="0.8"/>'
  +'</svg>';
};
