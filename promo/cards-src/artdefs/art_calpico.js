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
