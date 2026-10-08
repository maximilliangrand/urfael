import type { IconDraw, Vec3 } from '../kit';
import { arc, helper, NEAR, rad, RIGHT, ringOf } from './parts';

/**
 * What Urfael holds to, on the home page, and Uru's principles, on /uru: gentle, private, honest about
 * limits, a human in the loop, on your side, open to inspection. Each is an object from a home, not a
 * symbol; one part of each, the one the principle is about, is in the accent.
 */

/**
 * Gentle by design: a plump square cushion, piped round its widest edge and tufted in the middle, with a
 * feather resting on it; the feather is the accent.
 */
export const gentle: IconDraw = (k) => {
  const S = 11, seam = 1.7;
  /** The cushion's height a distance d in from its edge, read off its rings. */
  const rise: [number, number][] = [[0, seam], [0.18, 2.55], [0.95, 3.35], [2.5, 3.75], [5.5, 3.95]];
  const heightAt = (d: number) => {
    for (let i = 1; i < rise.length; i++) if (d <= rise[i][0]) { const [d0, z0] = rise[i - 1], [d1, z1] = rise[i]; return z0 + ((z1 - z0) * (d - d0)) / (d1 - d0); }
    return rise[rise.length - 1][1];
  };
  const topAt = (x: number, y: number) => heightAt(Math.max(0, Math.min(x, S - x, y, S - y)));
  const ring = (inset: number, r: number, z: number): Vec3[] => roundRing(inset, inset, S - inset, S - inset, r).map(([x, y]): Vec3 => [x, y, z]);
  k.hullOf([...ring(0.85, 2.2, 0), ...ring(0.18, 2.0, 0.85), ...ring(0, 1.9, seam), ...ring(0.18, 2.0, 2.55), ...ring(0.95, 2.4, 3.35), ...ring(2.5, 2.4, 3.75)]);
  const pipe = roundRing(0, 0, S, S, 1.9);
  k.seam(pipe.map(([x, y]): Vec3 => [x, y, seam]), pipe.map(([x, y]): Vec3 => [x - S / 2, y - S / 2, 0]), { tone: 'mid' });
  const c = S / 2;
  for (let i = 0; i < 6; i++) {
    const t = rad(15 + i * 60), d0 = 0.7, d1 = 1.7;
    k.line([[c + d0 * Math.cos(t), c + d0 * Math.sin(t), topAt(c, c) + 0.02], [c + d1 * Math.cos(t + 0.25), c + d1 * Math.sin(t + 0.25), topAt(c, c) + 0.02]], { tone: 'lo', detail: true });
  }
  k.cyl(c, c, 0.48, topAt(c, c) - 0.1, topAt(c, c) + 0.2, { b: 0.15 });
  const A: [number, number] = [0.9, 7.9], B: [number, number] = [10.2, 3.0];
  const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const along: [number, number] = [(B[0] - A[0]) / len, (B[1] - A[1]) / len], across: [number, number] = [along[1], -along[0]];
  const spine = (t: number): [number, number] => {
    const bend = 0.9 * Math.sin(Math.PI * t);
    return [A[0] + along[0] * len * t + across[0] * bend, A[1] + along[1] * len * t + across[1] * bend];
  };
  const width = (t: number, side: number) => {
    const s = Math.max(0, (t - 0.17) / 0.83);
    const w = (side > 0 ? 1.5 : 1.1) * Math.sin(Math.PI * s ** 0.58);
    const notch = side > 0 ? 1 - 0.5 * Math.exp(-(((t - 0.6) / 0.028) ** 2)) : 1 - 0.42 * Math.exp(-(((t - 0.4) / 0.024) ** 2));
    return w * notch;
  };
  const on = (x: number, y: number, lift: number): Vec3 => [x, y, topAt(x, y) + lift];
  const edge = (t: number, side: number): Vec3 => { const [x, y] = spine(t), w = width(t, side) * side; return on(x + across[0] * w, y + across[1] * w, 0.16); };
  const ts = Array.from({ length: 41 }, (_, i) => 0.17 + (0.83 * i) / 40);
  k.loop([...ts.map((t) => edge(t, 1)), ...ts.slice().reverse().map((t) => edge(t, -1))], { tone: 'accent', fill: 'ground' });
  k.line(Array.from({ length: 25 }, (_, i) => { const [x, y] = spine(i / 24); return on(x, y, 0.18); }), { tone: 'accent' });
  for (let t = 0.22; t < 0.95; t += 0.05) for (const side of [-1, 1]) {
    const [x, y] = spine(t);
    k.line([on(x, y, 0.18), edge(Math.min(0.99, t + 0.065), side * 0.9)], { tone: 'lo', detail: true });
  }
};

/** A rounded rectangle's outline as (x, y) points, counter-clockwise. */
function roundRing(x0: number, y0: number, x1: number, y1: number, r: number): [number, number][] {
  return [...arc(x1 - r, y0 + r, r, -90, 0, 6), ...arc(x1 - r, y1 - r, r, 0, 90, 6), ...arc(x0 + r, y1 - r, r, 90, 180, 6), ...arc(x0 + r, y0 + r, r, 180, 270, 6)];
}

/** Private by default: a small house with its door shut and the curtains drawn in its window; the curtains are the accent. */
export const privateHome: IconDraw = (k) => {
  const g = 0.6, eave = 6.4, ridge = 9.9, W = 9, L = 11;
  k.box(-1.6, -1.6, W + 1.8, L + 3.0, 0, g, { r: 1.6, b: 0.55 });
  for (const [x, y] of [[4.5, L + 1.2], [4.0, L + 2.2]]) k.disc(x, y, 0.45, g, { tone: 'lo', detail: true });
  k.box(0, 0, W, L, g, eave, { r: 0.35, b: 0.2 });
  const roof = (x: number) => ridge - (Math.abs(x - W / 2) / (W / 2 + 0.7)) * (ridge - eave);
  k.taper([-0.7, -0.7, W + 0.7, L + 0.7], [W / 2 - 0.15, -0.7, W / 2 + 0.15, L + 0.7], eave, ridge, { r: 0.15, b: 0.08 });
  k.shape('y', L + 0.7, [[-0.7, eave], [W + 0.7, eave], [W / 2, ridge]], { tone: 'mid' });
  k.shape('y', L + 0.7, [[0.4, eave + 0.3], [W - 0.4, eave + 0.3], [W / 2, ridge - 0.6]], { tone: 'lo', detail: true });
  k.shape('y', L + 0.7, arc(W / 2, eave + 1.3, 0.55, 0, 360, 16), { tone: 'mid', detail: true });
  for (let y = 1.2; y < L; y += 1.3) k.line([[W + 0.7, y, eave], [W / 2 + 0.15, y, ridge]], { tone: 'lo', detail: true });
  const cx0 = 6.2, cx1 = 7.5, cy0 = 2.0, cy1 = 3.3, top = 11.0;
  const stack: Vec3[] = [];
  for (const [x, y] of [[cx0, cy0], [cx1, cy0], [cx1, cy1], [cx0, cy1]]) stack.push([x, y, roof(x)], [x, y, top]);
  k.hullOf(stack);
  k.line([[cx0 + 0.2, cy1, top], [cx1, cy1, top], [cx1, cy0 + 0.2, top]], { tone: 'lo' });
  k.box(cx0 - 0.2, cy0 - 0.2, cx1 + 0.2, cy1 + 0.2, top, top + 0.45, { r: 0.15, b: 0.08 });
  const door: [number, number][] = [[3.4, g], [5.6, g], ...arc(4.5, 3.6, 1.1, 0, 180, 10)];
  k.shape('y', L, door, { tone: 'mid', fill: 'ground' });
  k.shape('y', L, [[3.8, g + 0.4], [5.2, g + 0.4], ...arc(4.5, 3.6, 0.7, 0, 180, 8)], { tone: 'lo', detail: true });
  k.dot(5.15, L, 2.4, { r: 0.13, tone: 'mid', detail: true });
  k.box(3.1, L, 5.9, L + 0.8, g, g + 0.3, { r: 0.2, b: 0.1, detail: true });
  const w0 = 2.8, w1 = 8.2, z0 = 2.4, z1 = 5.2, mid = (w0 + w1) / 2;
  k.pane('x', W, w0, z0, w1, z1, { r: 0.3, tone: 'mid', fill: 'ground' });
  const curtain = (a: number, b: number) => {
    const sway: [number, number][] = [];
    for (let i = 0; i <= 6; i++) sway.push([b + (i % 2 ? 0.12 : 0) * Math.sign(a - b), z1 - 0.25 - ((z1 - z0 - 0.5) * i) / 6]);
    k.shape('x', W, [[a, z1 - 0.25], ...sway, [a, z0 + 0.25]], { tone: 'accent', fill: 'ground' });
    for (const f of [0.3, 0.62]) { const u = a + (b - a) * f; k.line([[W, u, z1 - 0.4], [W, u, z0 + 0.4]], { tone: 'lo', detail: true }); }
  };
  curtain(w0 + 0.3, mid - 0.02);
  curtain(w1 - 0.3, mid + 0.02);
  k.line([[W, w0 - 0.3, z1 + 0.35], [W, w1 + 0.3, z1 + 0.35]], { tone: 'mid', detail: true });
  k.box(W, w0 - 0.2, W + 0.45, w1 + 0.2, z0 - 0.35, z0 - 0.05, { r: 0.1, b: 0.05, detail: true });
  k.ball([W + 1.3, L + 1.6, g + 1.0], 1.0, { detail: true });
};

/** Honest about limits: a spirit level, ruled along its top, that reads plainly whether a thing is true; its bubble is the accent. */
export const honest: IconDraw = (k) => {
  const L = 12, D = 2.6, H = 3.4, y = D;
  k.box(0.9, 0, L - 0.9, D, 0, H, { r: 0.5, b: 0.28 });
  for (let x = 2.1, i = 0; x < L - 1.9; x += 0.5, i++) k.line([[x, D - 0.25, H], [x, D - (i % 4 === 0 ? 1.05 : 0.62), H]], { tone: 'lo', detail: true });
  k.pane('y', y, 3.9, 0.75, 8.1, 2.65, { r: 0.85, tone: 'mid', fill: 'ground' });
  k.pane('y', y, 4.3, 1.08, 7.7, 2.32, { r: 0.58, tone: 'lo' });
  for (const u of [5.15, 6.85]) k.line([[u, y, 1.08], [u, y, 2.32]], { tone: 'mid' });
  k.pane('y', y, 5.45, 1.28, 6.55, 2.12, { r: 0.4, tone: 'accent', fill: 'ground' });
  for (const u of [2.45, 9.55]) {
    k.shape('y', y, arc(u, 1.7, 0.8, 0, 360, 20), { tone: 'mid', fill: 'ground' });
    k.pane('y', y, u - 0.26, 1.12, u + 0.26, 2.28, { r: 0.24, tone: 'lo', detail: true });
  }
  k.box(0, -0.15, 1.5, D + 0.15, 0, H + 0.2, { r: 0.6, b: 0.25 });
  k.box(L - 1.5, -0.15, L, D + 0.15, 0, H + 0.2, { r: 0.6, b: 0.25 });
  k.shape('x', L, arc(1.3, 2.6, 0.32, 0, 360, 12), { tone: 'lo', detail: true });
};

/**
 * A human in the loop: a person standing at the centre of a round track, with the helper on the track
 * beside them; the person, who makes the important decisions, is the accent.
 */
export const human: IconDraw = (k) => {
  const top = 1.0;
  k.cyl(0, 0, 6.6, 0, top, { b: 0.7 });
  k.disc(0, 0, 4.9, top, { tone: 'mid' });
  k.disc(0, 0, 4.25, top, { tone: 'lo', detail: true });
  for (let i = 0; i < 8; i++) { const t = rad(22.5 + i * 45); k.dot(4.58 * Math.cos(t), 4.58 * Math.sin(t), top, { r: 0.16, tone: 'mid', detail: true }); }
  for (let i = 0; i < 24; i++) { const t = rad(-45 + i * 7.5); k.line([[6.6 * Math.cos(t), 6.6 * Math.sin(t), 0.25], [6.6 * Math.cos(t), 6.6 * Math.sin(t), 0.55]], { tone: 'lo', detail: true }); }
  const body = k.lathe([0, 0, top], [[1.55, 0], [1.6, 0.4], [1.45, 2.4], [1.2, 3.5], [0.8, 3.95], [0.35, 4.1]], { tone: 'accent' });
  body.seam(2.1, { tone: 'lo', detail: true });
  k.ball([0, 0, top + 5.25], 1.05, { tone: 'accent' });
  const at = rad(-16);
  helper(k, 4.58 * Math.cos(at), 4.58 * Math.sin(at), top, 1.05);
};

/** On your side: an armchair, and at its side a small table with the helper on it; the helper is the accent. */
export const onYourSide: IconDraw = (k) => {
  for (const [x, y] of [[0.8, 0.6], [7.2, 0.6]]) k.cyl(x, y, 0.32, 0, 0.8, { b: 0.1 });
  k.box(0, 0, 8, 2.1, 0.8, 8.6, { r: 1.2, b: 0.45 });
  for (const z of [5.0, 6.8]) k.line([[1.4, 2.1, z], [6.6, 2.1, z]], { tone: 'lo', detail: true });
  k.box(0, 2.1, 1.6, 7.8, 0.8, 5.4, { r: 0.75, b: 0.3 });
  k.box(1.6, 2.1, 6.4, 7.8, 0.8, 2.7, { r: 0.6, b: 0.25 });
  k.box(1.6, 2.1, 6.4, 7.6, 2.7, 3.7, { r: 0.9, b: 0.35 });
  k.line([[2.4, 7.6, 3.2], [5.6, 7.6, 3.2]], { tone: 'lo', detail: true });
  k.box(1.7, 2.1, 6.3, 2.9, 3.7, 7.7, { r: 0.7, b: 0.3 });
  for (const [x, y] of [[0.8, 7.2]]) k.cyl(x, y, 0.32, 0, 0.8, { b: 0.1 });
  k.box(6.4, 2.1, 8, 7.8, 0.8, 5.4, { r: 0.75, b: 0.3 });
  k.pane('x', 8, 2.8, 1.4, 7.1, 4.7, { r: 0.5, tone: 'lo', detail: true });
  k.cyl(7.2, 7.2, 0.32, 0, 0.8, { b: 0.1 });
  const tx = 11.2, ty = 5.0, tz = 5.2;
  k.cyl(tx, ty, 1.35, 0, 0.35, { b: 0.35 });
  k.cyl(tx, ty, 0.24, 0.35, tz - 0.45, { b: 0.08 });
  k.cyl(tx, ty, 2.1, tz - 0.45, tz, { b: 0.45 });
  helper(k, tx, ty, tz, 1.0, { tone: 'accent' });
};

/**
 * Open to inspection: an open book lying on the table, its pages ruled with lines anyone can read; the
 * ribbon marking the place, run out over its edge onto the table, is the accent.
 */
export const openBook: IconDraw = (k) => {
  const half = 5.2, wide = 6.6, rise = rad(11), cover = rad(6);
  const spine = (b: number, z: number): Vec3 => [NEAR[0] * b, NEAR[1] * b, z];
  const page = (side: number, ang: number, z: number) => {
    const out: Vec3 = [RIGHT[0] * side * Math.cos(ang), RIGHT[1] * side * Math.cos(ang), Math.sin(ang)];
    return k.face(spine(0, z), out, [NEAR[0], NEAR[1], 0]);
  };
  const rect = (a0: number, b0: number, a1: number, b1: number, r: number) =>
    ringOf([...arc(a1 - r, b0 + r, r, 270, 360, 3), ...arc(a1 - r, b1 - r, r, 0, 90, 3), ...arc(a0 + r, b1 - r, r, 90, 180, 3), ...arc(a0 + r, b0 + r, r, 180, 270, 3)]);
  for (const side of [-1, 1]) k.slab(page(side, cover, 0.35), rect(0, -half - 0.35, wide + 0.4, half + 0.35, 0.35), null, 0.35);
  for (const side of [-1, 1]) {
    const F = page(side, rise, 0.55);
    k.slab(F, rect(0, -half, wide, half, 0.2), rect(0.15, -half + 0.15, wide - 0.15, half - 0.15, 0.1), 0.5);
    const on = k.on(F);
    for (let b = -half + 1.0, i = 0; b < half - 0.8; b += 0.72, i++) {
      if (i === 5) continue;
      const end = i === 4 || i === 11 ? wide * 0.55 : wide - 0.9;
      on.line([[0.8, b], [end, b]], { tone: 'lo', detail: i % 2 === 1 });
    }
    for (const f of [0.18, 0.32]) {
      const nearEdge = [F.at(wide * 0.1, half), F.at(wide - 0.1, half)].map((p): Vec3 => [p[0], p[1], p[2] - f]);
      k.line(nearEdge, { tone: 'lo', detail: true });
    }
  }
  const R = page(1, rise, 0.55), a0 = 0.35, a1 = 1.15;
  k.on(R).shape([[a0, 0.6], [a1, 0.6], [a1, half], [a0, half]], { tone: 'accent', fill: 'ground' });
  const lip = [R.at(a1, half), R.at(a0, half)];
  const drop = lip.map((p): Vec3 => [p[0] + NEAR[0] * 0.5, p[1] + NEAR[1] * 0.5, 0]);
  k.loop([lip[0], lip[1], drop[1], drop[0]], { tone: 'accent', fill: 'ground' });
  const fwd = (p: Vec3, s: number): Vec3 => [p[0] + NEAR[0] * s, p[1] + NEAR[1] * s, 0];
  const mid: Vec3 = [(drop[0][0] + drop[1][0]) / 2, (drop[0][1] + drop[1][1]) / 2, 0];
  k.loop([drop[0], drop[1], fwd(drop[1], 2.0), fwd(mid, 1.45), fwd(drop[0], 2.0)], { tone: 'accent', fill: 'ground' });
};
