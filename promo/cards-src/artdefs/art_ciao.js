// Gabarit parametrique « Ciao » — deux gammes :
//   cat==="Energy"  -> canette slim 250ml, corps couleur parfum, CIAO blanc penche
//   sinon           -> bouteille kombucha trapue, etiquette pleine hauteur, CIAO vertical
ART["ciao"]=function(d){
  var c=d.color||"#888888";
  var uid="ci"+(d.id||0);
  var flavor=String(d.name||"").replace(/^Ciao\s+/i,"").replace(/^(Energy|Kombucha)\s+/i,"").trim()||"Original";
  var FL=flavor.toUpperCase().replace(/&/g,"&amp;").replace(/</g,"&lt;");
  var F="system-ui,sans-serif";

  if(d.cat==="Energy"){
    // ---- CANETTE SLIM 250 ml ----
    var body="M88,58 L152,58 L162,78 L162,306 Q162,318 150,322 Q120,328 90,322 Q78,318 78,306 L78,78 Z";
    return '<svg viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg">'
      +'<defs>'
      +'<linearGradient id="'+uid+'b" x1="0" y1="0" x2="1" y2="0">'
        +'<stop offset="0" stop-color="'+shade(c,.22)+'"/>'
        +'<stop offset=".3" stop-color="'+shade(c,.06)+'"/>'
        +'<stop offset=".55" stop-color="'+c+'"/>'
        +'<stop offset=".82" stop-color="'+shade(c,-.22)+'"/>'
        +'<stop offset="1" stop-color="'+shade(c,-.42)+'"/>'
      +'</linearGradient>'
      +'<linearGradient id="'+uid+'m" x1="0" y1="0" x2="1" y2="0">'
        +'<stop offset="0" stop-color="#eef0f4"/><stop offset=".5" stop-color="#b7bbc4"/><stop offset="1" stop-color="#7f838c"/>'
      +'</linearGradient>'
      +'<linearGradient id="'+uid+'h" x1="0" y1="0" x2="0" y2="1">'
        +'<stop offset="0" stop-color="#fff" stop-opacity="0"/>'
        +'<stop offset=".16" stop-color="#fff" stop-opacity=".6"/>'
        +'<stop offset=".7" stop-color="#fff" stop-opacity=".26"/>'
        +'<stop offset="1" stop-color="#fff" stop-opacity="0"/>'
      +'</linearGradient>'
      +'<linearGradient id="'+uid+'d" x1="0" y1="0" x2="1" y2="0">'
        +'<stop offset="0" stop-color="#000" stop-opacity="0"/>'
        +'<stop offset=".72" stop-color="#000" stop-opacity="0"/>'
        +'<stop offset="1" stop-color="#000" stop-opacity=".3"/>'
      +'</linearGradient>'
      +'<clipPath id="'+uid+'c"><path d="'+body+'"/></clipPath>'
      +'</defs>'
      +'<ellipse cx="120" cy="336" rx="56" ry="8" fill="#000" opacity=".16"/>'
      +'<path d="'+body+'" fill="url(#'+uid+'b)"/>'
      +'<g clip-path="url(#'+uid+'c)">'
        // colibri stylise en haut a gauche
        +'<g transform="translate(92,80) scale(1.18)" fill="'+shade(c,.8)+'">'
          +'<path d="M0,8 L10,9.2 L10,10.8 Z"/>'
          +'<path d="M10,10 C11,4.6 17,3.6 20.4,6.8 C23.6,9.8 22.6,16 17,18.2 C12.6,19.8 10.2,16 10,10 Z"/>'
          +'<path d="M13,9 C11,2 17.4,-1.4 20.6,1.6 C20.6,5.8 16.4,8.2 13,9 Z"/>'
          +'<path d="M17,18 L24.6,23.4 L19.4,15.8 Z"/>'
        +'</g>'
        // logo CIAO penche + ENERGY
        +'<g transform="translate(122,192) rotate(-12)">'
          +'<text x="0" y="0" text-anchor="middle" font-family="'+F+'" font-style="italic" font-weight="900" font-size="54" letter-spacing="-1" fill="#fff" stroke="'+shade(c,-.28)+'" stroke-width="1.2" stroke-opacity=".55" paint-order="stroke" stroke-linejoin="round" textLength="78" lengthAdjust="spacingAndGlyphs">CIAO</text>'
          +'<text x="0" y="23" text-anchor="middle" font-family="'+F+'" font-style="italic" font-weight="800" font-size="12" letter-spacing="4" fill="'+shade(c,.55)+'" stroke="'+shade(c,-.3)+'" stroke-width="1" stroke-opacity=".55" paint-order="stroke" stroke-linejoin="round" textLength="68" lengthAdjust="spacingAndGlyphs">ENERGY</text>'
        +'</g>'
        // 250 ml
        +'<text x="120" y="316" text-anchor="middle" font-family="'+F+'" font-size="8.5" font-weight="600" letter-spacing="1.5" fill="#fff" opacity=".85">250 ml</text>'
        // parfum vertical a gauche
        +'<text transform="translate(86,196) rotate(-90)" text-anchor="middle" font-family="'+F+'" font-size="9" font-weight="800" letter-spacing="1.5" fill="'+shade(c,.88)+'" stroke="'+shade(c,-.3)+'" stroke-width="2.2" paint-order="stroke" stroke-linejoin="round">'+FL+'</text>'
        // assombrissement bord droit + reflet vertical gauche
        +'<rect x="78" y="56" width="86" height="274" fill="url(#'+uid+'d)"/>'
        +'<rect x="82" y="72" width="8" height="246" rx="4" fill="url(#'+uid+'h)" opacity=".55"/>'
      +'</g>'
      // couvercle aluminium
      +'<ellipse cx="120" cy="58" rx="33" ry="6.5" fill="url(#'+uid+'m)"/>'
      +'<ellipse cx="120" cy="57.5" rx="27" ry="4.4" fill="#d7dade"/>'
      +'<ellipse cx="120" cy="57.5" rx="27" ry="4.4" fill="none" stroke="#9aa0a8" stroke-width=".8"/>'
      +'<ellipse cx="120" cy="57.5" rx="8" ry="2.1" fill="none" stroke="#9aa0a8" stroke-width="1"/>'
      +'</svg>';
  }

  // ---- BOUTEILLE KOMBUCHA ----
  var bp="M98,57 L142,57 L142,80 C142,94 172,99 172,126 L172,306 Q172,320 158,324 Q120,330 82,324 Q68,320 68,306 L68,126 C68,99 98,94 98,80 Z";
  // parfum sur 1 ou 2 lignes
  var lines=[FL];
  var words=FL.split(" ");
  if(FL.length>12&&words.length>1){
    var l1=words[0],i=1;
    while(i<words.length&&(l1+" "+words[i]).length<=Math.ceil(FL.length/2)){l1+=" "+words[i];i++;}
    var l2=words.slice(i).join(" ");
    if(l2)lines=[l1,l2];
  }
  var flav=lines.length===2
    ? '<text x="120" y="136" text-anchor="middle" font-family="'+F+'" font-size="9" font-weight="800" letter-spacing="1.2" fill="'+shade(c,.9)+'" stroke="'+shade(c,-.3)+'" stroke-width="1.6" paint-order="stroke" stroke-linejoin="round">'+lines[0]+'</text>'
     +'<text x="120" y="147" text-anchor="middle" font-family="'+F+'" font-size="9" font-weight="800" letter-spacing="1.2" fill="'+shade(c,.9)+'" stroke="'+shade(c,-.3)+'" stroke-width="1.6" paint-order="stroke" stroke-linejoin="round">'+lines[1]+'</text>'
    : '<text x="120" y="141" text-anchor="middle" font-family="'+F+'" font-size="9.5" font-weight="800" letter-spacing="1.4" fill="'+shade(c,.9)+'" stroke="'+shade(c,-.3)+'" stroke-width="1.6" paint-order="stroke" stroke-linejoin="round">'+lines[0]+'</text>';
  var ciao="";
  var L=["C","I","A","O"];
  for(var k=0;k<4;k++){
    ciao+='<text x="120" y="'+(180+k*38)+'" text-anchor="middle" font-family="'+F+'" font-size="40" font-weight="800" fill="'+shade(c,.88)+'" stroke="'+shade(c,-.3)+'" stroke-width="1.4" paint-order="stroke" stroke-linejoin="round">'+L[k]+'</text>';
  }
  return '<svg viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg">'
    +'<defs>'
    +'<linearGradient id="'+uid+'g" x1="0" y1="0" x2="1" y2="0">'
      +'<stop offset="0" stop-color="'+shade(c,.6)+'"/>'
      +'<stop offset=".3" stop-color="'+shade(c,.38)+'"/>'
      +'<stop offset=".65" stop-color="'+shade(c,.14)+'"/>'
      +'<stop offset="1" stop-color="'+shade(c,-.2)+'"/>'
    +'</linearGradient>'
    +'<linearGradient id="'+uid+'e" x1="0" y1="0" x2="0" y2="1">'
      +'<stop offset="0" stop-color="'+shade(c,.18)+'"/>'
      +'<stop offset=".5" stop-color="'+c+'"/>'
      +'<stop offset="1" stop-color="'+shade(c,-.3)+'"/>'
    +'</linearGradient>'
    +'<linearGradient id="'+uid+'m" x1="0" y1="0" x2="1" y2="0">'
      +'<stop offset="0" stop-color="#eef0f4"/><stop offset=".5" stop-color="#b7bbc4"/><stop offset="1" stop-color="#7f838c"/>'
    +'</linearGradient>'
    +'<linearGradient id="'+uid+'h" x1="0" y1="0" x2="0" y2="1">'
      +'<stop offset="0" stop-color="#fff" stop-opacity="0"/>'
      +'<stop offset=".16" stop-color="#fff" stop-opacity=".6"/>'
      +'<stop offset=".7" stop-color="#fff" stop-opacity=".26"/>'
      +'<stop offset="1" stop-color="#fff" stop-opacity="0"/>'
    +'</linearGradient>'
    +'<linearGradient id="'+uid+'d" x1="0" y1="0" x2="1" y2="0">'
      +'<stop offset="0" stop-color="#000" stop-opacity="0"/>'
      +'<stop offset=".72" stop-color="#000" stop-opacity="0"/>'
      +'<stop offset="1" stop-color="#000" stop-opacity=".28"/>'
    +'</linearGradient>'
    +'<clipPath id="'+uid+'c"><path d="'+bp+'"/></clipPath>'
    +'</defs>'
    +'<ellipse cx="120" cy="338" rx="62" ry="9" fill="#000" opacity=".16"/>'
    +'<path d="'+bp+'" fill="url(#'+uid+'g)"/>'
    +'<g clip-path="url(#'+uid+'c)">'
      // espace d'air dans le goulot + menisque
      +'<rect x="98" y="57" width="44" height="12" fill="#fff" opacity=".38"/>'
      +'<line x1="98" y1="69" x2="142" y2="69" stroke="'+shade(c,-.25)+'" stroke-width="1" opacity=".45"/>'
      // liquide plus dense en bas
      +'<rect x="68" y="306" width="104" height="26" fill="'+shade(c,-.18)+'" opacity=".55"/>'
      // etiquette pleine hauteur
      +'<rect x="68" y="124" width="104" height="182" fill="url(#'+uid+'e)"/>'
      +'<line x1="68" y1="124" x2="172" y2="124" stroke="'+shade(c,-.35)+'" stroke-width="1" opacity=".4"/>'
      +'<line x1="68" y1="306" x2="172" y2="306" stroke="'+shade(c,-.35)+'" stroke-width="1" opacity=".4"/>'
      +flav
      +ciao
      +'<text x="120" y="305" text-anchor="middle" font-family="'+F+'" font-size="9.5" font-weight="800" letter-spacing="2.2" fill="'+shade(c,.9)+'" stroke="'+shade(c,-.3)+'" stroke-width="1.4" paint-order="stroke" stroke-linejoin="round">KOMBUCHA</text>'
      // assombrissement droit + reflets
      +'<rect x="68" y="56" width="104" height="276" fill="url(#'+uid+'d)"/>'
      +'<rect x="76" y="98" width="8" height="218" rx="4" fill="url(#'+uid+'h)" opacity=".55"/>'
      +'<rect x="101" y="58" width="4" height="20" rx="2" fill="#fff" opacity=".5"/>'
    +'</g>'
    // bouchon metal plat
    +'<rect x="93" y="44" width="54" height="14" rx="3" fill="url(#'+uid+'m)"/>'
    +'<rect x="93" y="54" width="54" height="3" fill="#7d828a" opacity=".65"/>'
    +'<line x1="103" y1="46" x2="103" y2="54" stroke="#8b9098" stroke-width="1" opacity=".6"/>'
    +'<line x1="114" y1="46" x2="114" y2="54" stroke="#8b9098" stroke-width="1" opacity=".6"/>'
    +'<line x1="126" y1="46" x2="126" y2="54" stroke="#8b9098" stroke-width="1" opacity=".6"/>'
    +'<line x1="137" y1="46" x2="137" y2="54" stroke="#8b9098" stroke-width="1" opacity=".6"/>'
    +'</svg>';
};
