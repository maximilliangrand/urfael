import {
  Cam, circ, clamp, facing, fit, hull, open, poly, prism, proj, rad, ringAt, rings, rrect, run, seg,
  type Ring, type Vec2, type Vec3,
} from "../hairline/core/iso";
import { reducedMotion, spring, stepS, tdone, tset, tval, tween, type Spring, type Tween } from "../hairline/core/motion";
import { disposer, mk, pointer, put, register, solid, type FigureMount, type Solid } from "../hairline/core/stage";
import { faceMarks, hash, hatch, inside, LOOKS, mixLook, RUNE, ring2, runs, steps, toward, type Look } from "./uru-kit";

/**
 * Uru, under wraps: the corner of a shop in section, its slatted wall and
 * tiled floor cut and hatched where they are cut. On a low plinth stand two
 * closed boxes, a square one turned a little to the room and a round tin, a
 * drum with a lift-off lid, standing on a sheet of tissue paper. Each is closed
 * with a paper band round its body and a round seal on the band, the rune ᚢ
 * sewn into it and dashed stitching round it. A loose ribbon lies before the
 * square box, and a plant stands in the far corner.
 *
 * At rest the tin's lid sits a few millimetres ajar, lifted a crack and tipped
 * up at the front, and in the dark gap under it Uru's two dome eyes peek out;
 * the lid's outline is the bright mark. The eyes blink now and then and every
 * so often glance along the plinth. Nothing inside is ever drawn but the dark
 * gap and the face: two dome eyes and two cheeks from the kit (faceMarks,
 * LOOKS, mixLook), nothing between the eyes.
 *
 * The pointer picks a box. Its lid lifts a crack, by the slider (world units
 * at its front edge; the tin a little more, as its rim climbs toward its
 * sides), tipping back about its far edge on the lift curve, and takes the
 * bright stroke. A moment later Uru rises in the gap until its cheeks clear
 * the rim, turns curious, looks toward the pointer (a spring on where it is)
 * and blinks. The other box's lid settles shut, staggered by its distance from
 * the pick (rule 02), and Uru ducks out of sight there first. Leaving puts the
 * tin back ajar. The read-out names the box and says whether Uru is out yet:
 * `box · sealed`, then `box · peeking`, and `tin · …` for the tin. The arrow
 * keys walk the boxes. Under reduced motion every change lands at once and
 * nothing blinks or glances.
 *
 * Paint order keeps it honest (rule 06): per box the dark gap, then the face,
 * then the box's body drawn as a wall round its open top, which hides the
 * face below the rim, then its band and seal, then the lid over everything.
 * The hit test (rule 01) walks the boxes nearest first, each by its fixed hull
 * at rest and the pick by its hull with its lid at the slider's top end too, so
 * what is drawn on top wins and a lifted lid never takes a neighbour's place.
 */

// The shop: the back wall along x from 0 to RW, WT thick and cut at H; a stub of side wall SW deep; the floor RD deep on a slab SL thick.
const RW = 50, RD = 31, WT = 2.4, H = 20, SL = 3, SW = 7;
// The plinth [x0, y0, x1, y1] and its top.
const PLI = [4, 5, 43.5, 28.4] as const, PZ = 3;
type Kind = "square" | "round";
/**
 * A box: where it stands and how it is turned (its front, local +v, faces the room), its half width, the body's
 * and the lid's heights, its corners' radius, the band's foot and top, how far Uru can slide along its front, and
 * how much wider its lid opens than the slider says (a round rim climbs toward its sides, where the cheeks are).
 */
type BoxSpec = { kind: Kind; name: string; x: number; y: number; yaw: number; half: number; base: number; lid: number; r: number; band: readonly [number, number]; slide: number; open: number };
const BOXES: readonly BoxSpec[] = [
  { kind: "square", name: "box", x: 15, y: 14.6, yaw: rad(-27), half: 7.6, base: 9.8, lid: 3.3, r: 1.7, band: [2.7, 5.3], slide: 1.8, open: 1 },
  { kind: "round", name: "tin", x: 33.4, y: 18.6, yaw: rad(-45), half: 6.7, base: 6.6, lid: 2.4, r: 0, band: [1.8, 4.1], slide: 0.5, open: 1.15 },
];
// Which box is ajar at rest and how far its lid stands open at the front; the lid's overhang, a wall's thickness, how deep inside the front wall
// Uru's face is, and how much flatter than a tin's wall it bends.
const REST = 1, AJAR = 1.9, OVER = 0.35, WALL = 0.45, DEPTH = 1.5, CURVE = 1.5;
// Uru's face: its scale (world units to a face unit), and the back edge of the lid's share of the lift.
const FS = 1.0, BACK = 0.4;
// The answer: the slider's floor and the largest lift, the stagger between the boxes, the face's delay after the lid, the blink after a pick.
const LMIN = 3, LMAX = 4.6, STEP = 45, EYES = 110, BLINK = 820;
// Where Uru's eyes' foot sits under a shut lid, below the rim; how far its eyes turn toward the pointer, across and up (face units).
const HIDDEN = -3, GU = 0.8, GV = 0.12;
// The face's measures in face units from the eyes' foot, read off the kit: the tallest eye's top (curious, looking up as far
// as it does), the cheeks' foot (looking down), and how far out the cheeks' middles sit.
const FOOT = Math.min(...faceMarks(LOOKS.rest).eyes.flat().map((p) => p[1]));
const TOP = Math.max(...faceMarks(LOOKS.curious).eyes.flat().map((p) => p[1])) - FOOT + GV;
const CHEEK = Math.min(...faceMarks(LOOKS.curious).cheeks.flat().map((p) => p[1])) - FOOT - 0.35 * GV;
const OUT = (() => { const c = faceMarks(LOOKS.rest).cheeks[0]; return c.reduce((a, p) => a + p[0], 0) / c.length; })();

type Box = {
  s: BoxSpec; W: (u: number, v: number, z: number) => Vec3;
  skirt: Ring; top: Ring; panel: Ring; rim: Vec2[];
  gap: SVGPathElement; cheeks: SVGPathElement[]; eyes: SVGPathElement[]; lid: Solid; lidLines: SVGPathElement;
  lift: Tween; face: Tween; mood: Tween; gu: Spring; gv: Spring; blinkAt: number; blinks: number; last: number[];
  rest: Vec2[]; lifted: Vec2[]; centre: Vec2; across: Vec2;
};

/** A ring turned by a radians about its origin, then moved to (x, y). */
const at = (ring: Ring, x: number, y: number, a = 0): Ring => {
  const c = Math.cos(a), s = Math.sin(a);
  return ring.map((q) => ({ u: x + q.u * c - q.v * s, v: y + q.u * s + q.v * c, nu: q.nu * c - q.nv * s, nv: q.nu * s + q.nv * c }));
};
/** A polygon's signed area on screen, so a hole can be wound against its outline. */
const area2 = (pts: readonly Vec2[]) => pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0);

export const mount: FigureMount = ({ stage, svg, read }, value) => {
  const bag = disposer();
  let lift = clamp(value, LMIN, LMAX), act = -1;
  const C = Cam(45, 0.5, 6.05);
  fit(C, [[-WT, -WT, H], [RW, -WT, H], [-WT, SW, H], [-WT, RD, -SL], [RW, RD, -SL], [RW, -WT, -SL]], 200, 162);
  const P = proj(C), front = facing(C), eye = toward(C), per = C.S * Math.sqrt(1 - C.k * C.k);
  const g = mk("g", {}, svg);

  /* ---------- the pen ---------- */
  const Q = (p: Vec3) => P(p[0], p[1], p[2]), y = (p: Vec3) => Q(p)[1];
  const pth = (cls: string, d = "", into: Element = g) => mk("path", { class: cls, d }, into);
  const ln = (a: Vec3, b: Vec3) => seg(Q(a), Q(b));
  const curve = (pts: Vec3[]) => open(pts.map(Q));
  const box = (x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, r = 0.6, b = 0.4, cls = "sil") => {
    const s = solid(g); put(s, prism(P, front, ...rings(x0, y0, x1, y1, r, b), z0, z1)); s.sil.setAttribute("class", cls); return s;
  };
  const onY = (Y: number, x0: number, z0: number, x1: number, z1: number, r = 0.4) => poly(rrect(x0, z0, x1, z1, r, 3).map((p) => P(p.u, Y, p.v)));
  /** Writes a path only when it changed: in Chromium d is a style property, so each write costs a style recalc. */
  const drawn = new WeakMap<Element, string>();
  const setD = (el: Element, d: string) => { if (drawn.get(el) !== d) { drawn.set(el, d); el.setAttribute("d", d); } };

  /* ---------- the shop: the slab and its tiles, the wall and its stub cut and hatched, skirting, the slats ---------- */
  box(-WT, -WT, RW, RD, -SL, 0, 0.6, 0.4);
  pth("nf lo", hatch(P, "y", RD, -WT + 0.4, RW - 0.4, -SL + 0.3, -0.3) + hatch(P, "x", RW, -WT + 0.4, RD - 0.4, -SL + 0.3, -0.3)
    + steps(6.4, RD - 1.2, 5).map((y) => ln([0, y, 0], [RW, y, 0])).join("") + steps(6.75, RW - 6.75, 8).map((x) => ln([x, 0, 0], [x, RD, 0])).join(""));
  box(-WT, -WT, RW, 0, 0, H, 0.5, 0.45);
  box(-WT, 0, 0, SW, 0, H, 0.5, 0.45);
  pth("nf lo", hatch(P, "x", RW, -WT + 0.3, -0.3, 0.4, H - 0.4, 1.5) + hatch(P, "y", SW, -WT + 0.3, -0.3, 0.4, H - 0.4, 1.5));
  box(0, 0, RW, 0.55, 0, 1.6, 0.2, 0.2, "");
  box(0, 0.55, 0.55, SW, 0, 1.6, 0.2, 0.2, "");
  pth("nf lo", steps(3.4, H - 1.6, 10).map((z) => ln([0.6, 0.02, z], [RW - 0.4, 0.02, z]) + ln([0.02, 0.6, z], [0.02, SW - 0.4, z])).join(""));
  pth("", onY(0.05, 38.6, 2.6, 41, 5, 0.4));
  pth("nf lo", onY(0.1, 39.2, 4.2, 39.4, 4.6, 0.08) + onY(0.1, 40.2, 4.2, 40.4, 4.6, 0.08));

  /* ---------- the plant in the far corner: a pot on its saucer, broad leaves on three stems, back to front ---------- */
  {
    const cx = 46.7, cy = 4, disc = (r: number, n = 28) => at(circ(r, n), cx, cy);
    box(cx - 3, cy - 3, cx + 3, cy + 3, 0, 0.5, 3, 0.4, "");
    put(solid(g), { sil: poly(hull(ringAt(P, disc(2.1), 0.5).concat(ringAt(P, disc(2.7), 5.6)))), crease: "" });
    put(solid(g), prism(P, front, disc(2.95), disc(2.5), 5.6, 6.6));
    pth("nf lo", poly(ringAt(P, disc(2.4), 6.45)));
    const stems = [[0.4, -0.5, 13.5], [-0.7, 0.6, 10.5], [0.9, 0.8, 7.5]] as const;
    pth("nf", stems.map(([dx, dy, h]) => curve(steps(0, 1, 8).map((t): Vec3 => [cx + dx * t * 1.6 + 0.3 * Math.sin(t * 3), cy + dy * t * 1.6, 6.2 + h * t]))).join(""));
    const leaves = steps(0, 11, 12).map((k) => {
      const st = stems[k % 3], t = 0.36 + (0.64 * Math.floor(k / 3)) / 3, a = k * 2.35 + 0.6, el = 0.25 + hash(k) * 0.4, L = 5.8 - t * 1.6 + hash(k + 4) * 1.2, w = L * 0.52;
      const b: Vec3 = [cx + st[0] * t * 1.6, cy + st[1] * t * 1.6, 6.2 + st[2] * t], dir: Vec3 = [Math.cos(a) * Math.cos(el), Math.sin(a) * Math.cos(el), Math.sin(el)], side: Vec3 = [-Math.sin(a), Math.cos(a), 0];
      const mid = (u: number): Vec3 => [b[0] + dir[0] * L * u, b[1] + dir[1] * L * u, b[2] + dir[2] * L * u - 1.1 * u * u];
      const edge = (u: number, sg: number): Vec3 => { const m = mid(u), hw = (sg * w * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.05)), 0.7)) / 2; return [m[0] + side[0] * hw, m[1] + side[1] * hw, m[2] + 0.25 * sg * hw]; };
      const us = steps(0, 1, 13), m = mid(0.5);
      return { depth: m[0] + m[1] + m[2] * 0.1, d: poly(us.map((u) => Q(edge(u, 1))).concat(us.slice().reverse().map((u) => Q(edge(u, -1))))), rib: curve(steps(0.04, 0.9, 8).map(mid)) };
    }).sort((p, o) => p.depth - o.depth);
    for (const l of leaves) { pth("", l.d); pth("nf lo", l.rib); }
  }

  /* ---------- the plinth, its recessed foot, and on it the tissue paper and the ribbon ---------- */
  {
    const [x0, y0, x1, y1] = PLI;
    box(x0 + 0.6, y0 + 0.6, x1 - 0.6, y1 - 0.6, 0, 0.6, 1, 0.3, "");
    box(x0, y0, x1, y1, 0.6, PZ, 1.4, 0.6);
    // the tissue: a sheet turned on the plinth under the tin, its near corner curling up, a few creases
    const tc: Vec2 = [32.2, 17.2], ta = rad(12), half = 7.2, z = PZ + 0.04;
    const T = (u: number, v: number, h = 0): Vec3 => [tc[0] + u * Math.cos(ta) - v * Math.sin(ta), tc[1] + u * Math.sin(ta) + v * Math.cos(ta), z + h];
    const fold = 2.8;
    pth("", poly([T(-half, -half), T(half, -half), T(half, half), T(-half + fold, half), T(-half, half - fold)].map(Q)));
    pth("", poly([T(-half + fold, half), T(-half, half - fold), T(-half + fold * 0.55, half - fold * 0.55, 1.5)].map(Q)));
    pth("nf lo", [[[3, 7.4], [5.6, 3.6]], [[7.4, 4.4], [4.8, 6.6]], [[-6.8, 2.6], [-4.4, 4.8]], [[7.4, -3.4], [5.4, -1.2]]].map(([a, b]) => ln(T(a[0], a[1]), T(b[0], b[1]))).join(""));
    // the ribbon: a loose length lying in an S before the square box, its ends cut in a V
    const mid = steps(0, 1, 26).map((t): Vec2 => [6.2 + 14.8 * t, 26.3 - 0.9 * Math.sin(t * Math.PI * 2.1) + 0.5 * t]);
    const side = (k: number) => mid.map((p, i): Vec3 => {
      const a = mid[Math.max(0, i - 1)], b = mid[Math.min(mid.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy);
      return [p[0] - (dy / m) * 0.55 * k, p[1] + (dx / m) * 0.55 * k, PZ + 0.05];
    });
    const l = side(1), r = side(-1), notch = (i: number, j: number): Vec3 => [mid[i][0] + (mid[j][0] - mid[i][0]) * 0.8, mid[i][1] + (mid[j][1] - mid[i][1]) * 0.8, PZ + 0.05];
    pth("", poly([notch(0, 1)].concat(l, [notch(mid.length - 1, mid.length - 2)], r.reverse()).map(Q)));
  }

  /* ---------- the boxes ---------- */
  const boxes: Box[] = BOXES.map((s, i) => {
    const cs = Math.cos(s.yaw), sn = Math.sin(s.yaw);
    const W = (u: number, v: number, z: number): Vec3 => [s.x + u * cs - v * sn, s.y + u * sn + v * cs, PZ + z];
    const ring = (inset: number): Ring => (s.kind === "round" ? circ(s.half - inset, 72) : rrect(-s.half + inset, -s.half + inset, s.half - inset, s.half - inset, Math.max(0.3, s.r - inset), 6));
    const world = (inset: number) => at(ring(inset), s.x, s.y, s.yaw);
    const outer = world(0), body = hull(ringAt(P, outer, PZ).concat(ringAt(P, outer, PZ + s.base)));
    // in paint order: the dark gap, the face, the body round its open top, the band and its seal, then the lid
    const gap = pth("ink"), cheeks = [pth("blush"), pth("blush")], eyes = [pth("warm"), pth("warm")];
    const hole = ringAt(P, world(WALL), PZ + s.base);
    pth("fo", poly(body) + poly(Math.sign(area2(hole)) === Math.sign(area2(body)) ? hole.slice().reverse() : hole));
    pth("nf sil", poly(body));
    pth("nf", poly(hole));
    const bandRing = run(world(-0.1), front);
    pth("", poly(ringAt(P, bandRing, PZ + s.band[1]).concat(ringAt(P, bandRing, PZ + s.band[0]).reverse())));
    // the seal on the band's front, round, with the rune sewn into it and stitched round its edge
    const zc = (s.band[0] + s.band[1]) / 2, rp = 1.5, R = s.half + 0.16;
    const seal = (a: number, b: number): Vec2 => Q(s.kind === "round" ? W(R * Math.sin(a / R), R * Math.cos(a / R), zc + b) : W(a, R, zc + b));
    pth("", poly(ring2(0, 0, rp, rp, 32).map(([a, b]) => seal(a, b))));
    pth("nf dash", poly(ring2(0, 0, rp * 0.77, rp * 0.77, 32).map(([a, b]) => seal(a, b))));
    pth("nf sil", open(RUNE.map(([a, b]) => seal(a * rp, b * rp))));
    const lid = solid(g), lidLines = pth("nf lo");
    const b: Box = {
      s, W, skirt: ring(-OVER), top: ring(-OVER + 0.55), panel: ring(s.kind === "round" ? 2.3 : 2.1), rim: ringAt(P, outer, PZ + s.base),
      gap, cheeks, eyes, lid, lidLines,
      lift: tween(i === REST ? AJAR : 0), face: tween(HIDDEN), mood: tween(0), gu: spring(0), gv: spring(0), blinkAt: 0, blinks: 0, last: [NaN, NaN, NaN, NaN, NaN, NaN],
      rest: [], lifted: [], centre: [0, 0], across: [0, 0],
    };
    // the first frame is the rest pose: the tin already ajar, Uru already peeking
    if (i === REST) b.face = tween(peek(b));
    b.rest = hull(body.concat(lidPts(b, 0).sil, i === REST ? lidPts(b, AJAR).sil : []));
    b.lifted = hull(b.rest.concat(lidPts(b, LMAX * s.open).sil));
    b.centre = Q(onFace(b, 0, s.base + 0.6));
    const right = Q(onFace(b, 1, s.base + 0.6));
    b.across = [right[0] - b.centre[0], right[1] - b.centre[1]];
    return b;
  });

  /** A box's lid with its front edge f above the rim: tipped back about its far edge, which lifts BACK of the way. */
  function lidPts(b: Box, f: number) {
    const s = b.s, D = 2 * (s.half + OVER), h = BACK * f, th = Math.asin(clamp((f - h) / D, 0, 1)), c = Math.cos(th), sn = Math.sin(th), vp = -(s.half + OVER);
    const cy = Math.cos(s.yaw), sy = Math.sin(s.yaw);
    const L = (u: number, v: number, z: number) => b.W(u, vp + (v - vp) * c - z * sn, s.base + h + (v - vp) * sn + z * c);
    const sees = (nu: number, nv: number) => (nu * cy - nv * c * sy) * eye[0] + (nu * sy + nv * c * cy) * eye[1] + nv * sn * eye[2] > 0;
    const foot = b.skirt.map((p) => Q(L(p.u, p.v, 0)));
    const sil = hull(foot.concat(b.skirt.map((p) => Q(L(p.u, p.v, s.lid)))));
    const crease = runs(b.top.map((p) => Q(L(p.u, p.v, s.lid))), b.top.map((p) => sees(p.nu, p.nv)), true);
    // a pressed ring in a tin's lid, a pressed panel in a box's
    const lines = poly(b.panel.map((p) => Q(L(p.u, p.v, s.lid))));
    return { sil, crease, lines, foot, L };
  }

  /** Redraws a box: its lid at front lift f, and Uru's face, its eyes' foot e above the rim, in look lk, `shut` through a blink. */
  function drawBox(b: Box, f: number, e: number, lk: Look, slide: number, shut: number) {
    const s = b.s, L = lidPts(b, f), ajar = f > 0.02;
    setD(b.lid.sil, poly(L.sil));
    setD(b.lid.cr, L.crease);
    setD(b.lidLines, L.lines);
    setD(b.gap, ajar ? poly(hull(b.rim.concat(L.foot))) : "");
    const m = faceMarks(lk, shut);
    // face u runs to the left as we see it, the box's u to the right
    const F = (pts: Vec2[]) => poly(pts.map(([u, w]) => Q(onFace(b, slide - u * FS, s.base + e + (w - FOOT) * FS))));
    b.eyes.forEach((el, i) => setD(el, ajar ? F(m.eyes[i]) : ""));
    b.cheeks.forEach((el, i) => setD(el, ajar ? F(m.cheeks[i]) : ""));
  }

  /* ---------- where Uru's face sits, measured on screen ---------- */
  /**
   * Uru's face inside a box, u along it (to our right) and z up, DEPTH behind the front: flat in a box, and in a tin
   * bent round a gentler arc than its wall (CURVE times the radius), so the face turns with the tin and its sides stay inside.
   */
  function onFace(b: Box, u: number, z: number): Vec3 {
    const v = b.s.half - DEPTH, R = CURVE * v;
    return b.s.kind === "round" ? b.W(R * Math.sin(u / R), v - R + R * Math.cos(u / R), z) : b.W(u, v, z);
  }
  /** How far across the box's front a point of the face lies, u along it: where the rim and the lid are measured. */
  const across = (b: Box, u: number) => { const R = CURVE * (b.s.half - DEPTH); return b.s.kind === "round" ? R * Math.sin(u / R) : u; };
  /** How far out from the box's middle its rim (inset WALL) or its lid's skirt (inset -OVER) is, at u across its front. */
  function edge(b: Box, u: number, inset: number) { const r = b.s.half - inset; return b.s.kind === "round" ? Math.sqrt(Math.max(0, r * r - u * u)) : r; }
  /** Uru just peeking: its eyes' foot a little over the rim, at the middle of its face. */
  function peek(b: Box) {
    return (y(onFace(b, 0, b.s.base)) - y(b.W(0, edge(b, 0, WALL), b.s.base)) + 0.22 * per) / per;
  }
  /**
   * How high Uru rises under a lid lifted f: until its cheeks clear the rim, but never so high that its eyes' tops
   * reach the lid's edge, measured on screen wherever the face can be as it looks and slides toward the pointer.
   */
  function up(b: Box, f: number) {
    const s = b.s, L = lidPts(b, f).L, m = 0.3 * per, cur = LOOKS.curious;
    let most = Infinity, least = -Infinity;
    for (const k of [-1, -0.5, 0, 0.5, 1]) {
      const slide = k * s.slide, gu = cur.gu - k * GU;
      for (const e of cur.eyes) {
        const u = slide - (e.x + gu) * FS, x = across(b, u);
        most = Math.min(most, y(onFace(b, u, s.base + TOP * FS)) - y(L(x, edge(b, x, -OVER), 0)) - m);
      }
      for (const side of [1, -1]) {
        const u = slide - (side * OUT + 0.4 * gu) * FS, x = across(b, u);
        least = Math.max(least, y(onFace(b, u, s.base + CHEEK * FS)) - y(b.W(x, edge(b, x, WALL), s.base)) + m);
      }
    }
    return Math.min(most, least) / per;
  }

  /* ---------- state, the two clocks, and the answer ---------- */
  const glance = tween(0);
  let seen = 0, glanceAt = 0, glanceTo = 0, glanceDir = 1, peeking = false;
  function blinking(b: Box, now: number) {
    const t = now - b.blinkAt;
    if (t < 0) return 0;
    if (t >= 260) { b.blinks++; b.blinkAt = now + (hash(b.blinks + b.s.half) < 0.2 ? 150 : 2800 + hash(b.blinks + 5) * 3700); return 0; }
    return t < 90 ? t / 90 : t < 130 ? 1 : 1 - (t - 130) / 130;
  }
  /** The read-out for the pick: its name, and whether Uru is out of hiding there yet; written only when that changes. */
  function say(now: number, force = false) {
    const out = tval(boxes[act].face, now) > HIDDEN / 2;
    if (out === peeking && !force) return;
    peeking = out;
    read.textContent = `${BOXES[act].name} · ${out ? "peeking" : "sealed"}`;
  }
  const B = register(stage, (dt, now) => {
    const rm = reducedMotion();
    let moving = false;
    if (!seen && dt > 0) { seen = now; glanceAt = now + 5200; }
    if (rm && glance.to !== 0) { tset(glance, 0, now, 0); glanceTo = 0; }
    if (!rm && act < 0 && seen && now >= glanceAt) { tset(glance, glanceDir, now, 0); glanceDir = -glanceDir; glanceTo = now + 1900; glanceAt = now + 9000 + hash(now) * 4000; }
    if (glanceTo && now >= glanceTo) { glanceTo = 0; tset(glance, 0, now, 0); }
    if (!tdone(glance, now)) moving = true;
    const gl = tval(glance, now), ajar = act < 0 ? REST : act;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i], f = tval(b.lift, now), e = tval(b.face, now), mood = tval(b.mood, now);
      if (!tdone(b.lift, now) || !tdone(b.face, now) || !tdone(b.mood, now)) moving = true;
      if (stepS(b.gu, dt)) moving = true;
      if (stepS(b.gv, dt)) moving = true;
      const gu = b.gu.x + (i === ajar && act < 0 ? 0.7 * gl : 0), gv = b.gv.x, shut = rm || i !== ajar ? 0 : blinking(b, now);
      // only redraw a box whose pose moved: at rest this is the whole tick, between blinks
      const p = b.last;
      if (p[0] === f && p[1] === e && p[2] === mood && p[3] === gu && p[4] === gv && p[5] === shut) continue;
      p[0] = f; p[1] = e; p[2] = mood; p[3] = gu; p[4] = gv; p[5] = shut;
      const lk = mixLook(LOOKS.rest, LOOKS.curious, mood);
      // the pointer's gaze is + to our right, a look's to the left: it turns the eyes the other way round
      drawBox(b, f, e, { ...lk, gu: lk.gu - gu, gv: lk.gv + gv }, (b.gu.x * b.s.slide) / GU, shut);
    }
    if (act >= 0) say(now);
    return moving || !rm;
  });
  bag.add(B.unregister);

  /** Picks box a (-1 is rest): its lid lifts and takes the bright stroke, Uru rises in the gap; the other box shuts. */
  function choose(a: number, force = false) {
    if (a === act && !force) return;
    const now = performance.now(), from = a >= 0 ? a : act;
    act = a;
    const ajar = a < 0 ? REST : a;
    boxes.forEach((b, i) => {
      const delay = from < 0 ? 0 : Math.abs(i - from) * STEP;
      const f = i === ajar ? (a < 0 ? AJAR : lift * b.s.open) : 0, e = i !== ajar ? HIDDEN : a < 0 ? peek(b) : up(b, lift * b.s.open);
      const rising = e > tval(b.face, now);
      // Uru rises after its lid has opened, and ducks before its lid shuts
      tset(b.lift, f, now, delay + (rising ? 0 : EYES));
      tset(b.face, e, now, delay + (rising ? EYES : 0));
      tset(b.mood, i === a ? 1 : 0, now, delay + EYES);
      if (i !== a) { b.gu.t = 0; b.gv.t = 0; }
      if (i === a && rising) b.blinkAt = now + BLINK;
      b.lid.sil.classList.toggle("hi", i === ajar);
    });
    if (a >= 0) { tset(glance, 0, now, 0); glanceTo = 0; say(now, true); }
    else read.textContent = "rest";
    B.wake();
  }
  /** Uru looks toward the pointer: where it is across the box's front (+ to our right), and how far above the gap. */
  function look(p: Vec2) {
    if (act < 0) return;
    const b = boxes[act], dx = p[0] - b.centre[0], dy = p[1] - b.centre[1], m = Math.hypot(b.across[0], b.across[1]);
    b.gu.t = GU * clamp((dx * b.across[0] + dy * b.across[1]) / (m * m * 5), -1, 1);
    b.gv.t = GV * clamp(-dy / (C.S * 5), -1, 1);
    B.wake();
  }
  /**
   * The box under the pointer: what is drawn on top wins, so the boxes nearest first, each by its rest hull and the
   * pick by its lifted hull too. Stable (rule 01): the point that made the pick stays in its hulls while it lifts.
   */
  const order = boxes.map((_, i) => i).sort((i, j) => BOXES[j].x + BOXES[j].y - BOXES[i].x - BOXES[i].y);
  const hit = (p: Vec2) => order.find((i) => inside(p, boxes[i].rest) || (i === act && inside(p, boxes[i].lifted))) ?? -1;
  choose(-1, true);
  bag.add(pointer(stage, { move: (p) => { choose(hit(p)); look(p); }, leave: () => choose(-1) }));
  // The keyboard walks the boxes, left to right; Escape, or leaving the figure, puts it back to rest.
  bag.on(stage, "keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (dir) { e.preventDefault(); choose(act < 0 ? (dir > 0 ? 0 : boxes.length - 1) : (act + dir + boxes.length) % boxes.length); }
    else if (e.key === "Escape") choose(-1);
  });
  bag.on(stage, "blur", () => choose(-1));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { lift = clamp(v, LMIN, LMAX); if (act >= 0) choose(act, true); },
    destroy: bag.dispose,
  };
};
