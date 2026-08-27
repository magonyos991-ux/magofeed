// Gabarit parametrique Jarritos — bouteille en verre : corps court et trapu,
// col tres long et fin avec 4 anneaux, capsule couronne couleur du parfum,
// liquide eclatant d.color, etiquette blanche presque carree avec "Jarritos"
// en arc (couleur foncee du parfum) et le PARFUM en dessous.
ART["jarritos"]=function(d){
  var c=d.color||'#e67e22', id=d.id;
  var dk=shade(c,-0.45);
  // Parfum = nom sans le prefixe de marque
  var fl=String(d.name||'').replace(new RegExp('^\\s*'+String(d.brand||'Jarritos'),'i'),'').replace(/\s+/g,' ').trim()||'Original';
  var FL=fl.toUpperCase();
  // decoupe en 2 lignes si trop long
  var lines=[FL];
  if(FL.length>11 && FL.indexOf(' ')>-1){
    var ws=FL.split(' '), a='', b='';
    for(var i=0;i<ws.length;i++){ if(a.length<=FL.length/2-1) a+=(a?' ':'')+ws[i]; else b+=(b?' ':'')+ws[i]; }
    if(!b){ b=a.split(' ').pop(); a=a.split(' ').slice(0,-1).join(' '); }
    lines=[a,b];
  }
  var mx=0; for(var j=0;j<lines.length;j++) if(lines[j].length>mx) mx=lines[j].length;
  var fs=mx<=6?14:(mx<=9?12:(mx<=12?10.5:9.5));
  if(lines.length>1 && fs>10.5) fs=10.5;
  function tspan(t,y){
    var est=t.length*fs*0.68;
    var fit=est>80?' textLength="80" lengthAdjust="spacingAndGlyphs"':'';
    return '<text x="120" y="'+y+'" text-anchor="middle" font-size="'+fs+'" font-weight="800" letter-spacing="0.3" fill="'+dk+'"'+fit+'>'+t+'</text>';
  }
  var flavorTxt= lines.length===1 ? tspan(lines[0],292) : tspan(lines[0],286)+tspan(lines[1],298);
  // capsule couronne : bord crante en bas
  var zig='M100,30 Q100,25 105,25 L135,25 Q140,25 140,30 L140,41';
  for(var x=138;x>=102;x-=4){ zig+=' L'+x+',45 L'+(x-2)+',41'; }
  zig+=' Z';
  // 4 anneaux du col
  var rings='';
  var ry=[55,67,79,91];
  for(var k=0;k<4;k++){
    rings+='<rect x="104" y="'+ry[k]+'" width="32" height="7" rx="3.5" fill="url(#jn'+id+')" stroke="'+dk+'" stroke-width="1.6"/>';
  }
  return '<svg viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">'
  +'<defs>'
  // liquide vertical 3 stops
  +'<linearGradient id="jl'+id+'" x1="0" y1="0" x2="0" y2="1">'
  +'<stop offset="0" stop-color="'+shade(c,0.3)+'"/>'
  +'<stop offset="0.55" stop-color="'+c+'"/>'
  +'<stop offset="1" stop-color="'+shade(c,-0.25)+'"/>'
  +'</linearGradient>'
  // col / anneaux horizontal
  +'<linearGradient id="jn'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="'+shade(c,0.5)+'"/>'
  +'<stop offset="0.5" stop-color="'+shade(c,0.05)+'"/>'
  +'<stop offset="1" stop-color="'+shade(c,-0.35)+'"/>'
  +'</linearGradient>'
  // capsule couronne
  +'<linearGradient id="jc'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="'+shade(c,0.45)+'"/>'
  +'<stop offset="0.5" stop-color="'+shade(c,-0.05)+'"/>'
  +'<stop offset="1" stop-color="'+shade(c,-0.45)+'"/>'
  +'</linearGradient>'
  // etiquette blanche legerement chaude
  +'<linearGradient id="jw'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#ffffff"/>'
  +'<stop offset="0.6" stop-color="#f8f5ef"/>'
  +'<stop offset="1" stop-color="#e9e2d6"/>'
  +'</linearGradient>'
  // arc pour le mot Jarritos
  +'<path id="ja'+id+'" d="M83,263 Q120,235 157,263"/>'
  +'</defs>'
  // ombre au sol
  +'<ellipse cx="120" cy="334" rx="62" ry="9" fill="#000" opacity="0.14"/>'
  // silhouette bouteille remplie de liquide (col tres long + corps court et trapu)
  +'<path d="M109,46 L109,192 C109,212 66,210 66,240 L66,302 Q66,322 86,322 L154,322 Q174,322 174,302 L174,240 C174,210 131,212 131,192 L131,46 Z"'
  +' fill="url(#jl'+id+')" stroke="'+dk+'" stroke-width="2.5" stroke-linejoin="round"/>'
  // espace vide en haut du col + surface du liquide
  +'<rect x="110.4" y="47" width="19.2" height="13" fill="#edf4f7"/>'
  +'<ellipse cx="120" cy="60" rx="9.6" ry="2.6" fill="'+shade(c,0.45)+'"/>'
  // 4 anneaux du col
  +rings
  // bulles dans le corps
  +'<circle cx="90" cy="244" r="2.4" fill="#fff" opacity="0.55"/>'
  +'<circle cx="156" cy="226" r="2" fill="#fff" opacity="0.5"/>'
  +'<circle cx="99" cy="220" r="1.7" fill="#fff" opacity="0.5"/>'
  +'<circle cx="150" cy="316" r="2.2" fill="#fff" opacity="0.45"/>'
  // bande sombre a la base (assise du verre)
  +'<rect x="72" y="311" width="96" height="8" rx="4" fill="'+shade(c,-0.4)+'" opacity="0.3"/>'
  // reflet vertical clair a gauche
  +'<rect x="70" y="232" width="8" height="82" rx="4" fill="#fff" opacity="0.38"/>'
  +'<rect x="112" y="102" width="4" height="82" rx="2" fill="#fff" opacity="0.45"/>'
  // bord droit assombri
  +'<path d="M169,236 Q172,272 168,314" stroke="'+shade(c,-0.5)+'" stroke-width="6" fill="none" opacity="0.32" stroke-linecap="round"/>'
  +'<path d="M128.5,66 L128.5,186" stroke="'+shade(c,-0.5)+'" stroke-width="3" fill="none" opacity="0.3" stroke-linecap="round"/>'
  // etiquette blanche presque carree
  +'<rect x="76" y="232" width="88" height="78" rx="8" fill="url(#jw'+id+')" stroke="#d8d2c6" stroke-width="1.5"/>'
  // "Jarritos" en arc, couleur foncee du parfum
  +'<text font-size="20" font-weight="800" font-style="italic" fill="'+dk+'" letter-spacing="0.3">'
  +'<textPath href="#ja'+id+'" startOffset="50%" text-anchor="middle">Jarritos</textPath></text>'
  // petit trait sous l\'arc
  +'<path d="M98,271 Q120,278 142,271" stroke="'+dk+'" stroke-width="1.6" fill="none" stroke-linecap="round"/>'
  // PARFUM
  +flavorTxt
  // capsule couronne couleur du parfum
  +'<path d="'+zig+'" fill="url(#jc'+id+')" stroke="'+shade(c,-0.55)+'" stroke-width="1.8" stroke-linejoin="round"/>'
  +'<rect x="106" y="27.5" width="8" height="14" rx="3.5" fill="#fff" opacity="0.4"/>'
  +'</svg>';
};
