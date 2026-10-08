import type { Vec2 } from '../hairline/core/iso';

/**
 * Writing an icon's marks as short path data. Icons are inlined into pages, so every byte is paid on every
 * view: points the eye cannot place are dropped (Douglas-Peucker, to a tolerance well under a pixel), the
 * rest are written relative to each other in hundredths of a unit, and circles lying flat, which this
 * camera turns into upright ellipses, are written as arcs.
 */

/** The points of a polyline that matter: none of the dropped ones lies further than eps from what is kept. */
export function simplify(pts: readonly Vec2[], eps: number): Vec2[] {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    let far = -1, worst = eps;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      const d = len < 1e-9 ? Math.hypot(px - ax, py - ay) : Math.abs((px - ax) * dy - (py - ay) * dx) / len;
      if (d > worst) { worst = d; far = i; }
    }
    if (far >= 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** A whole number of hundredths as the shortest decimal: 50 is ".5", -125 is "-1.25". */
function num(h: number) {
  if (h === 0) return '0';
  const s = (Math.abs(h) / 100).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return (h < 0 ? '-' : '') + (s.startsWith('0.') ? s.slice(1) : s);
}

/** Numbers joined with the separators the path grammar needs and no more. */
function join(nums: readonly number[]) {
  let out = '';
  for (const n of nums) {
    const s = num(n);
    if (out && !(s.startsWith('-') || (s.startsWith('.') && /\.\d*$/.test(out)))) out += ' ';
    out += s;
  }
  return out;
}

const hundredths = (v: number) => Math.round(v * 100);

/** A polyline or polygon as path data: one absolute move, then relative steps. */
export function encode(pts: readonly Vec2[], closed: boolean, eps: number): string {
  if (pts.length < 2) return '';
  const kept = closed ? simplify([...pts, pts[0]], eps).slice(0, -1) : simplify(pts, eps);
  const q = kept.map(([x, y]) => [hundredths(x), hundredths(y)]);
  const steps: number[] = [];
  for (let i = 1; i < q.length; i++) {
    const dx = q[i][0] - q[i - 1][0], dy = q[i][1] - q[i - 1][1];
    if (dx || dy) steps.push(dx, dy);
  }
  if (!steps.length) return '';
  return `M${join(q[0])}l${join(steps)}${closed ? 'z' : ''}`;
}

/** An elliptical arc to (x, y), radii and end in hundredths; the two flags are written as they are, 0 or 1. */
const arcTo = (a: number, b: number, large: 0 | 1, sweep: 0 | 1, x: number, y: number) => `A${join([a, b])} 0 ${large} ${sweep} ${join([x, y])}`;

/** A full upright ellipse about (cx, cy), as two arcs. */
export function ellipse(cx: number, cy: number, rx: number, ry: number): string {
  const [x0, x1, y, a, b] = [cx - rx, cx + rx, cy, rx, ry].map(hundredths);
  return `M${join([x0, y])}${arcTo(a, b, 1, 0, x1, y)}${arcTo(a, b, 1, 0, x0, y)}z`;
}

/** The lower (nearer) half of an upright ellipse about (cx, cy), from its left end to its right. */
export function frontHalf(cx: number, cy: number, rx: number, ry: number): string {
  const [x0, x1, y, a, b] = [cx - rx, cx + rx, cy, rx, ry].map(hundredths);
  return `M${join([x0, y])}${arcTo(a, b, 0, 0, x1, y)}`;
}

/**
 * A standing cylinder's outline: the far half of its top ellipse, down its right side, the near half of its
 * foot ellipse, and up its left side.
 */
export function cylinder(cx: number, top: number, foot: number, rx: number, ry: number): string {
  const [x0, x1, t, f, a, b] = [cx - rx, cx + rx, top, foot, rx, ry].map(hundredths);
  return `M${join([x0, t])}${arcTo(a, b, 0, 1, x1, t)}L${join([x1, f])}${arcTo(a, b, 0, 1, x0, f)}z`;
}
