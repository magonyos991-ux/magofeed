"""Voix off du Reel « Je cherche quelle canette ensuite ? » : une phrase par beat,
synthétisée avec Piper (voix fr_FR-tom), calée sur la timeline, et le minutage de
chaque mot récupéré par reconnaissance vocale pour les sous-titres mot à mot.

Usage : python3 fabriquer-voix.py <modele.onnx> <dossier-sortie>
Produit : voix/beat-NN.wav, voix/voix.wav (piste complète), voix/timeline.json
"""
import os, sys, json, subprocess, wave, struct, math

MODEL = sys.argv[1]
OUT = sys.argv[2]
VOIX = os.path.join(OUT, 'voix')
os.makedirs(VOIX, exist_ok=True)
SR = 44100

# (début prévu, texte DIT (orthographe pour la synthèse), texte AFFICHÉ, mot doré)
BEATS = [
    (0.0,  "Ça y est, j'ai envie d'un Mil-kiss.",                                "Ça y est, j'ai envie d'un Milkis.",                                "Milkis"),
    (2.6,  "Bon… je la trouve où ?",                                             "Bon… je la trouve où ?",                                            ""),
    (5.0,  "En rue, tu sais jamais qui l'a.",                                   "En rue, tu sais jamais qui l'a.",                                   ""),
    (7.6,  "Du coup j'ai fait une appli qui te montre qui l'a, autour de toi.", "Du coup j'ai fait une appli qui te montre qui l'a, autour de toi.", "autour de toi"),
    (13.0, "Et pas que les supermarchés.",                                      "Et pas que les supermarchés.",                                      "pas que"),
    (15.2, "En stock, vue en rayon, ouvert, l'itinéraire. Tout au même endroit.", "En stock, vue en rayon, ouvert, l'itinéraire. Tout au même endroit.", "vue en rayon"),
    (19.8, "Personne l'a vue ? Chasse lancée, les gens autour sont prévenus.",  "Personne l'a vue ? Chasse lancée, les gens autour sont prévenus.",  "chasse"),
    (23.8, "J'ai commencé par Bruxelles.",                                      "J'ai commencé par Bruxelles.",                                      ""),
    (25.4, "Si ça peut être utile, lien dans ma bio. Et surtout, dis-moi :",    "Si ça peut être utile, lien dans ma bio. Et surtout, dis-moi :",    ""),
    (29.6, "je cherche quelle canette ensuite ?",                               "je cherche quelle canette ensuite ?",                               "quelle canette"),
]
LENGTH_SCALE = float(os.environ.get('LENGTH_SCALE', '0.93'))

def synth(text, path):
    subprocess.run(['piper', '-m', MODEL, '--length_scale', str(LENGTH_SCALE), '--sentence_silence', '0.15', '-f', path],
                   input=text.encode('utf-8'), check=True, capture_output=True)

def wav_info(path):
    with wave.open(path) as w:
        return w.getframerate(), w.getnchannels(), w.getsampwidth(), w.getnframes()

def read_mono(path):
    with wave.open(path) as w:
        sr, ch, sw, n = w.getframerate(), w.getnchannels(), w.getsampwidth(), w.getnframes()
        raw = w.readframes(n)
    fmt = {1: 'b', 2: 'h', 4: 'i'}[sw]
    data = struct.unpack('<' + fmt * (n * ch), raw)
    if ch > 1: data = data[::ch]
    peak = float(2 ** (8 * sw - 1))
    return sr, [d / peak for d in data]

def trim(samples, thresh=0.01, pad=0.04, sr=SR):
    i0 = next((i for i, v in enumerate(samples) if abs(v) > thresh), 0)
    i1 = next((i for i in range(len(samples) - 1, 0, -1) if abs(samples[i]) > thresh), len(samples))
    i0 = max(0, i0 - int(pad * sr)); i1 = min(len(samples), i1 + int(pad * sr))
    return samples[i0:i1]

# 1. synthèse beat par beat, rééchantillonnage en 44,1 kHz mono
from faster_whisper import WhisperModel
model = WhisperModel('small', device='cpu', compute_type='int8')
timeline = []
beats_audio = []
for i, (t0, dit, affiche, dore) in enumerate(BEATS):
    raw = os.path.join(VOIX, f'raw-{i:02d}.wav')
    synth(dit, raw)
    norm = os.path.join(VOIX, f'beat-{i:02d}.wav')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', raw, '-ar', str(SR), '-ac', '1', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', norm], check=True)
    sr, samples = read_mono(norm)
    samples = trim(samples)
    dur = len(samples) / sr
    # minutage des mots par reconnaissance, sur le beat isolé
    segs, _ = model.transcribe(norm, language='fr', word_timestamps=True, beam_size=5)
    heard = []
    for s_ in segs:
        for w in s_.words:
            tok = w.word.strip()
            # la reconnaissance coupe « j'ai » en « j » + « 'ai » et « dis-moi » en « dis » + « -moi » : on recolle
            if heard and (tok.startswith("'") or tok.startswith("-") or tok.startswith("’")):
                heard[-1] = type(w)(start=heard[-1].start, end=w.end, word=heard[-1].word.strip() + tok, probability=w.probability)
            else:
                heard.append(w)
    beats_audio.append(samples)
    timeline.append({'i': i, 'prevu': t0, 'duree': round(dur, 3), 'dit': dit, 'affiche': affiche, 'dore': dore,
                     'mots_entendus': [{'w': w.word.strip(), 't0': round(w.start, 3), 't1': round(w.end, 3)} for w in heard]})
    print(f'beat {i}: {dur:5.2f} s  « {affiche} »')

# 2. calage : chaque beat commence au plus tôt à son début prévu, et jamais avant la fin du précédent (+0,25 s d'air)
cursor = 0.0
for b, samples in zip(timeline, beats_audio):
    start = max(b['prevu'], cursor)
    b['debut'] = round(start, 3)
    b['fin'] = round(start + b['duree'], 3)
    cursor = b['fin'] + 0.25
total = max(timeline[-1]['fin'] + 0.6, 31.5)
print('durée totale voix :', round(total, 2), 's')

# 3. les mots affichés : on aligne les mots du texte affiché sur les mots entendus (même nombre en général),
#    sinon on répartit uniformément. Temps absolus.
import re
for b, samples in zip(timeline, beats_audio):
    shown = []
    for tok in re.findall(r"[^\s]+", b['affiche']):
        # « où ? », « dis-moi : » : la ponctuation détachée reste collée au mot qui précède
        if shown and re.fullmatch(r"[?!:;…»]+", tok): shown[-1] += " " + tok
        else: shown.append(tok)
    heard = b['mots_entendus']
    words = []
    if len(heard) == len(shown) and heard:
        for w, h in zip(shown, heard):
            words.append({'w': w, 't0': round(b['debut'] + h['t0'], 3), 't1': round(b['debut'] + h['t1'], 3)})
    else:
        n = len(shown); step = b['duree'] / max(1, n)
        for k, w in enumerate(shown):
            words.append({'w': w, 't0': round(b['debut'] + k * step, 3), 't1': round(b['debut'] + (k + 1) * step, 3)})
    # le dernier mot reste affiché jusqu'à la fin du beat
    if words: words[-1]['t1'] = b['fin']
    b['mots'] = words

# 4. piste complète
n_total = int(total * SR)
mix = [0.0] * n_total
for b, samples in zip(timeline, beats_audio):
    i0 = int(b['debut'] * SR)
    for k, v in enumerate(samples):
        if i0 + k < n_total: mix[i0 + k] += v
# fondu de sortie léger sur le tout dernier mot
peak = max(abs(v) for v in mix) or 1.0
with wave.open(os.path.join(VOIX, 'voix.wav'), 'w') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, v / peak * 0.95)) * 32767)) for v in mix))
json.dump({'sr': SR, 'total': round(total, 3), 'beats': timeline}, open(os.path.join(VOIX, 'timeline.json'), 'w'), ensure_ascii=False, indent=1)
print('ok', os.path.join(VOIX, 'voix.wav'))
