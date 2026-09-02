// Gabarit parametrique Arizona — grande canette haute 66cl, fond pastel du parfum,
// motifs decoratifs (fleurs de cerisier OU rayures fines), "AriZona" bordeaux en haut,
// parfum en capitales dans un cartouche clair. Un accent derive du NOM (rotation de
// teinte) garantit que deux parfums partageant la meme couleur catalogue restent distincts.
ART["arizona"]=function(d){
  var c=d.color||'#16a085', id=d.id, BX='#7c1f2e';
  // Parfum = nom sans prefixe de marque
  var fl=String(d.name||'').replace(new RegExp('^\\s*'+String(d.brand||'Arizona'),'i'),'')
        .replace(/arizona/ig,'').replace(/\s+/g,' ').trim()||'Original';
  fl=fl.toUpperCase();
  // Hash du parfum -> variation stable par NOM (pas seulement par couleur)
  var h=0; for(var z=0;z<fl.length;z++) h=(h*31+fl.charCodeAt(z))>>>0;
  // Rotation de teinte (hex -> hsl -> hex) pour l'accent du parfum
  function hue(hex,deg){
    var x=String(hex).replace('#',''),r=parseInt(x.substr(0,2),16)/255,g=parseInt(x.substr(2,2),16)/255,b=parseInt(x.substr(4,2),16)/255;
    var mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2,s2=0,hh=0,dd=mx-mn;
    if(dd>0){s2=l>0.5?dd/(2-mx-mn):dd/(mx+mn);
      if(mx===r)hh=((g-b)/dd+(g<b?6:0));else if(mx===g)hh=(b-r)/dd+2;else hh=(r-g)/dd+4;hh*=60;}
    hh=(hh+deg+360)%360;
    function f(n){var k=(n+hh/30)%12,a=s2*Math.min(l,1-l);
      return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1))));}
    return '#'+[f(0),f(8),f(4)].map(function(v){return v.toString(16).padStart(2,'0');}).join('');
  }
  var deg=((h%9)-4)*16;                 // -64..+64 deg, stable par parfum
  var ac=hue(c,deg);                    // accent du parfum (bandeau, motif, cartouche)
  // Luminance pour choisir texte clair ou fonce sur le bandeau
  var hx2=String(ac).replace('#',''),
      lum=0.299*parseInt(hx2.substr(0,2),16)+0.587*parseInt(hx2.substr(2,2),16)+0.114*parseInt(hx2.substr(4,2),16);
  var bandTxt=lum>165?shade(ac,-0.62):'#fff';
  // Decoupe du parfum en 1 ou 2 lignes equilibrees
  var words=fl.split(' '), lines=[fl];
  if(fl.length>10&&words.length>1){
    var best=null;
    for(var i=1;i<words.length;i++){
      var a=words.slice(0,i).join(' '), b=words.slice(i).join(' ');
      var m=Math.max(a.length,b.length);
      if(!best||m<best.m) best={m:m,a:a,b:b};
    }
    lines=[best.a,best.b];
  }
  var maxL=0; for(var j=0;j<lines.length;j++) maxL=Math.max(maxL,lines[j].length);
  var fs=Math.min(15,60/(0.64*maxL)); if(fs<8.5)fs=8.5;
  function tfit(s){var est=0.64*fs*s.length;return est>60?' textLength="60" lengthAdjust="spacingAndGlyphs"':'';}
  var body='M92,54 C86,62 82,72 82,84 L82,298 C82,306 84,311 89,315 C92,317.5 97,318 101,318 L139,318 C143,318 148,317.5 151,315 C156,311 158,306 158,298 L158,84 C158,72 154,62 148,54 Z';
  // Motif decoratif : 3 variantes par hash — fleurs de cerisier, rayures fines, bulles
  var pat='', pc=shade(ac,-0.05), off=(h%9)*2, vr=h%3;
  if(vr===0){
    var spots=[[97,140],[147,128],[89,238],[150,262],[118,300],[143,198],[93,200],[126,246]];
    for(var p=0;p<spots.length;p++){
      var bx=spots[p][0]+((p%2)?-off:off)*0.35, by=spots[p][1]+((p+h)%5)*1.5, s=(p%3===0?8:6);
      for(var k=0;k<5;k++){
        var ang=k*72+off*5;
        var px=bx+Math.cos(ang*Math.PI/180)*s*0.62, py=by+Math.sin(ang*Math.PI/180)*s*0.62;
        pat+='<ellipse cx="'+px.toFixed(1)+'" cy="'+py.toFixed(1)+'" rx="'+(s*0.52).toFixed(1)+'" ry="'+(s*0.34).toFixed(1)
           +'" fill="'+pc+'" opacity="0.45" transform="rotate('+ang+' '+px.toFixed(1)+' '+py.toFixed(1)+')"/>';
      }
      pat+='<circle cx="'+bx.toFixed(1)+'" cy="'+by.toFixed(1)+'" r="'+(s*0.3).toFixed(1)+'" fill="#fff" opacity="0.75"/>';
    }
  }else if(vr===1){
    var slope=(h%4===1)?-34:34;
    for(var q=0;q<15;q++){
      var x0=60+q*11+off;
      pat+='<path d="M'+x0+',40 L'+(x0+slope)+',330" stroke="'+pc+'" stroke-width="'+((q%3===0)?3.2:1.8)+'" opacity="0.34"/>';
    }
  }else{
    for(var u=0;u<28;u++){
      var ux=90+((u*53+h)%64), uy=52+((u*97+h*7)%266), ur=2.2+((u+h)%3)*1.6;
      pat+='<circle cx="'+ux+'" cy="'+uy+'" r="'+ur.toFixed(1)+'" fill="'+pc+'" opacity="0.4"/>'
         +((u%4===0)?'<circle cx="'+ux+'" cy="'+uy+'" r="'+(ur*0.45).toFixed(1)+'" fill="#fff" opacity="0.6"/>':'');
    }
  }
  // Cartouche parfum : 1 ou 2 lignes, texte fonce du parfum
  var ink=shade(ac,-0.55), cart;
  if(lines.length===1){
    cart='<rect x="85" y="148" width="70" height="35" rx="7" fill="#fdf9ee" stroke="'+shade(ac,-0.35)+'" stroke-width="1.8"/>'
    +'<text x="120" y="'+(165.5+fs*0.36).toFixed(1)+'" text-anchor="middle" font-size="'+fs.toFixed(1)+'" font-weight="800" fill="'+ink+'"'+tfit(lines[0])+'>'+lines[0]+'</text>';
  }else{
    cart='<rect x="85" y="141" width="70" height="50" rx="7" fill="#fdf9ee" stroke="'+shade(ac,-0.35)+'" stroke-width="1.8"/>'
    +'<text x="120" y="'+(157.5+fs*0.36).toFixed(1)+'" text-anchor="middle" font-size="'+fs.toFixed(1)+'" font-weight="800" fill="'+ink+'"'+tfit(lines[0])+'>'+lines[0]+'</text>'
    +'<text x="120" y="'+(174.5+fs*0.36).toFixed(1)+'" text-anchor="middle" font-size="'+fs.toFixed(1)+'" font-weight="800" fill="'+ink+'"'+tfit(lines[1])+'>'+lines[1]+'</text>';
  }
  return '<svg viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">'
  +'<defs>'
  // fond pastel vertical, 3 stops
  +'<linearGradient id="azb'+id+'" x1="0" y1="0" x2="0" y2="1">'
  +'<stop offset="0" stop-color="'+shade(c,0.62)+'"/>'
  +'<stop offset="0.5" stop-color="'+shade(c,0.5)+'"/>'
  +'<stop offset="1" stop-color="'+shade(c,0.34)+'"/>'
  +'</linearGradient>'
  // modelage cylindrique horizontal
  +'<linearGradient id="azs'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#fff" stop-opacity="0.3"/>'
  +'<stop offset="0.28" stop-color="#fff" stop-opacity="0"/>'
  +'<stop offset="0.78" stop-color="#000" stop-opacity="0"/>'
  +'<stop offset="1" stop-color="#000" stop-opacity="0.22"/>'
  +'</linearGradient>'
  // couvercle alu
  +'<linearGradient id="azt'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#f4f5f6"/>'
  +'<stop offset="0.5" stop-color="#c8ccd1"/>'
  +'<stop offset="1" stop-color="#969ca3"/>'
  +'</linearGradient>'
  // bandeau bas : accent du parfum
  +'<linearGradient id="azf'+id+'" x1="0" y1="0" x2="0" y2="1">'
  +'<stop offset="0" stop-color="'+ac+'"/>'
  +'<stop offset="0.55" stop-color="'+shade(ac,-0.14)+'"/>'
  +'<stop offset="1" stop-color="'+shade(ac,-0.34)+'"/>'
  +'</linearGradient>'
  +'<clipPath id="azc'+id+'"><path d="'+body+'"/></clipPath>'
  +'</defs>'
  // ombre au sol
  +'<ellipse cx="120" cy="334" rx="58" ry="8" fill="#000" opacity="0.13"/>'
  // corps de la canette
  +'<path d="'+body+'" fill="url(#azb'+id+')"/>'
  +'<g clip-path="url(#azc'+id+')">'
  +pat
  // anneau accent sous le col
  +'<rect x="80" y="66" width="80" height="6" fill="'+ac+'" opacity="0.85"/>'
  +'<rect x="80" y="72" width="80" height="1.6" fill="'+shade(ac,-0.35)+'" opacity="0.6"/>'
  // bandeau bas accent parfum
  +'<rect x="80" y="288" width="80" height="32" fill="url(#azf'+id+')"/>'
  +'<rect x="80" y="288" width="80" height="2.4" fill="#fff" opacity="0.4"/>'
  +'<text x="120" y="307" text-anchor="middle" font-size="10" font-weight="800" fill="'+bandTxt+'" letter-spacing="1">66cl</text>'
  // modelage cylindrique + reflet gauche + bord droit assombri
  +'<rect x="80" y="40" width="80" height="290" fill="url(#azs'+id+')"/>'
  +'<rect x="88" y="76" width="9" height="222" rx="4.5" fill="#fff" opacity="0.42"/>'
  +'<rect x="150" y="76" width="7" height="222" rx="3.5" fill="'+shade(c,-0.4)+'" opacity="0.22"/>'
  +'</g>'
  // contour de la canette
  +'<path d="'+body+'" fill="none" stroke="'+shade(c,-0.42)+'" stroke-width="2.4" stroke-linejoin="round"/>'
  // fond clair derriere le wordmark pour lisibilite sur motif
  +'<rect x="86" y="84" width="68" height="26" rx="6" fill="'+shade(c,0.62)+'" opacity="0.75"/>'
  // wordmark AriZona : grand A, grand Z, bordeaux
  +'<text x="120" y="104" text-anchor="middle" font-weight="800" fill="'+BX+'" textLength="62" lengthAdjust="spacingAndGlyphs">'
  +'<tspan font-size="29">A</tspan><tspan font-size="17">ri</tspan><tspan font-size="29">Z</tspan><tspan font-size="17">ona</tspan></text>'
  // ornement sous le wordmark
  +'<path d="M95,116 L113,116 M127,116 L145,116" stroke="'+BX+'" stroke-width="1.5" opacity="0.85"/>'
  +'<path d="M120,112 L124,116 L120,120 L116,116 Z" fill="'+BX+'"/>'
  // cartouche parfum
  +cart
  // categorie sous le cartouche
  +'<text x="120" y="207" text-anchor="middle" font-size="9" font-weight="700" fill="'+BX+'" letter-spacing="1.6" opacity="0.85">'+String(d.cat||'ICE TEA').toUpperCase()+'</text>'
  // couvercle alu
  +'<ellipse cx="120" cy="54" rx="28.5" ry="7" fill="url(#azt'+id+')" stroke="#7d848b" stroke-width="1.6"/>'
  +'<ellipse cx="120" cy="54" rx="20" ry="4.4" fill="#aeb4ba" stroke="#8b9198" stroke-width="1"/>'
  +'<rect x="114.5" y="51.4" width="11" height="4.4" rx="2.2" fill="#8b9198"/>'
  +'</svg>';
};
