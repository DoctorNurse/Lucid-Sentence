#!/usr/bin/env python3
"""Shape the brand text used by `pnpm icons` into SVG paths (assets/brand/src/text-paths.json).

One-off helper (needs fontTools + brotli): python3 scripts/brand-text.py
The output is committed so `pnpm icons` needs no fonts or Python.
Fonts: packages/tokens/fonts (SIL OFL 1.1).
"""
import sys, json
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

def text_path(font_path, text, size, axes, tracking=0.0):
    f = TTFont(font_path)
    if 'fvar' in f:
        f = instancer.instantiateVariableFont(f, axes)
    upm = f['head'].unitsPerEm
    cmap = f.getBestCmap()
    gs = f.getGlyphSet()
    hmtx = f['hmtx']
    scale = size / upm
    pen = SVGPathPen(gs)
    x = 0.0
    kern = None
    for ch in text:
        g = cmap.get(ord(ch))
        if g is None:
            raise SystemExit(f'missing glyph {ch!r}')
        tp = TransformPen(pen, (scale, 0, 0, -scale, x, 0))
        gs[g].draw(tp)
        x += hmtx[g][0] * scale + tracking * size
    asc = f['hhea'].ascent * scale
    return pen.getCommands(), x, asc

out = {}
F = 'packages/tokens/fonts/'
for key, font, text, size, axes, tr in [
    ('wordmark', F + 'Fraunces-Variable.woff2', 'Lucid Sentence', 120, {'wght': 500, 'opsz': 72, 'SOFT': 0, 'WONK': 0}, -0.01),
    ('tagline', F + 'InstrumentSans-Variable.woff2', 'A .docx-only word processor with Word\u2019s ribbon.', 40, {'wght': 450, 'wdth': 100}, 0),
    ('label', F + 'JetBrainsMono-Variable.woff2', 'OPEN SOURCE \u00b7 AGPL-3.0 \u00b7 LUCID SYSTEMS', 22, {'wght': 500}, 0.12),
]:
    f = TTFont(font)
    axes = {k: v for k, v in axes.items() if k in [a.axisTag for a in f['fvar'].axes]}
    d, w, asc = text_path(font, text, size, axes, tr)
    out[key] = {'d': d, 'width': round(w, 2), 'size': size, 'text': text}
labels = ['App icon', 'macOS', 'iOS (opaque)', 'PWA maskable', 'Android fg', 'Android mono', 'Android round', '.docx',
          '16 \u00b7 24 \u00b7 32 \u00b7 48 \u00b7 64 px at 2\u00d7 (pixelated) on light, white and dark']
out['labels'] = {}
for t in labels:
    d, w, asc = text_path(F + 'InstrumentSans-Variable.woff2', t, 20, {'wght': 500, 'wdth': 100})
    out['labels'][t] = d
json.dump(out, open('assets/brand/src/text-paths.json', 'w'), indent=1)
print({k: v['width'] for k, v in out.items() if k != 'labels'})
