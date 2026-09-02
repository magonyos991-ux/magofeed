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
