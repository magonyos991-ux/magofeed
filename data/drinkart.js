/* ═══ MOTEUR DE DESSIN PAR BOISSON ═══════════════════════════════════════
   Chaque marque a son GABARIT (l'identite reelle du produit : le CIAO blanc
   penche sur canette couleur du parfum, la bouteille Codd du Ramune, la
   canette noire a eclaboussure du Tango...) et chaque parfum le decline avec
   SA couleur (d.color) et SON nom — plus jamais la meme image pour deux
   boissons differentes. Les marques sans gabarit passent par « generique »,
   qui reste distinct par boisson (couleur + marque + parfum ecrits).
   Une nouvelle boisson ajoutee au catalogue a donc son dessin immediatement.
   Assemble par scratchpad/assembler_art.py — ne pas editer a la main. */
var ART={};
function shade(hex,f){hex=String(hex||'#888').replace('#','');
 var r=parseInt(hex.substr(0,2),16),g=parseInt(hex.substr(2,2),16),b=parseInt(hex.substr(4,2),16);
 if(f>=0){r+=(255-r)*f;g+=(255-g)*f;b+=(255-b)*f;}else{r*=1+f;g*=1+f;b*=1+f;}
 return '#'+[r,g,b].map(function(x){return Math.round(Math.max(0,Math.min(255,x))).toString(16).padStart(2,'0');}).join('');}
function artPourBoisson(d){
  if(!d||!d.brand)return null;
  var b=(d.brand||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  /* Alias : les fabricants de ramune (Hata Kosen, Sangaria) partagent le
     gabarit de la bouteille Codd. */
  if(b==="hata kosen"||b==="sangaria")b="ramune";
  var fn=ART[b]||ART["generique"];
  if(!fn)return null;
  try{return fn(d);}catch(e){return null;}
}


/* ── art_arizona.js ── */
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


/* ── art_calpico.js ── */
// Gabarit parametrique Calpico — bouteille PET blanche opaque legerement cintree.
// Chaque parfum : bouchon d.color, pois disperses d.color (tailles variees),
// "CALPICO" en teinte foncee du parfum, nom du parfum en dessous.
// Variante "Calpis Soda" : chip SODA + petites bulles (pour la distinguer du meme parfum non gazeux).
ART["calpico"]=function(d){
  var c=d.color||'#f5b7b1', id=d.id;
  var isSoda=/soda/i.test(String(d.name||''));
  // Parfum = nom sans prefixe de marque
  var fl=String(d.name||'')
    .replace(/calpis\s*soda/ig,'').replace(/calpico/ig,'').replace(/calpis/ig,'')
    .replace(new RegExp(String(d.brand||''),'ig'),'').replace(/\s+/g,' ').trim()||'Original';
  var n=fl.length;
  var ffs=n<=6?13:(n<=9?11.5:(n<=12?10.5:10));
  var est=ffs*0.6*n;
  var tfit=est>78?' textLength="78" lengthAdjust="spacingAndGlyphs"':'';
  // luminance : les parfums tres pales (Original, Litchi) ont besoin de tons renforces
  var h=String(c).replace('#',''),
      lum=0.299*parseInt(h.substr(0,2),16)+0.587*parseInt(h.substr(2,2),16)+0.114*parseInt(h.substr(4,2),16);
  var cc=lum>205?shade(c,-0.18):c;   // couleur de base renforcee si pale
  var dk=shade(cc,-0.5);             // teinte foncee du parfum (textes)
  var d1=cc, d2=shade(cc,-0.2), d3=lum>205?shade(c,-0.06):shade(c,0.22);  // 3 tons de pois
  var s='<svg viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">'
  +'<defs>'
  // plastique blanc laiteux : reflet a gauche, bord droit assombri (3+ stops)
  +'<linearGradient id="cpb'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#ffffff"/>'
  +'<stop offset="0.22" stop-color="#fffdfb"/>'
  +'<stop offset="0.6" stop-color="#f4f0ec"/>'
  +'<stop offset="1" stop-color="#d8d1cb"/>'
  +'</linearGradient>'
  // bouchon : couleur du parfum, 3 stops
  +'<linearGradient id="cpc'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="'+shade(cc,0.3)+'"/>'
  +'<stop offset="0.45" stop-color="'+cc+'"/>'
  +'<stop offset="1" stop-color="'+shade(cc,-0.32)+'"/>'
  +'</linearGradient>'
  +'</defs>'
  // ombre au sol
  +'<ellipse cx="120" cy="336" rx="60" ry="9" fill="#000" opacity="0.12"/>'
  // corps PET blanc opaque, legerement cintre
  +'<path d="M100,57 L100,72 C99,84 76,94 73,120 C70,148 84,170 83,204 C82,242 71,260 71,298 L71,313 Q71,331 89,331 L151,331 Q169,331 169,313 L169,298 C169,260 158,242 157,204 C156,170 170,148 167,120 C164,94 141,84 140,72 L140,57 Z"'
  +' fill="url(#cpb'+id+')" stroke="#c7bfb9" stroke-width="2.5" stroke-linejoin="round"/>'
  // ombre douce sous l epaule (plastique laiteux)
  +'<path d="M78,126 Q120,140 162,126" stroke="#d8d1cb" stroke-width="5" fill="none" opacity="0.45" stroke-linecap="round"/>'
  // pois epars couleur parfum, tailles variees — epaule
  +'<circle cx="100" cy="100" r="5" fill="'+d1+'"/>'
  +'<circle cx="127" cy="93" r="7" fill="'+d3+'"/>'
  +'<circle cx="150" cy="109" r="4" fill="'+d2+'"/>'
  // pois epars — ventre
  +'<circle cx="93" cy="216" r="6" fill="'+d2+'"/>'
  +'<circle cx="119" cy="209" r="9" fill="'+d1+'"/>'
  +'<circle cx="147" cy="222" r="5" fill="'+d3+'"/>'
  +'<circle cx="100" cy="247" r="10" fill="'+d3+'"/>'
  +'<circle cx="135" cy="253" r="6.5" fill="'+d2+'"/>'
  +'<circle cx="157" cy="241" r="4" fill="'+d1+'"/>'
  +'<circle cx="88" cy="279" r="5" fill="'+d1+'"/>'
  +'<circle cx="117" cy="285" r="11" fill="'+d2+'"/>'
  +'<circle cx="149" cy="288" r="7" fill="'+d3+'"/>'
  +'<circle cx="97" cy="311" r="7" fill="'+d3+'"/>'
  +'<circle cx="131" cy="316" r="5" fill="'+d1+'"/>'
  +'<circle cx="158" cy="310" r="4.5" fill="'+d2+'"/>'
  // reflet vertical clair a gauche (sous les textes)
  +'<rect x="79" y="134" width="9" height="168" rx="4.5" fill="#fff" opacity="0.75"/>'
  +'<path d="M96,80 Q86,96 82,116" stroke="#fff" stroke-width="5" fill="none" opacity="0.8" stroke-linecap="round"/>'
  // bord droit assombri
  +'<rect x="156" y="134" width="7" height="170" rx="3.5" fill="#a99f97" opacity="0.32"/>'
  +'<path d="M145,80 Q156,96 160,118" stroke="#a99f97" stroke-width="4" fill="none" opacity="0.35" stroke-linecap="round"/>'
  // marque en haut, teinte foncee du parfum
  +'<text x="120" y="157" text-anchor="middle" font-size="21" font-weight="800" fill="'+dk+'" textLength="74" lengthAdjust="spacingAndGlyphs">CALPICO</text>'
  // parfum en dessous, en petit
  +'<text x="120" y="177" text-anchor="middle" font-size="'+ffs+'" font-weight="700" fill="'+dk+'"'+tfit+'>'+fl+'</text>'
  +(isSoda
    ? '<rect x="94" y="182" width="52" height="15" rx="7.5" fill="'+dk+'"/>'
     +'<text x="120" y="193.5" text-anchor="middle" font-size="10" font-weight="800" fill="#fff" letter-spacing="1.6">SODA</text>'
     // bulles gazeuses : anneaux blancs sur les gros pois -> motif different a taille icone
     +'<circle cx="119" cy="209" r="4.5" fill="none" stroke="#fff" stroke-width="2.2" opacity="0.9"/>'
     +'<circle cx="100" cy="247" r="5" fill="none" stroke="#fff" stroke-width="2.2" opacity="0.9"/>'
     +'<circle cx="117" cy="285" r="5.5" fill="none" stroke="#fff" stroke-width="2.2" opacity="0.9"/>'
     +'<circle cx="149" cy="288" r="3.5" fill="none" stroke="#fff" stroke-width="2" opacity="0.9"/>'
     +'<circle cx="88" cy="145" r="2.2" fill="'+d2+'" opacity="0.8"/>'
     +'<circle cx="153" cy="152" r="1.8" fill="'+d2+'" opacity="0.8"/>'
     +'<circle cx="92" cy="188" r="1.8" fill="'+d2+'" opacity="0.8"/>'
     +'<circle cx="150" cy="184" r="2.2" fill="'+d2+'" opacity="0.8"/>'
    : '')
  // collerette blanche sous le bouchon
  +'<rect x="97" y="55" width="46" height="6" rx="3" fill="#efeae5" stroke="#c7bfb9" stroke-width="1.4"/>'
  // bouchon couleur parfum, strie
  +'<rect x="95" y="27" width="50" height="26" rx="5" fill="url(#cpc'+id+')"/>'
  +'<rect x="93" y="47" width="54" height="8" rx="4" fill="'+shade(c,-0.25)+'"/>'
  +'<path d="M103,30 L103,46 M110,30 L110,46 M117,30 L117,46 M124,30 L124,46 M131,30 L131,46 M138,30 L138,46" stroke="'+shade(c,-0.42)+'" stroke-width="1.6" opacity="0.55"/>'
  +'<rect x="99" y="30" width="5" height="14" rx="2.5" fill="#fff" opacity="0.45"/>'
  +'</svg>';
  return s;
};


/* ── art_chupa-chups.js ── */
// Gabarit parametrique Chupa Chups Sparkling — canette SLIM 25cl.
// Identite : corps degrade couleur du parfum, bande blanche centrale facon
// papier de sucette (rayures obliques aux extremites), badge fleur jaune
// 8 petales a coeur rouge "Chupa Chups", "sparkling" en italique puis le
// PARFUM en capitales sous la bande, couvercle aluminium.
ART["chupa chups"]=function(d){
  var c=d.color||'#e74c3c', id=d.id;
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  // Parfum = nom sans le prefixe de marque ni la gamme "Sparkling"
  var fl=String(d.name||'')
    .replace(new RegExp(String(d.brand||'Chupa Chups'),'ig'),'')
    .replace(/chupa\s*chups/ig,'').replace(/sparkling/ig,'')
    .replace(/\s+/g,' ').trim()||'Original';
  // Cesure en 1 ou 2 lignes equilibrees
  var words=fl.toUpperCase().split(' '), lines;
  if(fl.length<=11||words.length===1){lines=[words.join(' ')];}
  else{
    var best=null;
    for(var i=1;i<words.length;i++){
      var a=words.slice(0,i).join(' '), b=words.slice(i).join(' ');
      var m=Math.max(a.length,b.length);
      if(!best||m<best.m)best={m:m,a:a,b:b};
    }
    lines=[best.a,best.b];
  }
  var L=0; for(var j=0;j<lines.length;j++) L=Math.max(L,lines[j].length);
  var fs=lines.length===1?(L<=6?15:L<=8?13.5:L<=10?12:11):(L<=8?12.5:L<=11?11.5:L<=14?10.5:9.5);
  var ls=L<=8?1.4:0.5;
  // Couleur du texte selon la clarte du parfum
  var hx=String(c).replace('#','');
  var lum=(0.299*parseInt(hx.substr(0,2),16)+0.587*parseInt(hx.substr(2,2),16)+0.114*parseInt(hx.substr(4,2),16))/255;
  var tc=lum>0.62?shade(c,-0.62):'#ffffff';
  var cl=(d.formats&&d.formats[0]&&d.formats[0].cl?d.formats[0].cl:25)+' cl';
  // Silhouette de la canette slim
  var P='M84,74 C76,80 71,86 71,94 L71,290 C71,299 74,305 78,311 C81,316 84,319 92,319 L148,319 C156,319 159,316 162,311 C166,305 169,299 169,290 L169,94 C169,86 164,80 156,74 Z';
  // Rayures obliques (papier de sucette torsade), miroir gauche/droite
  var sl='',sr='';
  for(var t=30;t<118;t+=10){
    sl+='<path d="M'+t+',224 L'+(t+42)+',144" stroke="'+c+'" stroke-width="5" opacity="0.95"/>';
  }
  for(var u=124;u<212;u+=10){
    sr+='<path d="M'+u+',224 L'+(u-42)+',144" stroke="'+c+'" stroke-width="5" opacity="0.95"/>';
  }
  // Fleur jaune 8 petales
  var petals='';
  for(var k=0;k<8;k++){
    petals+='<ellipse cx="0" cy="-23" rx="9.5" ry="14" fill="#f9d61b" stroke="#e2b40c" stroke-width="1" transform="rotate('+(k*45)+')"/>';
  }
  // Lignes du parfum
  var ftxt='';
  var y0=lines.length===1?263:255;
  for(var t=0;t<lines.length;t++){
    var len=lines[t].length;
    var est=len*fs*0.7+(len-1)*ls;
    var tfit=est>88?' textLength="88" lengthAdjust="spacingAndGlyphs"':'';
    ftxt+='<text x="120" y="'+(y0+t*fs*1.18)+'" text-anchor="middle" font-size="'+fs+'" font-weight="800" letter-spacing="'+ls+'" fill="'+tc+'"'+tfit+'>'+esc(lines[t])+'</text>';
  }
  return '<svg viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">'
  +'<defs>'
  // corps : degrade vertical du parfum (4 stops)
  +'<linearGradient id="ccb'+id+'" x1="0" y1="0" x2="0" y2="1">'
  +'<stop offset="0" stop-color="'+shade(c,0.3)+'"/>'
  +'<stop offset="0.42" stop-color="'+c+'"/>'
  +'<stop offset="0.78" stop-color="'+shade(c,-0.16)+'"/>'
  +'<stop offset="1" stop-color="'+shade(c,-0.36)+'"/>'
  +'</linearGradient>'
  // galbe cylindrique : reflet a gauche, bord droit assombri
  +'<linearGradient id="cco'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#ffffff" stop-opacity="0.5"/>'
  +'<stop offset="0.17" stop-color="#ffffff" stop-opacity="0.07"/>'
  +'<stop offset="0.45" stop-color="#ffffff" stop-opacity="0"/>'
  +'<stop offset="0.78" stop-color="#000000" stop-opacity="0"/>'
  +'<stop offset="0.93" stop-color="#000000" stop-opacity="0.16"/>'
  +'<stop offset="1" stop-color="#000000" stop-opacity="0.32"/>'
  +'</linearGradient>'
  // couvercle aluminium
  +'<linearGradient id="ccl'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#eef1f3"/>'
  +'<stop offset="0.45" stop-color="#c3cad0"/>'
  +'<stop offset="1" stop-color="#8d959c"/>'
  +'</linearGradient>'
  +'<clipPath id="ccp'+id+'"><path d="'+P+'"/></clipPath>'
  +'<clipPath id="ccsl'+id+'"><rect x="71" y="152" width="24" height="64"/></clipPath>'
  +'<clipPath id="ccsr'+id+'"><rect x="145" y="152" width="24" height="64"/></clipPath>'
  +'</defs>'
  // ombre au sol
  +'<ellipse cx="120" cy="331" rx="56" ry="8" fill="#000" opacity="0.15"/>'
  // corps colore
  +'<path d="'+P+'" fill="url(#ccb'+id+')"/>'
  +'<g clip-path="url(#ccp'+id+')">'
  // bulles (soda petillant)
  +'<g fill="#ffffff" opacity="0.35">'
  +'<circle cx="100" cy="112" r="3"/><circle cx="128" cy="100" r="2.2"/>'
  +'<circle cx="112" cy="133" r="2"/><circle cx="141" cy="124" r="2.8"/>'
  +'<circle cx="90" cy="139" r="1.8"/><circle cx="98" cy="287" r="2"/>'
  +'<circle cx="143" cy="293" r="2.4"/>'
  +'</g>'
  // bande blanche centrale, papier de sucette
  +'<rect x="71" y="152" width="98" height="64" fill="#ffffff"/>'
  +'<g clip-path="url(#ccsl'+id+')">'+sl+'</g>'
  +'<g clip-path="url(#ccsr'+id+')">'+sr+'</g>'
  +'<line x1="71" y1="152" x2="169" y2="152" stroke="'+shade(c,-0.25)+'" stroke-width="1" opacity="0.45"/>'
  +'<line x1="71" y1="216" x2="169" y2="216" stroke="'+shade(c,-0.25)+'" stroke-width="1" opacity="0.45"/>'
  // ombres internes haut/bas
  +'<rect x="71" y="76" width="98" height="12" fill="#000" opacity="0.06"/>'
  +'<ellipse cx="120" cy="321" rx="46" ry="7" fill="#000" opacity="0.18"/>'
  // galbe + reflet vertical clair a gauche
  +'<rect x="66" y="60" width="108" height="266" fill="url(#cco'+id+')"/>'
  +'<rect x="79" y="102" width="8" height="192" rx="4" fill="#ffffff" opacity="0.4"/>'
  +'</g>'
  // badge fleur pose sur la bande, sur un disque blanc
  +'<g transform="translate(120,184)">'
  +'<circle r="38.5" fill="#ffffff" stroke="'+shade(c,-0.3)+'" stroke-width="1" stroke-opacity="0.25"/>'
  +petals
  +'<circle r="17.5" fill="#e0242a" stroke="#b8161c" stroke-width="1"/>'
  +'<text x="0" y="-2.5" text-anchor="middle" font-size="8" font-style="italic" font-weight="700" fill="#ffffff">Chupa</text>'
  +'<text x="0" y="7.5" text-anchor="middle" font-size="8" font-style="italic" font-weight="700" fill="#ffffff">Chups</text>'
  +'</g>'
  // gamme + parfum sous la bande
  +'<text x="120" y="238" text-anchor="middle" font-size="11" font-style="italic" font-weight="600" letter-spacing="0.5" fill="'+tc+'" opacity="0.92">sparkling</text>'
  +ftxt
  // contenance
  +'<text x="120" y="306" text-anchor="middle" font-size="8.5" font-weight="600" letter-spacing="1" fill="'+tc+'" opacity="0.8">'+cl+'</text>'
  // contour du corps
  +'<path d="'+P+'" fill="none" stroke="'+shade(c,-0.55)+'" stroke-width="1.5" opacity="0.6"/>'
  // couvercle aluminium
  +'<ellipse cx="120" cy="74" rx="38" ry="8.5" fill="url(#ccl'+id+')" stroke="#7d868e" stroke-width="1.5"/>'
  +'<ellipse cx="120" cy="74" rx="30" ry="5.5" fill="#c7ced4" stroke="#939ba3" stroke-width="1"/>'
  +'<rect x="113" y="70" width="14" height="6.5" rx="3" fill="#aab2b9" stroke="#7d868e" stroke-width="1"/>'
  +'<circle cx="117" cy="73.2" r="1.9" fill="#8b939b"/>'
  +'</svg>';
};


/* ── art_ciao.js ── */
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


/* ── art_generique.js ── */
// Gabarit generique parametrique — canette 33cl (defaut) ou bouteille
// (formats[0].type==="bouteille"). Corps/liquide = degrade de d.color,
// etiquette blanche : MARQUE en capitales grasses sombres (taille adaptee),
// PARFUM en petites capitales couleur foncee du parfum.
ART["generique"]=function(d){
  var c=d.color||'#888888', id=d.id||0;
  var isBottle=!!(d.formats&&d.formats[0]&&d.formats[0].type==="bouteille");
  var cl=(d.formats&&d.formats[0]&&d.formats[0].cl)||33;
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  // ---- textes -------------------------------------------------------------
  var brand=String(d.brand||'').trim()||'?';
  var fl=String(d.name||'').replace(new RegExp('^\\s*'+brand.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),'')
        .replace(/\([^)]*\)?/g,'').replace(/\s+/g,' ').trim()||'Original';
  var BR=brand.toUpperCase(), FL=fl.toUpperCase();
  function split2(T,limit){
    if(T.length<=limit||T.indexOf(' ')<0) return [T];
    var ws=T.split(' '),a='',b='';
    for(var i=0;i<ws.length;i++){ if(a.length<T.length/2) a+=(a?' ':'')+ws[i]; else b+=(b?' ':'')+ws[i]; }
    if(!b){ b=a.split(' ').pop(); a=a.split(' ').slice(0,-1).join(' '); }
    return [a,b];
  }
  var maxW = isBottle? 68 : 74;             // largeur utile de l'etiquette
  var bl=split2(BR,9);
  var bmx=0; for(var i1=0;i1<bl.length;i1++) if(bl[i1].length>bmx) bmx=bl[i1].length;
  var bfs = bmx<=4?21 : bmx<=6?18 : bmx<=8?15 : bmx<=10?12.5 : bmx<=13?10.5 : 9;
  var fll=split2(FL,12);
  var fmx=0; for(var i2=0;i2<fll.length;i2++) if(fll[i2].length>fmx) fmx=fll[i2].length;
  var ffs = fmx<=8?9.5 : fmx<=12?8.5 : 7.5;
  var dkTxt='#23262b', flCol=shade(c,-0.45);
  function line(t,y,fs,w,fill,ls,mw){
    var est=t.length*(fs*0.78+ls);
    var fit=est>mw?' textLength="'+mw+'" lengthAdjust="spacingAndGlyphs"':'';
    return '<text x="120" y="'+y+'" text-anchor="middle" font-size="'+fs+'" font-weight="'+w+'" letter-spacing="'+ls+'" fill="'+fill+'"'+fit+'>'+esc(t)+'</text>';
  }
  // bloc etiquette centre autour de yMid
  function labelBlock(yMid){
    var bh=bl.length*(bfs+2), fh=fll.length*(ffs+2);
    var total=bh+8+fh, y=yMid-total/2+bfs;
    var s='';
    for(var j=0;j<bl.length;j++){ s+=line(bl[j],y,bfs,800,dkTxt,0.5,maxW); y+=bfs+2; }
    y+=3;
    s+='<line x1="100" y1="'+(y-ffs+1)+'" x2="140" y2="'+(y-ffs+1)+'" stroke="'+c+'" stroke-width="2" stroke-linecap="round"/>';
    y+=4;
    for(var k=0;k<fll.length;k++){ s+=line(fll[k],y,ffs,700,flCol,1.1,maxW-8); y+=ffs+2; }
    return s;
  }
  var D='<defs>'
  +'<linearGradient id="gb'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="'+shade(c,0.45)+'"/>'
  +'<stop offset="0.16" stop-color="'+shade(c,0.15)+'"/>'
  +'<stop offset="0.5" stop-color="'+c+'"/>'
  +'<stop offset="0.86" stop-color="'+shade(c,-0.35)+'"/>'
  +'<stop offset="1" stop-color="'+shade(c,-0.08)+'"/>'
  +'</linearGradient>'
  +'<linearGradient id="gw'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#ffffff"/>'
  +'<stop offset="0.55" stop-color="#fdfdfd"/>'
  +'<stop offset="1" stop-color="#e3e4e8"/>'
  +'</linearGradient>'
  +'<linearGradient id="gl'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#eceef1"/>'
  +'<stop offset="0.5" stop-color="#aab0b8"/>'
  +'<stop offset="1" stop-color="#71767e"/>'
  +'</linearGradient>'
  +'</defs>';

  if(!isBottle){
    // ================= CANETTE 33cl =================
    var body='M77,58 C73,64 72,70 72,78 L72,288 C72,300 75,308 81,314 L83,317 C85,320 89,321 95,321 L145,321 C151,321 155,320 157,317 L159,314 C165,308 168,300 168,288 L168,78 C168,70 167,64 163,58 Z';
    return '<svg viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">'
    +D
    +'<defs><clipPath id="gc'+id+'"><path d="'+body+'"/></clipPath></defs>'
    +'<ellipse cx="120" cy="336" rx="58" ry="8" fill="#000" opacity="0.16"/>'
    +'<path d="'+body+'" fill="url(#gb'+id+')" stroke="'+shade(c,-0.55)+'" stroke-width="1.4"/>'
    +'<g clip-path="url(#gc'+id+')">'
    // bulles decoratives discretes, positions jitterees par d.id
    +(function(){
      var s='', BX=[95,140,152,90,146,112], BY=[105,90,118,268,282,255], BR=[7,4.5,6,5,7,3.5];
      for(var q=0;q<6;q++){
        var jx=((id*17+q*29)%11)-5, jy=((id*23+q*13)%15)-7;
        s+='<circle cx="'+(BX[q]+jx)+'" cy="'+(BY[q]+jy)+'" r="'+BR[q]+'" fill="'+shade(c,0.3+0.03*(q%3))+'" opacity="0.'+(4+q%2)+'"/>';
      }
      return s;
    })()
    // balayage brillant diagonal
    +'<polygon points="88,58 118,58 78,321 62,321" fill="#fff" opacity="0.09"/>'
    +'</g>'
    // etiquette blanche
    +'<rect x="79" y="140" width="82" height="96" rx="11" fill="url(#gw'+id+')" stroke="'+shade(c,-0.3)+'" stroke-width="1" opacity="0.98"/>'
    +labelBlock(188)
    +'<text x="120" y="306" text-anchor="middle" font-size="10" font-weight="600" letter-spacing="1.5" fill="'+shade(c,0.6)+'">33cl</text>'
    // reflet vertical clair a gauche
    +'<rect x="79" y="76" width="8" height="230" rx="4" fill="#fff" opacity="0.28"/>'
    +'<rect x="81" y="86" width="4" height="120" rx="2" fill="#fff" opacity="0.3"/>'
    // bord droit assombri
    +'<path d="M162,72 L162,306" stroke="#000" stroke-width="7" opacity="0.28" stroke-linecap="round"/>'
    // couvercle aluminium
    +'<path d="M77,58 Q120,50 163,58 L163,63 Q120,71 77,63 Z" fill="url(#gl'+id+')" stroke="#5c6167" stroke-width="1"/>'
    +'<path d="M80,57.2 Q120,50.4 160,57.2" fill="none" stroke="#f4f6f8" stroke-width="2.4" stroke-linecap="round"/>'
    +'<path d="M84,319 Q120,326 156,319" fill="none" stroke="'+shade(c,-0.5)+'" stroke-width="2.4" stroke-linecap="round"/>'
    +'</svg>';
  }

  // ================= BOUTEILLE =================
  var sil='M106,52 L106,86 C106,97 98,104 90,112 C81,121 77,131 77,144 L77,298 C77,313 85,322 100,322 L140,322 C155,322 163,313 163,298 L163,144 C163,131 159,121 150,112 C142,104 134,97 134,86 L134,52 Z';
  return '<svg viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">'
  +D
  +'<defs><clipPath id="gc'+id+'"><path d="'+sil+'"/></clipPath></defs>'
  +'<ellipse cx="120" cy="336" rx="56" ry="8" fill="#000" opacity="0.16"/>'
  // verre
  +'<path d="'+sil+'" fill="#eef2f5" stroke="'+shade(c,-0.5)+'" stroke-width="1.4"/>'
  +'<g clip-path="url(#gc'+id+')">'
  // liquide (niveau sous le goulot)
  +'<rect x="70" y="80" width="100" height="250" fill="url(#gb'+id+')"/>'
  +'<ellipse cx="120" cy="80" rx="15" ry="4" fill="'+shade(c,0.3)+'"/>'
  // fines bulles montantes dans le liquide, jitterees par d.id
  +(function(){
    var s='';
    for(var q=0;q<5;q++){
      var bx=92+((id*19+q*37)%56), by=130+((id*11+q*53)%160);
      s+='<circle cx="'+bx+'" cy="'+by+'" r="'+(2+q%3)+'" fill="'+shade(c,0.4)+'" opacity="0.5"/>';
    }
    return s;
  })()
  +'<polygon points="92,110 116,110 84,322 68,322" fill="#fff" opacity="0.10"/>'
  +'</g>'
  // etiquette blanche
  +'<rect x="81" y="168" width="78" height="90" rx="9" fill="url(#gw'+id+')" stroke="'+shade(c,-0.3)+'" stroke-width="1"/>'
  +labelBlock(213)
  +'<text x="120" y="288" text-anchor="middle" font-size="9" font-weight="600" letter-spacing="1.3" fill="'+shade(c,0.65)+'">'+cl+'cl</text>'
  // reflet vertical clair a gauche
  +'<rect x="84" y="130" width="7" height="176" rx="3.5" fill="#fff" opacity="0.4"/>'
  +'<rect x="109" y="58" width="4" height="26" rx="2" fill="#fff" opacity="0.5"/>'
  // bord droit assombri
  +'<path d="M157,140 L157,304" stroke="#000" stroke-width="6" opacity="0.2" stroke-linecap="round"/>'
  // bouchon couleur foncee du parfum
  +'<rect x="102" y="32" width="36" height="22" rx="4" fill="'+shade(c,-0.45)+'" stroke="'+shade(c,-0.6)+'" stroke-width="1"/>'
  +'<rect x="102" y="36" width="36" height="2.6" fill="'+shade(c,-0.2)+'" opacity="0.8"/>'
  +'<rect x="102" y="42" width="36" height="2.6" fill="'+shade(c,-0.2)+'" opacity="0.8"/>'
  +'<rect x="106" y="33.5" width="5" height="19" rx="2.5" fill="#fff" opacity="0.25"/>'
  +'</svg>';
};


/* ── art_jarritos.js ── */
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


/* ── art_milkis.js ── */
// Gabarit parametrique Milkis — canette 250ml coreenne.
// Identite : moitie haute blanche / moitie basse degradee d.color, separees par
// une vague douce. "MILKIS" bleu #2b6cb8 incline sur le blanc, parfum en petites
// capitales dessous, gouttes de lait stylisees sur la partie coloree.
ART["milkis"]=function(d){
  var c=d.color||'#aed6f1', id=d.id;
  // Parfum = nom sans le prefixe de marque
  var fl=String(d.name||'').replace(new RegExp(String(d.brand||'Milkis'),'ig'),'').replace(/milkis/ig,'').replace(/\s+/g,' ').trim()||'Original';
  var FL=fl.toUpperCase();
  var n=FL.length;
  var fs=n<=5?15:(n<=7?13.5:(n<=9?12:10.5));
  var ls=n<=7?2.4:1.6;
  var est=n*fs*0.72+(n-1)*ls;
  var tfit=est>126?' textLength="126" lengthAdjust="spacingAndGlyphs"':'';
  var flc=shade(c,-0.52);
  // silhouette de la canette
  var P='M62,78 C54,84 48,90 48,98 L48,292 C48,300 52,306 56,312 C59,317 62,320 70,320 L170,320 C178,320 181,317 184,312 C188,306 192,300 192,292 L192,98 C192,90 186,84 178,78 Z';
  // goutte de lait stylisee
  function dp(x,y,s){
    return '<g transform="translate('+x+','+y+') scale('+s+')">'
      +'<path d="M0,-14 C5,-6 9,-1 9,4 A9,9 0 1,1 -9,4 C-9,-1 -5,-6 0,-14 Z" fill="#ffffff" stroke="'+shade(c,-0.35)+'" stroke-width="1.2" stroke-opacity="0.45"/>'
      +'<circle cx="-3" cy="3.5" r="2.4" fill="'+shade(c,0.8)+'" opacity="0.85"/>'
      +'</g>';
  }
  return '<svg viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">'
  +'<defs>'
  // blanc de la canette (galbe horizontal)
  +'<linearGradient id="mkb'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#ffffff"/>'
  +'<stop offset="0.5" stop-color="#fbfcfd"/>'
  +'<stop offset="0.82" stop-color="#eef1f4"/>'
  +'<stop offset="1" stop-color="#dbe1e6"/>'
  +'</linearGradient>'
  // bas colore du parfum (4 stops verticaux)
  +'<linearGradient id="mkc'+id+'" x1="0" y1="0" x2="0" y2="1">'
  +'<stop offset="0" stop-color="'+shade(c,0.32)+'"/>'
  +'<stop offset="0.4" stop-color="'+c+'"/>'
  +'<stop offset="0.75" stop-color="'+shade(c,-0.18)+'"/>'
  +'<stop offset="1" stop-color="'+shade(c,-0.38)+'"/>'
  +'</linearGradient>'
  // couvercle aluminium
  +'<linearGradient id="mkl'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#eef1f3"/>'
  +'<stop offset="0.45" stop-color="#c3cad0"/>'
  +'<stop offset="1" stop-color="#8d959c"/>'
  +'</linearGradient>'
  // galbe cylindrique global
  +'<linearGradient id="mko'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#ffffff" stop-opacity="0.5"/>'
  +'<stop offset="0.16" stop-color="#ffffff" stop-opacity="0.06"/>'
  +'<stop offset="0.45" stop-color="#ffffff" stop-opacity="0"/>'
  +'<stop offset="0.78" stop-color="#000000" stop-opacity="0"/>'
  +'<stop offset="0.94" stop-color="#000000" stop-opacity="0.15"/>'
  +'<stop offset="1" stop-color="#000000" stop-opacity="0.3"/>'
  +'</linearGradient>'
  +'<clipPath id="mkp'+id+'"><path d="'+P+'"/></clipPath>'
  +'</defs>'
  // ombre au sol
  +'<ellipse cx="120" cy="330" rx="72" ry="9" fill="#000" opacity="0.14"/>'
  // corps blanc
  +'<path d="'+P+'" fill="url(#mkb'+id+')"/>'
  +'<g clip-path="url(#mkp'+id+')">'
  // moitie basse coloree, separee par une vague douce
  +'<path d="M40,208 C70,196 95,214 122,206 C150,198 172,206 200,196 L200,345 L40,345 Z" fill="url(#mkc'+id+')"/>'
  // crete de vague laiteuse + seconde vague
  +'<path d="M40,208 C70,196 95,214 122,206 C150,198 172,206 200,196" fill="none" stroke="#ffffff" stroke-width="5.5" stroke-linecap="round" opacity="0.95"/>'
  +'<path d="M40,221 C72,210 98,225 126,218 C152,212 176,219 200,209" fill="none" stroke="'+shade(c,0.55)+'" stroke-width="3" stroke-linecap="round" opacity="0.6"/>'
  // gouttes de lait stylisees
  +dp(92,252,1.05)+dp(143,238,0.72)+dp(126,290,0.9)
  // contenance
  +'<text x="120" y="313" text-anchor="middle" font-size="9.5" font-weight="600" letter-spacing="1" fill="#ffffff" opacity="0.9">250 ml</text>'
  // ombre du fond
  +'<ellipse cx="120" cy="322" rx="68" ry="8" fill="#000" opacity="0.18"/>'
  // ombre sous le couvercle
  +'<rect x="44" y="80" width="152" height="14" fill="#000" opacity="0.05"/>'
  // galbe + reflet vertical clair a gauche, bord droit assombri
  +'<rect x="44" y="60" width="152" height="266" fill="url(#mko'+id+')"/>'
  +'<rect x="57" y="104" width="10" height="200" rx="5" fill="#ffffff" opacity="0.45"/>'
  +'</g>'
  // logo incline + parfum en petites capitales
  +'<g transform="rotate(-7 120 140)">'
  +'<text x="120" y="147" text-anchor="middle" font-size="35" font-weight="800" font-style="italic" fill="#2b6cb8" letter-spacing="1" textLength="128" lengthAdjust="spacingAndGlyphs">MILKIS</text>'
  +'<path d="M64,155 Q120,163 176,151" fill="none" stroke="#2b6cb8" stroke-width="3" stroke-linecap="round" opacity="0.9"/>'
  +'<text x="120" y="179" text-anchor="middle" font-size="'+fs+'" font-weight="700" letter-spacing="'+ls+'" fill="'+flc+'"'+tfit+'>'+FL+'</text>'
  +'</g>'
  // contour du corps
  +'<path d="'+P+'" fill="none" stroke="#8d979f" stroke-width="2" opacity="0.9"/>'
  // couvercle aluminium
  +'<ellipse cx="120" cy="76" rx="58" ry="11.5" fill="url(#mkl'+id+')" stroke="#7d868e" stroke-width="1.5"/>'
  +'<ellipse cx="120" cy="76" rx="47" ry="8" fill="#c7ced4" stroke="#939ba3" stroke-width="1"/>'
  +'<rect x="112" y="71" width="17" height="7.5" rx="3.5" fill="#aab2b9" stroke="#7d868e" stroke-width="1"/>'
  +'<circle cx="117" cy="74.8" r="2.2" fill="#8b939b"/>'
  +'</svg>';
};


/* ── art_mogu-mogu.js ── */
// Gabarit parametrique Mogu Mogu — bouteille PET courte et trapue, epaules
// carrees, petit goulot, bouchon vert. Jus = d.color avec cubes de nata de
// coco blancs, etiquette blanche bordee de la couleur du parfum.
// Gamme "Ice Tea" : bouteille plus haute + bandeau ICE TEA sur l'etiquette.
ART["mogu mogu"]=function(d){
  var c=d.color||'#f39c12', id=d.id;
  var raw=String(d.name||'');
  var ice=/ice\s*tea/i.test(raw);
  // Parfum = nom sans le prefixe de marque (et sans "Ice Tea")
  var fl=raw.replace(/mogu\s*mogu/ig,'').replace(/ice\s*tea/ig,'').replace(/\s+/g,' ').trim()||'Original';
  fl=fl.toUpperCase();
  var n=fl.length;
  var pfs=n<=6?14:(n<=9?13:(n<=12?11:9.5));
  var fit=(pfs*0.62*n)>94?' textLength="94" lengthAdjust="spacingAndGlyphs"':'';
  var dk=shade(c,-0.42);            // couleur foncee du parfum (logo)
  var vg='#3fae5a';                 // vert bouchon
  var t=ice?-30:0;                  // decalage vertical : Ice Tea plus haute
  // micro-variation deterministe par parfum : distingue les parfums
  // auxquels le catalogue donne la meme couleur
  var hs=0; for(var i=0;i<fl.length;i++) hs+=fl.charCodeAt(i);
  var v=((hs%7)-3)*0.03;            // -0.09 .. +0.09
  // etiquette
  var ly=ice?176:184, lh=ice?96:84;
  var my1=ice?216:214, my2=ice?239:240;      // lignes MOGU / MOGU
  var mfs=ice?22:25;
  var py=ice?246:248, pty=ice?259:261.5;     // pastille parfum
  var s='<svg viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">'
  +'<defs>'
  // jus : degrade vertical 4 stops de la couleur du parfum
  +'<linearGradient id="mgJ'+id+'" x1="0" y1="0" x2="0" y2="1">'
  +'<stop offset="0" stop-color="'+shade(c,0.3+v)+'"/>'
  +'<stop offset="0.35" stop-color="'+shade(c,0.08+v)+'"/>'
  +'<stop offset="0.72" stop-color="'+shade(c,v)+'"/>'
  +'<stop offset="1" stop-color="'+shade(c,-0.2+v)+'"/>'
  +'</linearGradient>'
  // bouchon vert
  +'<linearGradient id="mgC'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="'+shade(vg,0.35)+'"/>'
  +'<stop offset="0.5" stop-color="'+vg+'"/>'
  +'<stop offset="1" stop-color="'+shade(vg,-0.35)+'"/>'
  +'</linearGradient>'
  +'</defs>'
  // ombre au sol
  +'<ellipse cx="120" cy="336" rx="66" ry="9" fill="#000" opacity="0.13"/>'
  // corps PET trapu, epaules carrees, petit goulot
  +'<path d="M104,'+(76+t)+' L104,'+(85+t)+' C104,'+(91+t)+' 98,'+(93+t)+' 88,'+(97+t)
  +' Q58,'+(106+t)+' 58,'+(126+t)+' L58,304 Q58,326 80,326 L160,326 Q182,326 182,304'
  +' L182,'+(126+t)+' Q182,'+(106+t)+' 152,'+(97+t)+' C142,'+(93+t)+' 136,'+(91+t)+' 136,'+(85+t)
  +' L136,'+(76+t)+' Z" fill="#f2f6f7" stroke="'+shade(c,-0.5)+'" stroke-width="2.5" stroke-linejoin="round"/>'
  // le jus (rempli jusqu au goulot)
  +'<path d="M108,'+(80+t)+' L108,'+(85+t)+' C108,'+(93+t)+' 101,'+(96+t)+' 91,'+(100+t)
  +' Q63,'+(109+t)+' 63,'+(127+t)+' L63,303 Q63,321 81,321 L159,321 Q177,321 177,303'
  +' L177,'+(127+t)+' Q177,'+(109+t)+' 149,'+(100+t)+' C139,'+(96+t)+' 132,'+(93+t)+' 132,'+(85+t)
  +' L132,'+(80+t)+' Z" fill="url(#mgJ'+id+')"/>'
  // ligne d epaule
  +'<path d="M66,'+(122+t)+' Q120,'+(112+t)+' 174,'+(122+t)+'" stroke="'+shade(c,-0.3)+'" stroke-width="2" fill="none" opacity="0.3"/>'
  // cubes de nata de coco (8, blancs, legerement inclines)
  +'<g fill="#fff" opacity="0.95" stroke="'+shade(c,-0.22)+'" stroke-width="1.2">'
  +'<rect x="76" y="'+(136+t)+'" width="14" height="14" rx="2.8" transform="rotate(-12 83 '+(143+t)+')"/>'
  +'<rect x="108" y="'+(126+t)+'" width="13" height="13" rx="2.6" transform="rotate(8 114 '+(132+t)+')"/>'
  +'<rect x="146" y="'+(140+t)+'" width="14" height="14" rx="2.8" transform="rotate(16 153 '+(147+t)+')"/>'
  +'<rect x="90" y="'+(160+t)+'" width="12" height="12" rx="2.4" transform="rotate(-18 96 '+(166+t)+')"/>'
  +'<rect x="128" y="'+(162+t)+'" width="13" height="13" rx="2.6" transform="rotate(5 134 '+(168+t)+')"/>'
  // — en dessous de l etiquette
  +'<rect x="80" y="288" width="14" height="14" rx="2.8" transform="rotate(10 87 295)"/>'
  +'<rect x="118" y="296" width="13" height="13" rx="2.6" transform="rotate(-13 124 302)"/>'
  +'<rect x="150" y="284" width="12" height="12" rx="2.4" transform="rotate(18 156 290)"/>'
  +'</g>'
  // mention nata de coco sur le jus
  +'<text x="120" y="281" text-anchor="middle" font-size="7.5" font-weight="700" fill="#fff" opacity="0.85" letter-spacing="1">NATA DE COCO</text>'
  // rainures PET du bas
  +'<path d="M63,302 L177,302 M63,310 L177,310" stroke="'+shade(c,-0.3)+'" stroke-width="1.6" opacity="0.3"/>'
  // etiquette blanche joyeuse bordee de la couleur du parfum
  +'<rect x="54" y="'+ly+'" width="132" height="'+lh+'" rx="11" fill="#fff" stroke="'+c+'" stroke-width="5"/>'
  +'<rect x="61" y="'+(ly+7)+'" width="118" height="'+(lh-14)+'" rx="7" fill="none" stroke="'+shade(c,0.55)+'" stroke-width="1.5"/>'
  // points joyeux couleur parfum
  +'<circle cx="71" cy="'+(ly+17)+'" r="3.2" fill="'+shade(c,0.15)+'"/>'
  +'<circle cx="169" cy="'+(ly+17)+'" r="3.2" fill="'+shade(c,0.15)+'"/>'
  +'<circle cx="66" cy="'+(ly+27)+'" r="2" fill="'+shade(c,0.4)+'"/>'
  +'<circle cx="174" cy="'+(ly+27)+'" r="2" fill="'+shade(c,0.4)+'"/>'
  +(ice
    ? '<rect x="82" y="'+(ly+6)+'" width="76" height="15" rx="7.5" fill="'+dk+'"/>'
      +'<text x="120" y="'+(ly+17.2)+'" text-anchor="middle" font-size="10" font-weight="800" fill="#fff" letter-spacing="2">ICE TEA</text>'
    : '')
  // MOGU MOGU en lettres rondes de la couleur foncee du parfum
  +'<text x="120" y="'+my1+'" text-anchor="middle" font-size="'+mfs+'" font-weight="800" fill="'+dk+'" stroke="'+dk+'" stroke-width="2" paint-order="stroke" stroke-linejoin="round" letter-spacing="1.5">MOGU</text>'
  +'<text x="120" y="'+my2+'" text-anchor="middle" font-size="'+mfs+'" font-weight="800" fill="'+dk+'" stroke="'+dk+'" stroke-width="2" paint-order="stroke" stroke-linejoin="round" letter-spacing="1.5">MOGU</text>'
  // le parfum, sur pastille foncee
  +'<rect x="68" y="'+py+'" width="104" height="19" rx="9.5" fill="'+dk+'"/>'
  +'<text x="120" y="'+pty+'" text-anchor="middle" font-size="'+pfs+'" font-weight="700" fill="#fff"'+fit+'>'+fl+'</text>'
  // reflet vertical clair a gauche (au-dessus et en dessous de l etiquette)
  +'<rect x="68" y="'+(132+t)+'" width="10" height="'+(ly-138-t)+'" rx="5" fill="#fff" opacity="0.5"/>'
  +'<rect x="68" y="'+(ly+lh+6)+'" width="10" height="'+(316-ly-lh-6)+'" rx="5" fill="#fff" opacity="0.4"/>'
  +'<path d="M98,'+(94+t)+' Q78,'+(102+t)+' 70,'+(118+t)+'" stroke="#fff" stroke-width="4.5" fill="none" opacity="0.55" stroke-linecap="round"/>'
  // bord droit assombri
  +'<rect x="165" y="'+(132+t)+'" width="9" height="'+(ly-138-t)+'" rx="4.5" fill="'+shade(c,-0.5)+'" opacity="0.2"/>'
  +'<rect x="165" y="'+(ly+lh+6)+'" width="9" height="'+(316-ly-lh-6)+'" rx="4.5" fill="'+shade(c,-0.5)+'" opacity="0.18"/>'
  // goulot + bouchon vert strie
  +'<rect x="100" y="'+(72+t)+'" width="40" height="6" rx="3" fill="'+shade(vg,-0.25)+'"/>'
  +'<rect x="98" y="'+(52+t)+'" width="44" height="22" rx="5" fill="url(#mgC'+id+')"/>'
  +'<path d="M106,'+(55+t)+' L106,'+(71+t)+' M113,'+(54+t)+' L113,'+(72+t)+' M120,'+(54+t)+' L120,'+(72+t)
  +' M127,'+(54+t)+' L127,'+(72+t)+' M134,'+(55+t)+' L134,'+(71+t)+'" stroke="'+shade(vg,-0.4)+'" stroke-width="1.6" opacity="0.6"/>'
  +'<rect x="102" y="'+(55+t)+'" width="4" height="14" rx="2" fill="#fff" opacity="0.4"/>'
  +'</svg>';
  return s;
};


/* ── art_mountain-dew.js ── */
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


/* ── art_prime.js ── */
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


/* ── art_ramune.js ── */
// Gabarit parametrique Ramune — bouteille Codd japonaise en verre clair.
// Chaque parfum : liquide teinte d.color, etiquette d.color bordee de rouge,
// nom du parfum ecrit sous le bandeau RAMUNE.
ART["ramune"]=function(d){
  var c=d.color||'#5dade2', id=d.id;
  // Parfum = nom sans prefixe de marque
  var fl=String(d.name||'').replace(/ramune/ig,'').replace(new RegExp(String(d.brand||''),'ig'),'').replace(/\s+/g,' ').trim()||'Original';
  var n=fl.length;
  var ffs=n<=6?11.5:(n<=9?10.5:(n<=12?9.5:8.5));
  var est=ffs*0.62*n;
  var tfit=est>56?' textLength="56" lengthAdjust="spacingAndGlyphs"':'';
  var dk=shade(c,-0.45);
  return '<svg viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">'
  +'<defs>'
  // liquide : teinte claire du parfum, 3 stops
  +'<linearGradient id="rq'+id+'" x1="0" y1="0" x2="0" y2="1">'
  +'<stop offset="0" stop-color="'+shade(c,0.55)+'"/>'
  +'<stop offset="0.5" stop-color="'+shade(c,0.35)+'"/>'
  +'<stop offset="1" stop-color="'+shade(c,0.05)+'"/>'
  +'</linearGradient>'
  // etiquette : couleur du parfum, 3 stops horizontaux
  +'<linearGradient id="rb'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="'+shade(c,0.3)+'"/>'
  +'<stop offset="0.45" stop-color="'+c+'"/>'
  +'<stop offset="1" stop-color="'+shade(c,-0.28)+'"/>'
  +'</linearGradient>'
  // verre clair
  +'<linearGradient id="rg'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#ffffff"/>'
  +'<stop offset="0.55" stop-color="#e3edf4"/>'
  +'<stop offset="1" stop-color="#bfd2de"/>'
  +'</linearGradient>'
  // bouchon plastique bleu
  +'<linearGradient id="rc'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#6ea8ea"/>'
  +'<stop offset="0.5" stop-color="#3a72c4"/>'
  +'<stop offset="1" stop-color="#274f92"/>'
  +'</linearGradient>'
  +'</defs>'
  // ombre au sol
  +'<ellipse cx="120" cy="332" rx="52" ry="8" fill="#000" opacity="0.13"/>'
  // corps de la bouteille (verre)
  +'<path d="M104,52 L104,60 C97,66 91,76 91,90 C91,104 97,114 103,122 C107,127 107,129 104,132 q6,4.5 0,9 q6,4.5 0,9 C96,156 85,160 85,172 L85,306 Q85,320 99,320 L141,320 Q155,320 155,306 L155,172 C155,160 144,156 136,150 q-6,-4.5 0,-9 q-6,-4.5 0,-9 C133,129 133,127 137,122 C143,114 149,104 149,90 C149,76 143,66 136,60 L136,52 Z"'
  +' fill="url(#rg'+id+')" stroke="#8fa9ba" stroke-width="2.5" stroke-linejoin="round"/>'
  // liquide : remplit le corps
  +'<path d="M108,136 q4,3.5 0,7 q4,3.5 0,7 C100,156 89,162 89,172 L89,304 Q89,316 101,316 L139,316 Q151,316 151,304 L151,172 C151,162 140,156 132,150 q-4,-3.5 0,-7 q-4,-3.5 0,-7 Z" fill="url(#rq'+id+')" opacity="0.55"/>'
  // flaque de liquide au fond de la chambre
  +'<ellipse cx="120" cy="114" rx="9" ry="3.2" fill="url(#rq'+id+')" opacity="0.35"/>'
  // bille de verre dans la chambre
  +'<circle cx="120" cy="90" r="12.5" fill="'+shade(c,0.78)+'" opacity="0.95" stroke="#7e98aa" stroke-width="1.6"/>'
  +'<path d="M112,96.5 A10.5,10.5 0 0 0 128,96.5 A14,10 0 0 1 112,96.5" fill="'+shade(c,0.35)+'" opacity="0.55"/>'
  +'<circle cx="115.5" cy="85.5" r="3.8" fill="#fff" opacity="0.95"/>'
  +'<circle cx="125" cy="93" r="1.6" fill="#fff" opacity="0.7"/>'
  // bulles blanches dans le liquide
  +'<circle cx="104" cy="190" r="2.6" fill="#fff" opacity="0.85"/>'
  +'<circle cx="132" cy="206" r="2" fill="#fff" opacity="0.8"/>'
  +'<circle cx="116" cy="222" r="3" fill="#fff" opacity="0.85"/>'
  +'<circle cx="140" cy="182" r="2.2" fill="#fff" opacity="0.8"/>'
  +'<circle cx="122" cy="172" r="1.7" fill="#fff" opacity="0.75"/>'
  +'<circle cx="99" cy="214" r="1.8" fill="#fff" opacity="0.75"/>'
  +'<circle cx="128" cy="309" r="2" fill="#fff" opacity="0.7"/>'
  +'<circle cx="118" cy="107" r="1.6" fill="#fff" opacity="0.8"/>'
  // etiquette basse : bandeau couleur parfum borde de rouge
  +'<rect x="85" y="234" width="70" height="50" rx="3" fill="#c0392b"/>'
  +'<rect x="88" y="238.5" width="64" height="41" rx="2" fill="url(#rb'+id+')"/>'
  +'<rect x="88" y="238.5" width="64" height="4" fill="#fff" opacity="0.25"/>'
  +'<text x="120" y="263.5" text-anchor="middle" font-size="13" font-weight="800" fill="#fff" textLength="46" lengthAdjust="spacingAndGlyphs" stroke="'+shade(c,-0.4)+'" stroke-width="2.4" paint-order="stroke" stroke-linejoin="round">RAMUNE</text>'
  // parfum en dessous, en petit, sur pastille blanche
  +'<rect x="87" y="289" width="66" height="16" rx="8" fill="#fff" opacity="0.93"/>'
  +'<text x="120" y="300.5" text-anchor="middle" font-size="'+ffs+'" font-weight="700" fill="'+dk+'"'+tfit+'>'+fl+'</text>'
  // reflet vertical clair a gauche
  +'<rect x="91.5" y="168" width="7" height="140" rx="3.5" fill="#fff" opacity="0.5"/>'
  +'<path d="M100,72 Q95,86 99,102" stroke="#fff" stroke-width="4" fill="none" opacity="0.55" stroke-linecap="round"/>'
  // bord droit assombri
  +'<rect x="146" y="168" width="6" height="140" rx="3" fill="'+shade(c,-0.35)+'" opacity="0.2"/>'
  +'<path d="M141,74 Q146,88 141,104" stroke="#5a7484" stroke-width="3" fill="none" opacity="0.25" stroke-linecap="round"/>'
  // bouchon plastique bleu avec stries
  +'<rect x="103" y="26" width="34" height="26" rx="4" fill="url(#rc'+id+')"/>'
  +'<rect x="101" y="47" width="38" height="7" rx="3.5" fill="#2c5aa3"/>'
  +'<path d="M110,29 L110,46 M117,28 L117,46 M124,28 L124,46 M131,29 L131,46" stroke="#1d3f76" stroke-width="1.6" opacity="0.55"/>'
  +'<rect x="106" y="29" width="4" height="15" rx="2" fill="#fff" opacity="0.35"/>'
  +'</svg>';
};


/* ── art_sumol.js ── */
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


/* ── art_tango.js ── */
// Gabarit parametrique Tango — canette 33cl NOIRE, grande eclaboussure ronde
// energique de la couleur du parfum (5-6 pointes organiques) au centre,
// "TANGO" en enormes capitales blanches penchees par-dessus, le PARFUM en
// capitales couleur claire du parfum sous le nom. Couvercle aluminium.
ART["tango"]=function(d){
  var c=d.color||'#e67e22', id=d.id||0;
  var lt=shade(c,0.55), dk=shade(c,-0.5);
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  // Parfum = nom sans le prefixe de marque, sans parenthese
  var fl=String(d.name||'').replace(new RegExp('^\\s*'+String(d.brand||'Tango'),'i'),'')
        .replace(/\([^)]*\)?/g,'').replace(/\s+/g,' ').trim()||'Original';
  var FL=fl.toUpperCase();
  // decoupe en 2 lignes equilibrees si trop long
  var lines=[FL];
  if(FL.length>10 && FL.indexOf(' ')>-1){
    var ws=FL.split(' '), a='', b='';
    for(var i=0;i<ws.length;i++){ if(a.length<FL.length/2) a+=(a?' ':'')+ws[i]; else b+=(b?' ':'')+ws[i]; }
    if(!b){ b=a.split(' ').pop(); a=a.split(' ').slice(0,-1).join(' '); }
    lines=[a,b];
  }
  var mx=0; for(var j=0;j<lines.length;j++) if(lines[j].length>mx) mx=lines[j].length;
  var fs=mx<=6?15:(mx<=9?13:(mx<=12?11.5:10));
  function tsp(t,y){
    var est=t.length*fs*0.66;
    var fit=est>86?' textLength="86" lengthAdjust="spacingAndGlyphs"':'';
    return '<text x="120" y="'+y+'" text-anchor="middle" font-size="'+fs+'" font-weight="800" letter-spacing="0.6" fill="'+lt+'"'+fit+'>'+esc(t)+'</text>';
  }
  var flavorTxt= lines.length===1 ? tsp(lines[0],258) : tsp(lines[0],251)+tsp(lines[1],251+fs+3);
  // Eclaboussure : 6 pointes energiques, jitter deterministe par d.id,
  // arcs concaves profonds ; ecrasee en x pour tenir dans la canette
  var cx=120, cy=170, n=6, rot=((id*37)%21-10)*Math.PI/180;
  var RO=[56,49,59,52,57,50], AJ=[0.10,-0.15,0.19,-0.08,0.13,-0.17];
  var pts=[];
  for(var k=0;k<n;k++){
    var rr=RO[k]+((id*13+k*7)%9)-4;
    var a=-Math.PI/2 + k*2*Math.PI/n + AJ[k] + rot;
    pts.push([cx+rr*Math.cos(a)*0.8, cy+rr*Math.sin(a)*1.04, a]);
  }
  var sp='M'+pts[0][0].toFixed(1)+','+pts[0][1].toFixed(1);
  for(var k2=0;k2<n;k2++){
    var p1=pts[k2], p2=pts[(k2+1)%n];
    var am=p1[2]+Math.PI/n; // angle du creux
    var rv=27+(k2%2?3:-2);
    var qx=cx+rv*Math.cos(am)*0.9, qy=cy+rv*Math.sin(am)*1.04;
    sp+=' Q'+qx.toFixed(1)+','+qy.toFixed(1)+' '+p2[0].toFixed(1)+','+p2[1].toFixed(1);
  }
  sp+=' Z';
  return '<svg viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">'
  +'<defs>'
  // corps noir : cylindre, reflet a gauche, bord droit sombre
  +'<linearGradient id="tb'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#454549"/>'
  +'<stop offset="0.18" stop-color="#232326"/>'
  +'<stop offset="0.55" stop-color="#111113"/>'
  +'<stop offset="0.88" stop-color="#050506"/>'
  +'<stop offset="1" stop-color="#2b2b2f"/>'
  +'</linearGradient>'
  // couvercle aluminium
  +'<linearGradient id="tl'+id+'" x1="0" y1="0" x2="1" y2="0">'
  +'<stop offset="0" stop-color="#eceef1"/>'
  +'<stop offset="0.5" stop-color="#aab0b8"/>'
  +'<stop offset="1" stop-color="#71767e"/>'
  +'</linearGradient>'
  // eclaboussure : radial 3+ stops de d.color
  +'<radialGradient id="ts'+id+'" cx="0.42" cy="0.36" r="0.85">'
  +'<stop offset="0" stop-color="'+shade(c,0.4)+'"/>'
  +'<stop offset="0.45" stop-color="'+shade(c,0.08)+'"/>'
  +'<stop offset="0.8" stop-color="'+c+'"/>'
  +'<stop offset="1" stop-color="'+shade(c,-0.28)+'"/>'
  +'</radialGradient>'
  +'<clipPath id="tc'+id+'"><path d="M77,58 C73,64 72,70 72,78 L72,288 C72,300 75,308 81,314 L83,317 C85,320 89,321 95,321 L145,321 C151,321 155,320 157,317 L159,314 C165,308 168,300 168,288 L168,78 C168,70 167,64 163,58 Z"/></clipPath>'
  +'</defs>'
  // ombre au sol
  +'<ellipse cx="120" cy="336" rx="58" ry="8" fill="#000" opacity="0.16"/>'
  // corps de la canette
  +'<path d="M77,58 C73,64 72,70 72,78 L72,288 C72,300 75,308 81,314 L83,317 C85,320 89,321 95,321 L145,321 C151,321 155,320 157,317 L159,314 C165,308 168,300 168,288 L168,78 C168,70 167,64 163,58 Z"'
  +' fill="url(#tb'+id+')" stroke="#000" stroke-width="1.6"/>'
  +'<g clip-path="url(#tc'+id+')">'
  // eclaboussure + gouttelettes
  +'<path d="'+sp+'" fill="url(#ts'+id+')"/>'
  +'<circle cx="82" cy="121" r="4.5" fill="'+c+'"/>'
  +'<circle cx="160" cy="212" r="5" fill="'+c+'"/>'
  +'<circle cx="88" cy="228" r="3.2" fill="'+shade(c,-0.12)+'"/>'
  +'<circle cx="157" cy="109" r="3.5" fill="'+shade(c,0.15)+'"/>'
  // brillance discrete dans l\'eclaboussure
  +'<ellipse cx="106" cy="146" rx="15" ry="8" fill="#fff" opacity="0.14" transform="rotate(-18 106 146)"/>'
  +'</g>'
  // TANGO : enormes capitales blanches penchees (ombre coloree + blanc)
  +'<g transform="rotate(-8 120 178)">'
  +'<text x="122" y="181" text-anchor="middle" font-size="35" font-weight="900" font-style="italic" letter-spacing="0.5" fill="'+dk+'" textLength="98" lengthAdjust="spacingAndGlyphs">TANGO</text>'
  +'<text x="120" y="179" text-anchor="middle" font-size="35" font-weight="900" font-style="italic" letter-spacing="0.5" fill="#ffffff" textLength="98" lengthAdjust="spacingAndGlyphs">TANGO</text>'
  +'</g>'
  // PARFUM en couleur claire du parfum
  +flavorTxt
  // 33cl
  +'<text x="120" y="306" text-anchor="middle" font-size="10" font-weight="600" letter-spacing="1.5" fill="#8b8b90">33cl</text>'
  // reflet vertical clair a gauche
  +'<rect x="79" y="76" width="8" height="230" rx="4" fill="#fff" opacity="0.16"/>'
  +'<rect x="81" y="86" width="4" height="120" rx="2" fill="#fff" opacity="0.22"/>'
  // bord droit assombri
  +'<path d="M162,72 L162,306" stroke="#000" stroke-width="7" opacity="0.35" stroke-linecap="round"/>'
  // couvercle aluminium
  +'<path d="M77,58 Q120,50 163,58 L163,63 Q120,71 77,63 Z" fill="url(#tl'+id+')" stroke="#5c6167" stroke-width="1"/>'
  +'<path d="M80,57.2 Q120,50.4 160,57.2" fill="none" stroke="#f4f6f8" stroke-width="2.4" stroke-linecap="round"/>'
  // assise en bas
  +'<path d="M84,319 Q120,326 156,319" fill="none" stroke="#7d838c" stroke-width="2.6" stroke-linecap="round"/>'
  +'</svg>';
};


/* ── art_trio.js ── */
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


/* ── art_vimto.js ── */
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
