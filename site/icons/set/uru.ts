import { unit, type IconDraw, type Vec3 } from '../kit';
import { URU, uruR } from '../../figures/uru-kit';
import { along, arc, domeEye, NEAR, oval, rad, RIGHT, squircle, stone, UP } from './parts';

/**
 * Uru, and what we want Uru to be (strategy.md 4.3, section 4): good company, a gentle nudge, a bridge to
 * your people, a soft presence. "Your helper, not ours" shares the on-your-side icon.
 *
 * Uru is drawn to the character notes (strategy.md section 6), to the same measurements as the figures' Uru
 * (figures/uru-kit.ts: its profile, band, patch and face window), so the icon and the drawings are one
 * character: a one-piece pebble on a flared gliding base,
 * a knit band with its ribbing, mitten arms, a stitched rune badge, a lantern bead on a stalk, and a dark
 * face window holding two dome eyes and two blush cheeks, with nothing between the eyes. The window is the
 * drawing's one dark solid; the eyes and cheeks on it are its accent. Everything else is line work.
 */

const dir = (deg: number): Vec3 => [Math.cos(rad(deg)), Math.sin(rad(deg)), 0];

/** A mitten arm: a short soft pill along its axis, no fingers. */
const MITTEN: readonly (readonly [number, number])[] = [[0, 0], [0.42, 0.07], [0.6, 0.32], [0.66, 0.7], [0.66, 1.65], [0.6, 2.03], [0.42, 2.28], [0, 2.36]];

/** Uru: waving with one mitten, eyes smiling, the bead on its stalk; the eyes and cheeks are the accent. */
export const uru: IconDraw = (k) => {
  // Uru's own profile, scaled so its widest radius is R, from its foot up
  const R = 4.5, s = R / URU.RMAX, H = (URU.ZT - URU.ZB) * s, foot = 0.5, front = 45, at = (z: number) => (z - URU.ZB) * s;
  const profile = Array.from({ length: 25 }, (_, i): [number, number] => { const z = URU.ZB + ((URU.ZT - URU.ZB) * i) / 24; return [uruR(z) * s, at(z)]; });
  k.disc(0, 0, R * 1.12, 0, { tone: 'lo', detail: true });
  k.lathe([0, 0, 0], [[R * 0.9, 0], [R * 0.98, 0.2], [R * 0.99, 0.4], [R * 0.92, foot + 0.2]], { n: 56 });
  const body = k.lathe([0, 0, foot], profile, { n: 64 });
  for (const d of [-22, 112]) body.meridian(d, at(URU.band[1]) + 0.3, H * 0.95, { detail: true });
  const b0 = at(URU.band[0]), b1 = at(URU.band[1]);
  body.strip(b0, b1, { out: 0.2, tone: 'edge' });
  for (let d = -40; d <= 130; d += 7.5) body.meridian(d, b0 + 0.15, b1 - 0.15, { out: 0.2, detail: d % 15 !== 0 });
  body.seam((b0 + b1) / 2, { out: 0.2, tone: 'lo', detail: true });
  const badgeH = at(10.65);
  body.patch(front, badgeH, squircle(0, 0, 0.6, 0.5, 32), { tone: 'mid', fill: 'ground', out: 0.04 });
  const stitch = squircle(0, 0, 0.46, 0.37, 28);
  for (let i = 0; i < stitch.length; i += 2) body.patch(front, badgeH, [stitch[i], stitch[(i + 1) % stitch.length]], { tone: 'lo', open: true, out: 0.05, detail: true });
  // the rune ᚢ: its stem on the left as we see it, the arm stepping down to the right (the patch's across runs right to left)
  body.patch(front, badgeH, [[0.17, -0.22], [0.17, 0.22], [-0.16, 0.05], [-0.16, -0.22]], { tone: 'mid', open: true, out: 0.05, detail: true });
  const faceH = at(URU.face.v), hu = URU.face.hu * s, hv = URU.face.hv * s;
  body.patch(front, faceH, squircle(0, 0, hu + 0.3, hv + 0.26, 56), { tone: 'mid', fill: 'ground', out: 0.03 });
  body.patch(front, faceH, squircle(0, 0, hu, hv, 56), { tone: 'ink', fill: 'tone', out: 0.05 });
  for (const e of [-1, 1]) body.patch(front, faceH, domeEye(e * 1.6 * s * 1.1, -0.35 * s, 1.75 * s * 1.15, 1.2 * s * 1.15, 16), { tone: 'warm', fill: 'tone', out: 0.07 });
  for (const e of [-1, 1]) body.patch(front, faceH, oval(e * 3.05 * s, -1.55 * s, 0.8 * s, 0.45 * s, 18), { tone: 'blush', fill: 'tone', out: 0.07 });
  const arm = (deg: number, h: number, out: number, axis: Vec3) => k.lathe(body.at(deg, h, out), MITTEN, { axis: unit(axis), n: 36 });
  arm(135, at(10.6) + 0.3, 0.05, along(along(dir(135), UP, -3.2), NEAR, 0.5));
  arm(-45, at(10.6) - 0.3, -0.05, along(along(dir(-45), UP, 1.05), NEAR, 0.25));
  k.cyl(0, 0, 0.17, foot + H - 0.2, foot + H + 0.95, { b: 0.06 });
  k.ball([0, 0, foot + H + 1.42], 0.52, { crease: false });
};

/** Good company: a teapot and two cups on a tray, set for two; the nearer cup, yours, is the accent. */
export const company: IconDraw = (k) => {
  k.box(-1.4, -1.2, 15.4, 10.4, 0, 0.55, { r: 1.8, b: 0.5, detail: true });
  k.plate(-0.7, -0.5, 14.7, 9.7, 0.55, { r: 1.3, tone: 'lo', detail: true });
  const pot: Vec3 = [3.6, 4.3, 0.55];
  const around = (c: Vec3, h: number) => k.face([c[0], c[1], c[2] + h], RIGHT, UP);
  const handle = k.on(around(pot, 2.0));
  handle.shape([...arc(-3.05, 0, 1.55, 75, 285, 16), ...arc(-3.05, 0, 0.92, 285, 75, 14)], { tone: 'edge', fill: 'ground' });
  const body = k.lathe(pot, [[1.7, 0], [2.4, 0.28], [2.9, 0.95], [3.08, 1.8], [2.9, 2.7], [2.35, 3.4], [1.8, 3.75]], { n: 56 });
  body.seam(0.95, { tone: 'lo', detail: true });
  body.seam(3.3, { tone: 'lo' });
  const lid = k.lathe([pot[0], pot[1], pot[2] + 3.72], [[1.8, 0], [1.68, 0.3], [1.15, 0.72], [0.5, 0.9]], { n: 40 });
  lid.seam(0.25, { tone: 'lo', detail: true });
  k.ball([pot[0], pot[1], pot[2] + 4.95], 0.42, { crease: false });
  const root = body.at(-45, 1.15, -0.7);
  const spout = k.lathe(root, [[0.9, 0], [0.78, 1.2], [0.58, 2.6], [0.45, 3.45], [0.47, 3.6]], { axis: unit(along(RIGHT, UP, 1.05)), n: 28 });
  spout.seam(3.45, { tone: 'lo', detail: true });
  const cup = (x: number, y: number, tone: 'edge' | 'accent') => {
    k.cyl(x, y, 1.95, 0.55, 0.78, { b: 0.45, tone });
    k.disc(x, y, 1.1, 0.78, { tone: 'lo', detail: true });
    const c = k.lathe([x, y, 0.78], [[0.92, 0], [1.2, 0.22], [1.45, 0.95], [1.56, 1.85]], { tone, n: 48 });
    k.disc(x, y, 1.44, 0.78 + 1.85, { tone });
    k.disc(x, y, 1.26, 0.78 + 1.5, { tone: 'lo', detail: true });
    c.seam(0.3, { tone: 'lo', detail: true });
    const h = k.on(around([x, y, 0.78], 1.1));
    h.shape([...arc(1.5, 0, 0.62, -95, 95, 10), ...arc(1.5, 0, 0.3, 95, -95, 8)], { tone, fill: 'ground' });
  };
  cup(10.3, 2.6, 'edge');
  cup(11.2, 7.0, 'accent');
};

/**
 * A gentle nudge: an hourglass between turned posts, the sand running for a routine you chose; the sand,
 * falling and gathered, is the accent.
 */
export const nudge: IconDraw = (k) => {
  const foot = 0.9, neck = 5.0, top = 9.1, pr = 2.72;
  const post = (deg: number) => {
    const x = pr * Math.cos(rad(deg)), y = pr * Math.sin(rad(deg));
    k.cyl(x, y, 0.24, foot, top, { b: 0.08 });
    for (const z of [foot + 0.5, neck, top - 0.5]) k.cyl(x, y, 0.4, z - 0.22, z + 0.22, { b: 0.12, detail: true });
  };
  k.cyl(0, 0, 3.4, 0, foot, { b: 0.55 });
  k.cyl(0, 0, 3.05, foot - 0.25, foot, { b: 0.3, detail: true });
  post(225);
  const low = k.lathe([0, 0, foot], [[1.5, 0], [2.15, 0.45], [2.36, 1.2], [2.15, 2.2], [1.4, 3.15], [0.6, 3.82], [0.3, 4.1]], { n: 56 });
  low.seam(0.25, { tone: 'lo', detail: true });
  const high = k.lathe([0, 0, neck], [[0.3, 0], [0.6, 0.28], [1.4, 0.95], [2.15, 1.9], [2.36, 2.9], [2.15, 3.65], [1.5, 4.1]], { n: 56 });
  high.seam(3.85, { tone: 'lo', detail: true });
  k.lathe([0, 0, neck], [[0.3, 0], [0.5, 0.2], [1.25, 0.78], [1.86, 1.42]], { tone: 'accent', n: 40 });
  k.disc(0, 0, 1.86, neck + 1.42, { tone: 'accent' });
  k.line([[0, 0, neck], [0, 0, foot + 2.05]], { tone: 'accent' });
  k.lathe([0, 0, foot], [[1.45, 0], [2.05, 0.38], [2.22, 0.95], [1.6, 1.45], [0, 2.1]], { tone: 'accent', n: 48 });
  post(105);
  post(345);
  k.cyl(0, 0, 3.4, top, top + 0.9, { b: 0.55 });
  k.ball([0, 0, top + 1.25], 0.42, { crease: false, detail: true });
};

/**
 * A bridge to your people: an arched footbridge from one bank to the other, its planks and railings
 * drawn; the near handrail, the one you hold on the way over, is the accent.
 */
export const bridge: IconDraw = (k) => {
  const x0 = 1.6, x1 = 14.4, base = 1.2, lift = 2.7, y0 = 0.6, y1 = 4.4, rail = 2.0;
  const deck = (x: number) => base + lift * Math.sin((Math.PI * (x - x0)) / (x1 - x0));
  const xs = Array.from({ length: 33 }, (_, i) => x0 + ((x1 - x0) * i) / 32);
  for (const [x, w] of [[6.2, 1.8], [8.4, 2.4], [10.6, 1.6]] as const) {
    k.line(Array.from({ length: 9 }, (_, i): Vec3 => [x - w / 2 + (w * i) / 8, 2.2 + 0.18 * Math.sin(i * 1.6), 0]), { tone: 'lo', detail: true });
  }
  k.box(-1.8, -0.6, x0, 5.6, 0, base, { r: 0.9, b: 0.4 });
  k.box(x1, -0.6, 17.8, 5.6, 0, base, { r: 0.9, b: 0.4 });
  for (const [x, y] of [[-0.6, 6.4], [16.6, 6.5], [17.4, 5.9]]) k.disc(x, y, 0.35, 0, { tone: 'lo', detail: true });
  const newel = (x: number, y: number) => {
    const z = deck(x);
    k.box(x - 0.32, y - 0.32, x + 0.32, y + 0.32, z, z + rail + 0.35, { r: 0.12, b: 0.06 });
    k.ball([x, y, z + rail + 0.62], 0.3, { crease: false, detail: true });
  };
  const railing = (y: number, tone: 'mid' | 'accent') => {
    for (let x = x0 + 1.6; x < x1 - 1.2; x += 1.6) k.line([[x, y, deck(x)], [x, y, deck(x) + rail]], { tone: 'mid' });
    k.line(xs.map((x): Vec3 => [x, y, deck(x) + rail]), { tone });
    k.line(xs.slice(2, -2).map((x): Vec3 => [x, y, deck(x) + rail * 0.5]), { tone: 'lo', detail: true });
  };
  newel(x0 + 0.1, y0 + 0.3);
  newel(x1 - 0.1, y0 + 0.3);
  railing(y0 + 0.3, 'mid');
  k.loop([...xs.map((x): Vec3 => [x, y0, deck(x)]), ...xs.slice().reverse().map((x): Vec3 => [x, y1, deck(x)])], { tone: 'edge', fill: 'ground' });
  for (let x = x0 + 0.8; x < x1 - 0.4; x += 0.8) k.line([[x, y0 + 0.15, deck(x)], [x, y1 - 0.15, deck(x)]], { tone: 'lo', detail: true });
  const under = (x: number) => base + (deck(x) - base) * 0.62;
  k.shape('y', y1, [...xs.map((x): [number, number] => [x, deck(x)]), ...xs.slice().reverse().map((x): [number, number] => [x, under(x)])], { tone: 'edge', fill: 'ground' });
  k.line(xs.slice(1, -1).map((x): Vec3 => [x, y1, deck(x) - 0.32]), { tone: 'lo', detail: true });
  newel(x0 + 0.1, y1 - 0.3);
  railing(y1 - 0.3, 'accent');
  newel(x1 - 0.1, y1 - 0.3);
};

/** A soft presence: a cairn of three smooth stones, settled and quiet; the top stone is the accent. */
export const presence: IconDraw = (k) => {
  k.disc(0.2, 0.1, 5.4, 0, { tone: 'lo', detail: true });
  for (const [x, y, h, lean] of [[-3.9, 2.6, 1.6, -0.5], [-3.5, 3.1, 1.2, 0.3], [-4.3, 2.3, 1.0, -0.9]] as const) {
    k.line([[x, y, 0], [x + lean * 0.4, y, h * 0.6], [x + lean, y, h]], { tone: 'lo', detail: true });
  }
  stone(k, [0, 0, 1.35], 4.0, 3.25, 1.35, 18);
  stone(k, [0.35, -0.15, 3.5], 2.9, 2.35, 1.05, -14);
  stone(k, [0.15, 0.1, 5.3], 1.95, 1.62, 0.88, 32, { tone: 'accent' });
  stone(k, [4.6, 2.9, 0.48], 0.95, 0.75, 0.48, 10, { detail: true });
};
