"""Build docs/assets/fonts/urfael-rune.woff2: one glyph, U+16A2, drawn from the Urfael mark, so every ᚢ the site writes is the logo.
Usage: python build-rune.py <mark.svg> <out.woff2>  (needs fonttools and brotli)."""
import re, sys
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path

SRC, OUT = sys.argv[1], sys.argv[2]
d = re.search(r'\sd="([^"]+)"', open(SRC).read()).group(1)

UPM, CAP = 1000, 714            # cap height matches the Noto cut it replaces
SCALE = CAP / 96                # the mark's nominal height is y 16 to 112
LSB, RSB = 90, 80
X0, X1, BASE = 32, 104, 112      # the mark's ink spans x 32 to 104 and stands on y 112
ADVANCE = round((X1 - X0) * SCALE + LSB + RSB)

def glyph(draw):
    pen = TTGlyphPen(None)
    draw(pen)
    return pen.glyph()

def rune(pen):
    flipped = TransformPen(Cu2QuPen(pen, max_err=0.5, reverse_direction=True), (SCALE, 0, 0, -SCALE, LSB - X0 * SCALE, BASE * SCALE))
    parse_path(d, flipped)

fb = FontBuilder(UPM, isTTF=True)
fb.setupGlyphOrder(['.notdef', 'space', 'uni16A2'])
fb.setupCharacterMap({0x20: 'space', 0x16A2: 'uni16A2'})
glyphs = {'.notdef': glyph(lambda p: None), 'space': glyph(lambda p: None), 'uni16A2': glyph(rune)}
fb.setupGlyf(glyphs)
bounds = glyphs['uni16A2']
bounds.recalcBounds(fb.font['glyf'])
fb.setupHorizontalMetrics({'.notdef': (500, 0), 'space': (260, 0), 'uni16A2': (ADVANCE, bounds.xMin)})
fb.setupHorizontalHeader(ascent=1069, descent=-293)
fb.setupNameTable({'familyName': 'Urfael Rune', 'styleName': 'Regular', 'copyright': 'The Urfael mark. All rights reserved.'})
fb.setupOS2(sTypoAscender=1069, sTypoDescender=-293, sTypoLineGap=0, usWinAscent=1069, usWinDescent=293, sCapHeight=CAP, sxHeight=500, achVendID='URFL')
fb.setupPost()
fb.font.flavor = 'woff2'
fb.save(OUT)
print('wrote', OUT, 'advance', ADVANCE, 'bounds', (bounds.xMin, bounds.yMin, bounds.xMax, bounds.yMax))
