import { rrect, type Ring } from '../../hairline/core/iso';
import { faceMarks, LOOKS } from '../../figures/uru-kit';
import { unit, type Kit, type Tone, type Vec3 } from '../kit';

/**
 * Parts more than one icon draws: Uru's box, a pebble, and outlines the kit has no builder for.
 */

/** Degrees to radians. */
export const rad = (deg: number) => (deg * Math.PI) / 180;

/** The point a, moved s along b. */
export const along = (a: Vec3, b: Vec3, s = 1): Vec3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

/** Points on a circle about (cu, cv), from one angle to another in degrees: for shapes on a face. */
export const arc = (cu: number, cv: number, r: number, from: number, to: number, n = 12): [number, number][] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = rad(from + ((to - from) * i) / n);
    return [cu + r * Math.cos(t), cv + r * Math.sin(t)];
  });

/**
 * Uru's box: a small rounded square box, W across and H high, standing on (x, y, z), and its lift-off lid.
 * Shut, the lid sits on the box. Open, it is lifted a crack, hinged along its back edge, and the dark gap
 * under it, the drawing's one dark solid, shows Uru's two dome eyes peeking out on the left-front face, in
 * the figures' own eye shapes (figures/uru-kit.ts), nothing between them. The eyes are then the accent.
 * `light` draws the box and lid as a light solid, white on any band.
 */
export function uruBox(k: Kit, x: number, y: number, z: number, W: number, H: number, o: { open?: boolean; light?: boolean; tone?: Tone; detail?: boolean } = {}) {
  const u = W / 9, wall = 0.32 * u, over = 0.28 * u, LH = 0.3 * H, look = { tone: o.tone, detail: o.detail };
  // the lid's foot at depth v across the box: level when shut, tipped up towards the front when open
  const gap = o.open ? 0.4 * u : 0, tilt = o.open ? 0.19 : 0, foot = (v: number) => z + H + gap + (v + over) * tilt;
  k.light(!!o.light);
  k.box(x, y, x + W, y + W, z, z + H, { r: 1.1 * u, b: wall, ...look });
  if (o.open) {
    k.light(false);
    const inner = rrect(wall, wall, W - wall, W - wall, 0.8 * u);
    k.hullOf(inner.flatMap((q): Vec3[] => [[x + q.u, y + q.v, z + H], [x + q.u, y + q.v, foot(q.v)]]), { tone: 'ink', fill: 'tone' });
    const F = k.face([x, y + W - wall, z], [1, 0, 0], [0, 0, 1]), eyes = k.on(F), sc = 1.15 * u;
    for (const e of faceMarks(LOOKS.rest).eyes) eyes.shape(e.map(([a, b]): [number, number] => [0.53 * W + a * sc, H + 0.34 * u + (b + 0.35) * sc]), { tone: 'warm', fill: 'tone' });
    k.light(!!o.light);
  }
  const lid = rrect(-over, -over, W + over, W + over, 1.3 * u), crease = rrect(-over + 0.35 * u, -over + 0.35 * u, W + over - 0.35 * u, W + over - 0.35 * u, 0.95 * u);
  k.hullOf(lid.flatMap((q): Vec3[] => [[x + q.u, y + q.v, foot(q.v)], [x + q.u, y + q.v, foot(q.v) + LH]]), look);
  k.seam(crease.map((q): Vec3 => [x + q.u, y + q.v, foot(q.v) + LH]), crease.map((q): Vec3 => [q.nu, q.nv, 0]), { detail: o.detail });
  k.light(false);
}

/** A pebble: an ellipsoid about c, turned `turn` degrees about the vertical, with its crease a little below its middle. */
export function pebble(k: Kit, c: Vec3, rx: number, ry: number, rz: number, turn: number, o: { tone?: Tone; detail?: boolean } = {}) {
  const ct = Math.cos(rad(turn)), st = Math.sin(rad(turn));
  const at = (u: number, v: number, w: number): Vec3 => [c[0] + u * ct - v * st, c[1] + u * st + v * ct, c[2] + w];
  const pts: Vec3[] = [];
  for (let i = 0; i <= 12; i++) {
    const lat = rad(-90 + (180 * i) / 12);
    for (let j = 0; j < 36; j++) {
      const lon = rad((360 * j) / 36);
      pts.push(at(rx * Math.cos(lat) * Math.cos(lon), ry * Math.cos(lat) * Math.sin(lon), rz * Math.sin(lat)));
    }
  }
  k.hullOf(pts, { tone: o.tone, detail: o.detail });
  const lat = rad(-14), ring: Vec3[] = [], normals: Vec3[] = [];
  for (let j = 0; j < 72; j++) {
    const lon = rad((360 * j) / 72), u = 0.86 * rx * Math.cos(lat) * Math.cos(lon), v = 0.86 * ry * Math.cos(lat) * Math.sin(lon), w = rz * Math.sin(lat);
    ring.push(at(u, v, w));
    const nu = u / rx ** 2, nv = v / ry ** 2;
    normals.push([nu * ct - nv * st, nu * st + nv * ct, w / rz ** 2]);
  }
  k.seam(ring, normals, { detail: o.detail });
}

/** A ring from (u, v) points in order, with outward normals from the neighbouring points: for slabs of any convex outline. */
export function ringOf(pts: readonly (readonly [number, number])[]): Ring {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const turn = area > 0 ? 1 : -1;
  return pts.map((p, i) => {
    const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
    const du = b[0] - a[0], dv = b[1] - a[1], l = Math.hypot(du, dv) || 1;
    return { u: p[0], v: p[1], nu: (turn * dv) / l, nv: (-turn * du) / l };
  });
}

/** A tunnel outline in (u, v): a flat foot with rounded corners and a half-round top, `inset` in from the edge. */
export function tunnel(u0: number, u1: number, v0: number, v1: number, inset = 0): Ring {
  const a0 = u0 + inset, a1 = u1 - inset, b0 = v0 + inset, R = (a1 - a0) / 2, c = (a0 + a1) / 2, r = 0.35;
  const pts: [number, number][] = [];
  pts.push(...arc(a0 + r, b0 + r, r, 180, 270, 4), ...arc(a1 - r, b0 + r, r, 270, 360, 4));
  pts.push(...arc(c, v1 - inset - R, R, 0, 180, 18));
  return ringOf(pts);
}

/** The direction across the screen to the right, on the ground, and the one towards the viewer. */
export const RIGHT: Vec3 = unit([1, -1, 0]);
export const NEAR: Vec3 = unit([1, 1, 0]);
export const UP: Vec3 = [0, 0, 1];
