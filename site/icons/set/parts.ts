import type { Ring } from '../../hairline/core/iso';
import { unit, type Kit, type Lathe, type Profile, type Tone, type Vec3 } from '../kit';

/**
 * Parts more than one icon draws: Uru's pebble, the small helper that stands for Uru inside other icons,
 * a stone, and outlines the kit has no builder for.
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

/** An ellipse about (cu, cv), for shapes on a face or a surface. */
export const oval = (cu: number, cv: number, ru: number, rv: number, n = 20): [number, number][] =>
  Array.from({ length: n }, (_, i) => [cu + ru * Math.cos((i / n) * Math.PI * 2), cv + rv * Math.sin((i / n) * Math.PI * 2)]);

/** A squircle about (cu, cv), |u|^4 + |v|^4 = 1 scaled: Uru's face window. */
export const squircle = (cu: number, cv: number, ru: number, rv: number, n = 48): [number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    return [cu + ru * Math.sign(c) * Math.abs(c) ** 0.5, cv + rv * Math.sign(s) * Math.abs(s) ** 0.5];
  });

/** A dome eye: flat underneath, round on top, `w` across and `h` high, its foot at (cu, cv). */
export const domeEye = (cu: number, cv: number, w: number, h: number, n = 14): [number, number][] =>
  Array.from({ length: n + 1 }, (_, i): [number, number] => {
    const t = Math.PI * (i / n);
    return [cu + (w / 2) * Math.cos(t), cv + h * Math.sin(t) ** 0.85];
  });

/**
 * Uru's one-piece pebble as a lathe profile, R across at its widest and H high: a flat foot, widest a
 * fifth of the way up, and a soft superellipse dome above (`dome` 2 is an ellipse; less is more egg-like),
 * so the shoulders come in and the top is round.
 */
export function pebble(R: number, H: number, n = 18, dome = 1.9): Profile {
  const out: [number, number][] = [];
  const tm = 0.2;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let r: number;
    if (t <= tm) r = R * (1 - 0.14 * ((tm - t) / tm) ** 2);
    else r = R * Math.max(0, 1 - ((t - tm) / (1 - tm)) ** dome) ** (1 / dome);
    out.push([r, t * H]);
  }
  return out;
}

/**
 * The small helper inside other icons: Uru's pebble, its lantern bead on a stalk, no face. The face is
 * Uru's own icon; elsewhere the pebble and bead say who it is without a second dark shape.
 */
export function helper(k: Kit, x: number, y: number, z: number, R: number, o: { tone?: Tone; detail?: boolean } = {}): Lathe {
  const H = R * 2.05;
  const body = k.lathe([x, y, z], pebble(R, H), { tone: o.tone, detail: o.detail, n: 40 });
  body.seam(H * 0.28, { tone: 'lo', detail: true });
  k.cyl(x, y, R * 0.11, z + H - R * 0.1, z + H + R * 0.42, { tone: o.tone, b: 0.05, detail: o.detail });
  k.ball([x, y, z + H + R * 0.62], R * 0.26, { tone: o.tone, detail: o.detail, crease: false });
  return body;
}

/** A stone: an ellipsoid about c, turned `turn` degrees about the vertical, with its crease a little below its middle. */
export function stone(k: Kit, c: Vec3, rx: number, ry: number, rz: number, turn: number, o: { tone?: Tone; detail?: boolean } = {}) {
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
