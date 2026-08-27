# -*- coding: utf-8 -*-
"""Assemble data/drinkart.js : entete (helpers + dispatcher) + tous les
gabarits livres par les dessinateurs (artdefs/art_*.js)."""
import io, glob, os, re
SC=os.path.dirname(os.path.abspath(__file__))
ENTETE='''/* ═══ MOTEUR DE DESSIN PAR BOISSON ═══════════════════════════════════════
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
  var b=(d.brand||"").toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g,"");
  /* Alias : les fabricants de ramune (Hata Kosen, Sangaria) partagent le
     gabarit de la bouteille Codd. */
  if(b==="hata kosen"||b==="sangaria")b="ramune";
  var fn=ART[b]||ART["generique"];
  if(!fn)return null;
  try{return fn(d);}catch(e){return null;}
}
'''
morceaux=[ENTETE]
for f in sorted(glob.glob(SC+"/artdefs/art_*.js")):
    if f.endswith("art_test.js"): continue
    code=io.open(f,encoding="utf-8").read()
    morceaux.append("\n/* ── %s ── */\n"%os.path.basename(f)+code.strip()+"\n")
sortie="/home/user/magofeed/data/drinkart.js"
io.open(sortie,"w",encoding="utf-8").write("\n".join(morceaux))
print("assemble:",len(morceaux)-1,"gabarits ->",sortie, os.path.getsize(sortie),"octets")
