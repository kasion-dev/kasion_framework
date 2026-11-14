"""Generate the app's sound effects (original, synthesized -> no licence needed).
Run: python3 scripts/gen_sfx.py   (writes public/sounds/*.wav)"""
import numpy as np, wave, os

SR = 22050
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'sounds')

def env(n, a=0.004, r=None):
    t = np.arange(n) / SR
    e = np.minimum(1, t / a) if a else np.ones(n)
    return e * (np.exp(-t / r) if r else 1)

def tone(f, dur, r=0.12, a=0.004, harm=(1,), shape=None):
    n = int(SR * dur); t = np.arange(n) / SR
    f = f if shape is None else shape(t)
    ph = 2 * np.pi * np.cumsum(np.broadcast_to(f, t.shape)) / SR
    w = sum(np.sin(ph * (i + 1)) * h for i, h in enumerate(harm))
    return w * env(n, a, r)

def seq(*parts, gap=0.0):
    out = []
    for p in parts:
        out.append(p); out.append(np.zeros(int(SR * gap)))
    return np.concatenate(out)

def mix(*xs):
    n = max(len(x) for x in xs); o = np.zeros(n)
    for x in xs: o[:len(x)] += x
    return o

def save(name, x, vol=0.7):
    x = x / (np.max(np.abs(x)) or 1) * vol
    fade = min(len(x), int(SR * 0.01)); x[-fade:] *= np.linspace(1, 0, fade)
    with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype('<i2').tobytes())

os.makedirs(OUT, exist_ok=True)
# send: short upward "swoop" pop
save('send', tone(0, 0.11, r=0.05, shape=lambda t: 520 + 900 * (t / 0.11) ** 0.6, harm=(1, .25)), 0.55)
# receive: two soft bubble pops
save('receive', seq(tone(988, 0.07, r=0.03, harm=(1, .3)), tone(1319, 0.09, r=0.04, harm=(1, .3)), gap=0.03), 0.55)
# notify: bell chime (inharmonic partials, long decay)
save('notify', mix(tone(1047, 0.7, r=0.25, harm=(1, .5, .2, .1)), tone(1568, 0.7, r=0.18, harm=(.6, .2)), np.concatenate([np.zeros(int(SR * .09)), tone(2093, 0.5, r=0.15, harm=(.4,))])), 0.6)
# order: bright rising arpeggio (new order / new job)
save('order', seq(*[tone(f, 0.12, r=0.08, harm=(1, .35, .1)) for f in (1047, 1319, 1568, 2093)], gap=0.01), 0.65)
# success: rising major third + sparkle
save('success', mix(seq(tone(784, 0.14, r=0.09, harm=(1, .3)), tone(988, 0.3, r=0.16, harm=(1, .3))), np.concatenate([np.zeros(int(SR * .16)), tone(1976, 0.25, r=0.08, harm=(.5,))])), 0.6)
# error: low double buzz
save('error', seq(tone(196, 0.12, r=0.08, harm=(1, .6, .4, .2)), tone(165, 0.16, r=0.1, harm=(1, .6, .4, .2)), gap=0.04), 0.5)
# tap: tiny click for buttons
save('tap', tone(1800, 0.025, r=0.006, harm=(1, .2)), 0.35)
print('ok', sorted(os.listdir(OUT)))
