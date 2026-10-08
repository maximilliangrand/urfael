import { Cam, circ, facing, hull, proj, ringAt, rings, rrect, run, type Ring, type Vec2, type Vec3 } from '../hairline/core/iso';
import { cylinder, ellipse, encode, frontHalf } from './path';

/**
 * Urfael's icon kit. It is MYG's isoicons kit (myg-media-v3 src/lib/isoicons/kit.ts) on the same hairline
 * projection, vendored in ../hairline/core/iso.ts, so an icon is drawn the way the figures are: rounded solids
 * at the 2:1 camera, each a filled silhouette and one dim crease, painted back to front, with one part in the
 * accent. Everything here is arithmetic: site/icons/build.mjs runs it in Node and writes plain SVG.
 *
 * MYG's kit draws upright solids. Urfael's icons are finer and rounder, so this one also draws:
 *   - lathed solids about any axis (a pebble, a bell, a teapot, a microphone capsule), with seams and
 *     meridians that follow their surface and stop where it turns away;
 *   - slabs standing on any plane (a tilted lid, a flap, a handset), and shapes and lines on any plane;
 *   - convex hulls of world points, for solids no primitive covers.
 *
 * World units are free; an icon is fitted to its own square when it is rendered. Marks flagged `detail` are
 * drawn only from 96px, in the full variant.
 */

/**
 * The strokes and fills an icon may use. `edge`, `mid` and `lo` are the neutral hairlines, `accent` is the
 * one bright mark. `ink`, `warm` and `blush` exist for Uru alone: its face window is the one dark solid,
 * and its eyes and cheeks sit on it.
 */
export type Tone = 'edge' | 'mid' | 'lo' | 'accent' | 'ink' | 'warm' | 'blush';
export type Fill = 'ground' | 'none' | 'tone';
/** A drawn path in paint order; `box` is its extent on screen, or null for a crease inside a silhouette. */
export type Mark = { d: string; tone: Tone; fill: Fill; detail: boolean; box: [number, number, number, number] | null };

type Look = { tone?: Tone; detail?: boolean };
type ShapeLook = Look & { fill?: Fill };
type SolidLook = Look & { r?: number; b?: number; fill?: Fill };

/** A flat frame in the world: an origin, two unit directions along it, and the normal that faces the eye. */
export type Face = { o: Vec3; u: Vec3; v: Vec3; n: Vec3; at: (a: number, b: number) => Vec3 };

/** A lathed solid's surface: a point on it by angle (degrees about its axis) and height along the axis. */
export type Lathe = {
  at: (deg: number, h: number, out?: number) => Vec3;
  /** The ring round the surface at height h, the run of it the camera sees. */
  seam: (h: number, o?: Look & { out?: number; from?: number; to?: number }) => void;
  /** The line up the surface at one angle, from h0 to h1, while it faces the camera. */
  meridian: (deg: number, h0: number, h1: number, o?: Look & { out?: number }) => void;
  /**
   * A band round the surface from h0 to h1, standing `out` proud of it: the part the camera sees, closed
   * between the seen runs of its two edges. A knit band, a collar, a ring of grille.
   */
  strip: (h0: number, h1: number, o?: ShapeLook & { out?: number }) => void;
  /**
   * A shape drawn on the surface about the angle `deg` and height h, from (across, up) offsets in world units:
   * a face window, an eye, a badge. An open line instead with `open`.
   */
  patch: (deg: number, h: number, pts: readonly (readonly [number, number])[], o?: ShapeLook & { out?: number; open?: boolean }) => void;
};

/** A profile point of a lathed solid: radius, then height along its axis. */
export type Profile = readonly (readonly [number, number])[];

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const unit = (a: Vec3): Vec3 => mul(a, 1 / Math.hypot(a[0], a[1], a[2]));
const rad = (deg: number) => (deg * Math.PI) / 180;

/** The one cyclic run of indices that pass, in order; all of them when every one passes. */
function cyclic(n: number, keep: (i: number) => boolean): number[] {
  let s = -1;
  for (let i = 0; i < n; i++) if (keep(i) && !keep((i + n - 1) % n)) { s = i; break; }
  if (s < 0) return keep(0) ? Array.from({ length: n + 1 }, (_, i) => i % n) : [];
  const out: number[] = [];
  for (let k = 0; k < n && keep((s + k) % n); k++) out.push((s + k) % n);
  return out;
}

/** A radius at height h, read off a profile by straight interpolation. */
function radiusOf(profile: Profile, h: number) {
  if (h <= profile[0][1]) return profile[0][0];
  for (let i = 1; i < profile.length; i++) {
    const [r0, h0] = profile[i - 1], [r1, h1] = profile[i];
    if (h <= h1) return h1 === h0 ? r1 : r0 + ((r1 - r0) * (h - h0)) / (h1 - h0);
  }
  return profile[profile.length - 1][0];
}

/**
 * `fine` draws for the full variant. The compact variant takes fewer samples per curve and drops points
 * nearer to the line than a 28px or 56px icon can show (path.ts), which a small icon cannot see and which
 * keeps its markup short.
 */
export function kit(fine = true) {
  const C = Cam(45, 0.5, 1);
  const steps = (n: number) => (fine ? n : Math.max(10, Math.round(n * 0.5)));
  /** How far a dropped point may lie from the kept line, in world units: a tenth of a pixel or so at 192px (full) and 95px (compact). */
  const eps = fine ? 0.01 : 0.02;
  const P = proj(C), front = facing(C);
  const zf = Math.sqrt(1 - C.k * C.k);
  /** Towards the eye: a surface is seen when its normal leans this way. (1, 1, .82) for the 2:1 camera. */
  const eye: Vec3 = [Math.sin(C.az) * zf, Math.cos(C.az) * zf, C.k];
  const sees = (n: Vec3) => dot(n, eye) > 1e-6;
  const marks: Mark[] = [];

  /** Adds a mark; `box` frames the icon, and is null for a crease, which lies inside its silhouette. */
  const mark = (d: string, tone: Tone, fill: Fill, detail: boolean, box: Mark['box']) => {
    if (d) marks.push({ d, tone, fill, detail, box });
  };
  const boxOf = (points: readonly Vec2[]): Mark['box'] => {
    if (!points.length) return null;
    const box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of points) { box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y); }
    return box;
  };
  /** A mark from screen points: a closed shape or an open line. */
  const markPts = (pts: readonly Vec2[], closed: boolean, tone: Tone, fill: Fill, detail: boolean, frames = true) =>
    mark(encode(pts, closed, eps), tone, fill, detail, frames ? boxOf(pts) : null);
  const solidFrom = (ring: Ring, inner: Ring, z0: number, z1: number, o: SolidLook) => {
    markPts(hull(ringAt(P, ring, z1).concat(ringAt(P, ring, z0))), true, o.tone ?? 'edge', o.fill ?? 'ground', !!o.detail);
    markPts(ringAt(P, run(inner, front), z1), false, 'lo', 'none', !!o.detail, false);
  };
  /** The silhouette of a convex solid: the hull of its points on screen, filled with the ground. */
  const hullOf = (pts: readonly Vec3[], o: ShapeLook = {}) =>
    markPts(hull(pts.map(([x, y, z]) => P(x, y, z))), true, o.tone ?? 'edge', o.fill ?? 'ground', !!o.detail);
  const line = (points: readonly Vec3[], o: Look = {}) =>
    markPts(points.map(([x, y, z]) => P(x, y, z)), false, o.tone ?? 'mid', 'none', !!o.detail);
  const loop = (points: readonly Vec3[], o: ShapeLook = {}) =>
    markPts(points.map(([x, y, z]) => P(x, y, z)), true, o.tone ?? 'mid', o.fill ?? 'none', !!o.detail);
  /** A circle lying flat at (x, y, z), which this camera shows as an upright ellipse: written as arcs. */
  const flatCircle = (x: number, y: number, z: number, R: number, tone: Tone, fill: Fill, detail: boolean) => {
    const [cx, cy] = P(x, y, z), rx = R * C.S, ry = rx * C.k;
    mark(ellipse(cx, cy, rx, ry), tone, fill, detail, [cx - rx, cy - ry, cx + rx, cy + ry]);
  };
  /** The run of a closed ring of world points whose normals face the camera, as one open line (or a loop). */
  const seam = (pts: readonly Vec3[], normals: readonly Vec3[], o: Look = {}) => {
    const idx = cyclic(pts.length, (i) => sees(normals[i]));
    if (idx.length > 1) line(idx.map((i) => pts[i]), { tone: o.tone ?? 'lo', detail: o.detail });
  };
  const face = (o: Vec3, u: Vec3, v: Vec3): Face => {
    let n = unit(cross(u, v));
    if (dot(n, eye) < 0) n = mul(n, -1);
    return { o, u, v, n, at: (a, b) => add(o, add(mul(u, a), mul(v, b))) };
  };
  /** The point and its outward normal on a lathed surface, in the frame of its axis. */
  const latheFrame = (axis: Vec3) => {
    const w = unit(axis);
    const e1 = Math.abs(w[2]) > 0.999 ? ([1, 0, 0] as Vec3) : unit(cross(w, [0, 0, 1]));
    const e2 = cross(w, e1);
    return { w, dir: (deg: number): Vec3 => add(mul(e1, Math.cos(rad(deg))), mul(e2, Math.sin(rad(deg)))) };
  };

  /**
   * A solid turned on a lathe about an axis through `base`: the profile is [radius, height] pairs from the
   * foot up, with heights along the axis. A convex profile only, as its silhouette is the hull of its rings.
   * Returns its surface, for seams, meridians and shapes drawn on it.
   */
  const lathe = (base: Vec3, profile: Profile, o: ShapeLook & { axis?: Vec3; n?: number; crease?: number } = {}): Lathe => {
    const { w, dir } = latheFrame(o.axis ?? [0, 0, 1]);
    const n = steps(o.n ?? 48);
    const radius = (h: number) => radiusOf(profile, h);
    const slope = (h: number) => (radius(h + 0.02) - radius(h - 0.02)) / 0.04;
    const at = (deg: number, h: number, out = 0) => add(add(base, mul(w, h)), mul(dir(deg), radius(h) + out));
    const normal = (deg: number, h: number) => add(dir(deg), mul(w, -slope(h)));
    const pts: Vec3[] = [];
    for (const [r, h] of profile) for (let i = 0; i < n; i++) pts.push(add(add(base, mul(w, h)), mul(dir((360 * i) / n), r)));
    hullOf(pts, o);
    const surface: Lathe = {
      at,
      seam(h, s = {}) {
        const from = s.from ?? 0, to = s.to ?? 360, m = steps(64);
        const degs = Array.from({ length: m }, (_, i) => from + ((to - from) * i) / (to - from >= 360 ? m : m - 1));
        if (to - from >= 360) seam(degs.map((d) => at(d, h, s.out ?? 0)), degs.map((d) => normal(d, h)), s);
        else {
          const keep = degs.filter((d) => sees(normal(d, h)));
          if (keep.length > 1) line(keep.map((d) => at(d, h, s.out ?? 0)), { tone: s.tone ?? 'lo', detail: s.detail });
        }
      },
      meridian(deg, h0, h1, s = {}) {
        const pts: Vec3[] = [], n = Math.max(3, Math.min(24, Math.ceil(Math.abs(h1 - h0) / 0.25)));
        for (let i = 0; i <= n; i++) {
          const h = h0 + ((h1 - h0) * i) / n;
          if (sees(normal(deg, h))) pts.push(at(deg, h, s.out ?? 0));
          else if (pts.length) break;
        }
        if (pts.length > 1) line(pts, { tone: s.tone ?? 'lo', detail: s.detail });
      },
      strip(h0, h1, s = {}) {
        const m = steps(72), deg = (i: number) => (360 * i) / m;
        // a band round the body is a short cylinder: both its edges end at its own limbs, so its sides stand straight
        const edge = (h: number) => cyclic(m, (i) => sees(dir(deg(i)))).map((i) => at(deg(i), h, s.out ?? 0));
        const top = edge(h1), foot = edge(h0);
        if (top.length > 1 && foot.length > 1) loop(top.concat(foot.reverse()), { tone: s.tone ?? 'mid', fill: s.fill ?? 'ground', detail: s.detail });
      },
      patch(deg, h, pts, s = {}) {
        const world = pts.map(([across, up]) => at(deg + (across / Math.max(0.01, radius(h + up) + (s.out ?? 0))) * (180 / Math.PI), h + up, s.out ?? 0));
        if (s.open) line(world, { tone: s.tone ?? 'mid', detail: s.detail });
        else loop(world, s);
      },
    };
    if (o.crease !== undefined) surface.seam(o.crease, { detail: o.detail });
    return surface;
  };

  return {
    P,
    marks,
    /** A rounded block standing from z0 to z1 on the footprint x0..x1, y0..y1. */
    box(x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, o: SolidLook = {}) {
      const [ring, inner] = rings(x0, y0, x1, y1, o.r ?? 1.2, o.b ?? 0.6);
      solidFrom(ring, inner, z0, z1, o);
    },
    /** A block whose top is smaller than its foot: a wedge, a roof, a sloping body. */
    taper(foot: [number, number, number, number], top: [number, number, number, number], z0: number, z1: number, o: SolidLook = {}) {
      const r = o.r ?? 1.2, b = o.b ?? 0.6;
      const footRing = rrect(...foot, r), topRing = rrect(...top, r);
      const inner = rrect(top[0] + b, top[1] + b, top[2] - b, top[3] - b, Math.max(0.3, r - b));
      markPts(hull(ringAt(P, footRing, z0).concat(ringAt(P, topRing, z1))), true, o.tone ?? 'edge', o.fill ?? 'ground', !!o.detail);
      markPts(ringAt(P, run(inner, front), z1), false, 'lo', 'none', !!o.detail, false);
    },
    /** A cylinder standing from z0 to z1: its rims are flat circles, so its outline and crease are exact arcs. */
    cyl(cx: number, cy: number, R: number, z0: number, z1: number, o: SolidLook = {}) {
      const b = o.b ?? Math.min(0.6, R * 0.25), ri = Math.max(0.2 * Math.min(1, R), R - b);
      const [x, top] = P(cx, cy, z1), foot = P(cx, cy, z0)[1], rx = R * C.S, ry = rx * C.k;
      mark(cylinder(x, top, foot, rx, ry), o.tone ?? 'edge', o.fill ?? 'ground', !!o.detail, [x - rx, top - ry, x + rx, foot + ry]);
      mark(frontHalf(x, top, ri * C.S, ri * C.S * C.k), 'lo', 'none', !!o.detail, null);
    },
    /** A flat rounded rectangle lying on the plane z: a panel, a pad, a seam. */
    plate(x0: number, y0: number, x1: number, y1: number, z: number, o: ShapeLook & { r?: number } = {}) {
      markPts(ringAt(P, rrect(x0, y0, x1, y1, o.r ?? 0.8), z), true, o.tone ?? 'mid', o.fill ?? 'none', !!o.detail);
    },
    /** A flat circle lying on the plane z. */
    disc(cx: number, cy: number, R: number, z: number, o: ShapeLook = {}) {
      flatCircle(cx, cy, z, R, o.tone ?? 'mid', o.fill ?? 'none', !!o.detail);
    },
    /** A closed shape lying flat on the plane z, from (x, y) points. */
    flat(xy: readonly (readonly [number, number])[], z: number, o: ShapeLook = {}) {
      loop(xy.map(([x, y]): Vec3 => [x, y, z]), o);
    },
    /**
     * A rounded rectangle standing upright: on the plane y = at (it looks towards the viewer's left, u runs
     * along x) or x = at (it looks right, u runs along y).
     */
    pane(plane: 'x' | 'y', at: number, u0: number, z0: number, u1: number, z1: number, o: ShapeLook & { r?: number } = {}) {
      loop(rrect(u0, z0, u1, z1, o.r ?? 0.6).map((q): Vec3 => (plane === 'y' ? [q.u, at, q.v] : [at, q.u, q.v])), o);
    },
    /** A closed shape on an upright plane, from (u, z) points, as with pane. */
    shape(plane: 'x' | 'y', at: number, uz: readonly (readonly [number, number])[], o: ShapeLook = {}) {
      loop(uz.map(([u, z]): Vec3 => (plane === 'y' ? [u, at, z] : [at, u, z])), o);
    },
    line,
    loop,
    hullOf,
    seam,
    /** A small dot lying flat on the plane z: a stud, a node, a key. */
    dot(x: number, y: number, z: number, o: Look & { r?: number } = {}) {
      flatCircle(x, y, z, o.r ?? 0.7, o.tone ?? 'edge', 'tone', !!o.detail);
    },
    /** A plane through o spanned by the unit directions u and v; its normal is turned to face the eye. */
    face,
    lathe,
    /** Draws on a face in its own (a, b) units. */
    on(F: Face) {
      const map = (ab: readonly (readonly [number, number])[]) => ab.map(([a, b]) => F.at(a, b));
      return {
        rect: (a0: number, b0: number, a1: number, b1: number, o: ShapeLook & { r?: number } = {}) =>
          loop(rrect(a0, b0, a1, b1, o.r ?? 0.4).map((q) => F.at(q.u, q.v)), o),
        circle: (ca: number, cb: number, R: number, o: ShapeLook = {}) =>
          loop(circ(R, steps(36)).map((q) => F.at(ca + q.u, cb + q.v)), o),
        shape: (ab: readonly (readonly [number, number])[], o: ShapeLook = {}) => loop(map(ab), o),
        line: (ab: readonly (readonly [number, number])[], o: Look = {}) => line(map(ab), o),
        dot: (a: number, b: number, o: Look & { r?: number } = {}) =>
          markPts(circ(o.r ?? 0.5, steps(16)).map((q) => P(...F.at(a + q.u, b + q.v))), true, o.tone ?? 'edge', 'tone', !!o.detail),
      };
    },
    /**
     * A solid standing out of a face: the outline, a convex ring in the face's (a, b) units, is its front, and
     * it runs `depth` back behind the face. Its silhouette is the hull of front and back; its crease is the
     * run of `inset` along the sides the camera sees, as with box.
     */
    slab(F: Face, outline: Ring, inset: Ring | null, depth: number, o: ShapeLook = {}) {
      const frontPts = outline.map((q) => F.at(q.u, q.v));
      hullOf(frontPts.concat(frontPts.map((p) => add(p, mul(F.n, -depth)))), o);
      if (!inset) return;
      const ring = inset.map((q) => F.at(q.u, q.v)), normals = inset.map((q) => add(mul(F.u, q.nu), mul(F.v, q.nv)));
      seam(ring, normals, { detail: o.detail });
    },
    /**
     * A ball about c: a circle from every side, as arcs; its crease the front of a ring inside its equator,
     * which lies flat, so it is the near half of an ellipse.
     */
    ball(c: Vec3, R: number, o: ShapeLook & { crease?: boolean } = {}) {
      const [x, y] = P(...c), r = R * C.S;
      mark(ellipse(x, y, r, r), o.tone ?? 'edge', o.fill ?? 'ground', !!o.detail, [x - r, y - r, x + r, y + r]);
      if (o.crease !== false) mark(frontHalf(x, y, 0.8 * r, 0.8 * r * C.k), 'lo', 'none', !!o.detail, null);
    },
  };
}

export type Kit = ReturnType<typeof kit>;
export type IconDraw = (k: Kit) => void;

/** The square that holds the marks, padded, as an SVG viewBox. */
export function frame(marks: readonly Mark[], pad = 0.06): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const m of marks) if (m.box) { x0 = Math.min(x0, m.box[0]); y0 = Math.min(y0, m.box[1]); x1 = Math.max(x1, m.box[2]); y1 = Math.max(y1, m.box[3]); }
  const side = Math.max(x1 - x0, y1 - y0) * (1 + pad * 2);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const r = (n: number) => Math.round(n * 100) / 100;
  return [r(cx - side / 2), r(cy - side / 2), r(side), r(side)];
}

/**
 * Draws an icon for one variant: the full one (fine, every mark) or the compact one (coarse, no detail).
 * Each variant is framed by its own marks, so the compact one fills its square at 28px.
 */
export function render(draw: IconDraw, full: boolean) {
  const k = kit(full);
  draw(k);
  const marks = full ? k.marks : k.marks.filter((m) => !m.detail);
  return { marks, box: frame(marks) };
}

export type { Vec2, Vec3 };
