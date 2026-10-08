import {
  Cam, circ, clamp, facing, fillet, fit, hull, lerp, open, poly, prism, proj, ringAt, rings, rrect, run, seg,
  type Ring, type Vec2, type Vec3,
} from "../hairline/core/iso";
import { reducedMotion, tdone, tset, tval, tween, type Tween } from "../hairline/core/motion";
import { disposer, mk, pointer, put, register, solid, wave, type FigureMount } from "../hairline/core/stage";
import { LOOKS, mixLook, ribbon, ring2, steps, URU, uru, hash, type UruPose } from "./uru-kit";

/**
 * Uru at home: the corner of a living room in section, its two walls cut at
 * door height and hatched where they are cut, the floorboards on a slab and a
 * plinth. Along the window wall a picture, an armchair with a knitted throw
 * over its arm, slippers before it, a basket of yarn, the radiator under the
 * window, the window with its curtains half drawn and a plant on the sill, and
 * a pedestal side table with a cup of tea on its saucer and a photo album, a
 * ribbon marking its page. Along the other wall a woven hanging, a clock that
 * keeps time, a low bookshelf full of books with the phone on its stand on
 * top, and a floor lamp (an object: it gives no light). A rug, a cat asleep on
 * it, curled with its tail round its paws, and a knitted pouf with the paper
 * folded on it and a pair of reading glasses.
 *
 * Uru stands in the corner between the lamp and the chair, drawn by the kit
 * (uru-kit.ts), so it is the same character in every figure: the one-piece
 * pebble on its gliding skirt, the knit band with its knot, the stitched rune
 * patch, the seams, the mitten arms, the lantern bead on its soft stalk, and
 * the dark face window with two dome eyes and two cheeks, nothing between the
 * eyes. At rest it watches the cat, breathes, blinks now and then, and waves
 * once when it is first seen.
 *
 * The pointer picks something in the room. Uru looks first, then turns toward
 * it (its body at most 35 degrees off us, its eyes the rest of the way, so its
 * face stays readable), tilts its head and lifts its near mitten toward it, and
 * the thing answers a moment later: the cup lifts off its saucer, the album's
 * cover opens on a photograph, the curtains part, the phone tips up and its
 * three dots come on, the book under the pointer slides out and its neighbours
 * stir. Pointed at, Uru waves. The read-out names the thing: tea, photos,
 * window, call, book, hello. The slider is the head tilt, in degrees.
 *
 * Every hit area is a fixed hull of its thing's rest and target poses, so
 * nothing moves out from under the pointer (rule 01); a picked book's
 * slid-out box is tested before the shelf. No glow, no filter, no light.
 */

/** The robot's working name, from the kit, where it lives once; it is never drawn. */
export { ROBOT } from "./uru-kit";

// The room: the floor RW along the window wall (x) by RD along the shelf wall (y); walls WT thick, cut at H; the slab SL, the plinth PL under it and PM wider.
const RW = 64, RD = 58, WT = 2.4, H = 36, SL = 3, PL = 2.6, PM = 4;
// Uru: where it stands (the kit draws it, at one world unit to its own).
const UX = 9.8, UY = 15.2;
// What Uru helps with, and what furnishes the room.
const TBL = { x: 52.2, y: 10.4, r: 6.2, z: 11.4 }, CUP = { x: 50.6, y: 13 }, ALB = { x0: 49.6, x1: 55.4, y0: 5.5, y1: 9.4 };
const WIN = { x0: 43, x1: 60, z0: 13.8, z1: 31.6 }, ROD = { y: 3.7, z: 34, x0: 39.2, x1: 63.2 }, CUR = { y: 3.1, top: 33.4, hem: 14.6, wf: 11 };
const SH = { x1: 8.4, y0: 32.6, y1: 55.6, top: 19.6, mid: 9.8 }, PHONE = { x: 4.6, y: 51.6 };
const CHAIR = { x0: 25, x1: 41, y0: 2.4, y1: 19 }, LAMP = { x: 4.6, y: 28.6 }, CAT = { x: 36.4, y: 40.6, a: 0.45, k: 1.2 }, POUF = { x: 59.4, y: 27.6, r: 3.9, h: 4.6 };
// Timing: the stagger from Uru's eyes to its body to the thing's answer; the breath, the wave.
const STEP = 70, ANSWER = 170, BREATH = 4800, WAVE = 1500;

type Pose = UruPose & { happy: number };
type Key = keyof Pose;
const KEYS: Key[] = ["yaw", "lean", "roll", "lu", "lv", "ta", "fa", "tb", "fb", "happy"];
type Book = { y0: number; y1: number; z0: number; z1: number; tw: Tween; g: SVGGElement; drawn: number };
type Zone = { name: string; area: Vec2[]; aim: Vec3 };

/** A ring turned by a radians about its origin, then moved to (x, y). */
const at = (ring: Ring, x: number, y: number, a = 0): Ring => {
  const c = Math.cos(a), s = Math.sin(a);
  return ring.map((q) => ({ u: x + q.u * c - q.v * s, v: y + q.u * s + q.v * c, nu: q.nu * c - q.nv * s, nv: q.nu * s + q.nv * c }));
};
/** Even-odd: whether a screen point is inside a polygon. */
function inside([x, y]: Vec2, pg: readonly Vec2[]) {
  let c = false;
  for (let i = 0, j = pg.length - 1; i < pg.length; j = i++) {
    const [xi, yi] = pg[i], [xj, yj] = pg[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/** A small leaf at screen point c, pointing along angle a, l long and w wide, as a closed path. */
const leaf = (c: Vec2, a: number, l: number, w: number) => poly(steps(0, Math.PI * 2, 17).slice(0, 16).map((t): Vec2 => {
  const u = l * (0.5 + 0.5 * Math.cos(t)), v = (w / 2) * Math.sin(t) * (1 - 0.35 * Math.cos(t));
  return [c[0] + u * Math.cos(a) - v * Math.sin(a), c[1] + u * Math.sin(a) + v * Math.cos(a)];
}));
export const mount: FigureMount = ({ stage, svg, read }, value) => {
  const bag = disposer();
  let tilt = (value * Math.PI) / 180;
  const C = Cam(45, 0.5, 3.55), ext = -WT - PM;
  fit(C, [[ext, ext, -SL - PL], [RW + PM, RD + PM, -SL - PL], [RW + PM, ext, -SL - PL], [ext, RD + PM, -SL - PL], [-WT, -WT, H], [RW, -WT, H], [-WT, RD, H]], 200, 160);
  const P = proj(C), front = facing(C);
  const o = P(0, 0, 0), EX: Vec2 = [P(1, 0, 0)[0] - o[0], P(1, 0, 0)[1] - o[1]], RISE = P(0, 0, 1)[1] - o[1];
  const g = mk("g", {}, svg);

  /* ---------- the pen: paths, lines and solids in world units ---------- */
  const Q = (p: Vec3) => P(p[0], p[1], p[2]);
  const pth = (cls: string, d = "", into: Element = g) => mk("path", { class: cls, d }, into);
  const ln = (a: Vec3, b: Vec3) => seg(Q(a), Q(b));
  const curve = (pts: Vec3[]) => open(pts.map(Q));
  const shape = (pts: Vec3[]) => poly(pts.map(Q));
  const dot = (p: Vec3, r: number) => poly(ring2(Q(p)[0], Q(p)[1], r * C.S, r * C.S, 12));
  const onX = (X: number, y0: number, z0: number, y1: number, z1: number, r = 0.5) => poly(rrect(y0, z0, y1, z1, r, 3).map((q) => P(X, q.u, q.v)));
  const onY = (Y: number, x0: number, z0: number, x1: number, z1: number, r = 0.5) => poly(rrect(x0, z0, x1, z1, r, 3).map((q) => P(q.u, Y, q.v)));
  const onZ = (Z: number, x0: number, y0: number, x1: number, y1: number, r = 0.5) => poly(rrect(x0, y0, x1, y1, r, 3).map((q) => P(q.u, q.v, Z)));
  const disc = (cx: number, cy: number, r: number, n = 28) => at(circ(r, n), cx, cy);
  const ell = (cx: number, cy: number, r: number, z: number, n = 28) => poly(ringAt(P, disc(cx, cy, r, n), z));
  const frontArc = (cx: number, cy: number, r: number, z: number, n = 32) => open(ringAt(P, run(disc(cx, cy, r, n), front), z));
  const backArc = (cx: number, cy: number, r: number, z: number, n = 32) => open(ringAt(P, run(disc(cx, cy, r, n), (q) => !front(q)), z));
  const box = (x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, r = 0.8, b = 0.45, into: Element = g, cls = "sil") => {
    const s = solid(into);
    put(s, prism(P, front, ...rings(x0, y0, x1, y1, r, b), z0, z1));
    s.sil.setAttribute("class", cls);
    return s;
  };
  const cyl = (cx: number, cy: number, r: number, z0: number, z1: number, b = 0.3, into: Element = g, cls = "sil", n = 28) => {
    const s = solid(into);
    put(s, prism(P, front, disc(cx, cy, r, n), disc(cx, cy, Math.max(0.1, r - b), n), z0, z1));
    s.sil.setAttribute("class", cls);
    return s;
  };
  /** A round solid whose top and foot differ: a pot, a shade, a cup. `rim` draws the whole opening, for a vessel. */
  const frustum = (cx: number, cy: number, r0: number, r1: number, z0: number, z1: number, rim = 0, into: Element = g, cls = "sil") => {
    const s = solid(into);
    s.sil.setAttribute("class", cls);
    put(s, { sil: poly(hull(ringAt(P, disc(cx, cy, r0, 36), z0).concat(ringAt(P, disc(cx, cy, r1, 36), z1)))), crease: rim ? ell(cx, cy, r1 - rim, z1, 36) : frontArc(cx, cy, r1 - 0.3, z1) });
    return s;
  };
  /** Section hatch on a cut face: 45° lines across the plane y = c (or x = c) from a0 to a1, between z0 and z1. */
  function hatch(axis: "x" | "y", c: number, a0: number, a1: number, z0: number, z1: number, gap = 2.2) {
    const h = z1 - z0, p = (a: number, z: number): Vec3 => (axis === "y" ? [a, c, z] : [c, a, z]);
    let d = "";
    for (let a = a0 - h + gap / 2; a < a1; a += gap) {
      const s0 = Math.max(a, a0), s1 = Math.min(a + h, a1);
      if (s1 - s0 > 0.3) d += ln(p(s0, z0 + (s0 - a)), p(s1, z0 + (s1 - a)));
    }
    return d;
  }

  /* ---------- the shell: plinth, slab, floorboards, the two walls cut and hatched, skirting ---------- */
  put(solid(g), prism(P, front, ...rings(ext, ext, RW + PM, RD + PM, 5, 1.6), -SL - PL, -SL));
  box(-WT, -WT, RW, RD, -SL, 0, 0.6, 0.4);
  pth("nf lo", hatch("y", RD, -WT + 0.4, RW - 0.4, -SL + 0.3, -0.3, 1.8) + hatch("x", RW, -WT + 0.4, RD - 0.4, -SL + 0.3, -0.3, 1.8));
  let boards = "";
  for (let y = 4.4, k = 0; y < RD; y += 4.4, k++) boards += ln([0, y, 0], [RW, y, 0]);
  for (let y = 0, k = 0; y < RD - 0.5; y += 4.4, k++) for (let x = 5 + hash(k) * 16; x < RW - 2; x += 18 + hash(k * 3 + x) * 10) boards += ln([x, y + 0.3, 0], [x, Math.min(RD, y + 4.1), 0]);
  pth("nf lo", boards);
  box(-WT, -WT, 0, RD, 0, H, 0.5, 0.45);
  box(0, -WT, RW, 0, 0, H, 0.5, 0.45);
  pth("nf lo", hatch("x", RW, -WT + 0.3, -0.3, 0.4, H - 0.4, 1.6) + hatch("y", RD, -WT + 0.3, -0.3, 0.4, H - 0.4, 1.6));
  box(0, 0, RW, 0.55, 0, 1.9, 0.2, 0.2, g, "");
  box(0, 0.55, 0.55, RD, 0, 1.9, 0.2, 0.2, g, "");

  /* ---------- the shelf wall: a woven hanging, the clock, the socket and the lamp's cable ---------- */
  {
    const X = 0.3, y0 = 33.6, y1 = 40.6, zt = 32.4;
    pth("nf lo", curve([[X, y0 + 0.4, zt + 0.1], [X, (y0 + y1) / 2, zt + 2.2], [X, y1 - 0.4, zt + 0.1]]));
    pth("", poly(hull([...ring2(0, 0, 0.32, 0.32, 10).map(([u, v]) => P(X + 0.3, y0 - 0.6 + u, zt + v)), ...ring2(0, 0, 0.32, 0.32, 10).map(([u, v]) => P(X + 0.3, y1 + 0.6 + u, zt + v))])));
    const hem = (y: number) => zt - 7.2 - 2.4 * Math.cos(((y - (y0 + y1) / 2) / (y1 - y0)) * Math.PI);
    pth("", shape([[X, y0, zt - 0.4], [X, y1, zt - 0.4], ...steps(y1, y0, 14).map((y): Vec3 => [X, y, hem(y)])]));
    let weave = "";
    for (const z of steps(zt - 1.6, zt - 6.4, 5)) weave += curve(steps(y0 + 0.5, y1 - 0.5, 15).map((y, i): Vec3 => [X, y, z + (i % 2 ? 0.45 : -0.15)]));
    weave += curve(steps(y0 + 0.8, y1 - 0.8, 9).map((y): Vec3 => [X, y, hem(y) + 1.2]));
    pth("nf lo", weave + steps(y0 + 0.5, y1 - 0.5, 13).map((y) => ln([X, y, hem(y) - 0.1], [X, y, hem(y) - 2.2])).join(""));
  }
  const CK = { y: 46.6, z: 28.6, r: 3.5 };
  const ckP = (r: number, t: number, x = 0.9): Vec3 => [x, CK.y - r * Math.sin(t), CK.z + r * Math.cos(t)];
  pth("sil", poly(hull(steps(0, Math.PI * 2, 40).flatMap((t) => [Q(ckP(CK.r, t, 0)), Q(ckP(CK.r, t, 0.9))]))));
  pth("nf", shape(steps(0, Math.PI * 2, 41).slice(0, 40).map((t) => ckP(CK.r - 0.42, t))));
  pth("nf lo", steps(0, 11, 12).map((k) => ln(ckP(k % 3 ? 2.6 : 2.2, (k * Math.PI) / 6), ckP(2.9, (k * Math.PI) / 6))).join(""));
  const hands = pth("nf", ""), second = pth("nf lo", "");
  pth("", dot(ckP(0, 0, 0.95), 0.2));
  let clockAt = -1;
  function drawClock() {
    const d = new Date(), s = d.getSeconds();
    if (s === clockAt) return;
    clockAt = s;
    const m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60, tt = (f: number) => f * Math.PI * 2;
    hands.setAttribute("d", ln(ckP(-0.4, tt(h / 12)), ckP(1.65, tt(h / 12))) + ln(ckP(-0.5, tt(m / 60)), ckP(2.5, tt(m / 60))));
    second.setAttribute("d", ln(ckP(-0.7, tt(s / 60)), ckP(2.75, tt(s / 60))));
  }
  pth("", onX(0.15, 30.2, 2.2, 32, 4, 0.4));
  pth("nf lo", onX(0.2, 30.7, 2.9, 30.9, 3.4, 0.1) + onX(0.2, 31.3, 2.9, 31.5, 3.4, 0.1));
  pth("nf", curve([[0.25, 31.1, 2.6], [0.8, 31.2, 0.4], [2, 30, 0.05], [LAMP.x - 1.6, LAMP.y + 0.6, 0.05]]));

  /* ---------- a little wall shelf on brackets: a trailing plant and two jars ---------- */
  {
    const x0 = 12.6, x1 = 22.6, z = 26.4;
    for (const x of [x0 + 1.4, x1 - 1.4]) pth("", shape([[x - 0.3, 0.05, z], [x + 0.3, 0.05, z], [x + 0.3, 0.05, z - 2.2], [x - 0.3, 0.05, z - 0.4]].map((q): Vec3 => [q[0], 0.05 + (q[2] > z - 0.5 ? 0 : 0), q[2]])));
    box(x0, 0, x1, 2.6, z, z + 0.6, 0.3, 0.2);
    const px = x0 + 2.6, py = 1.3, pz = z + 0.6;
    const vines = [[0.4, -0.2, 6.2, 0], [1.1, 0.5, 7.4, 1], [-0.6, 0.3, 4.8, 2], [1.6, 1.0, 5.6, 3]].map(([dx, dy, L, k]) => steps(0, 1, 14).map((t): Vec3 => [px + dx * t * 2 + 0.4 * Math.sin(t * 5 + k), py + 1.0 + dy * t, pz + 1.6 - L * t * t - 0.6 * t]));
    pth("nf", vines.map(curve).join(""));
    pth("", vines.flatMap((v, k) => v.filter((_, i) => i > 1 && (i + k) % 3 === 0).map((q, i) => leaf(Q(q), (i + k) % 2 ? 0.5 : 2.6, 0.75 * C.S, 0.42 * C.S))).join(""));
    frustum(px, py, 0.9, 1.15, pz, pz + 1.8, 0.25);
    frustum(x1 - 4.2, 1.2, 0.8, 0.8, pz, pz + 2.4, 0.2, g, "");
    pth("nf lo", frontArc(x1 - 4.2, 1.2, 0.82, pz + 1.7, 20));
    frustum(x1 - 2, 1.3, 0.62, 0.62, pz, pz + 1.6, 0.18, g, "");
    pth("", ell(x1 - 2, 1.3, 0.66, pz + 1.75, 16) + ell(x1 - 4.2, 1.2, 0.86, pz + 2.55, 18));
  }

  /* ---------- the window wall: the picture, the radiator, the window, its sill and plant, rod and curtains ---------- */
  pth("", onY(0.05, 27.6, 23.2, 37.4, 30.2, 0.5));
  pth("nf lo", onY(0.1, 28.7, 24.3, 36.3, 29.1, 0.3));
  pth("nf", curve(steps(28.9, 36.1, 18).map((x): Vec3 => [x, 0.1, 25.6 + 1.1 * Math.sin((x - 28.9) * 0.5) + (x - 28.9) * 0.1])));
  pth("nf lo", curve(steps(30.4, 36.1, 14).map((x): Vec3 => [x, 0.1, 25 + 2.2 * Math.exp(-((x - 33.6) ** 2) / 3.4)])));
  {
    const x0 = 44.2, x1 = 58.8, z0 = 2.6, z1 = 10.6, n = 13;
    for (const x of [x0 + 1, x1 - 1]) box(x - 0.45, 0.9, x + 0.45, 2.1, 0.3, z0 + 0.6, 0.2, 0.1, g, "");
    box(x0, 0.6, x1, 2.6, z0, z1, 0.7, 0.4);
    pth("nf lo", steps(x0 + (x1 - x0) / n, x1 - (x1 - x0) / n, n - 1).map((x) => ln([x, 2.6, z0 + 0.7], [x, 2.6, z1 - 0.7])).join("") + ln([x0 + 0.6, 2.6, z1 - 1.2], [x1 - 0.6, 2.6, z1 - 1.2]));
    cyl(x1 + 0.9, 1.6, 0.45, 0, z0 + 1.6, 0.15, g, "", 12);
    cyl(x1 + 0.9, 1.6, 0.85, z0 + 1.6, z0 + 2.6, 0.25, g, "", 16);
  }
  pth("", onY(0.05, WIN.x0 - 1.2, WIN.z0 - 0.8, WIN.x1 + 1.2, WIN.z1 + 1.2, 0.6));
  pth("", onY(0.1, WIN.x0, WIN.z0, WIN.x1, WIN.z1, 0.4));
  {
    // the casements set back in the reveal: only what shows through the opening is drawn
    const yb = -0.9, xm = (WIN.x0 + WIN.x1) / 2, zt = WIN.z1 - 5;
    pth("nf lo", ln([WIN.x0, 0.1, WIN.z0], [WIN.x0, yb, WIN.z0]) + ln([WIN.x0, yb, WIN.z0], [WIN.x0, yb, WIN.z1 - 0.8]) + ln([WIN.x0, yb, WIN.z0], [WIN.x1 - 1, yb, WIN.z0]));
    for (const [a, b] of [[WIN.x0 + 0.7, xm - 0.25], [xm + 0.25, WIN.x1 - 1.4]]) {
      pth("nf", onY(yb, a, WIN.z0 + 0.6, b, WIN.z1 - 0.9, 0.3));
      pth("nf lo", onY(yb, a + 0.8, WIN.z0 + 1.4, b - 0.8, zt - 0.5, 0.25) + onY(yb, a + 0.8, zt + 0.5, b - 0.8, WIN.z1 - 1.7, 0.25));
    }
    pth("nf", ln([xm - 1.2, yb, 21.6], [xm - 1.2, yb, 24.2]) + ln([xm + 1.2, yb, 21.6], [xm + 1.2, yb, 24.2]));
    pth("nf lo", [[WIN.x0 + 1.8, xm - 1.35], [xm + 1.35, WIN.x1 - 2.5]].map(([a, b]) => [[19.6, 1.3, 0.32], [17.4, 0.9, 0.55]].map(([z, h, f]) => curve(steps(a, b, 16).map((x): Vec3 => [x, yb, z + h * Math.sin(x * f + z)]))).join("")).join(""));
  }
  box(WIN.x0 - 1.6, 0, WIN.x1 + 1.6, 2.7, WIN.z0 - 1.3, WIN.z0 - 0.4, 0.5, 0.35);
  pth("nf lo", onY(0.05, WIN.x0 + 0.4, WIN.z0 - 2.6, WIN.x1 - 0.4, WIN.z0 - 1.3, 0.3));
  // the plant: a pot with its rim, and leaves fanning out of it, painted back to front
  {
    const px = 46.4, py = 1.35, pz = WIN.z0 - 0.4;
    frustum(px, py, 0.95, 1.3, pz, pz + 2.4, 0.32, g);
    pth("nf lo", frontArc(px, py, 1.33, pz + 1.9));
    const leaves = [[-0.5, 0.95, 4.2, 1.3], [0.4, 1.1, 4.6, 1.5], [1.25, 0.8, 3.9, 1.35], [2.2, 1.05, 4.4, 1.4], [2.95, 0.7, 3.6, 1.2], [1.7, 1.3, 3.4, 1.15], [0.95, 1.25, 4.9, 1.45]]
      .map(([a, el, L, w]) => {
        const b: Vec3 = [px, py, pz + 2.2], dir: Vec3 = [Math.cos(a) * Math.cos(el), Math.sin(a) * Math.cos(el), Math.sin(el)], side: Vec3 = [-Math.sin(a), Math.cos(a), 0];
        const mid = (t: number): Vec3 => [b[0] + dir[0] * L * t, b[1] + dir[1] * L * t, b[2] + dir[2] * L * t - 1.6 * t * t];
        const edge = (t: number, k: number): Vec3 => { const m = mid(t), h = (k * w * Math.pow(Math.sin(Math.PI * t), 0.75)) / 2; return [m[0] + side[0] * h, m[1] + side[1] * h, m[2]]; };
        const ts = steps(0, 1, 12), m = mid(0.5);
        return { depth: m[0] + m[1], d: shape(ts.map((t) => edge(t, 1)).concat(ts.slice().reverse().map((t) => edge(t, -1)))), rib: curve(steps(0.05, 0.9, 8).map(mid)) };
      }).sort((a, b) => a.depth - b.depth);
    for (const l of leaves) { pth("", l.d); pth("nf lo", l.rib); }
  }
  box(ROD.x0 + 1.4, 0, ROD.x0 + 2, ROD.y, ROD.z - 0.5, ROD.z + 0.3, 0.2, 0.1, g, "");
  box(ROD.x1 - 2, 0, ROD.x1 - 1.4, ROD.y, ROD.z - 0.5, ROD.z + 0.3, 0.2, 0.1, g, "");
  const rodRing = (x: number) => poly(circ(0.36, 14).map((q) => P(x, ROD.y + q.u, ROD.z + q.v)));
  pth("sil", poly(hull([ROD.x0, ROD.x1].flatMap((x) => circ(0.36, 14).map((q) => P(x, ROD.y + q.u, ROD.z + q.v))))));
  const curtains = [0, 1].map(() => ({ fill: pth("sil"), folds: pth("nf lo"), rings: pth("nf") }));
  for (const x of [ROD.x0, ROD.x1]) pth("sil", dot([x, ROD.y, ROD.z], 0.85));
  /** One curtain hanging from xa to xb on the rod, its fabric gathered into folds: the narrower, the deeper. */
  function hang(c: (typeof curtains)[number], xa: number, xb: number, lead: number) {
    const s = xb - xa, n = s < 6 ? 4 : 3, A = Math.min((0.8 * s) / (Math.PI * n), (CUR.wf - s) * 0.3 + 0.3);
    const y = (x: number) => CUR.y + (A * (1 - Math.cos((2 * Math.PI * n * (x - xa)) / s))) / 2;
    const xs = steps(xa, xb, 37), hem = (x: number) => CUR.hem + 0.3 * Math.sin((x - xa) * 1.7) * Math.sin((Math.PI * (x - xa)) / s);
    c.fill.setAttribute("d", shape(xs.map((x): Vec3 => [x, y(x), CUR.top]).concat(xs.slice().reverse().map((x): Vec3 => [x, y(x), hem(x)]))));
    const crest = steps(0, n - 1, n).map((k) => xa + (s * (k + 0.5)) / n);
    const trough = steps(1, n - 1, n - 1).map((k) => xa + (s * k) / n);
    const fold = (x: number, top: number, low: number) => ln([x, y(x), CUR.top - top], [x, y(x), hem(x) + low]);
    c.folds.setAttribute("d", crest.map((x) => fold(x, 0.3, 0.2)).join("") + trough.map((x) => fold(x, 3, 2.4)).join("")
      + curve(xs.map((x): Vec3 => [x, y(x), hem(x) + 0.8])) + ln([lead, CUR.y, CUR.top - 0.2], [lead, CUR.y, CUR.hem + 0.2]));
    c.rings.setAttribute("d", crest.concat([xa, xb]).map(rodRing).join(""));
  }
  const drawCurtains = (v: number) => { hang(curtains[0], ROD.x0 + 0.8, lerp(47.6, 42.4, v), lerp(47.6, 42.4, v)); hang(curtains[1], lerp(55.8, 60.6, v), ROD.x1 - 0.8, lerp(55.8, 60.6, v)); };

  /* ---------- the rug, flat on the floor ---------- */
  {
    const [x0, y0, x1, y1] = [17, 26.6, 55, 54.2], cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    box(x0, y0, x1, y1, 0, 0.3, 2.6, 0.5);
    const lz = (pts: Vec2[]) => shape(pts.map(([x, y]): Vec3 => [x, y, 0.3]));
    pth("nf lo", onZ(0.3, x0 + 2.2, y0 + 2.2, x1 - 2.2, y1 - 2.2, 1.6) + onZ(0.3, x0 + 3.1, y0 + 3.1, x1 - 3.1, y1 - 3.1, 1.2)
      + lz([[cx - 11, cy], [cx, cy - 8], [cx + 11, cy], [cx, cy + 8]]) + lz([[cx - 6.4, cy], [cx, cy - 4.7], [cx + 6.4, cy], [cx, cy + 4.7]])
      + steps(x0 + 6, x1 - 6, 7).map((x) => lz([[x - 1, y0 + 4.6], [x, y0 + 3.9], [x + 1, y0 + 4.6], [x, y0 + 5.3]]) + lz([[x - 1, y1 - 4.6], [x, y1 - 5.3], [x + 1, y1 - 4.6], [x, y1 - 3.9]])).join("")
      + steps(x0 + 1.6, x1 - 1.6, 30).map((x) => ln([x, y1, 0.15], [x + 0.15, y1 + 1.4, 0]) + ln([x, y0, 0.15], [x - 0.1, y0 - 1.3, 0])).join(""));
  }

  /* ---------- Uru, from the kit: the floor ring, the arm turned away, the body, band, patch, face, bead, the arm toward us ---------- */
  const U = uru(P, C, g, { x: UX, y: UY });

  /* ---------- the lamp: a weighted foot, its pole and switch, a drum shade with its harp, and the pull cord ---------- */
  {
    const { x, y } = LAMP;
    cyl(x, y, 2.6, 0, 0.7, 0.35);
    frustum(x, y, 1.9, 1.1, 0.7, 1.5, 0, g, "");
    cyl(x, y, 0.32, 1.5, 29, 0.1, g, "", 12);
    cyl(x, y, 0.62, 13.4, 14.6, 0.2, g, "", 16);
    frustum(x, y, 4.7, 3.1, 28.6, 35, 0.25);
    pth("nf lo", frontArc(x, y, 4.62, 29.5) + ln([x, y, 35.05], [x, y, 33.4]) + ln([x + 3.6, y + 2.4, 28.9], [x + 3.62, y + 2.42, 26.4]));
    pth("", dot([x + 3.62, y + 2.42, 26.2], 0.3));
  }

  /* ---------- the armchair: rolled arms, a tufted back, a cushion, the knitted throw over its right arm; slippers before it ---------- */
  {
    const { x0, x1, y0, y1 } = CHAIR, zb = 2.7, zs = 6.4, za = 13.2, aw = 3.8;
    for (const [lx, ly] of [[x0 + 1.6, y0 + 1.6], [x1 - 1.6, y0 + 1.6], [x0 + 1.6, y1 - 1.6], [x1 - 1.6, y1 - 1.6]]) frustum(lx, ly, 0.42, 0.62, 0, zb, 0, g, "");
    box(x0, y0, x1, y1, zb, zs, 1.6, 0.5);
    const back = solid(g);
    // the back: a camel top, its arch round above the seat
    const cx = (x0 + x1) / 2, arch = (y: number, inset: number, rise: number) => steps(0, Math.PI, 13).map((t): Vec3 => [cx + Math.cos(t) * ((x1 - x0) / 2 - inset), y, 18.4 + Math.sin(t) * rise]);
    put(back, { sil: poly(hull([...ringAt(P, rrect(x0, y0, x1, y0 + 4.4, 1.9, 4), zs), ...arch(y0 + 0.4, 0, 3).map(Q), ...arch(y0 + 4.2, 0, 3).map(Q)])), crease: curve(arch(y0 + 4.2, 0.6, 2.6).slice(1, -1)) });
    const arm = (a: number, b: number) => {
      const roll = (y: number) => circ(2.1, 18).map((q): Vec3 => [(a + b) / 2 + q.u * 1.05, y, za - 1 + q.v]);
      const m = (a + b) / 2, scroll = steps(0.2, 1, 14).map((t): Vec3 => [m + 1.4 * t * Math.cos(t * 9) * 0.55, y1 + 0.01, za - 1.3 + 1.4 * t * Math.sin(t * 9) * 0.5]);
      put(solid(g), { sil: poly(hull([...ringAt(P, rrect(a, y0 + 3, b, y1, 1, 3), zs), ...roll(y0 + 3).map(Q), ...roll(y1).map(Q)])), crease: curve(steps(0, Math.PI, 10).map((t): Vec3 => [m + Math.cos(t) * 1.9, y1 - 0.5, za - 1 + Math.sin(t) * 1.8])) });
      pth("nf lo", curve(scroll) + ln([a + 0.6, y1, zs + 0.6], [a + 0.6, y1, za - 2.6]) + ln([b - 0.6, y1, zs + 0.6], [b - 0.6, y1, za - 2.6]));
    };
    arm(x0, x0 + aw);
    box(x0 + aw, y0 + 4.4, x1 - aw, y0 + 7.2, zs + 3.2, 18.6, 1.4, 0.5, g, "");
    const tufts = [[-2.2, 16.2], [0, 15.8], [2.2, 16.2], [-1.1, 13.2], [1.1, 13.2]].map(([dx, z]): Vec3 => [(x0 + x1) / 2 + dx, y0 + 7.22, z]);
    pth("nf lo", tufts.map((t) => ln([t[0] - 0.7, t[1], t[2] + 0.7], t) + ln([t[0] + 0.7, t[1], t[2] - 0.7], t) + ln([t[0] + 0.7, t[1], t[2] + 0.6], t)).join(""));
    pth("nf", tufts.map((t) => dot(t, 0.22)).join(""));
    box(x0 + aw, y0 + 4.4, x1 - aw, y1 + 0.3, zs, zs + 3.3, 1.6, 0.6, g, "");
    pth("nf lo", ln([x0 + aw + 0.8, y1 + 0.3, zs + 1.65], [x1 - aw - 0.8, y1 + 0.3, zs + 1.65]));
    // a knitted cushion, leaning in the seat's far corner
    {
      const c: Vec3 = [x0 + aw + 2.8, y0 + 8.4, zs + 3.3], tl = -0.42, w = 4.6, hh = 4.4;
      const pt = (u: number, v: number, d: number): Vec3 => [c[0] + u, c[1] + d * Math.cos(tl) - v * Math.sin(tl) * 0.3, c[2] + v * Math.cos(tl * 0.3) + d * Math.sin(tl)];
      const out = fillet([[-w / 2, 0], [w / 2, 0], [w / 2, hh], [-w / 2, hh]], [1.4, 1.4, 1.4, 1.4], 4);
      pth("", poly(hull(out.flatMap(([u, v]) => [Q(pt(u, v, -0.6)), Q(pt(u, v, 0.6))]))));
      pth("nf lo", steps(-1.35, 1.35, 4).flatMap((u) => steps(1, hh - 1.1, 4).map((v) => curve([pt(u - 0.32, v + 0.38, 0.63), pt(u, v, 0.63), pt(u + 0.32, v + 0.38, 0.63)]))).join(""));
    }
    arm(x1 - aw, x1);
    // the throw: over the roll of the right arm and down its outside, knitted in columns of stitches, fringed at the hem
    const ty0 = 7, ty1 = 15.6, tx = x1 + 0.25, hemZ = 3.6;
    const over = (y: number) => steps(0.3, Math.PI * 0.5, 9).map((t): Vec3 => [(x1 - 2.0) + Math.cos(t) * 2.25, y, za - 1 + Math.sin(t) * 2.2]);
    const wavy = (y: number) => hemZ + 0.35 * Math.sin(y * 1.9);
    pth("sil", poly(hull([...over(ty0), ...over(ty1), [tx, ty0, za - 1], [tx, ty1, za - 1], ...steps(ty0, ty1, 12).map((y): Vec3 => [tx, y, wavy(y)])].map((q) => Q(q as Vec3)))));
    let knit = "";
    for (const y of steps(ty0 + 0.9, ty1 - 0.9, 6)) {
      for (const z of steps(hemZ + 1.4, za - 1.4, 7)) knit += curve([[tx + 0.01, y - 0.45, z + 0.55], [tx + 0.01, y, z], [tx + 0.01, y + 0.45, z + 0.55]]);
      knit += curve(over(y).slice(1, 8).map((q): Vec3 => [q[0] + 0.05, q[1], q[2] + 0.05]));
    }
    pth("nf lo", knit + curve(steps(ty0, ty1, 18).map((y): Vec3 => [tx + 0.01, y, wavy(y) + 0.9])));
    pth("nf", steps(ty0 + 0.3, ty1 - 0.3, 15).map((y) => ln([tx + 0.02, y, wavy(y)], [tx + 0.12, y + 0.1, wavy(y) - 1.5])).join(""));
    // a pair of slippers on the floor before the chair
    for (const [sx, sy, sa] of [[30.2, 23, 1.75], [34.4, 23.6, 1.45]]) {
      const outl = fillet([[-1.9, -0.9], [1.4, -1.05], [2.2, 0], [1.4, 1.05], [-1.9, 0.9]], [0.8, 1, 1.1, 1, 0.8], 3), pl = (u: number, v: number, z: number): Vec3 => [sx + u * Math.cos(sa) - v * Math.sin(sa), sy + u * Math.sin(sa) + v * Math.cos(sa), z];
      pth("", poly(hull(outl.flatMap(([u, v]) => [Q(pl(u, v, 0)), Q(pl(u * 0.96, v * 0.92, 1.1))]))));
      pth("nf lo", shape(outl.map(([u, v]) => pl(u * 0.55 - 0.65, v * 0.66, 1.12))) + curve(steps(-0.9, 0.9, 7).map((v): Vec3 => pl(0.55 + 0.6 * Math.cos(v * 1.6), v, 1.15))));
    }
  }

  /* ---------- the yarn basket by the chair: a woven basket, two balls of yarn and the needles ---------- */
  {
    const bx = 46.6, by = 22, z1 = 3.4;
    frustum(bx, by, 2.3, 2.9, 0, z1, 0.28);
    pth("nf lo", [0.9, 1.8, 2.7].map((z) => frontArc(bx, by, 2.3 + (0.6 * z) / z1 + 0.02, z)).join("") + run(disc(bx, by, 2.6, 18), front).map((q) => ln([q.u, q.v, 0.25], [bx + (q.u - bx) * 1.1, by + (q.v - by) * 1.1, z1 - 0.3])).join(""));
    for (const [cx, cy, r] of [[bx - 0.9, by - 0.5, 1.55], [bx + 0.9, by + 0.7, 1.4]]) {
      const c = Q([cx, cy, z1 + r * 0.55]);
      pth("", poly(ring2(c[0], c[1], r * C.S, r * C.S, 22)));
      pth("nf lo", [-0.5, 0, 0.5].map((k) => open(steps(-1.1, 1.1, 9).map((t): Vec2 => [c[0] + r * C.S * Math.sin(t) * Math.cos(0.7 + k), c[1] + r * C.S * (k * 0.9 + Math.cos(t) * 0.25 * Math.sin(1.2 + k))]))).join(""));
    }
    pth("nf", ln([bx - 0.4, by + 0.1, z1 + 1], [bx - 3.6, by - 1.2, z1 + 5.4]) + ln([bx - 0.1, by + 0.4, z1 + 1], [bx - 2.4, by - 2.6, z1 + 5.6]));
    pth("", dot([bx - 3.6, by - 1.2, z1 + 5.5], 0.32) + dot([bx - 2.4, by - 2.6, z1 + 5.7], 0.32));
    const yb: Vec3 = [50.6, 43.8, 1.45], c = Q(yb);
    const floor = steps(0, 1, 20).map((t): Vec3 => [lerp(bx + 3.1, yb[0] + 0.8, t) + 1.6 * Math.sin(t * Math.PI * 2.2), lerp(by + 3.4, yb[1] - 0.6, t), t > 0.45 ? 0.33 : 0.05]);
    pth("nf", curve([[bx + 0.9, by + 0.9, z1 + 0.6], [bx + 2.2, by + 2.3, z1 + 0.1], [bx + 2.6, by + 2.7, z1 - 1.2], [bx + 2.8, by + 3.0, 0.4], ...floor]));
    pth("", poly(ring2(c[0], c[1], 1.45 * C.S, 1.45 * C.S, 22)));
    pth("nf lo", [-0.45, 0.05, 0.5].map((k) => open(steps(-1.15, 1.15, 9).map((t): Vec2 => [c[0] + 1.45 * C.S * Math.sin(t) * Math.cos(0.5 + k), c[1] + 1.45 * C.S * (k * 0.85 + Math.cos(t) * 0.22)]))).join(""));
  }

  /* ---------- the bookshelf full of books, one of many; the phone on its stand on top ---------- */
  const books: Book[] = [], shelfG = mk("g", {}, g);
  /** A book, standing, its spine to the room: bands at its head and tail, a blank label, or one rule down it. */
  function drawBook(b: Book) {
    const x0 = 0.9 + hash(b.y0 * 5) * 0.5, x1 = SH.x1 - 0.5 - hash(b.y0 * 9) * 0.5, kind = Math.floor(hash(b.y0 * 13) * 3), zh = b.z1 - b.z0, ym = (b.y0 + b.y1) / 2;
    box(x0, b.y0, x1, b.y1, b.z0, b.z1, 0.22, 0.14, b.g, "");
    pth("nf lo", kind === 0 ? ln([x1, b.y0 + 0.15, b.z1 - 0.9], [x1, b.y1 - 0.15, b.z1 - 0.9]) + ln([x1, b.y0 + 0.15, b.z0 + 0.9], [x1, b.y1 - 0.15, b.z0 + 0.9])
      : kind === 1 ? onX(x1, b.y0 + 0.22, b.z0 + zh * 0.55, b.y1 - 0.22, b.z0 + zh * 0.8, 0.12) : ln([x1, ym, b.z0 + 0.8], [x1, ym, b.z1 - 0.8]), b.g);
    const pages = [0.35, 0.65].map((f) => ln([x0 + 0.4, lerp(b.y0, b.y1, f), b.z1], [x1 - 0.6, lerp(b.y0, b.y1, f), b.z1])).join("");
    pth("nf lo", onY(b.y1, x0 + 0.6, b.z0 + 0.6, x1 - 0.9, b.z1 - 0.6, 0.3) + ln([x1 - 0.5, b.y1, b.z0 + 0.4], [x1 - 0.5, b.y1, b.z1 - 0.4]) + pages, b.g);
  }
  {
    const { x1, y0, y1, top, mid } = SH;
    box(0, y0, x1, y0 + 1, 0, top - 0.8, 0.4, 0.3, shelfG);
    box(0.2, y0, x1 - 0.2, y1, 0, 1.4, 0.4, 0.3, shelfG, "");
    /** A row of standing books from a to b, a gap left from skip[0] to skip[1], from z0 to under zMax. */
    const row = (a: number, b: number, z0: number, zMax: number, seed: number, skip: [number, number]) => {
      for (let y = a, k = 0; y < b - 0.9; k++) {
        const w = 0.85 + hash(seed + k) * 0.7, hgt = zMax - z0 - 0.5 - hash(seed * 3 + k) * 2.4;
        if (y + w > skip[0] && y < skip[1]) { y = skip[1]; continue; }
        if (y + w > b) break;
        const bk: Book = { y0: y, y1: y + w, z0, z1: z0 + hgt, tw: tween(0), g: mk("g", {}, shelfG), drawn: NaN };
        books.push(bk); drawBook(bk);
        y += w + 0.1 + (hash(seed + k * 7) > 0.88 ? 0.7 : 0);
      }
    };
    row(y0 + 1.2, y1 - 1.2, 1.4, mid, 11, [y0 + 11.5, y0 + 18.6]);
    // in the lower row's gap three books lie flat
    [[0.25, 0.4], [0.5, 0], [0.15, 0.6]].forEach(([dx, dy], i) => {
      const a = y0 + 12 + dy, b = y0 + 18.2 - dy * 0.5, z = 1.4 + i * 1.05;
      box(1.1 + dx, a, x1 - 1.3 + dx, b, z, z + 1, 0.25, 0.15, shelfG, "");
      pth("nf lo", ln([x1 - 1.3 + dx, a + 0.4, z + 0.5], [x1 - 1.3 + dx, b - 0.4, z + 0.5]), shelfG);
    });
    box(0, y0 + 1, x1, y1 - 1, mid, mid + 0.8, 0.3, 0.2, shelfG);
    const zb = mid + 0.8;
    row(y0 + 1.2, y1 - 2.6, zb, top - 0.8, 29, [y1 - 10.4, y1 - 5.2]);
    // in the upper row's gap a little vase with two stems, and a book leaning against the side
    frustum(4.2, y1 - 7.8, 1.0, 0.55, zb, zb + 3.2, 0, shelfG, "");
    pth("nf", curve([[4.2, y1 - 7.8, zb + 3.1], [4.0, y1 - 8.6, zb + 5.4], [3.8, y1 - 9.5, zb + 6.8]]) + curve([[4.2, y1 - 7.8, zb + 3.1], [4.4, y1 - 6.9, zb + 5.1], [4.5, y1 - 6, zb + 6.1]]), shelfG);
    pth("", dot([3.8, y1 - 9.5, zb + 7], 0.45) + dot([4.5, y1 - 6, zb + 6.3], 0.38), shelfG);
    {
      const a = -0.32, yb = y1 - 4.8, pts: Vec3[] = [];
      for (const x of [1.2, x1 - 1.4]) for (const [dy, dz] of [[0, 0], [1.2, 0], [1.2, 6.6], [0, 6.6]]) pts.push([x, yb + dy * Math.cos(a) - dz * Math.sin(a), zb + dy * Math.sin(a) + dz * Math.cos(a)]);
      const hl = hull(pts.map(Q));
      pth("", poly(fillet(hl, hl.map(() => 0.4), 2)), shelfG);
      pth("nf lo", ln([x1 - 1.4, yb + 0.6 - 5.8 * Math.sin(a), zb + 5.8 * Math.cos(a)], [x1 - 1.4, yb + 0.6 - 0.9 * Math.sin(a), zb + 0.9 * Math.cos(a)]), shelfG);
    }
    box(0, y1 - 1, x1, y1, 0, top - 0.8, 0.4, 0.3, shelfG);
    pth("nf lo", onY(y1, 1.1, 2.2, x1 - 1.1, top - 2.2, 0.6) + onY(y1, 1.7, 2.8, x1 - 1.7, top - 2.8, 0.4), shelfG);
    box(-0.1, y0 - 0.4, x1 + 0.5, y1 + 0.4, top - 0.8, top, 0.6, 0.4, shelfG);
  }
  const phoneG = mk("g", {}, g);
  {
    const { x, y } = PHONE, z = SH.top;
    // a little framed photograph standing on the shelf
    const fx = 4.4, fy = 38.2, fa = 0.28, F = (w: number, h: number, d = 0): Vec3 => [fx + 0.6 - h * Math.sin(fa) - d, fy + w, z + h * Math.cos(fa)];
    pth("", poly(hull([[-1.7, 0], [1.7, 0], [1.7, 4.2], [-1.7, 4.2]].flatMap(([w, h]) => [Q(F(w, h)), Q(F(w, h, 0.35))]))), phoneG);
    pth("nf lo", shape([[-1.15, 0.6], [1.15, 0.6], [1.15, 3.6], [-1.15, 3.6]].map(([w, h]) => F(w, h))) + curve(steps(-1.1, 1.1, 9).map((w): Vec3 => F(w, 1.3 + 0.9 * Math.exp(-((w + 0.2) ** 2) * 2)))), phoneG);
    box(x - 1.9, y - 1.8, x + 1.7, y + 1.8, z, z + 0.55, 0.7, 0.35, phoneG, "");
    box(x - 1.7, y - 1.2, x - 0.9, y + 1.2, z + 0.5, z + 3.4, 0.35, 0.2, phoneG, "");
    box(x + 1.0, y - 1.6, x + 1.6, y + 1.6, z + 0.5, z + 1.2, 0.25, 0.15, phoneG, "");
    pth("nf lo", curve([[x - 1.6, y, z + 0.3], [x - 2.4, y + 0.8, z + 0.2], [-0.2, y + 1.6, z + 0.1], [0.25, y + 2.2, z - 0.6]]), phoneG);
  }
  // the cat's two bowls on their mat by the shelf, water in one, a few biscuits in the other
  {
    box(10.6, 47.4, 16.4, 55.4, 0, 0.12, 1.2, 0.4, g, "");
    for (const [bx, by, k] of [[12.6, 49.6, 0], [14.4, 53.2, 1]]) {
      frustum(bx, by, 1.05, 1.45, 0.12, 1.25, 0.22, g, "");
      pth("nf lo", k ? [[-0.4, -0.2], [0.3, 0.1], [-0.1, 0.45], [0.45, -0.35]].map(([dx, dy]) => dot([bx + dx, by + dy, 1.0], 0.14)).join("") : backArc(bx, by, 1.05, 0.95, 24), g);
    }
  }
  const phone = { plate: pth("sil", "", phoneG), glass: pth("nf", "", phoneG), cam: pth("nf lo", "", phoneG), dots: [0, 1, 2].map(() => mk("circle", { r: 0.62, class: "dot off" }, phoneG)) };
  /** The phone on its stand, tipped from leaning back (0) to standing up and lifted a little (1). */
  function drawPhone(v: number) {
    const ang = lerp(1.02, 0.18, v), { x, y } = PHONE, z0 = SH.top + 0.7 + v * 0.5, xb = x + 0.75;
    const F = (w: number, h: number, d: number): Vec2 => P(xb - h * Math.sin(ang) + d * Math.cos(ang), y + w, z0 + h * Math.cos(ang) + d * Math.sin(ang));
    const plate = rrect(-1.45, 0, 1.45, 5.8, 0.6, 3);
    phone.plate.setAttribute("d", poly(hull(plate.map((q) => F(q.u, q.v, 0)).concat(plate.map((q) => F(q.u, q.v, -0.45))))));
    phone.glass.setAttribute("d", poly(rrect(-1.15, 0.45, 1.15, 5.35, 0.35, 3).map((q) => F(q.u, q.v, 0.02))));
    phone.cam.setAttribute("d", poly(rrect(-0.35, 4.95, 0.35, 5.12, 0.08, 2).map((q) => F(q.u, q.v, 0.02))));
    phone.dots.forEach((el, i) => { const q = F((i - 1) * 0.75, 2.6, 0.03); el.setAttribute("cx", q[0].toFixed(2)); el.setAttribute("cy", q[1].toFixed(2)); });
  }

  /* ---------- the side table: a pedestal round table, the photo album, the cup of tea on its saucer, its steam ---------- */
  // The album lies with its spine to the window; its cover is hinged along the spine and opens up and back.
  const tableG = mk("g", {}, g), TOP = TBL.z + 0.8, PAGE = TOP + 1.25, HINGE = PAGE + 0.15, AD = ALB.y1 - ALB.y0;
  {
    const { x, y, r, z } = TBL;
    cyl(x, y, 3.6, 0, 0.8, 0.35, tableG);
    frustum(x, y, 1.6, 0.8, 0.8, 2.2, 0, tableG, "");
    cyl(x, y, 0.7, 2.2, z - 0.4, 0.2, tableG, "", 16);
    cyl(x, y, 1.6, z - 1.2, z, 0.4, tableG, "", 20);
    cyl(x, y, r, z, z + 0.8, 0.45, tableG, "sil", 48);
    pth("nf lo", frontArc(x, y, r - 1.1, z + 0.8, 48), tableG);
    const { x0, x1, y0, y1 } = ALB;
    // the back board, then the block of pages on it, set in from the board's edges, its leaves ruled along the two sides we see
    box(x0, y0, x1, y1, TOP, TOP + 0.3, 0.35, 0.2, tableG, "");
    box(x0 + 0.1, y0 + 0.25, x1 - 0.25, y1 - 0.25, TOP + 0.3, PAGE, 0.15, 0.1, tableG, "");
    pth("nf lo", steps(TOP + 0.5, PAGE - 0.2, 4).map((zz) => ln([x0 + 0.4, y1 - 0.25, zz], [x1 - 0.45, y1 - 0.25, zz]) + ln([x1 - 0.25, y0 + 0.45, zz], [x1 - 0.25, y1 - 0.45, zz])).join(""), tableG);
    // the first page: a photograph held by four corners, a hill and the sun in it
    const pz = PAGE + 0.01, px0 = x0 + 0.9, px1 = x1 - 1.05, py0 = y0 + 0.75, py1 = y1 - 0.75;
    pth("", onZ(pz, px0, py0, px1, py1, 0.12), tableG);
    pth("nf lo", onZ(pz + 0.01, px0 + 0.3, py0 + 0.3, px1 - 0.3, py1 - 0.3, 0.08)
      + curve(steps(px0 + 0.3, px1 - 0.3, 12).map((xx): Vec3 => [xx, py1 - 0.9 - 1.1 * Math.exp(-((xx - (px0 + px1) / 2 + 0.5) ** 2) / 1.6), pz + 0.02])), tableG);
    pth("nf", [[px0, py0, 1, 1], [px1, py0, -1, 1], [px0, py1, 1, -1], [px1, py1, -1, -1]].map(([cx, cy, sx, sy]) => shape([[cx - sx * 0.12, cy - sy * 0.12, pz + 0.02], [cx + sx * 0.75, cy - sy * 0.12, pz + 0.02], [cx - sx * 0.12, cy + sy * 0.75, pz + 0.02]])).join(""), tableG);
    pth("", dot([px1 - 0.85, py0 + 0.85, pz + 0.03], 0.3), tableG);
    // the ribbon marking the page: out of the leaves at the front, over the board and onto the table, its end cut in a V
    const rb = ribbon(([[x1 - 1.7, y1 - 0.25, PAGE - 0.35], [x1 - 1.66, y1 + 0.05, TOP + 0.2], [x1 - 1.55, y1 + 0.45, TOP + 0.02], [x1 - 1.4, y1 + 1.15, TOP + 0.02]] as Vec3[]).map(Q), () => 0.32 * C.S);
    const tip = rb.length / 2, notch = Q([x1 - 1.45, y1 + 0.85, TOP + 0.02]);
    pth("", poly([...rb.slice(0, tip), notch, ...rb.slice(tip)]), tableG);
  }
  const cover = { board: pth("", "", tableG), face: pth("nf lo", "", tableG) };
  /** The album's cover, hinged along the spine: shut (0) to stood open and leaning back a little (1). */
  function drawCover(v: number) {
    const th = v * 1.88, { x0, x1, y0 } = ALB;
    const pt = (x: number, dy: number, dz: number): Vec2 => P(x, y0 + dy * Math.cos(th) - dz * Math.sin(th), HINGE + dy * Math.sin(th) + dz * Math.cos(th));
    const outline = rrect(x0, 0, x1, AD, 0.35, 3);
    cover.board.setAttribute("d", poly(hull(outline.flatMap((q) => [pt(q.u, q.v, -0.15), pt(q.u, q.v, 0.15)]))));
    // the face we see: the tooled border on the outside while it lies shut, the endpaper's edge on the inside once it stands past upright
    const out = th < Math.PI / 2, dz = out ? 0.16 : -0.16, inset = out ? 0.55 : 0.3;
    const frame = rrect(x0 + inset, inset, x1 - inset, AD - inset, 0.2, 2).map((q) => pt(q.u, q.v, dz));
    cover.face.setAttribute("d", Math.abs(th - Math.PI / 2) < 0.12 ? "" : poly(frame) + (out ? poly(rrect(x0 + 1.6, 1.1, x1 - 1.6, AD - 1.1, 0.15, 2).map((q) => pt(q.u, q.v, dz))) : ""));
  }
  const saucerZ = TBL.z + 0.8, cz = saucerZ + 0.32, cupTop = cz + 2.4;
  cyl(CUP.x, CUP.y, 2.25, saucerZ, cz, 0.3, tableG, "", 40);
  pth("nf lo", ell(CUP.x, CUP.y, 1.3, cz, 32), tableG);
  pth("nf", curve([[CUP.x + 0.6, CUP.y + 1.3, cz + 0.04], [CUP.x + 1.5, CUP.y + 1.9, cz + 0.08], [CUP.x + 2.9, CUP.y + 2.5, cz + 0.18]]) + ell(CUP.x + 0.35, CUP.y + 1.1, 0.42, cz + 0.04, 12), tableG);
  const cupG = mk("g", {}, tableG);
  const handle = (t: number, k: number): Vec3 => { const rr = 1.32 + 0.12 * (1 - t) + 1.0 * Math.sin(Math.PI * t) * k; return [CUP.x + Math.cos(-0.62) * rr, CUP.y + Math.sin(-0.62) * rr, cz + 0.55 + 1.5 * (1 - t)]; };
  const cup = frustum(CUP.x, CUP.y, 1.08, 1.5, cz, cupTop, 0.16, cupG, "sil");
  pth("nf lo", backArc(CUP.x, CUP.y, 1.3, cupTop - 0.45), cupG);
  pth("sil", shape(steps(0, 1, 12).map((t) => handle(t, 1)).concat(steps(1, 0, 12).map((t) => handle(t, 0.42)))), cupG);
  const steam = [0, 1].map(() => pth("nf lo", "", tableG));
  function drawSteam(now: number, lift: number) {
    steam.forEach((el, i) => {
      const ph = (now / 3600 + i * 0.5) % 1, h0 = Math.max(0, ph * 9 - 4), h1 = Math.min(6.5, ph * 9);
      el.setAttribute("d", h1 - h0 < 0.4 ? "" : curve(steps(h0, h1, 10).map((h): Vec3 => [CUP.x + (i ? 0.4 : -0.35) + 0.45 * Math.sin(h * 0.95 + i * 2 + now / 900) * (0.3 + h / 6.5), CUP.y - 0.2 + 0.35 * Math.cos(h * 0.8 + i), cupTop + 0.6 + h + lift])));
    });
  }

  /* ---------- the cat, curled asleep on the rug: its back, the tail round its front, its head on its paws ---------- */
  const catG = mk("g", {}, g), tail = mk("path", { class: "fo" }), tailTip = mk("path", { class: "nf sil" });
  const CL = (u: number, v: number, z: number): Vec3 => { const ca = Math.cos(CAT.a), sa = Math.sin(CAT.a), k = CAT.k; return [CAT.x + (u * ca - v * sa) * k, CAT.y + (u * sa + v * ca) * k, z * k]; };
  {
    // the curled body, a loaf higher at the haunch than at the shoulder, and the stripes across its back
    const pts: Vec2[] = [];
    for (const z of steps(0, 3.1, 8)) for (let i = 0; i < 32; i++) {
      const t = (i / 32) * Math.PI * 2, k = Math.sqrt(Math.max(0, 1 - (z / (3.2 - 0.5 * Math.cos(t))) ** 2));
      pts.push(Q(CL(4.5 * k * Math.cos(t), 3.5 * k * Math.sin(t), z)));
    }
    pth("sil", poly(hull(pts)), catG);
    pth("nf lo", [-2.2, -1, 0.2, 1.3].map((u, i) => curve(steps(-0.75, 0.75, 9).map((v): Vec3 => CL(u + v * 0.7, v * 3.1, 3.05 - v * v * 1.6 - 0.18 * i)))).join("")
      + curve(steps(-2.6, 0.6, 12).map((t): Vec3 => CL(4.3 * Math.cos(t), 3.3 * Math.sin(t), 1.05))), catG);
    catG.appendChild(tail); catG.appendChild(tailTip);
  }
  {
    // the head, low on its front paws: the ears behind it, the round head, the eyes shut, the nose, the whiskers
    const hq = Q(CL(3.4, 2.2, 1.75)), hr = 1.8 * C.S * CAT.k, s = C.S * CAT.k;
    for (const [a, w] of [[-2.2, 0.36], [-0.93, 0.33]]) {
      const base = (d: number): Vec2 => [hq[0] + hr * 0.82 * Math.cos(a + d), hq[1] + hr * 0.82 * Math.sin(a + d)];
      const tip: Vec2 = [hq[0] + hr * 1.5 * Math.cos(a), hq[1] + hr * 1.5 * Math.sin(a)];
      pth("sil", poly(fillet([base(-w), tip, base(w)], [0.3 * s, 0.22 * s, 0.3 * s], 3)), catG);
      pth("nf lo", open([[hq[0] + hr * 0.95 * Math.cos(a - w * 0.5), hq[1] + hr * 0.95 * Math.sin(a - w * 0.5)], [hq[0] + hr * 1.3 * Math.cos(a), hq[1] + hr * 1.3 * Math.sin(a)], [hq[0] + hr * 0.95 * Math.cos(a + w * 0.5), hq[1] + hr * 0.95 * Math.sin(a + w * 0.5)]]), catG);
    }
    pth("sil", poly(ring2(hq[0], hq[1], hr * 1.04, hr * 0.92, 28)), catG);
    pth("nf", [[-0.62, 0.14], [0.56, 0.1]].map(([dx, dy]) => open(steps(0, Math.PI, 7).map((t): Vec2 => [hq[0] + (dx + 0.34 * Math.cos(t)) * s, hq[1] + (dy + 0.17 * Math.sin(t)) * s]))).join(""), catG);
    pth("", poly([[hq[0] - 0.17 * s, hq[1] + 0.52 * s], [hq[0] + 0.17 * s, hq[1] + 0.52 * s], [hq[0], hq[1] + 0.72 * s]]), catG);
    pth("nf lo", open([[hq[0] - 0.3 * s, hq[1] + 0.95 * s], [hq[0], hq[1] + 0.78 * s], [hq[0] + 0.3 * s, hq[1] + 0.95 * s]])
      + [-1, 1].flatMap((k) => [[0.62, -0.05], [0.66, 0.14]].map(([y, d]) => seg([hq[0] + k * 0.75 * s, hq[1] + y * s], [hq[0] + k * 1.95 * s, hq[1] + (y + d) * s]))).join(""), catG);
    // the front paws, tucked under the chin
    for (const dx of [-0.7, 0.55]) pth("sil", poly(ring2(hq[0] + dx * s, hq[1] + 1.55 * s, 0.62 * s, 0.4 * s, 16)), catG);
  }
  /**
   * The tail, round the front of the body to the chin; its tip lifts by f. It comes out from behind the haunch where
   * the body's outline is widest on screen, so its root has no end drawn: a fill, and its two edges as lines.
   */
  const tailAt = (th: number, f: number, t: number): Vec3 => CL(lerp(4.6, 4.3, t) * Math.cos(th), lerp(4.6, 4.3, t) * 0.8 * Math.sin(th) - 0.2, 0.42 + f * t * t * t * 1.8);
  const th0 = steps(-Math.PI, 0, 60).reduce((b, th) => (Q(tailAt(th, 0, 0))[0] > Q(tailAt(b, 0, 0))[0] ? th : b), -Math.PI / 2) - 0.12;
  function drawTail(f: number) {
    const line = steps(0, 1, 24).map((t) => Q(tailAt(lerp(th0, 1.05, t), f, t))), w = (t: number) => lerp(1.3, 0.95, t) * C.S * CAT.k;
    const rb = ribbon(line, w), n = line.length, tipR = fillet(rb.slice(n - 3, n + 3), [0, 0.5, 0.5, 0.5, 0.5, 0], 3);
    tail.setAttribute("d", poly(rb));
    tailTip.setAttribute("d", open(rb.slice(0, n - 3).concat(tipR, rb.slice(n + 3))) + [0.78, 0.88].map((t) => { const i = Math.round(t * (n - 1)); return seg(rb[i], rb[2 * n - 1 - i]); }).join(""));
  }

  /* ---------- a knitted pouf on the floor, the paper folded on it and a pair of reading glasses ---------- */
  {
    const { x, y, r, h } = POUF, prof = steps(0, 1, 9).map((t): [number, number] => [r * (0.86 + 0.14 * Math.sin(Math.PI * (0.15 + 0.7 * t))), h * t]);
    pth("sil", poly(hull(prof.flatMap(([rr, z]) => ringAt(P, disc(x, y, rr, 40), z)))));
    pth("nf lo", steps(0, Math.PI * 2, 25).slice(0, 24).map((t) => { const c = Math.cos(t), sn = Math.sin(t); return front({ u: 0, v: 0, nu: c, nv: sn }) ? curve(prof.slice(1, 8).map(([rr, z], i): Vec3 => [x + (rr + 0.02) * Math.cos(t + (i % 2 ? 0.05 : -0.05)), y + (rr + 0.02) * Math.sin(t + (i % 2 ? 0.05 : -0.05)), z])) : ""; }).join("")
      + frontArc(x, y, r * 0.9, h - 0.05, 40) + ell(x, y, r * 0.55, h, 28));
    pth("", dot([x, y, h + 0.05], 0.38));
    // the paper, folded in half, a little askew
    const pa = 0.5, pp = (u: number, v: number, z: number): Vec3 => [x - 0.6 + u * Math.cos(pa) - v * Math.sin(pa), y + 0.3 + u * Math.sin(pa) + v * Math.cos(pa), z];
    pth("", poly(hull([[-2.4, -1.7], [2.4, -1.7], [2.4, 1.7], [-2.4, 1.7]].flatMap(([u, v]) => [Q(pp(u, v, h + 0.1)), Q(pp(u, v, h + 0.45))]))));
    pth("nf lo", steps(-1.2, 1.1, 5).map((v, i) => ln(pp(-1.9, v, h + 0.46), pp(i % 2 ? 0.6 : 1.9, v, h + 0.46))).join("") + ln(pp(-2.4, 1.72, h + 0.3), pp(2.4, 1.72, h + 0.3)));
    // the glasses, lenses down, their arms folded
    const gl = (u: number, v: number): Vec3 => [x + 1.6 + u * Math.cos(-0.4) - v * Math.sin(-0.4), y - 1.3 + u * Math.sin(-0.4) + v * Math.cos(-0.4), h + 0.55];
    pth("", [-0.85, 0.85].map((u) => shape(steps(0, Math.PI * 2, 17).slice(0, 16).map((t) => gl(u + 0.7 * Math.cos(t), 0.5 * Math.sin(t))))).join(""));
    pth("nf", curve([gl(-0.18, 0.1), gl(0, 0.22), gl(0.18, 0.1)]) + curve([gl(-1.5, 0.1), gl(-1.3, -0.5), gl(0.4, -0.65)]) + curve([gl(1.5, 0.1), gl(1.3, -0.4), gl(-0.3, -0.55)]));
  }

  /* ---------- what the pointer can pick ---------- */
  const H2 = (pts: Vec3[]) => hull(pts.map(Q));
  const cube = (x0: number, y0: number, x1: number, y1: number, z0: number, z1: number) => H2([x0, x1].flatMap((x) => [y0, y1].flatMap((y) => [[x, y, z0], [x, y, z1]] as Vec3[])));
  const restPose: Pose = { yaw: 0.92, lean: 0.06, roll: 0, lu: -0.2, lv: -0.42, ta: 0.24, fa: 0.34, tb: 0.2, fb: 0.3, happy: 0 };
  const zones: Zone[] = [
    { name: "hello", area: H2([...steps(0, 1, 9).flatMap((t) => circ(URU.RMAX + 0.6, 24).map((q): Vec3 => [UX + q.u, UY + q.v, URU.ZT * t])), [UX, UY, URU.top]]), aim: [UX + 30, UY + 30, 30] },
    { name: "call", area: cube(0.4, PHONE.y - 3.2, SH.x1 + 0.6, PHONE.y + 3.2, SH.top, SH.top + 7.4), aim: [PHONE.x, PHONE.y, SH.top + 3] },
    { name: "book", area: cube(0, SH.y0, SH.x1 + 5.6, SH.y1, 0, SH.top), aim: [SH.x1, (SH.y0 + SH.y1) / 2, 10] },
    { name: "tea", area: cube(CUP.x - 3, CUP.y - 2.3, CUP.x + 3.8, CUP.y + 3, TBL.z - 1, cupTop + 4.5), aim: [CUP.x, CUP.y, cupTop] },
    { name: "photos", area: H2(([[-6, -6, 0], [6.6, -6.6, 0], [6.6, 4, 0], [-6, -6, 6.6], [6.6, -6.6, 6.6], [6.6, 4, 3.2], [3, 6.6, 0]] as Vec3[]).map(([dx, dy, dz]): Vec3 => [TBL.x + dx, TBL.y + dy, TBL.z + dz])), aim: [(ALB.x0 + ALB.x1) / 2, ALB.y0, PAGE] },
    { name: "window", area: cube(ROD.x0 - 1, 0, ROD.x1 + 1, CUR.y + 3, WIN.z0 - 2.6, ROD.z + 1.4), aim: [(WIN.x0 + WIN.x1) / 2, 0, 24] },
  ];
  /** The book under the pointer: the screen point met on the shelf's front face, then the book whose spine is nearest it in its row. */
  function bookAt([sx, sy]: Vec2): number {
    const O = P(SH.x1, 0, 0), ey = P(SH.x1, 1, 0), ez = P(SH.x1, 0, 1), a = ey[0] - O[0], b = ez[0] - O[0], c = ey[1] - O[1], d = ez[1] - O[1], det = a * d - b * c;
    const yy = ((sx - O[0]) * d - b * (sy - O[1])) / det, zz = (a * (sy - O[1]) - c * (sx - O[0])) / det, low = zz < SH.mid + 0.4;
    let best = -1, bd = 1e9;
    books.forEach((k, i) => { if ((k.z0 < SH.mid) !== low) return; const dd = yy < k.y0 ? k.y0 - yy : yy > k.y1 ? yy - k.y1 : 0; if (dd < bd) { bd = dd; best = i; } });
    return bd < 3.2 ? best : -1;
  }

  /* ---------- state, the two clocks, and the answer ---------- */
  const tw = Object.fromEntries(KEYS.map((k) => [k, tween(restPose[k])])) as Record<Key, Tween>;
  const objs = { cup: tween(0), cover: tween(0), curtain: tween(0), phone: tween(0) };
  const drawn = { cup: NaN, cover: NaN, curtain: NaN, phone: NaN };
  let stillMode = false, glanceAt = 0, glanceBack = 0, glances = 0, act = "rest", pick = -1, seenAt = 0, waveAt = -1e9, blinkAt = 0, blinkTwice = false, flickAt = 0, lastBreath = NaN, lastCat = NaN, lastSteam = -1e9;
  const pose = { ...restPose };
  /** The one bright mark: Uru's band at rest and when it waves, else the thing it helps with. */
  function bright(name: string) {
    U.band.setAttribute("class", name === "rest" || name === "hello" ? "hi" : "sil");
    cover.board.setAttribute("class", name === "photos" ? "hi" : "");
    cup.sil.setAttribute("class", name === "tea" ? "hi" : "sil");
    curtains.forEach((c) => c.fill.setAttribute("class", name === "window" ? "hi" : "sil"));
    phone.plate.setAttribute("class", name === "call" ? "hi" : "sil");
    books.forEach((b, i) => b.g.querySelector("path")?.setAttribute("class", name === "book" && i === pick ? "hi" : ""));
  }
  /** Uru's pose for a pick: turned toward what it helps with, its head tilted toward it, its near mitten lifted toward it. */
  function target(name: string, aim: Vec3): Pose {
    if (name === "rest") return reducedMotion() ? { ...restPose, yaw: 0.8, lu: 0, lv: 0.15, ta: 2.5, fa: 0.2, happy: 1, roll: tilt * 0.5 } : { ...restPose, roll: -tilt * 0.55 };
    if (name === "hello") return { yaw: Math.PI / 4, lean: -0.03, roll: tilt * 0.7, lu: 0, lv: 0.25, ta: 0.75, fa: 0.3, tb: 0.22, fb: 0.32, happy: 1 };
    const want = Math.atan2(aim[1] - UY, aim[0] - UX), cam = Math.PI / 4, yaw = clamp(want, cam - 0.62, cam + 0.62), dz = aim[2] - 16, side = Math.sign(want - cam) || 1;
    const lift = (s: number) => (side === -s ? [1.15, 1.5] : [0.24, 0.32]);
    const [ta, fa] = lift(1), [tb, fb] = lift(-1);
    return { yaw, lean: clamp(-dz * 0.006, -0.09, 0.1), roll: side * tilt, lu: clamp((want - yaw) * 1.6, -1.1, 1.1) + side * 0.25, lv: clamp(dz / 13, -0.7, 0.75), ta, fa, tb, fb, happy: name === "call" ? 0.6 : 0 };
  }
  function choose(name: string, sub = -1) {
    if (name === act && sub === pick) return;
    const now = performance.now(), zone = zones.find((z) => z.name === name), was = act, later = name === "rest" ? 0 : ANSWER;
    act = name; pick = sub;
    const aim: Vec3 = name === "book" && sub >= 0 ? [SH.x1, (books[sub].y0 + books[sub].y1) / 2, (books[sub].z0 + books[sub].z1) / 2] : zone ? zone.aim : [0, 0, 0];
    const to = target(name, aim);
    KEYS.forEach((k) => tset(tw[k], to[k], now, k === "lu" || k === "lv" ? 0 : k === "roll" ? STEP * 2 : k[0] === "t" || k[0] === "f" ? STEP * 3 : STEP));
    (["cup", "cover", "curtain", "phone"] as const).forEach((k, i) => { const on = name === ["tea", "photos", "window", "call"][i]; tset(objs[k], on ? 1 : 0, now, on ? later : 0); });
    books.forEach((b, i) => {
      const same = name === "book" && sub >= 0 && (b.z0 < SH.mid) === (books[sub].z0 < SH.mid), far = same ? Math.abs(i - sub) : 9;
      tset(b.tw, [1, 0.16, 0.06][far] ?? 0, now, same ? later + far * 45 : 0);
    });
    wave(phone.dots, name !== "call", 110, name === "call" ? later + 380 : 0, "off");
    if (name === "hello" && was !== "hello") waveAt = now + 120;
    bright(name);
    read.textContent = name;
    B.wake();
  }
  function hit(p: Vec2): [string, number] {
    if (act === "book" && pick >= 0) { const b = books[pick]; if (inside(p, cube(0.8, b.y0, SH.x1 + 5.6, b.y1, b.z0, b.z1))) return ["book", pick]; }
    for (const z of zones) if (inside(p, z.area)) {
      if (z.name !== "book") return [z.name, -1];
      const i = bookAt(p);
      if (i >= 0) return ["book", i];
    }
    return ["rest", -1];
  }

  /** The wave, t into it: the far mitten up and twice across, and how happy the eyes are. */
  function waving(t: number): [number, number] {
    if (t < 0 || t > WAVE) return [0, 0];
    const up = t < 320 ? Math.sin(((t / 320) * Math.PI) / 2) : t > 1150 ? Math.cos((((t - 1150) / 350) * Math.PI) / 2) : 1;
    return [up * (2.3 + (t > 320 && t < 1150 ? 0.3 * Math.sin(((t - 320) / 410) * Math.PI * 2) : 0)), clamp(Math.min(t / 150, (WAVE - 150 - t) / 150), 0, 1)];
  }
  /** How shut the eyes are: a blink every 2.8 to 6.5 seconds, one in five of them twice. */
  function blinking(now: number): number {
    if (now < blinkAt) return 0;
    const t = now - blinkAt, one = (s: number) => (s < 0 ? 0 : s < 90 ? s / 90 : s < 130 ? 1 : s < 260 ? 1 - (s - 130) / 130 : 0);
    if (t > (blinkTwice ? 560 : 260)) { blinkAt = now + 2800 + Math.random() * 3700; blinkTwice = Math.random() < 0.2; return 0; }
    return Math.max(one(t), blinkTwice ? one(t - 300) : 0);
  }
  /** Scales a group about a point on the floor, for a breath. */
  const breathe = (el: Element, at: Vec2, sx: number, sy: number) => el.setAttribute("transform", `translate(${at[0].toFixed(2)} ${at[1].toFixed(2)}) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(${(-at[0]).toFixed(2)} ${(-at[1]).toFixed(2)})`);

  const B = register(stage, (dt, now) => {
    const rm = reducedMotion();
    if (!seenAt && dt > 0) { seenAt = now; if (!rm && act === "rest") waveAt = now + 650; blinkAt = now + 2600; glanceAt = now + 7000; }
    if (rm !== stillMode && act === "rest") { const to = target("rest", [0, 0, 0]); KEYS.forEach((k) => { tw[k].from = tw[k].to = to[k]; }); }
    stillMode = rm;
    let moving = false;
    for (const k of KEYS) { pose[k] = tval(tw[k], now); if (!tdone(tw[k], now)) moving = true; }
    const [wv, happy] = rm ? [0, 0] : waving(now - waveAt);
    if (wv || happy) moving = true;
    pose.ta += wv; pose.happy = Math.max(pose.happy, happy); pose.roll += wv * 0.02;
    U.draw(pose, mixLook(LOOKS.rest, LOOKS.happy, pose.happy), rm ? 0 : blinking(now));
    if (U.step(dt)) moving = true;
    for (const k of ["cup", "cover", "curtain", "phone"] as const) {
      const v = tval(objs[k], now);
      if (!tdone(objs[k], now)) moving = true;
      if (v === drawn[k]) continue;
      drawn[k] = v;
      if (k === "cup") cupG.setAttribute("transform", `translate(0 ${(v * 2.6 * RISE).toFixed(2)})`);
      else if (k === "cover") drawCover(v);
      else if (k === "curtain") drawCurtains(v);
      else drawPhone(v);
    }
    for (const b of books) {
      const v = tval(b.tw, now);
      if (!tdone(b.tw, now)) moving = true;
      if (v !== b.drawn) { b.drawn = v; b.g.setAttribute("transform", `translate(${(v * 5 * EX[0]).toFixed(2)} ${(v * 5 * EX[1]).toFixed(2)})`); }
    }
    drawClock();
    if (rm) { if (lastSteam < 0) { lastSteam = 0; drawSteam(1500, 0); drawTail(0); } return moving; }
    // now and then, at rest, Uru glances up at whoever is looking, with a little smile, or out of the window, and back to the cat
    if (act !== "rest") glanceAt = Math.max(glanceAt, now + 6000);
    else if (seenAt && now >= glanceAt) {
      const look: Pose = glances++ % 2 ? { ...restPose, yaw: 0.5, lv: 0.35, lu: 0.7 } : { ...restPose, yaw: Math.PI / 4, lv: 0.12, lu: 0, happy: 0.55, roll: tilt * 0.4 };
      KEYS.forEach((k) => tset(tw[k], look[k], now, k === "lu" || k === "lv" ? 0 : STEP));
      glanceAt = now + 9000 + Math.random() * 5000; glanceBack = now + 2300;
    }
    if (glanceBack && now >= glanceBack) {
      glanceBack = 0;
      if (act === "rest") { const to = target("rest", [0, 0, 0]); KEYS.forEach((k) => tset(tw[k], to[k], now, k === "lu" || k === "lv" ? STEP : 0)); }
    }
    // the ambient life, each part redrawn only once it has moved enough to see: the breath, the steam, the cat's breath and its tail
    const br = Math.round(((1 - Math.cos((now / BREATH) * Math.PI * 2)) / 2) * 40) / 40;
    if (br !== lastBreath) { lastBreath = br; U.breathe(br); }
    if (now - lastSteam > 48) { lastSteam = now; drawSteam(now, tval(objs.cup, now) * 2.6); }
    const cb = Math.round(((1 - Math.cos((now / 3300) * Math.PI * 2)) / 2) * 16) / 16;
    if (cb !== lastCat) { lastCat = cb; breathe(catG, P(CAT.x, CAT.y, 0), 1 + 0.012 * cb, 1 + 0.03 * cb); }
    if (!flickAt) flickAt = now + 5000 + Math.random() * 6000;
    const ft = now - flickAt;
    if (ft >= 900) { flickAt = now + 7000 + Math.random() * 8000; drawTail(0); }
    else if (ft > 0) drawTail(Math.sin((ft / 900) * Math.PI) * (0.6 + 0.4 * Math.sin((ft / 900) * Math.PI * 3)));
    return true;
  });
  bag.add(B.unregister);

  drawCurtains(0); drawCover(0); drawPhone(0); drawTail(0);
  bright("rest");
  read.textContent = "rest";
  bag.add(pointer(stage, { move: (p) => { const [n, i] = hit(p); choose(n, i); }, leave: () => choose("rest") }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { tilt = (v * Math.PI) / 180; const a = act, s = pick; act = ""; choose(a, s); },
    destroy: bag.dispose,
  };
};
