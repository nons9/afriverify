#!/usr/bin/env python3
"""Generates every AfriVerify logo asset from one definition (run: python3 generate.py).
Needs: fonttools, and the Bricolage Grotesque .woff files (npm i @fontsource/bricolage-grotesque).
The mark is plain filled polygons on a 100x100 grid; the wordmark is traced from the font, so no
SVG depends on a font being installed."""
import math, os, sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'svg')
FONT_DIR = os.environ.get('FONT_DIR', os.path.join(HERE, 'fonts'))

# ── palette (gold + warm black + cream are already the product/ecosystem colours) ──
GOLD, GOLD_DEEP = '#C9960E', '#8A6508'          # deep gold for light backgrounds (AA on white)
INK, INK_SOFT, CREAM = '#0D0B08', '#1A1612', '#EDE0C8'
SCHEMES = {
    'dark':  dict(frame=GOLD,      check=CREAM,    afri=CREAM,    verify=GOLD),
    'light': dict(frame=GOLD_DEEP, check=INK_SOFT, afri=INK_SOFT, verify=GOLD_DEEP),
    'mono-black': dict(frame=INK,  check=INK,      afri=INK,      verify=INK),
    'mono-white': dict(frame='#FFFFFF', check='#FFFFFF', afri='#FFFFFF', verify='#FFFFFF'),
}

# ── the mark: 3 scan brackets + a 45° check whose long arm completes the 4th corner ──
T, ARM = 12, 32                                 # stroke + bracket arm length on the 100 grid
S2 = T / 2 * math.sqrt(2)                       # 8.485: miter offset of a 90° join at half-width 6
def f(n): return ('%.3f' % n).rstrip('0').rstrip('.')
FRAME_PATH = (f'M0 0H{ARM}V{T}H{T}V{ARM}H0Z '
              f'M0 {100-ARM}H{T}V{100-T}H{ARM}V100H0Z '
              f'M{100-ARM} 100V{100-T}H{100-T}V{100-ARM}H100V100Z')
V = (34, 66)                                    # vertex of the check
A  = (18.243, 41.757); B = (9.757, 50.243)      # short-arm end cap (perpendicular to the 45° arm)
VI = (V[0], V[1] - S2); VO = (V[0], V[1] + S2)  # inner / outer miter points
TOP = (V[0] + VI[1], 0)                         # inner edge meets the top of the frame
RIGHT = (100, VO[1] - (100 - V[0]))             # outer edge meets the right of the frame
CHECK_PATH = (f'M{f(A[0])} {f(A[1])}L{f(VI[0])} {f(VI[1])}L{f(TOP[0])} 0H100V{f(RIGHT[1])}'
              f'L{f(VO[0])} {f(VO[1])}L{f(B[0])} {f(B[1])}Z')

def mark_svg(frame, check, size=None, extra=''):
    wh = f' width="{size}" height="{size}"' if size else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"{wh} role="img" aria-label="AfriVerify">{extra}'
            f'<path fill="{frame}" d="{FRAME_PATH}"/><path fill="{check}" d="{CHECK_PATH}"/></svg>')

# ── wordmark traced from Bricolage Grotesque: "Afri" Light + "Verify" ExtraBold ──
def load(weight):
    p = os.path.join(FONT_DIR, f'bricolage-grotesque-latin-{weight}-normal.woff')
    return TTFont(p)
FONTS = {300: load(300), 800: load(800)}
UPM = FONTS[800]['head'].unitsPerEm
CAP = getattr(FONTS[800]['OS/2'], 'sCapHeight', int(0.7 * UPM)) or int(0.7 * UPM)
TRACK = -0.012 * UPM                            # slight tightening, like the UI wordmark

def trace(text, weight, x0):
    font = FONTS[weight]; gs = font.getGlyphSet(); cmap = font.getBestCmap(); hmtx = font['hmtx']
    paths, x = [], x0
    for ch in text:
        g = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        # flip Y (font y-up -> svg y-down) with baseline at y=0
        gs[g].draw(TransformPen(pen, (1, 0, 0, -1, x, 0)))
        d = pen.getCommands()
        if d: paths.append(d)
        x += hmtx[g][0] + TRACK
    return ' '.join(paths), x

def wordmark_paths(colors):
    d1, x = trace('Afri', 300, 0)
    d2, x2 = trace('Verify', 800, x)
    width = x2 - TRACK
    return (f'<path fill="{colors["afri"]}" d="{d1}"/><path fill="{colors["verify"]}" d="{d2}"/>'), width

def horizontal(scheme):
    c = SCHEMES[scheme]
    wm, w = wordmark_paths(c)
    m = CAP * 1.62                               # mark height relative to cap height
    gap = m * 0.30
    ymid = -CAP / 2                              # vertical centre of the capitals
    top = ymid - m / 2
    desc = UPM * 0.22                            # room for the 'y' descender
    pad = 0
    width_total = m + gap + w
    height = m if (top + m) >= desc else m
    vb_x, vb_y = 0, top
    vb_w, vb_h = width_total, max(m, -top + desc)
    mark = (f'<g transform="translate(0 {f(top)}) scale({f(m/100)})"><path fill="{c["frame"]}" d="{FRAME_PATH}"/>'
            f'<path fill="{c["check"]}" d="{CHECK_PATH}"/></g>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{f(vb_x)} {f(vb_y)} {f(vb_w)} {f(vb_h)}" role="img" aria-label="AfriVerify">'
            f'{mark}<g transform="translate({f(m+gap)} 0)">{wm}</g></svg>')

def lockup_data():
    """Raw geometry of the horizontal lockup, for the website's React component."""
    d1, x = trace('Afri', 300, 0)
    d2, x2 = trace('Verify', 800, x)
    wmw = x2 - TRACK
    m = CAP * 1.62; gap = m * 0.30
    top = -CAP / 2 - m / 2
    desc = UPM * 0.22
    return dict(afri=d1, verify=d2, mark=m, top=top, wordX=m + gap,
                vb=(0, top, m + gap + wmw, max(m, -top + desc)))

def write_ts(path):
    d = lockup_data(); vb = d['vb']
    ts = f'''// GENERATED by brand/source/generate.py. Do not edit by hand.
// Outlined brand geometry shared with brand/svg/*.svg so the site and the asset files never drift.
export const MARK_VIEWBOX = '0 0 100 100';
export const FRAME_PATH = '{FRAME_PATH}';
export const CHECK_PATH = '{CHECK_PATH}';

export const LOCKUP = {{
  viewBox: '{f(vb[0])} {f(vb[1])} {f(vb[2])} {f(vb[3])}',
  aspect: {vb[2] / vb[3]:.5f},
  markSize: {d['mark']:.3f},
  markTop: {d['top']:.3f},
  wordX: {d['wordX']:.3f},
  afri: '{d['afri']}',
  verify: '{d['verify']}',
}} as const;
'''
    open(path, 'w').write(ts); print('wrote', path)

def stacked(scheme):
    c = SCHEMES[scheme]
    wm, w = wordmark_paths(c)
    m = w * 0.46; gap = m * 0.34
    total_w = max(w, m); cx = total_w / 2
    mark = (f'<g transform="translate({f(cx-m/2)} 0) scale({f(m/100)})"><path fill="{c["frame"]}" d="{FRAME_PATH}"/>'
            f'<path fill="{c["check"]}" d="{CHECK_PATH}"/></g>')
    base = m + gap + CAP
    h = base + UPM * 0.22
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {f(total_w)} {f(h)}" role="img" aria-label="AfriVerify">'
            f'{mark}<g transform="translate({f(cx-w/2)} {f(base)})">{wm}</g></svg>')

def app_icon(size=512, pad=0.215, radius=0.225, bg=INK):
    m = size * (1 - 2 * pad)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}" role="img" aria-label="AfriVerify">'
            f'<rect width="{size}" height="{size}" rx="{f(size*radius)}" fill="{bg}"/>'
            f'<g transform="translate({f(size*pad)} {f(size*pad)}) scale({f(m/100)})"><path fill="{GOLD}" d="{FRAME_PATH}"/>'
            f'<path fill="{CREAM}" d="{CHECK_PATH}"/></g></svg>')

def w(name, s):
    open(os.path.join(OUT, name), 'w').write(s); print('wrote', name)

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for k, c in SCHEMES.items():
        w(f'mark-{k}.svg', mark_svg(c['frame'], c['check']))
        w(f'logo-horizontal-{k}.svg', horizontal(k))
        w(f'logo-stacked-{k}.svg', stacked(k))
    w('app-icon.svg', app_icon())
    w('favicon.svg', app_icon(64, pad=0.15, radius=0.2))
    # Android maskable: full-bleed square (the OS applies its own mask), mark inside the central 80% safe zone
    w('app-icon-maskable.svg', app_icon(512, pad=0.22, radius=0))
    if len(sys.argv) > 1 and sys.argv[1] == '--ts':
        write_ts(sys.argv[2])
