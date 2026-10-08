import {
  Cam, clamp, facing, fillet, fit, hull, lerp, open, poly, prism, proj, quad, r2, rad, ringAt, rings, rrect, run, seg,
  type Camera, type Projector, type Sample, type Vec2, type Vec3,
} from "../hairline/core/iso";
import { reducedMotion, tdone, tset, tval, tween, type Tween } from "../hairline/core/motion";
import { disposer, mk, pointer, put, register, solid, type FigureMount } from "../hairline/core/stage";
import { body, capsule, cross, disc, hash, hoop, LOOKS, mixLook, norm, POSE, profile, ringAt3, runs, squircle, toward, uru, URU } from "./uru-kit";

/**
 * Uru study: an illustration of Uru in soft layers above a drawing board, and
 * not a design. It shows the idea the goals beside it describe, a soft
 * presence, light and rounded, and nothing about what is inside: no parts, no
 * electronics, no measurements. Up the centre line, from the sheet: the
 * gliding base ring, a soft bumper stitched round its widest line; a light
 * frame, a cage of six ribs on three hoops under a spoked crown, a bezel for
 * the face between its two front ribs and a pivot for each arm; a soft inner
 * shell, quilted, with its face opening and two mitten sockets; and the
 * cover, Uru itself, drawn by the kit (uru-kit.ts) as in every Uru figure,
 * its knit band and stitched patch, its face, mittens and lantern bead. The
 * frame and the shell follow Uru's own profile, each a little inside the one
 * over it.
 *
 * The sheet is drawn as a sketching sheet is: a border, a faint grid, three
 * fabric swatches pinned along one edge (a knit, a felt and a quilted one,
 * each cut with pinking shears), drafting dots at two corners, a ruler, a set
 * square and a pencil. The construction is dashed: the centre line in every
 * gap, two guides standing at the layers' common extent with a tick at the
 * foot of each layer, and the footprint and centre lines on the sheet.
 *
 * At rest the base ring stands a little apart, and the frame, the shell and
 * the cover nest, each drawn half out of the one over it; the cover is bright.
 * The pointer picks a layer: everything above it is drawn clear of it and
 * lifts by the slider (world units), together, staggered out from the pick;
 * the layer takes the bright stroke. Picking the cover makes Uru wave its
 * near mitten while its eyes ease into happy arcs. Uru blinks now and then;
 * under reduced motion it holds still, eyes open. The read-out names the
 * layer: base, frame, shell, cover.
 *
 * The hit test is the target pose (rule 01): each layer's silhouette at its
 * target height, from the top down, as they are painted; then the gap the
 * picked layer opened, which stays its own; then up the centre line, the
 * other gaps split between their neighbours.
 */

// The cover is Uru itself, from the kit, at scale US: its widest radius, its body's height, and the way it faces (the camera looks along 45°).
// The base ring is drawn for a cover of radius 22, and scaled by K should the cover change size.
const US = 2.5, R = URU.RMAX * US, H = (URU.ZT - URU.ZB) * US, THETA = rad(28), K = R / 22;
/** Heights on the cover, from its foot: the face window's middle, its half-size, the shoulders. */
const FV = (URU.face.v - URU.ZB) * US, FHU = URU.face.hu * US, FHV = URU.face.hv * US, SHZ = (10.6 - URU.ZB) * US;
const NAMES = ["base", "frame", "shell", "cover"];
/** The cover, the top layer: Uru itself. */
const COVER = NAMES.length - 1;
/** Each layer's height over its foot. */
const HT = [3.6 * K, profile(US, 2.6).H, profile(US, 1.3).H, H];
/**
 * The rest gap over the base ring; the share of the lift each gap opens by when the layer under it is picked (a
 * little less over the base, so the frame lifted off it still shows where it stood); the stagger; the lift's range.
 */
const GAP = 10, OPEN = [0.9, 1, 1], STEP = 45, LMIN = 6, LMAX = 14;
/**
 * How far each layer's foot stands over the one below it at rest. The base ring stands apart; the frame, the shell
 * and the cover nest, each drawn half out of the next, so the cover is never far from what it covers. A pick draws
 * everything above the picked layer clear of it.
 */
const REST = [HT[0] + GAP, 0.5 * HT[1], 0.6 * HT[2]];
/** The ambient drift: how far each layer up the stack rises and falls, per layer, and the swell's period in ms. */
const DRIFT = 0.11, SWELL = 5600;
/** The guides' radius about the centre line; the drafting board's half-size and thickness, and the sheet's. */
const RG = 26.5 * K, BW = 46, BT = 2.6, SH = 40;

type Ctx = { P: Projector; C: Camera; front: (q: Sample) => boolean; S: number };
/** What a layer hands back: what goes bright when it is picked, and its screen points for the hit test. */
type Built = { hi: Element[]; pts: Vec2[] };
type Layer = { g: SVGGElement; hi: Element[]; shape: Vec2[]; tw: Tween; to: number; off: number; drawn: number };

const pather = (g: Element) => (cls: string, d = "") => mk("path", { class: cls, d }, g);
const ln = (P: Projector, a: Vec3, b: Vec3) => seg(P(a[0], a[1], a[2]), P(b[0], b[1], b[2]));
/** A rounded rectangle on the plane x = X (its y and z), or y = Y (its x and z). */
const onX = (P: Projector, X: number, y0: number, z0: number, y1: number, z1: number, r = 0.5) => poly(rrect(y0, z0, y1, z1, r, 3).map((q) => P(X, q.u, q.v)));
const onY = (P: Projector, Y: number, x0: number, z0: number, x1: number, z1: number, r = 0.5) => poly(rrect(x0, z0, x1, z1, r, 3).map((q) => P(q.u, Y, q.v)));
/** A ring's run that faces the camera, at height z. */
const near = (x: Ctx, ring: readonly Sample[], z: number) => open(ringAt(x.P, run(ring, x.front), z));

/** The gliding base: a flared ring, a soft bumper stitched round its widest line, and its opening. */
function baseRing(x: Ctx, g: SVGGElement): Built {
  const { P, front } = x, path = pather(g);
  const prof: [number, number][] = [[0, 22.6], [0.7, 23.5], [1.8, 23.9], [2.9, 23.2], [3.6, 21.8]];
  const pts = prof.flatMap(([z, r]) => ringAt(P, disc(0, 0, r, 144), z));
  const sil = path("sil", poly(hull(pts)));
  path("nf lo", near(x, disc(0, 0, 23.6, 72), 1.2) + near(x, disc(0, 0, 21.8, 72), 3.6));
  path("nf dash", near(x, disc(0, 0, 23.95, 96), 1.85));
  path("nf", poly(ringAt(P, disc(0, 0, 15.6, 72), 3.6)));
  path("nf lo", open(ringAt(P, run(disc(0, 0, 15.6, 72), (q) => !front(q)), 1.1)) + poly(ringAt(P, disc(0, 0, 14.6, 72), 3.6)));
  return { hi: [sil], pts };
}

/** A round boss standing out of a surface: centre M, axis dir, radius rr, length len; its outline and, when it faces the camera, its end. */
function boss(x: Ctx, M: Vec3, dir: Vec3, rr: number, len: number): [string, string] {
  const v = toward(x.C), e1 = norm(cross(dir, [0, 0, 1])), e2 = cross(dir, e1), pts: Vec2[] = [], end: Vec2[] = [];
  for (const t of [0, len]) for (let k = 0; k < 20; k++) {
    const a = (k * Math.PI) / 10, q: Vec3 = [M[0] + dir[0] * t + rr * (e1[0] * Math.cos(a) + e2[0] * Math.sin(a)), M[1] + dir[1] * t + rr * (e1[1] * Math.cos(a) + e2[1] * Math.sin(a)), M[2] + dir[2] * t + rr * (e1[2] * Math.cos(a) + e2[2] * Math.sin(a))];
    const p = x.P(q[0], q[1], q[2]);
    pts.push(p); if (t) end.push(p);
  }
  return [poly(hull(pts)), dir[0] * v[0] + dir[1] * v[1] + dir[2] * v[2] > 0 ? poly(end) : ""];
}

/**
 * The light frame: a cage seen through. Its far ribs and the far halves of its hoops are drawn first, lighter; then
 * the near halves of the hoops and the near ribs over them, then the face's bezel and the near pivot, and the crown.
 */
function frame(x: Ctx, g: SVGGElement): Built {
  const { P, C, front } = x, path = pather(g), v = toward(C);
  const pf = profile(US, 2.6), B = body(P, C, pf), cam = Math.atan2(v[1], v[0]);
  const depth = (p: number) => Math.cos(p - cam);
  const zt = pf.H - 2.2, rt = pf.r(zt);
  const ribs = [30, 90, 150, 210, 270, 330].map((d) => THETA + rad(d));
  const rib = (phi: number) => {
    const a: Vec2[] = [], b: Vec2[] = [];
    for (let i = 0; i <= 22; i++) {
      const z = lerp(0.3, zt + 0.3, i / 22), dp = 0.85 / Math.max(pf.r(z), 4);
      a.push(B.at(phi - dp, z, 0.35)); b.push(B.at(phi + dp, z, 0.35));
    }
    return poly(a.concat(b.reverse()));
  };
  /** A hoop's half, front or back: a strip from z0 to z1 round the body. */
  const strip = (z0: number, z1: number, far: boolean) => {
    const a0 = cam + (far ? Math.PI / 2 : -Math.PI / 2), top: Vec2[] = [], bot: Vec2[] = [];
    for (let k = 0; k <= 36; k++) { const p = a0 + (Math.PI * k) / 36; top.push(B.at(p, z1)); bot.push(B.at(p, z0)); }
    return poly(top.concat(bot.reverse()));
  };
  const hoops: [number, number][] = [[0, 1.7], [pf.zc - 0.75, pf.zc + 0.75], [0.66 * pf.H - 0.6, 0.66 * pf.H + 0.6]];
  const pivots = [THETA + rad(93), THETA - rad(93)].sort((a, b) => depth(a) - depth(b));
  const pivot = (phi: number): [string, string] => boss(x, B.w(phi, SHZ, -0.2), [Math.cos(phi), Math.sin(phi), 0], 1.5, 2.8);
  const hi: Element[] = [];
  // the far side: ribs, hoops, the far pivot, the centre line inside
  const [fs, fe] = pivot(pivots[0]);
  hi.push(path("", fs)); path("nf lo", fe);
  for (const p of ribs.filter((p) => depth(p) < 0)) hi.push(path("", rib(p)));
  for (const [z0, z1] of hoops) hi.push(path("", strip(z0, z1, true)));
  path("nf dash", ln(P, [0, 0, 0], [0, 0, zt]));
  // the near side
  for (const [z0, z1] of hoops) hi.push(path("sil", strip(z0, z1, false)));
  for (const p of ribs.filter((p) => depth(p) >= 0)) hi.push(path("sil", rib(p)));
  // the bezel the face window sits in, between the two front ribs, open in the middle
  const F = B.patch(THETA, 0.6), bc = FV, wa = FHU - 0.4, hb = FHV - 0.2;
  const bez = path("", poly(squircle(0, bc, wa + 0.9, hb + 0.9, 4.5, 120).map(([a, b]) => F(a, b))) + poly(squircle(0, bc, wa, hb, 4.5, 120).map(([a, b]) => F(a, b))));
  bez.setAttribute("fill-rule", "evenodd");
  hi.push(bez);
  const [ns, ne] = pivot(pivots[1]);
  hi.push(path("sil", ns)); path("nf lo", ne);
  // the crown: an open ring on the ribs' tops, three spokes and the hub the stalk will stand in
  const zc = zt + 0.3, ro = rt + 0.5, ri = rt - 3.2;
  const crown = path("sil", poly(hull(ringAt(P, disc(0, 0, ro, 48), zc - 0.9).concat(ringAt(P, disc(0, 0, ro, 48), zc + 0.6)))) + poly(ringAt(P, disc(0, 0, ri, 48), zc + 0.6)));
  crown.setAttribute("fill-rule", "evenodd");
  hi.push(crown);
  path("nf lo", poly(ringAt(P, disc(0, 0, ro - 0.8, 48), zc + 0.6)));
  for (const d of [THETA + rad(60), THETA + rad(180), THETA + rad(300)]) {
    const c = Math.cos(d), s = Math.sin(d), w = 0.8;
    path("", poly([[2, -w], [ri + 0.4, -w], [ri + 0.4, w], [2, w]].map(([u, t]) => P(u * c - t * s, u * s + t * c, zc + 0.3))));
  }
  const hub = solid(g);
  put(hub, prism(P, front, disc(0, 0, 2.6, 24), disc(0, 0, 1.9, 24), zc - 0.6, zc + 2.2));
  path("nf lo", poly(ringAt(P, disc(0, 0, 1.1, 16), zc + 2.2)));
  hi.push(hub.sil);
  return { hi, pts: B.outline(18, () => 0.4).concat(ringAt(P, disc(0, 0, 2.6, 12), zc + 2.2)) };
}

/** The soft inner shell: quilted, stitched in rings and down its panels, with the face opening and the two mitten sockets. */
function shell(x: Ctx, g: SVGGElement): Built {
  const { P, C } = x, path = pather(g);
  const pf = profile(US, 1.3), B = body(P, C, pf), pts = B.outline();
  const sil = path("sil", poly(pts));
  const F = B.patch(THETA, 0.08), bc = FV, wa = FHU + 0.2, hb = FHV + 0.2;
  // the quilting: three stitched rings and a stitched line down each panel, broken round the face opening
  const rows = [0.18, 0.4, 0.62].map((t) => t * pf.H);
  path("nf dash", rows.map((z) => B.lat(z, 0.02)).join(""));
  const face = (phi: number, z: number) => Math.abs(Math.atan2(Math.sin(phi - THETA), Math.cos(phi - THETA))) * pf.r(z) < wa + 1.4 && Math.abs(z - bc) < hb + 1.4;
  for (let k = 0; k < 8; k++) {
    const phi = THETA + rad(22.5 + 45 * k);
    const zz = Array.from({ length: 25 }, (_, i) => lerp(1.2, pf.H - 2.4, i / 24)).filter((z) => !face(phi, z));
    path("nf dash", runs(zz.map((z) => B.at(phi, z, 0.02)), zz.map((z) => B.sees(phi, z))));
  }
  path("nf", poly(squircle(0, bc, wa + 0.9, hb + 0.9).map(([a, b]) => F(a, b))));
  path("nf lo", poly(squircle(0, bc, wa, hb).map(([a, b]) => F(a, b))));
  for (const p of [THETA + rad(93), THETA - rad(93)]) {
    const Fp = B.patch(p, 0.06), seen = B.patchSees(p), zb = SHZ;
    for (const rr of [2.5, 1.5]) {
      const ring = squircle(0, zb, rr, rr, 2, 28);
      path(rr > 2 ? "nf" : "nf lo", runs(ring.map(([a, b]) => Fp(a, b)), ring.map(([a, b]) => seen(a, b)), true));
    }
  }
  return { hi: [sil], pts };
}
/** The drawing board and its sheet: border, grid, three fabric swatches, drafting dots, a ruler, a set square and a pencil, and the footprint and centre lines. */
function board(x: Ctx, g: SVGGElement) {
  const { P, C, front } = x, path = pather(g), on = (a: number, b: number) => P(a, b, 0);
  put(solid(g), prism(P, front, ...rings(-BW, -BW, BW, BW, 3.2, 1.2), -BT, 0));
  path("", quad(on, -SH, -SH, SH, SH, 0.6));
  path("nf lo", quad(on, -SH + 3, -SH + 3, SH - 3, SH - 3, 0)
    + [-30, -20, -10, 0, 10, 20, 30].map((t) => seg(on(t, -SH + 3), on(t, SH - 3)) + seg(on(-SH + 3, t), on(SH - 3, t))).join(""));
  // the footprint and the centre lines, dashed
  path("nf dash", poly(ringAt(P, disc(0, 0, RG, 72), 0)) + seg(on(-38, 0), on(38, 0)) + seg(on(0, -38), on(0, 38)));
  // three fabric swatches pinned along the near-right edge, each cut with pinking shears along its two near sides:
  // a knit in rows of stitches, a felt flecked with its fibres, and a quilt in diamonds with a tuft at each crossing
  const swatch = (a0: number, b0: number, a1: number, b1: number, z: number) => {
    const pts: Vec2[] = [[a0, b0], [a1, b0]];
    const zig = (from: Vec2, to: Vec2, n: number) => { for (let k = 1; k <= n; k++) { const t = k / n, m = (k - 0.5) / n, nx = -(to[1] - from[1]), ny = to[0] - from[0], l = Math.hypot(nx, ny); pts.push([lerp(from[0], to[0], m) + (nx / l) * 0.45, lerp(from[1], to[1], m) + (ny / l) * 0.45], [lerp(from[0], to[0], t), lerp(from[1], to[1], t)]); } };
    zig([a1, b0], [a1, b1], 14);
    zig([a1, b1], [a0, b1], 12);
    return poly(pts.map(([a, b]) => P(a, b, z)));
  };
  const sw: [number, number, number, number][] = [[27.5, -3, 36.5, 7.5], [27.5, 9.5, 36.5, 20], [27.5, 22, 36.5, 32.5]];
  sw.forEach(([a0, b0, a1, b1], k) => {
    const z = 0.04 + k * 0.01;
    path("", swatch(a0, b0, a1, b1, z));
    const u = (t: number) => lerp(a0 + 1, a1 - 1, t), v = (t: number) => lerp(b0 + 1, b1 - 1, t);
    if (k === 0) path("nf lo", Array.from({ length: 6 }, (_, r) => Array.from({ length: 8 }, (_, c) => open([P(u(r / 5) - 0.5, v((c + 0.1) / 8), z), P(u(r / 5), v((c + 0.5) / 8), z), P(u(r / 5) + 0.5, v((c + 0.1) / 8), z)])).join("")).join(""));
    if (k === 1) path("nf lo", Array.from({ length: 22 }, (_, i) => poly(ringAt3(P, lerp(a0 + 1.2, a1 - 1.2, hash(i * 3 + 1)), lerp(b0 + 1.2, b1 - 1.2, hash(i * 7 + 2)), z, 0.16 + 0.1 * hash(i), 8))).join(""));
    if (k === 2) {
      // the quilt's two families of diagonals, a − b = c and a + b = c, cut to the swatch less a margin; a tuft where they cross
      const A0 = a0 + 0.8, A1 = a1 - 0.8, B0 = b0 + 0.8, B1 = b1 - 0.8, gap = 3.2, lines: string[] = [], tufts: string[] = [];
      const cut = (c: number, sgn: number) => {
        // b = sgn·(a − c): its ends where it meets the margin's edges
        const ends = [A0, A1].map((a): Vec2 => [a, sgn * (a - c)]).concat([B0, B1].map((b): Vec2 => [c + sgn * b, b]))
          .filter(([a, b]) => a >= A0 - 1e-6 && a <= A1 + 1e-6 && b >= B0 - 1e-6 && b <= B1 + 1e-6);
        if (ends.length >= 2) lines.push(seg(P(ends[0][0], ends[0][1], z), P(ends[ends.length - 1][0], ends[ends.length - 1][1], z)));
      };
      const d1: number[] = [], d2: number[] = [];
      for (let c = A0 - B1 + gap / 2; c < A1 - B0; c += gap) { cut(c, 1); d1.push(c); }
      for (let c = A0 + B0 + gap / 2; c < A1 + B1; c += gap) { cut(c, -1); d2.push(c); }
      for (const c1 of d1) for (const c2 of d2) {
        const a = (c1 + c2) / 2, b = (c2 - c1) / 2;
        if (a > A0 + 0.4 && a < A1 - 0.4 && b > B0 + 0.4 && b < B1 - 0.4) tufts.push(poly(ringAt3(P, a, b, z, 0.26, 10)));
      }
      path("nf lo", lines.join(""));
      path("nf", tufts.join(""));
    }
    path("", poly(ringAt3(P, a0 + 1.4, b0 + 1.4, z + 0.05, 0.75, 16)));
  });
  // drafting dots holding the sheet down at its left and right corners
  for (const [cx, cy] of [[-SH + 1.6, SH - 1.6], [SH - 1.6, -SH + 1.6]]) path("", poly(ringAt3(P, cx, cy, 0.05, 2.6, 28)));
  // a scale rule along the back-right edge, ticked every two units and longer every ten
  const ru = rings(-8, -36.6, 32, -32.4, 0.8, 0.4), tk = Array.from({ length: 20 }, (_, i) => -6 + i * 2);
  put(solid(g), prism(P, front, ...ru, 0, 0.7));
  path("nf lo", tk.map((t) => seg(P(t, -32.4, 0.7), P(t, (t + 6) % 10 === 0 ? -34.4 : -33.4, 0.7))).join(""));
  // a set square, its hole cut through it
  const V: Vec2 = [-33.5, 35.5], L = 22.5, d = 4.3, Li = L - d * (2 + Math.SQRT2), Vi: Vec2 = [V[0] + d, V[1] - d];
  const tri = (o: Vec2, l: number) => fillet([o, [o[0] + l, o[1]], [o[0], o[1] - l]], [1.2, 0.8, 0.8], 3);
  const outer = tri(V, L), inner = tri(Vi, Li), t = 0.8;
  const sq = path("", poly(hull(outer.map(([a, b]) => P(a, b, 0)).concat(outer.map(([a, b]) => P(a, b, t))))) + poly(inner.map(([a, b]) => P(a, b, t))));
  sq.setAttribute("fill-rule", "evenodd");
  path("nf lo", poly(outer.map(([a, b]) => P(a, b, t))) + open(inner.slice(4, 10).map(([a, b]) => P(a, b, 0))));
  // a pencil: its hexagonal body, the sharpened end, the ferrule and the eraser
  const A: Vec3 = [2, 34.5, 1], Bp: Vec3 = [24.5, 24.5, 1], dir = norm([Bp[0] - A[0], Bp[1] - A[1], 0]), at = (t: number): Vec3 => [A[0] + dir[0] * t, A[1] + dir[1] * t, 1];
  const len = Math.hypot(Bp[0] - A[0], Bp[1] - A[1]), S = C.S;
  path("", poly(hull(capsule(P, S, at(-3.2), at(-0.6), 0.85, 0.85, 3))));
  path("", poly(hull(capsule(P, S, at(-0.6), at(2.4), 1.06, 1.06, 3))));
  path("nf lo", hoop(P, C, at(0.4), dir, 1.12, 24) + hoop(P, C, at(1.4), dir, 1.12, 24));
  path("", poly(hull(capsule(P, S, at(2.4), at(len - 4), 1, 1, 3).concat(capsule(P, S, at(len - 0.3), at(len - 0.3), 0.12, 0.12, 1)))));
  path("nf lo", ln(P, at(2.6), at(len - 4)) + hoop(P, C, at(len - 4), dir, 1.0, 24));
  path("", poly(hull(capsule(P, S, at(len - 1.6), at(len - 1.6), 0.42, 0.42, 1).concat(capsule(P, S, at(len - 0.3), at(len - 0.3), 0.12, 0.12, 1)))));
}

export const mount: FigureMount = ({ stage, svg, read }, value) => {
  const bag = disposer();
  let lift = clamp(value, LMIN, LMAX), act = -1;
  /** Each layer's foot when layer a is picked (-1 for rest): every gap at rest, the one above it opened by its share of the lift. */
  const pose = (a: number, l = lift) => {
    const o = [0];
    for (let i = 0; i < COVER; i++) o.push(o[i] + (i === a ? Math.max(REST[i], i > 0 ? 0.76 * HT[i] : HT[i] + 3) + OPEN[i] * l : REST[i]));
    return o;
  };
  // Scaled and fitted to the board and to the cover at its highest, the shell picked at the largest lift, so nothing leaves the frame.
  const coverTop = Math.max(...NAMES.map((_, a) => pose(a - 1, LMAX)[COVER])) + (URU.top - URU.ZB) * US + 7;
  const ext: Vec3[] = [[-BW, -BW, 0], [BW, BW, -BT], [BW, -BW, -BT], [-BW, BW, -BT], [0, 0, coverTop]];
  const C = Cam(45, 0.5, 1);
  {
    const P1 = proj(C), q = ext.map((p) => P1(p[0], p[1], p[2])), xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
    C.S = Math.min(384 / (Math.max(...xs) - Math.min(...xs)), 300 / (Math.max(...ys) - Math.min(...ys)));
  }
  fit(C, ext, 200, 160);
  const P = proj(C), front = facing(C), x: Ctx = { P, C, front, S: C.S }, rise = P(0, 0, 1)[1] - P(0, 0, 0)[1];
  // the base ring, drawn at K: the same projector on a scaled world
  const xk: Ctx = { P: (a, b, c) => P(a * K, b * K, c * K), C, front, S: C.S * K };
  const g = mk("g", {}, svg);
  board(x, mk("g", {}, g));
  // the guides, behind every layer: two dashed uprights at the layers' common extent, a tick at each layer's foot
  const guides = mk("path", { class: "nf dash" }, g), ticks = mk("path", { class: "nf lo" }, g);
  const ex: Vec2 = [Math.cos(C.az) * RG, -Math.sin(C.az) * RG];

  const builders = [baseRing, frame, shell];
  const rest = pose(-1), layers: Layer[] = [], axes: SVGPathElement[] = [];
  let cover: ReturnType<typeof uru> | null = null;
  for (let i = 0; i <= COVER; i++) {
    const lg = mk("g", {}, g);
    let built: Built;
    if (i < COVER) built = builders[i](i === 0 ? xk : x, lg);
    else {
      // Uru's body starts at its foot, ZB over its own ground: stood that much lower, so its foot is the layer's
      cover = uru(P, C, lg, { x: 0, y: 0, z: -URU.ZB * US, s: US, skirt: false, ground: false });
      cover.band.setAttribute("class", "sil");
      built = { hi: cover.outline, pts: cover.hull(POSE(THETA)).concat(cover.hull(POSE(THETA, { ta: 2.6 }))) };
    }
    layers.push({ g: lg, hi: built.hi, shape: hull(built.pts), tw: tween(rest[i]), to: rest[i], off: rest[i], drawn: NaN });
    if (i < COVER) axes.push(mk("path", { class: "nf dash" }, g));
  }
  const uruC = cover!;
  const crownAxis = mk("path", { class: "nf dash" }, g);
  /** Where the centre line leaves each layer's top, over its foot. */
  const beadTop = (URU.top - URU.ZB) * US, tops = [1.1 * K, HT[1], HT[2], beadTop];

  /** The construction, for the layers where they are now: the centre line in each gap and over the bead, the guides and their ticks. */
  function construct() {
    const o = layers.map((L) => L.off);
    axes.forEach((el, i) => el.setAttribute("d", o[i + 1] > o[i] + tops[i] + 0.5 ? ln(P, [0, 0, o[i] + tops[i]], [0, 0, o[i + 1]]) : ""));
    crownAxis.setAttribute("d", ln(P, [0, 0, o[COVER] + beadTop + 1.4], [0, 0, o[COVER] + beadTop + 7]));
    const zTop = o[COVER] + 0.36 * H;
    guides.setAttribute("d", [1, -1].map((s) => ln(P, [s * ex[0], s * ex[1], 0], [s * ex[0], s * ex[1], zTop])).join(""));
    ticks.setAttribute("d", o.slice(1).flatMap((z) => [1, -1].map((s) => ln(P, [s * ex[0], s * ex[1], z], [s * ex[0] * 0.9, s * ex[1] * 0.9, z]))).join(""));
  }

  // Ambient: a blink every few seconds, now and then a double one, and the parts drifting a little on a slow swell
  // that rises up the stack, the higher the more. A wave swings twice once the mitten is up. Under reduced motion
  // all of it holds still, eyes open.
  const waveTw = tween(0);
  let blinkAt = performance.now() + 2200, blinks = 0, wavedAt = 0;
  const drift = (i: number, now: number) => (reducedMotion() ? 0 : DRIFT * i * Math.sin((2 * Math.PI * now) / SWELL - i * 0.45));
  const swing = (now: number) => { const p = clamp((now - wavedAt - 760) / 1100, 0, 1); return act === COVER && !reducedMotion() ? Math.sin(p * 4 * Math.PI) * 0.16 * (1 - p) : 0; };
  function eyes(now: number) {
    if (reducedMotion()) return 1;
    const t = now - blinkAt;
    if (t < 0) return 1;
    if (t >= 260) { blinks++; blinkAt = now + (hash(blinks) < 0.2 ? 150 : 2800 + hash(blinks + 9) * 3700); return 1; }
    return t < 90 ? 1 - (t / 90) * 0.93 : t < 130 ? 0.07 : 0.07 + ((t - 130) / 130) * 0.93;
  }

  // Each layer at its tween's foot, never nearer than half a unit to the one below; painted once, it is moved whole.
  const B = register(stage, (dt, now) => {
    let moving = false, dirty = false;
    layers.forEach((L, i) => {
      const o = tval(L.tw, now) + drift(i, now);
      L.off = i ? Math.max(o, layers[i - 1].off + REST[i - 1] - 0.4) : o;
      if (L.off !== L.drawn) { L.drawn = L.off; L.g.setAttribute("transform", `translate(0 ${r2(L.off * rise)})`); dirty = true; }
      if (!tdone(L.tw, now)) moving = true;
    });
    if (dirty) construct();
    // the cover's pose: the near mitten raised and swinging to wave, the eyes easing into happy arcs, a blink
    const wv = tval(waveTw, now), sw = swing(now);
    uruC.draw(POSE(THETA, { ta: lerp(0.22, 2.35, wv) + sw * 2.2 * wv, fa: lerp(0.3, 0.15, wv), roll: -0.04 * wv }), mixLook(LOOKS.rest, LOOKS.happy, wv), (1 - eyes(now)) / 0.93);
    if (uruC.step(dt)) moving = true;
    if (!tdone(waveTw, now) || sw) moving = true;
    return moving || !reducedMotion();
  });
  bag.add(B.unregister);

  // The hit test, on the target pose (rule 01).
  const y0 = P(0, 0, 0)[1], x0 = P(0, 0, 0)[0];
  const edge = (p: Vec2, a: Vec2, b: Vec2) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
  };
  /** Whether p is inside layer i's silhouette at its target, or within m of it. */
  const over = (p: Vec2, i: number, m: number) => {
    const h = layers[i].shape, q: Vec2 = [p[0], p[1] - layers[i].to * rise];
    let inside = true, best = Infinity;
    for (let k = 0; k < h.length; k++) {
      const a = h[k], b = h[(k + 1) % h.length];
      if ((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]) < 0) inside = false;
      best = Math.min(best, edge(q, a, b));
    }
    return inside || best < m;
  };
  function hit(p: Vec2): number {
    const T = layers.map((L) => L.to), z = (p[1] - y0) / rise, column = Math.abs(p[0] - x0) < RG * C.S * 0.86;
    for (let i = COVER; i >= 0; i--) if (over(p, i, 2)) return i;
    if (act >= 0 && act < COVER && column && z >= T[act] && z <= T[act + 1]) return act;
    if (!column || z < -3 || z > T[COVER] + beadTop + 6) return -1;
    for (let i = COVER; i > 0; i--) if (z >= (T[i - 1] + Math.min(HT[i - 1], T[i] - T[i - 1]) + T[i]) / 2) return i;
    return 0;
  }

  /** The one bright mark: the picked layer, else the cover. */
  const brighten = () => layers.forEach((L, i) => L.hi.forEach((el) => el.classList.toggle("hi", i === (act >= 0 ? act : COVER))));
  /** Picks layer a (-1 for rest): the layers above it move, staggered out from it, and it takes the bright stroke. */
  function choose(a: number, force = false) {
    if (a === act && !force) return;
    const now = performance.now(), from = a >= 0 ? a : act, to = pose(a);
    act = a;
    layers.forEach((L, i) => { tset(L.tw, to[i], now, from < 0 ? 0 : Math.abs(i - from) * STEP); L.to = to[i]; });
    tset(waveTw, a === COVER ? 1 : 0, now, a === COVER ? 120 : 0);
    if (a === COVER) wavedAt = now;
    brighten();
    read.textContent = a < 0 ? "rest" : NAMES[a];
    B.wake();
  }
  choose(-1, true);
  bag.add(pointer(stage, { move: (p) => choose(hit(p)), leave: () => choose(-1) }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { lift = clamp(v, LMIN, LMAX); if (act >= 0) choose(act, true); },
    destroy: bag.dispose,
  };
};
