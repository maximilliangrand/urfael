import { circ } from '../../hairline/core/iso';
import { unit, type IconDraw, type Vec3 } from '../kit';
import { along, arc, helper, rad, ringOf, tunnel } from './parts';

/**
 * The rest of the copy's cards and callouts: the emergency-number line on /uru (a telephone, never a
 * cross), the evidence section and the install section on /assistant, where Uru is today, and following
 * along. One part of each is in the accent.
 */

/**
 * Call your local emergency number: a rotary telephone, its dial on the sloping front, the cord curled at
 * its side; the handset, lifted to call, is the accent.
 */
export const call: IconDraw = (k) => {
  const coil: Vec3[] = [];
  for (let i = 0; i <= 90; i++) {
    const t = i / 90, x = 0.5 - 1.9 * Math.sin(t * 2.2), y = 3.3 + 4.6 * t, z = 4.9 - 4.6 * t ** 0.8;
    const a = t * Math.PI * 22;
    coil.push([x + 0.28 * Math.cos(a), y + 0.18 * Math.sin(a), z + 0.28 * Math.sin(a)]);
  }
  k.line(coil, { tone: 'mid', detail: true });
  k.line([[0.5, 3.3, 4.9], [-1.3, 5.6, 2.4], [-0.6, 7.9, 0.3]], { tone: 'mid' });
  k.taper([0, 0, 10, 9.4], [1.0, 0.7, 9.0, 6.2], 0, 4.4, { r: 2.2, b: 0.5 });
  const up = unit([0, -3.2, 4.4]);
  const n = unit([0, 4.4, 3.2]);
  const centre: Vec3 = [5, 7.8, 2.2];
  const dial = k.face(along(centre, n, 0.35), [1, 0, 0], up);
  k.slab(dial, circ(2.05, 48), circ(1.8, 48), 0.35);
  const d = k.on(dial);
  for (let i = 0; i < 10; i++) { const t = rad(65 + i * 28); d.circle(1.32 * Math.cos(t), 1.32 * Math.sin(t), 0.3, { tone: 'mid' }); }
  d.circle(0, 0, 0.66, { tone: 'mid', fill: 'ground' });
  d.circle(0, 0, 0.42, { tone: 'lo', detail: true });
  d.line([[1.55 * Math.cos(rad(28)), 1.55 * Math.sin(rad(28))], [2.0 * Math.cos(rad(22)), 2.0 * Math.sin(rad(22))]], { tone: 'mid', detail: true });
  for (const x of [1.7, 7.3]) k.box(x, 2.2, x + 1.0, 4.4, 4.4, 5.3, { r: 0.35, b: 0.15 });
  for (const x of [1.4, 8.6]) k.cyl(x, 3.3, 1.3, 4.95, 5.6, { b: 0.35, tone: 'accent' });
  k.box(1.0, 2.65, 9.0, 3.95, 5.55, 6.35, { r: 0.62, b: 0.25, tone: 'accent' });
  k.pane('y', 9.4, 3.6, 0.35, 6.4, 0.75, { r: 0.18, tone: 'lo', detail: true });
};

/**
 * Tests you can run yourself: a multimeter with its leads plugged in and its probes laid out ready; the
 * selector knob, which you turn yourself, is the accent.
 */
export const tests: IconDraw = (k) => {
  k.box(0, 0, 8.6, 12.2, 0, 1.8, { r: 1.7, b: 0.6 });
  k.plate(0.6, 0.6, 8.0, 11.6, 1.8, { r: 1.2, tone: 'lo', detail: true });
  k.plate(1.3, 1.2, 7.3, 4.3, 1.8, { r: 0.5, tone: 'mid', fill: 'ground' });
  k.plate(1.75, 1.6, 6.85, 3.9, 1.8, { r: 0.3, tone: 'lo' });
  [1.4, 2.0, 2.4, 3.1, 2.2, 1.6].forEach((len, i) => k.plate(2.2 + i * 0.72, 3.1 - len * 0.5, 2.62 + i * 0.72, 3.4, 1.8, { r: 0.08, tone: 'mid', detail: true }));
  for (const x of [2.2, 4.3, 6.4]) k.plate(x - 0.55, 4.9, x + 0.55, 5.5, 1.8, { r: 0.28, tone: 'mid', detail: true });
  for (let i = 0; i < 9; i++) { const t = rad(160 + i * 27); k.dot(4.3 + 2.7 * Math.cos(t), 8.0 + 2.7 * Math.sin(t), 1.8, { r: 0.13, tone: 'mid', detail: true }); }
  k.cyl(4.3, 8.0, 2.15, 1.8, 2.2, { b: 0.45 });
  k.cyl(4.3, 8.0, 1.4, 2.2, 3.0, { b: 0.35, tone: 'accent' });
  k.box(4.0, 6.75, 4.6, 9.25, 3.0, 3.35, { r: 0.25, b: 0.1, tone: 'accent' });
  for (const x of [2.0, 4.3, 6.6]) { k.disc(x, 10.9, 0.55, 1.8, { tone: 'mid' }); k.dot(x, 10.9, 1.8, { r: 0.2, tone: 'mid', detail: true }); }
  const lead = (x: number, pts: Vec3[]) => {
    k.line([[x, 10.9, 2.6], [x, 11.3, 2.75], ...pts], { tone: 'mid' });
    k.cyl(x, 10.9, 0.4, 1.8, 2.6, { b: 0.15 });
  };
  lead(2.0, [[1.9, 12.4, 1.6], [2.2, 13.2, 0.1], [3.4, 14.0, 0.1], [4.8, 14.15, 0.1]]);
  lead(4.3, [[4.6, 12.3, 1.5], [5.4, 12.6, 0.1], [6.8, 12.5, 0.1], [8.6, 12.0, 0.1]]);
  const probe = (base: Vec3, axis: Vec3) => {
    k.lathe(base, [[0.26, 0], [0.32, 0.25], [0.32, 3.3], [0.24, 3.5], [0.09, 4.9], [0.02, 5.2]], { axis, n: 24 });
    k.lathe(along(base, axis, 3.3), [[0.55, 0], [0.55, 0.16]], { axis, n: 24 });
  };
  probe([4.8, 14.15, 0.35], unit([1, -0.18, 0]));
  probe([8.6, 12.0, 0.35], unit([1, -0.5, 0]));
};

/** Install: a box opened, its flaps folded out, and what was packed in it lifting free; that is the accent. */
export const install: IconDraw = (k) => {
  const W = 10, D = 8, H = 5.6, back = rad(24), out = rad(64), t = 0.18;
  const rect = (a0: number, b0: number, a1: number, b1: number) => ringOf([[a0, b0], [a1, b0], [a1, b1], [a0, b1]]);
  const flap = (o: Vec3, u: Vec3, v: Vec3, len: number, span: number, tape = false) => {
    const F = k.face(o, u, v);
    k.slab(F, rect(0.15, 0, span - 0.15, len), null, t);
    if (tape) k.on(F).line([[span / 2, 0.2], [span / 2, len - 0.2]], { tone: 'lo', detail: true });
    return F;
  };
  flap([0, 0, H], [1, 0, 0], [0, -Math.sin(back), Math.cos(back)], 3.9, W);
  flap([0, 0, H], [0, 1, 0], [-Math.sin(back), 0, Math.cos(back)], 3.7, D);
  k.box(0, 0, W, D, 0, H, { r: 0.35, b: 0.22 });
  k.plate(0.3, 0.3, W - 0.3, D - 0.3, H, { r: 0.25, tone: 'lo' });
  k.line([[W / 2, D, H - 0.2], [W / 2, D, H - 1.8]], { tone: 'lo', detail: true });
  k.pane('y', D, 1.2, 1.2, 3.8, 2.8, { r: 0.2, tone: 'lo', detail: true });
  k.pane('x', W, 4.6, 1.4, 6.8, 2.4, { r: 0.2, tone: 'lo', detail: true });
  const z0 = H - 0.408 * (D - 0.3 - 6.0);
  k.box(2.7, 2.1, 7.3, 6.0, z0, 8.6, { r: 1.0, b: 0.4, tone: 'accent' });
  k.pane('y', 6.0, 3.8, 6.4, 6.2, 7.6, { r: 0.6, tone: 'lo', detail: true });
  flap([W, 0, H], [0, 1, 0], [Math.sin(out), 0, Math.cos(out)], 3.7, D, true);
  flap([0, D, H], [1, 0, 0], [0, Math.sin(out), Math.cos(out)], 3.9, W, true);
};

/**
 * Where Uru is today, the research stage: a sculptor's banding wheel with a clay study of Uru on it and a
 * modelling tool laid by; the study is the accent.
 */
export const research: IconDraw = (k) => {
  k.cyl(0, 0, 2.5, 0, 0.7, { b: 0.5 });
  k.cyl(0, 0, 0.6, 0.7, 2.7, { b: 0.2 });
  k.cyl(0, 0, 5.0, 2.7, 3.45, { b: 0.65 });
  for (let i = 0; i < 25; i++) { const t = rad(-45 + i * 7.5); k.line([[5 * Math.cos(t), 5 * Math.sin(t), 2.85], [5 * Math.cos(t), 5 * Math.sin(t), i % 4 === 0 ? 3.3 : 3.1]], { tone: 'lo', detail: true }); }
  for (const r of [3.7, 2.5]) k.disc(0, 0, r, 3.45, { tone: 'lo', detail: true });
  helper(k, -0.2, -0.3, 3.45, 1.85, { tone: 'accent' });
  k.box(1.4, 3.1, 4.6, 3.5, 3.45, 3.72, { r: 0.18, b: 0.08 });
  k.line(arc(0, 0, 0.42, 0, 300, 10).map(([a, b]): Vec3 => [4.95 + a, 3.3 + b * 0.6, 3.72 + 0.4 + b * 0.5]), { tone: 'mid' });
};

/** Follow along: a mailbox on its post with the flag up, a letter ready to go; the flag is the accent. */
export const follow: IconDraw = (k) => {
  k.disc(4.9, 4.1, 2.4, 0, { tone: 'lo', detail: true });
  for (const [x, y, lean] of [[2.9, 5.6, -0.4], [3.3, 6.1, 0.3], [7.2, 5.4, 0.4]] as const) k.line([[x, y, 0], [x + lean, y, 1.1]], { tone: 'lo', detail: true });
  k.box(4.4, 3.6, 5.4, 4.6, 0, 6.2, { r: 0.2, b: 0.1 });
  k.box(3.2, 3.0, 6.8, 5.2, 5.75, 6.3, { r: 0.2, b: 0.1 });
  const y0 = 2.4, y1 = 5.8, z0 = 6.3, z1 = 9.75, L = 10;
  const end = k.face([L, 0, 0], [0, 1, 0], [0, 0, 1]);
  k.slab(end, tunnel(y0, y1, z0, z1), tunnel(y0, y1, z0, z1, 0.32), L);
  for (const x of [2.2, 7.6]) {
    const ring = tunnel(y0, y1, z0, z1);
    k.seam(ring.map((q): Vec3 => [x, q.u, q.v]), ring.map((q): Vec3 => [0, q.nu, q.nv]), { detail: true });
  }
  k.shape('x', L, tunnel(y0, y1, z0, z1, 0.6).map((q): [number, number] => [q.u, q.v]), { tone: 'lo', detail: true });
  k.box(L, 3.8, L + 0.45, 4.4, 6.55, 7.25, { r: 0.15, b: 0.06 });
  // the flag, raised: a thin arm on its pivot, and the flag itself, a plate of its own with its hem, so it reads as a flag
  const pole: [number, number][] = [...arc(2.3, 7.3, 0.3, 180, 360, 6), ...arc(2.3, 12.05, 0.3, 0, 180, 6)];
  const plate: [number, number][] = [...arc(2.95, 9.55, 0.3, 180, 270, 3), ...arc(6.05, 9.55, 0.3, 270, 360, 3), ...arc(6.05, 11.75, 0.3, 0, 90, 3), ...arc(2.95, 11.75, 0.3, 90, 180, 3)];
  k.shape('y', y1 + 0.08, pole, { tone: 'accent', fill: 'ground' });
  k.shape('y', y1 + 0.16, plate, { tone: 'accent', fill: 'ground' });
  k.line([[3.3, y1 + 0.18, 10.1], [5.95, y1 + 0.18, 10.1]], { tone: 'lo', detail: true });
  k.shape('y', y1 + 0.08, arc(2.3, 7.35, 0.2, 0, 360, 10), { tone: 'mid', detail: true });
};
