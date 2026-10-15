import { render, type Mark, type Tone } from './kit';
import { ICONS, type IconName } from './index';

/**
 * Writes an icon as one inline-ready SVG. Two variants per icon:
 *   full     from 96px up: every mark, circles smooth.
 *   compact  under 96px: no detail marks, framed by what is left so it fills its square at 28px.
 *
 * Its paint is presentation attributes: a plain solid inherits the svg element's (edge stroke, ground fill),
 * every other mark carries its own. So a file works as an <img>, pasted inline, or through the sprite's
 * <use>, and since any CSS rule outranks a presentation attribute, a page can re-theme an inline icon by
 * class (icons.css does, for the wash band and for the night band). A light mark, Uru's body, spells its paint
 * out and is never re-themed, so Uru stays white on the night band. The strokes are
 * hairlines in screen pixels at any size (vector-effect: non-scaling-stroke). No filters, no gradients,
 * no CSS variables inside the file, no text.
 */

export type Variant = 'full' | 'compact';

/**
 * The light palette, black, white and neutral greys only: three greys for the hairlines (darker for the
 * compact variant, which is drawn smaller), pure ink as the one bright stroke (19.8:1 on the white), and
 * Uru's face: the page's black, white dome eyes on it (19.8:1) and grey cheeks. site/icons/build.mjs checks
 * the ratios.
 */
export const PALETTE: Record<Variant, Record<Tone | 'ground', string>> = {
  full: { ground: '#ffffff', edge: '#666666', mid: '#8a8a8a', lo: '#ababab', accent: '#0a0a0a', ink: '#0a0a0a', warm: '#ffffff', blush: '#646464' },
  compact: { ground: '#ffffff', edge: '#5c5c5c', mid: '#808080', lo: '#a3a3a3', accent: '#0a0a0a', ink: '#0a0a0a', warm: '#ffffff', blush: '#646464' },
};

/** Stroke widths in CSS pixels: the line, and the dim crease. */
export const WEIGHT: Record<Variant, { line: number; lo: number }> = {
  full: { line: 1.1, lo: 0.8 },
  compact: { line: 1.15, lo: 0.9 },
};

const SHORT: Record<Tone, string> = { edge: 'e', mid: 'm', lo: 'l', accent: 'a', ink: 'k', warm: 'w', blush: 'b' };

/** Joins neighbouring marks that paint the same way and fill nothing opaque, so they can share one path. */
function merge(marks: readonly Mark[]): Mark[] {
  const out: Mark[] = [];
  for (const m of marks) {
    const last = out[out.length - 1];
    if (last && m.fill !== 'ground' && last.fill === m.fill && last.tone === m.tone && last.light === m.light) out[out.length - 1] = { ...last, d: last.d + m.d };
    else out.push({ ...m });
  }
  return out;
}

const NON_SCALING = ' vector-effect="non-scaling-stroke"';

/**
 * The class and paint a mark is drawn with, as attributes. The svg itself carries the commonest paint, an
 * edge stroke over a ground fill, so a plain solid needs none and inherits it (and any theme set on the svg).
 */
function paintOf(m: Mark, variant: Variant): string {
  const paint = PALETTE[variant], t = SHORT[m.tone];
  if (m.light) return lightPaint(m, variant);
  if (m.fill === 'tone') return ` class="ui-f-${t}" fill="${paint[m.tone]}" stroke="none"`;
  const width = m.tone === 'lo' ? ` stroke-width="${WEIGHT[variant].lo}"` : '';
  const fill = m.fill === 'none' ? ' fill="none"' : '';
  return m.tone === 'edge' ? fill && ` class="ui-s-e"${fill}` : ` class="ui-s-${t}${m.fill === 'ground' ? ' ui-f-g' : ''}" stroke="${paint[m.tone]}"${width}${fill}`;
}

/**
 * A light mark's paint, spelled out in full, under its own class rather than the re-theming ones, so icons.css
 * repaints it only for forced colours: the white body stays white on any band.
 */
function lightPaint(m: Mark, variant: Variant): string {
  const paint = PALETTE[variant];
  if (m.fill === 'tone') return ` class="ui-lt" fill="${paint[m.tone]}" stroke="none"`;
  const width = m.tone === 'lo' ? ` stroke-width="${WEIGHT[variant].lo}"` : '';
  return ` class="ui-lt${m.fill === 'none' ? '' : ' ui-lt-g'}" fill="${m.fill === 'none' ? 'none' : paint.ground}" stroke="${paint[m.tone]}"${width}`;
}

/**
 * The marks as SVG, in paint order. Solids that follow one another with the same paint share a group that
 * carries it, so each of them is only its outline; lines and dots are already one path per run.
 */
function paths(marks: readonly Mark[], variant: Variant): string {
  let out = '';
  for (let i = 0; i < marks.length; ) {
    let j = i + 1;
    while (j < marks.length && marks[j].fill === 'ground' && marks[i].fill === 'ground' && marks[j].tone === marks[i].tone && marks[j].light === marks[i].light) j++;
    const stroke = marks[i].fill === 'tone' ? '' : NON_SCALING;
    const paint = paintOf(marks[i], variant);
    if (j - i === 1 || !paint) out += marks.slice(i, j).map((m) => `<path${paint} d="${m.d}"${stroke}/>`).join('');
    else out += `<g${paint}>${marks.slice(i, j).map((m) => `<path d="${m.d}"${NON_SCALING}/>`).join('')}</g>`;
    i = j;
  }
  return out;
}

/** The paint the svg (or symbol) carries for its plain solids, and the stroke width they share. */
const root = (variant: Variant) =>
  `class="u-icon u-icon--${variant}" fill="${PALETTE[variant].ground}" stroke="${PALETTE[variant].edge}" stroke-width="${WEIGHT[variant].line}" stroke-linecap="round" stroke-linejoin="round"`;

/** The icon's paths and its square viewBox, for one variant. */
export function draw(name: IconName, variant: Variant) {
  const { marks, box } = render(ICONS[name], variant === 'full');
  return { box, paths: paths(merge(marks), variant) };
}

/** One icon as a standalone SVG element, sized `size` px until CSS says otherwise. */
export function svg(name: IconName, variant: Variant, size = variant === 'full' ? 96 : 48) {
  const { box, paths: body } = draw(name, variant);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.join(' ')}" width="${size}" height="${size}" ${root(variant)} data-icon="${name}" aria-hidden="true" focusable="false">${body}</svg>`;
}

/** The same icon as a <symbol> for the sprite, its id the file's name. */
export function symbol(name: IconName, variant: Variant) {
  const { box, paths: body } = draw(name, variant);
  const id = variant === 'full' ? name : `${name}-compact`;
  return `<symbol id="${id}" viewBox="${box.join(' ')}" ${root(variant)}>${body}</symbol>`;
}

export { ICONS, ABOUT, type IconName } from './index';
