import { Cam, circ, facing, fillet, fit, hull, open, poly, prism, proj, ringAt, rings, rrect, run, seg, type PrismPaths, type Ring, type Vec2, type Vec3 } from "../hairline/core/iso";
import { reducedMotion, tdone, tset, tval, tween, type Tween } from "../hairline/core/motion";
import { disposer, mk, pointer, put, register, replay, solid, type FigureMount, type Solid } from "../hairline/core/stage";

/**
 * Assistant desk: the open-source assistant as the desk it works at, a room
 * corner in section, its two walls and the floor slab cut and hatched. On the
 * desk the laptop with the Console open (a sidebar with the orb, a
 * conversation, the input bar with its mic button); the desk microphone with
 * its level meter, for local voice; a small card cabinet, the archive, one
 * drawer ajar; the code window on its stand and before it the checkpoint
 * stack under its rewind dial; the phone in its dock, chat bubbles rising off
 * it, for the optional bridges. On the left wall the clock and the calendar,
 * one day ringed; on the shelf over the desk a strongbox, padlocked, for the
 * restricted profiles. Under the desk the computer it runs on and a basket,
 * headphones on a hook; a chair pushed back, a rug, a coffee, a pinboard, a
 * window, a rubber plant, a high shelf of books with a trailing plant, a
 * backpack on the floor, the cables.
 *
 * The pointer picks a part: it lifts by the slider (world units), dashed
 * guides dropping to where it stood, and answers in its own way: the
 * cabinet's drawer runs out on its cards, the meter turns to the accent, a
 * new reply draws itself into the Console, the checkpoints fan apart as the
 * dial turns back, the bubbles climb, the calendar's page lifts. The others
 * ease home, staggered by their distance from the pick (rule 02). At rest the
 * Console is the bright mark. Read-outs: voice, console, memory, reminders,
 * code, channels, security.
 *
 * Ambient life is sparse: the meter ticks in phrases, the clock's hands step,
 * the caret blinks, steam rises off the coffee; under reduced motion all hold. The arrow keys walk the
 * parts in the page's order, Escape returns to rest. The hit test (rule 01)
 * walks the parts from the last painted, each by its rest hulls and the pick
 * by its target hulls too, so what is drawn on top wins.
 */

// The room: the floor W by DP on a slab SLB thick, two walls WT thick and H tall, cut at their ends; the desk top at TZ.
const W = 118, DP = 44, H = 58, WT = 3, SLB = 3.4, TZ = 26.4;
// The cabinet [x0, y0, x1, y1] and its top; the microphone; the laptop's base, its lid's height and lean.
const CAB = [6, 3.6, 25, 20.4] as const, CT = 45, MX = 30.5, MY = 22.6, LAP = [36, 11.5, 64, 29] as const, LH = 18.5, LEAN = 0.24;
// The code window's panel along x and its face; the checkpoint stack's centre; the phone's dock along x.
const MON = [67, 89] as const, MF = 8, SX = 91.2, SY = 22.4, DK = [91.4, 99.2] as const;
// The window [x0, x1, z0, z1]; on the left wall the clock (y, z, radius) and the calendar [y0, z0, y1, z1]; the shelf [x0, x1, z] and the strongbox.
const WIN = [101.6, 115.6, 29, 51] as const, CLK = [20.5, 46, 5.6] as const, CAL = [28, 22, 40.6, 42.4] as const, SH = [47, 80, 47] as const, BOX = [55, 70] as const;
// The answer: the longest lift and the stagger between parts by their distance from the pick.
const LMAX = 14, STEP = 45;

type B6 = readonly [number, number, number, number, number, number];
type Face = (a: number, b: number, d: number) => Vec2;
type UV = readonly { u: number; v: number }[];
type Part = {
  name: string; g: SVGGElement; guide: SVGPathElement; hi: Element[]; boxes: B6[]; c: Vec2; rest: number;
  up: Tween; act: Tween; du: number; da: number; anim?: (a: number) => void; pick?: () => void;
};

/** A ring turned by a radians, then moved to (x, y). */
const at = (ring: Ring, x: number, y: number, a = 0): Ring => {
  const c = Math.cos(a), s = Math.sin(a);
  return ring.map((q) => ({ u: x + q.u * c - q.v * s, v: y + q.u * s + q.v * c, nu: q.nu * c - q.nv * s, nv: q.nu * s + q.nv * c }));
};
const uv = (list: Vec2[]): UV => list.map(([u, v]) => ({ u, v }));
/** n evenly spaced values from a to b, both ends included. */
const steps = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / Math.max(1, n - 1));
/** A fixed pseudo-random number in [0, 1) for n. */
const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
/** Even-odd: whether a screen point is inside a polygon. */
function inside([x, y]: Vec2, pg: readonly Vec2[]) {
  let c = false;
  for (let i = 0, j = pg.length - 1; i < pg.length; j = i++) {
    const [xi, yi] = pg[i], [xj, yj] = pg[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/** A speech bubble's outline in its plane: a rounded rectangle with its tail standing off the bottom edge, near the left or the right. */
const bubble = (a0: number, b0: number, a1: number, b1: number, right: boolean): Vec2[] => right
  ? fillet([[a0, b0], [a1 - 3.2, b0], [a1 - 0.5, b0 - 1.6], [a1 - 1.5, b0], [a1, b0], [a1, b1], [a0, b1]], [1.2, 0.3, 0.15, 0.3, 1.2, 1.2, 1.2], 3)
  : fillet([[a0, b0], [a0 + 1.5, b0], [a0 + 0.5, b0 - 1.6], [a0 + 3.2, b0], [a1, b0], [a1, b1], [a0, b1]], [1.2, 0.3, 0.15, 0.3, 1.2, 1.2, 1.2], 3);

export const mount: FigureMount = ({ stage, svg, read }, value) => {
  const bag = disposer();
  let lift = Math.min(LMAX, value);
  const C = Cam(45, 0.5, 2.72);
  fit(C, [[-WT, -WT, -SLB], [W, -WT, -SLB], [-WT, DP, -SLB], [W, DP, -SLB], [-WT, -WT, H], [W, -WT, H], [-WT, DP, H], [BOX[0], 0, 56.4 + LMAX], [96, 10, 58 + LMAX]], 200, 162);
  const P = proj(C), front = facing(C), rise = P(0, 0, 1)[1] - P(0, 0, 0)[1];
  const root = mk("g", {}, svg);
  let cur: Element = root;

  /* ---------- the kit: everything draws into `cur`, in the order it is called, so call it back to front ---------- */
  const path = (cls: string, d = "") => mk("path", { class: cls, d }, cur);
  /** Writes a path only when it changed: in Chromium d is a style property, so each write costs a style recalc. */
  const drawn = new WeakMap<Element, string>();
  const setD = (el: Element, d: string) => { if (drawn.get(el) !== d) { drawn.set(el, d); el.setAttribute("d", d); } };
  const putD = (el: Solid, ps: PrismPaths) => { setD(el.sil, ps.sil); setD(el.cr, ps.crease); };
  const sol = (ps: PrismPaths, cls?: string): Solid => { const s = solid(cur); put(s, ps); if (cls !== undefined) s.sil.setAttribute("class", cls); return s; };
  const box = (x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, r = 0.8, b = 0.5, cls?: string) =>
    sol(prism(P, front, ...rings(x0, y0, x1, y1, r, b), z0, z1), cls);
  const disc = (cx: number, cy: number, R: number, b = 0.4, n = 28): [Ring, Ring] => [at(circ(R, n), cx, cy), at(circ(R - b, n), cx, cy)];
  const cyl = (cx: number, cy: number, R: number, z0: number, z1: number, b = 0.4, n = 28, cls?: string) => sol(prism(P, front, ...disc(cx, cy, R, b, n), z0, z1), cls);
  const turned = (cx: number, cy: number, a: number, u0: number, v0: number, u1: number, v1: number, z0: number, z1: number, r = 0.8, cls = "") =>
    sol(prism(P, front, at(rrect(u0, v0, u1, v1, r, 4), cx, cy, a), at(rrect(u0 + 0.4, v0 + 0.4, u1 - 0.4, v1 - 0.4, Math.max(0.3, r - 0.4), 4), cx, cy, a), z0, z1), cls);
  const ln = (a: Vec3, b: Vec3) => seg(P(a[0], a[1], a[2]), P(b[0], b[1], b[2]));
  const curve = (list: Vec3[]) => open(list.map((p) => P(p[0], p[1], p[2])));
  const onZ = (z: number, x0: number, y0: number, x1: number, y1: number, r = 0.5) => poly(rrect(x0, y0, x1, y1, r, 3).map((q) => P(q.u, q.v, z)));
  /** Faces: the plane x = X (a along y, b up, d out along x), y = Y (a along x, b up, d out along y), and one leaning back from a hinge. */
  const fx = (X: number): Face => (a, b, d) => P(X + d, a, b);
  const fy = (Y: number): Face => (a, b, d) => P(a, Y + d, b);
  const lean = (y: number, z: number, t: number): Face => { const s = Math.sin(t), c = Math.cos(t); return (a, b, d) => P(a, y - b * s + d * c, z + b * c + d * s); };
  /** A plate on a face, its outline from depth d0 to d1: the silhouette, and an inner ring on its front as the crease. */
  const plate = (F: Face, ring: UV, d0: number, d1: number, inner?: UV): PrismPaths => ({
    sil: poly(hull(ring.map((q) => F(q.u, q.v, d0)).concat(ring.map((q) => F(q.u, q.v, d1))))),
    crease: inner ? poly(inner.map((q) => F(q.u, q.v, d1))) : "",
  });
  const rr = (F: Face, d: number, a0: number, b0: number, a1: number, b1: number, r = 0.4) => poly(rrect(a0, b0, a1, b1, r, 3).map((q) => F(q.u, q.v, d)));
  const fl = (F: Face, d: number, a0: number, b0: number, a1: number, b1: number) => seg(F(a0, b0, d), F(a1, b1, d));
  const dot = (F: Face, d: number, a: number, b: number, r: number) => poly(at(circ(r, 12), a, b).map((q) => F(q.u, q.v, d)));
  /** Section hatch at 45° across a face, from a0 to a1 and b0 to b1. */
  const hatch = (F: Face, a0: number, a1: number, b0: number, b1: number, gap = 2.2) => {
    let d = "";
    for (let a = a0 - (b1 - b0) + gap / 2; a < a1; a += gap) {
      const s0 = Math.max(a, a0), s1 = Math.min(a + b1 - b0, a1);
      if (s1 - s0 > 0.3) d += seg(F(s0, b0 + s0 - a, 0), F(s1, b0 + s1 - a, 0));
    }
    return d;
  };

  /* ---------- the room ---------- */
  // the floor slab, cut and hatched on its near faces, its boards with their butt joints staggered
  sol(prism(P, front, ...rings(-WT, -WT, W, DP, 1, 0.6), -SLB, 0));
  path("nf lo", hatch(fy(DP), -WT, W, -SLB, 0) + hatch(fx(W), -WT, DP, -SLB, 0)
    + steps(5.5, DP - 5.5, 8).map((y, k) => ln([0, y, 0], [W, y, 0]) + steps(9 + (k % 3) * 12, W - 8, 4).map((x) => ln([x, y - 5.5, 0], [x, y, 0])).join("")).join(""));
  // a rug under the chair, its border and fringe
  box(8, 31.6, 50, 42.4, 0, 0.3, 1.6, 1.1, "lo");
  path("nf lo", [8, 50].map((x) => steps(32.8, 41.2, 9).map((y) => ln([x, y, 0.15], [x + (x < 20 ? -1.4 : 1.4), y, 0])).join("")).join("") + onZ(0.3, 10.2, 33.6, 47.8, 40.4, 0.8));
  // the walls, the back one along x and the left one along y, their cut ends hatched; skirting along both; a socket
  box(-WT, -WT, W, 0, 0, H, 0.4, 0.4);
  box(-WT, 0, 0, DP, 0, H, 0.4, 0.4);
  path("nf lo", hatch(fx(W), -WT, 0, 0, H) + hatch(fy(DP), -WT, 0, 0, H));
  box(0, 0, W, 0.7, 0, 2.6, 0.2, 0.2, "lo");
  box(0, 0.7, 0.7, DP, 0, 2.6, 0.2, 0.2, "lo");
  const FL = fx(0), FB = fy(0);
  // a socket low on the left wall, a cable from it along the skirting and under the desk
  sol(plate(FL, rrect(33, 6.4, 38.4, 10.4, 0.6, 3), 0, 0.4, rrect(33.5, 6.9, 37.9, 9.9, 0.4, 3)), "");
  path("nf lo", dot(FL, 0.42, 36.8, 8.4, 0.75));
  box(0.4, 34, 1.8, 35.6, 7.6, 9.2, 0.4, 0.2, "");
  path("nf", curve([[1.8, 34.8, 8.4], [3, 34.8, 8.2], [3.4, 34, 1], [3.4, 31, 0.3], [6, 29.4, 0.3], [9, 27, 0.3]]));
  // a small shelf high on the left wall: a row of books, one leaning, and a trailing plant in a pot
  const WS = 50.4;
  for (const y of [31.4, 41]) sol(plate(fy(y), uv(fillet([[0, WS], [3.6, WS], [0, WS - 2.8]], [0.2, 0.4, 0.2], 3)), 0, 0.6), "");
  box(0, 29.6, 4.4, 43, WS, WS + 0.8, 0.4, 0.25);
  {
    const px = 2, py = 31.6, pz = WS + 0.8;
    sol({ sil: poly(hull(ringAt(P, at(circ(1.05, 20), px, py), pz).concat(ringAt(P, at(circ(1.4, 20), px, py), pz + 2.2)))), crease: open(ringAt(P, run(at(circ(1.2, 20), px, py), front), pz + 2.2)) }, "");
    const vines = [[0.6, -1.1, 8, 0], [1.2, 0.2, 10, 1], [0.4, 1, 6.5, 2]].map(([dx, dy, L, k]) => steps(0, 1, 14).map((t): Vec3 => [px + dx * t * 1.6 + 0.3 * Math.sin(t * 5 + k), py + dy * t * 1.4 + 0.3, pz + 1.8 - L * t * t]));
    path("nf", vines.map(curve).join(""));
    const leaf = (o: Vec2, an: number) => poly(steps(0, Math.PI * 2, 15).slice(0, 14).map((t): Vec2 => {
      const u = 0.95 * C.S * (0.5 + 0.5 * Math.cos(t)), v = 0.3 * C.S * Math.sin(t) * (1 - 0.35 * Math.cos(t));
      return [o[0] + u * Math.cos(an) - v * Math.sin(an), o[1] + u * Math.sin(an) + v * Math.cos(an)];
    }));
    path("", vines.flatMap((v, k) => v.filter((_, i) => i > 1 && (i + k) % 2 === 0).map((q, i) => leaf(P(q[0], q[1], q[2]), (i + k) % 2 ? 0.7 : 2.45))).join(""));
  }
  [[34, 1.3, 5.4], [35.4, 1.1, 6.2], [36.6, 1.5, 4.8], [38.2, 1.2, 5.8]].forEach(([y, w, h]) => {
    box(0.5, y, 3.6, y + w, WS + 0.8, WS + 0.8 + h, 0.25, 0.15, "");
    path("nf lo", fl(fx(3.6), 0, y + 0.2, WS + h - 0.4, y + w - 0.2, WS + h - 0.4));
  });
  sol(plate((a, b, d) => P(0.5 + d, a + (b - WS - 0.8) * 0.3, b), rrect(40, WS + 0.8, 41.3, WS + 6.2, 0.25, 2), 0, 3), "");
  // a pinboard over the laptop, four cards pinned to it
  sol(plate(FB, rrect(27, 46.6, 45, 56.4, 0.6, 3), 0, 0.8, rrect(27.9, 47.5, 44.1, 55.5, 0.4, 3)), "");
  ([[28.8, 50.6, 33.6, 54.6], [34.6, 51.4, 39, 54.8], [39.6, 48.6, 43.4, 53.6], [30.4, 48.2, 35.4, 50.2]] as const).forEach(([a0, b0, a1, b1], k) => {
    sol(plate(FB, rrect(a0, b0, a1, b1, 0.2, 2), 0.8, 0.95), "");
    path("nf lo", steps(b1 - 1.2, b0 + 0.8, k === 3 ? 1 : 3).map((b, j) => fl(FB, 0.96, a0 + 0.6, b, a1 - 0.6 - (j % 2) * 1.2, b)).join(""));
    path("", dot(FB, 1.1, (a0 + a1) / 2, b1 - 0.5, 0.32));
  });
  // the window behind the plant: its frame, sill, mullion and transom, a roller blind half down on its cord
  const [wx0, wx1, wz0, wz1] = WIN, wm = (wx0 + wx1) / 2;
  box(wx0 - 1, 0, wx1 + 1, 2.8, wz0 - 1.3, wz0, 0.5, 0.3, "");
  sol(plate(FB, rrect(wx0, wz0, wx1, wz1, 0.6, 3), 0, 0.9, rrect(wx0 + 1.2, wz0 + 1.2, wx1 - 1.2, wz1 - 1.2, 0.4, 3)), "");
  path("nf lo", fl(FB, 0.2, wx0 + 1.2, wz0 + 1.2, wx0 + 2, wz0 + 0.4) + fl(FB, 0.2, wx1 - 1.2, wz0 + 1.2, wx1 - 2, wz0 + 0.4));
  sol(plate(FB, rrect(wm - 0.45, wz0 + 1.2, wm + 0.45, wz1 - 1.2, 0.2, 2), 0.2, 0.7), "");
  sol(plate(FB, rrect(wx0 + 1.2, (wz0 + wz1) / 2 - 0.4, wx1 - 1.2, (wz0 + wz1) / 2 + 0.4, 0.2, 2), 0.2, 0.75), "");
  sol(plate(FB, rrect(wx0 + 1.3, wz1 - 5.2, wx1 - 1.3, wz1 - 1.2, 0.2, 2), 0.8, 1), "");
  box(wx0 + 1.1, 1, wx1 - 1.1, 1.8, wz1 - 6, wz1 - 5.2, 0.3, 0.2, "");
  path("nf lo", fl(FB, 1.9, wm + 4, wz1 - 6, wm + 4, wz1 - 10.5) + fl(FB, 1.02, wx0 + 1.5, wz1 - 3, wx1 - 1.5, wz1 - 3));
  path("", dot(FB, 1.9, wm + 4, wz1 - 10.9, 0.4));

  /* ---------- the parts: each lifts as a group; its guides drop to where it stood ---------- */
  const parts: Part[] = [];
  function part(name: string, boxes: B6[], rest: number, draw: (p: Part) => void): Part {
    const guide = mk("path", { class: "dash nf" }, root), g = mk("g", {}, root);
    const xs = boxes.flatMap((b) => [b[0], b[2]]), ys = boxes.flatMap((b) => [b[1], b[3]]);
    const p: Part = { name, g, guide, hi: [], boxes, rest, c: [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2], up: tween(0), act: tween(rest), du: 0, da: NaN };
    const was = cur;
    cur = g;
    draw(p);
    cur = was;
    parts.push(p);
    return p;
  }

  // reminders: the clock, its hands stepping, and the wall calendar on its nail, its top page able to lift off the wall
  const [cy, cz, cr] = CLK, [ky0, kz0, ky1, kz1] = CAL;
  let hands: (t: number) => void = () => {};
  part("reminders", [[0, cy - cr, 2, cy + cr, cz - cr, cz + cr], [0, ky0, 1.2, ky1, kz0, kz1 + 2]], 0.12, (p) => {
    p.hi.push(sol(plate(FL, at(circ(cr, 56), cy, cz), 0, 1.6, at(circ(cr - 0.7, 56), cy, cz))).sil);
    const R = cr - 0.7, F = (r: number, a: number, d = 1.64) => FL(cy - r * Math.sin(a), cz + r * Math.cos(a), d);
    path("nf lo", steps(0, 59, 60).map((k) => (k % 5 ? seg(F(R - 0.35, (k * Math.PI) / 30), F(R - 0.75, (k * Math.PI) / 30)) : "")).join(""));
    path("nf", steps(0, 11, 12).map((k) => seg(F(R - 0.35, (k * Math.PI) / 6), F(R - (k % 3 ? 1.2 : 1.9), (k * Math.PI) / 6))).join(""));
    const hand = (len: number, w: number, tail: number) => { const el = path(""); return (a: number) => setD(el, poly([F(-tail, a), F(w, a + Math.PI / 2), F(len, a), F(w, a - Math.PI / 2)])); };
    const hr = hand(R - 2.5, 0.4, 0.7), mn = hand(R - 1.1, 0.32, 0.9), sc = path("nf lo");
    path("", dot(FL, 1.72, cy, cz, 0.42));
    hands = (t) => {
      const s = (t * Math.PI) / 30, m = ((8 + t / 60) * Math.PI) / 30, h = ((10 + (8 + t / 60) / 60) * Math.PI) / 6;
      hr(h); mn(m);
      setD(sc, seg(F(-1.5, s), F(R - 0.5, s)));
    };
    // the calendar: its cord on the nail, the pages under, the top page, which tilts off the wall, then the binding over it
    const ym = (ky0 + ky1) / 2, kb = kz1 - 2.2;
    path("nf lo", open([FL(ky0 + 1.6, kb + 1, 0.6), FL(ym, kz1 + 1.8, 0.3), FL(ky1 - 1.6, kb + 1, 0.6)]));
    path("", dot(FL, 0.4, ym, kz1 + 1.8, 0.38));
    sol(plate(FL, rrect(ky0 + 0.3, kz0 - 0.5, ky1 - 0.3, kb, 0.4, 3), 0, 0.5), "");
    path("nf lo", [0.5, 1].map((e) => fl(FL, 0.5, ky0 + 0.5 + e, kz0 - 0.5 + e * 0.5, ky1 - 0.5 - e, kz0 - 0.5 + e * 0.5)).join(""));
    const sheet = solid(cur), grid = path("nf lo"), ring = path("nf"), done = path("nf lo");
    p.hi.push(sheet.sil, ring);
    p.hi.push(sol(plate(FL, rrect(ky0, kb, ky1, kz1, 0.6, 3), 0, 1.1)).sil);
    path("nf lo", steps(ky0 + 1.2, ky1 - 1.2, 10).map((y) => fl(FL, 1.12, y, kb + 0.5, y, kz1 - 0.5)).join(""));
    const page = rrect(ky0 + 0.2, kz0, ky1 - 0.2, kb, 0.4, 3), head = rrect(ky0 + 1, kb - 5.8, ky1 - 1, kb - 0.9, 0.3, 3);
    const cols = steps(ky0 + 1, ky1 - 1, 8), rows = steps(kz0 + 1.2, kb - 6.8, 6), cw = cols[1] - cols[0], rh = rows[1] - rows[0];
    const cell = (i: number, j: number): Vec2 => [cols[i] + cw / 2, rows[j] + rh / 2], mark = at(circ(1, 16), ...cell(4, 2));
    const crossed = [[0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [0, 3], [1, 3], [2, 3]].map(([i, j]) => cell(i, j));
    p.anim = (v) => {
      const tilt = v * 0.4, c = Math.cos(tilt), sn = Math.sin(tilt), T = (a: number, b: number): Vec2 => FL(a, kb - (kb - b) * c, 0.56 + (kb - b) * sn);
      putD(sheet, { sil: poly(page.map((q) => T(q.u, q.v))), crease: poly(head.map((q) => T(q.u, q.v))) });
      setD(grid, cols.map((y) => seg(T(y, rows[0]), T(y, rows[5]))).join("") + rows.map((z) => seg(T(cols[0], z), T(cols[7], z))).join(""));
      setD(ring, poly(mark.map((q) => T(q.u, q.v))));
      setD(done, crossed.map(([a, b]) => seg(T(a - 0.5, b - 0.5), T(a + 0.5, b + 0.5))).join(""));
    };
  });

  // security: the shelf on its brackets with books at one end, and the strongbox on it, hasp shut, padlocked
  for (const x of [SH[0] + 4, SH[1] - 4]) sol(plate(fx(x), uv(fillet([[0, SH[2]], [6.2, SH[2]], [0, SH[2] - 6.2]], [0.3, 0.6, 0.3], 3)), 0, 0.8), "");
  box(SH[0], 0, SH[1], 7, SH[2], SH[2] + 1.2, 0.5, 0.3);
  const ST = SH[2] + 1.2;
  [[71.6, 1.6, 7.4], [73.4, 1.4, 8.2], [75, 2.1, 6.6], [77.3, 1.3, 7.6]].forEach(([x, w, h]) => {
    box(x, 1.2, x + w, 6.2, ST, ST + h, 0.3, 0.2, "");
    path("nf lo", fl(FB, 6.2, x + 0.2, ST + h - 1.4, x + w - 0.2, ST + h - 1.4) + fl(FB, 6.2, x + 0.2, ST + 1.2, x + w - 0.2, ST + 1.2));
  });
  part("security", [[BOX[0] - 0.4, 0.2, BOX[1] + 1.4, 7.6, ST, ST + 8.4]], 0, (p) => {
    const [x0, x1] = BOX, zl = ST + 6.2, xm = (x0 + x1) / 2;
    p.hi.push(box(x0, 0.6, x1, 7.2, ST, zl, 0.9, 0.4).sil);
    box(x1 - 0.2, 2.8, x1 + 1.2, 5, ST + 2.6, ST + 3.5, 0.3, 0.15, "");
    p.hi.push(box(x0 - 0.4, 0.2, x1 + 0.4, 7.6, zl, zl + 2.2, 1, 0.5).sil);
    const F = fy(7.2), L = fy(7.9), sr = 1.15;
    path("nf lo", [x0 + 0.4, x1 - 2.4].map((x) => rr(F, 0.02, x, ST + 0.4, x + 2, ST + 2, 0.3)).join("") + fl(F, 0.02, x0 + 3, zl - 0.7, x1 - 3, zl - 0.7));
    // the hasp hanging from the lid, its staple; the padlock's shackle through it, its body and keyway
    sol(plate(fy(7.6), rrect(xm - 1.2, zl - 3.2, xm + 1.2, zl + 1.6, 0.6, 3), 0, 0.3, rrect(xm - 0.5, zl - 2.8, xm + 0.5, zl - 1.8, 0.3, 2)), "");
    path("nf", open(steps(Math.PI, 0, 14).map((t) => L(xm + sr * Math.cos(t), zl - 3.4 + sr * 1.4 * Math.sin(t), 0.15))) + fl(L, 0.15, xm - sr, zl - 3.4, xm - sr, zl - 4.4) + fl(L, 0.15, xm + sr, zl - 3.4, xm + sr, zl - 4.4));
    p.hi.push(sol(plate(L, rrect(xm - 1.9, ST + 0.5, xm + 1.9, zl - 4.2, 1, 3), 0, 1.3, rrect(xm - 1.35, ST + 1.05, xm + 1.35, zl - 4.75, 0.7, 3))).sil);
    path("nf", dot(L, 1.32, xm, ST + 2.5, 0.36) + fl(L, 1.32, xm, ST + 2.2, xm, ST + 1.4));
  });

  // the desk: two panel legs, a modesty panel, a hanging drawer, then its top, the cable grommet in it
  box(3.4, 3, 5.8, 29, 0, TZ - 2.4, 0.5, 0.3, "");
  path("nf lo", rr(fx(5.8), 0, 6, 3, 26, TZ - 6.4, 2));
  box(5.8, 3, 94.5, 4.2, 8, TZ - 2.4, 0.4, 0.3, "lo");
  sol({ sil: poly(hull(ringAt(P, at(circ(2.9, 24), 84, 21.6), 0).concat(ringAt(P, at(circ(3.6, 24), 84, 21.6), 9)))), crease: open(ringAt(P, run(at(circ(3.2, 24), 84, 21.6), front), 9)) }, "");
  path("nf lo", steps(-0.2, 1.7, 8).map((t) => ln([84 + 2.9 * Math.cos(t), 21.6 + 2.9 * Math.sin(t), 0.6], [84 + 3.6 * Math.cos(t), 21.6 + 3.6 * Math.sin(t), 8.4])).join("") + open(ringAt(P, run(at(circ(3.25, 24), 84, 21.6), front), 4.5)));
  // the computer the assistant runs on, a small tower under the desk: its feet, the case, the front panel, the vents in its side
  {
    const [x0, x1, y0, y1, z1] = [71.4, 78.6, 6.6, 21.4, 15.6], F = fy(y1), Sd = fx(x1);
    for (const [x, y] of [[x0 + 1, y0 + 1.2], [x1 - 1, y0 + 1.2], [x0 + 1, y1 - 1.2], [x1 - 1, y1 - 1.2]]) cyl(x, y, 0.5, 0, 0.6, 0.2, 10, "");
    box(x0, y0, x1, y1, 0.6, z1, 0.9, 0.5, "");
    path("nf lo", rr(F, 0.01, x0 + 0.9, 1.4, x1 - 0.9, z1 - 0.9, 0.6) + steps(3.2, 8.6, 7).map((z) => fl(F, 0.02, x0 + 1.8, z, x1 - 1.8, z)).join("")
      + steps(y0 + 2.5, y1 - 2.5, 9).map((y) => fl(Sd, 0.01, y, 3, y, z1 - 3)).join(""));
    path("nf", dot(F, 0.03, (x0 + x1) / 2, z1 - 2.4, 0.75) + rr(F, 0.03, x0 + 2, z1 - 4.6, x0 + 3.1, z1 - 4.1, 0.15) + rr(F, 0.03, x0 + 3.6, z1 - 4.6, x0 + 4.7, z1 - 4.1, 0.15));
    path("nf lo", dot(F, 0.04, (x0 + x1) / 2, z1 - 2.4, 0.38) + curve([[x0 + 2, y0, 6], [x0 + 1.4, y0 - 2.4, 4], [x0 - 2, 4.4, 1.2], [x0 - 7, 4.6, 0.3]]));
  }
  box(68, 2.4, 92, 29.4, TZ - 7.2, TZ - 2.4, 0.6, 0.4, "");
  path("nf lo", rr(fy(29.4), 0, 69, TZ - 6.6, 91, TZ - 3, 0.5));
  path("nf", rr(fy(29.4), 0, 76, TZ - 5.3, 84, TZ - 4.3, 0.4));
  box(94.5, 3, 97, 29, 0, TZ - 2.4, 0.5, 0.3, "");
  path("nf lo", rr(fx(97), 0, 6, 3, 26, TZ - 6.4, 2));
  box(2.6, 1.2, 100, 30.4, TZ - 2.4, TZ, 1.2, 0.7);
  path("nf lo", onZ(TZ, 59.4, 2.4, 63.4, 5.2, 1.3) + onZ(TZ, 60.1, 3, 62.7, 4.6, 0.7));
  // headphones hanging from a hook under the desk's front edge: the band, the two cushioned cups
  {
    const hx = 97.2, hy = 30.6, hz = TZ - 2.6, F = fy(hy + 0.6);
    box(hx - 0.5, hy - 1.6, hx + 0.5, hy + 0.3, hz - 0.5, hz + 0.1, 0.2, 0.1, "");
    path("", poly(steps(Math.PI * 1.05, Math.PI * 1.95, 14).map((t) => F(hx + 3.2 * Math.cos(t), hz - 3.4 - 3.2 * Math.sin(t), 0)).concat(steps(Math.PI * 1.95, Math.PI * 1.05, 14).map((t) => F(hx + 2.6 * Math.cos(t), hz - 3.4 - 2.6 * Math.sin(t), 0)))));
    for (const k of [-1, 1]) sol(plate(F, rrect(hx + k * 3 - 1.1, hz - 8.4, hx + k * 3 + 1.1, hz - 4.6, 1, 3), -0.6, 0.9, rrect(hx + k * 3 - 0.6, hz - 7.9, hx + k * 3 + 0.6, hz - 5.1, 0.6, 3)), "");
  }

  // the chair, pushed back from the desk and turned a little: five-star base on casters, the gas lift, the seat, its post and back
  {
    const cx = 26, cyy = 36.4, a = Math.PI - 0.3;
    const legs = steps(0, 4, 5).map((k) => a + 0.35 + (k * Math.PI * 2) / 5).sort((p, q) => Math.sin(p + Math.PI / 4) - Math.sin(q + Math.PI / 4));
    for (const t of legs) {
      cyl(cx + 4.6 * Math.cos(t), cyy + 4.6 * Math.sin(t), 0.65, 0, 1.2, 0.25, 12, "");
      turned(cx, cyy, t, 0, -0.55, 4.9, 0.55, 1.2, 2, 0.4, "");
    }
    cyl(cx, cyy, 1.3, 1.2, 2.4, 0.3, 18, "");
    cyl(cx, cyy, 0.85, 2.4, 6.4, 0.25, 16, "");
    cyl(cx, cyy, 0.55, 6.4, 11.4, 0.2, 14, "");
    turned(cx, cyy, a, -5, -4.8, 5, 5, 11.4, 14, 2.4, "");
    path("nf lo", poly(at(rrect(-4.2, -4, 4.2, 4.2, 1.8, 4), cx, cyy, a).map((q) => P(q.u, q.v, 14.02))));
    turned(cx, cyy, a, -0.9, -5.6, 0.9, -4.4, 12.6, 18, 0.4, "");
    turned(cx, cyy, a, -4.8, -6.6, 4.8, -5.4, 16.8, 27, 2.2, "");
    path("nf lo", steps(18.8, 25, 4).map((z) => { const e = (u: number): Vec3 => { const c = Math.cos(a), sn = Math.sin(a); return [cx + u * c + 6.62 * sn, cyy + u * sn - 6.62 * c, z]; }; return ln(e(-3.4), e(3.4)); }).join(""));
  }

  // memory: the card cabinet, two columns of three drawers, the top-right one able to run out on its cards
  const [ax0, ay0, ax1, ay1] = CAB, AF = fy(ay1), ow = (ax1 - ax0 - 3 * 1.1) / 2, oh = (CT - TZ - 2.2 - 4 * 1) / 3;
  const slot = (i: number) => [ax0 + 1.1 + (i % 2) * (ow + 1.1), TZ + 2.2 + (2 - Math.floor(i / 2)) * (oh + 1)] as const;
  part("memory", [[ax0 - 0.8, ay0 - 0.8, ax1 + 0.8, ay1 + 1, TZ, CT + 1.2]], 0.28, (p) => {
    box(ax0 + 1, ay0 + 1, ax1 - 1, ay1 - 1, TZ, TZ + 1.2, 0.6, 0.3, "");
    p.hi.push(box(ax0, ay0, ax1, ay1, TZ + 1.2, CT, 1, 0.5).sil);
    path("nf lo", rr(fx(ax1), 0, ay0 + 2, TZ + 3, ay1 - 2, CT - 2, 1.2));
    path("nf", steps(0, 5, 6).map((i) => { const [x, z] = slot(i); return rr(AF, 0, x, z, x + ow, z + oh, 0.5); }).join(""));
    const pull = (F: Face, x: number, z: number) => {
      path("nf", rr(F, 0.02, x + ow / 2 - 1.7, z + oh - 1.6, x + ow / 2 + 1.7, z + oh - 0.6, 0.25));
      sol(plate(F, rrect(x + ow / 2 - 1.3, z + 0.8, x + ow / 2 + 1.3, z + 1.5, 0.35, 3), 0, 0.55), "");
    };
    for (const i of [0, 2, 3, 4, 5]) { const [x, z] = slot(i); sol(plate(AF, rrect(x + 0.2, z + 0.2, x + ow - 0.2, z + oh - 0.2, 0.5, 3), 0, 0.5)); pull(fy(ay1 + 0.5), x, z); }
    p.hi.push(box(ax0 - 0.8, ay0 - 0.8, ax1 + 0.8, ay1 + 0.8, CT, CT + 1.2, 1.4, 0.6).sil);
    const card = at(rrect(-3.4, -2.2, 3.4, 2.2, 0.3, 2), 15, 11, 0.3), F0 = (u: number, v: number): Vec2 => P(15 + u * Math.cos(0.3) - v * Math.sin(0.3), 11 + u * Math.sin(0.3) + v * Math.cos(0.3), CT + 1.26);
    path("", poly(ringAt(P, card, CT + 1.25)));
    path("nf lo", [-1.1, 0, 1.1].map((v, k) => seg(F0(-2.4, v), F0(k === 2 ? 0.4 : 2.4, v))).join(""));
    // the drawer that runs out: its box from the face, the cards standing in it, its side, its front and pull
    const [dx, dz] = slot(1), body = path("sil"), rim = path("nf lo"), cards = steps(0, 6, 7).map(() => path("")), dots = [path("dot m"), path("dot m")];
    const side = path("sil"), fr = solid(cur), hold = path("nf"), pl = solid(cur);
    const bx0 = dx + 0.8, bx1 = dx + ow - 0.8, z0 = dz + 0.4, zw = dz + oh - 1.2;
    const shapes = cards.map((_, i) => {
      const t0 = bx0 + 1 + ((i * 2) % 3) * 1.3, th = i % 3 === 1 ? 1.3 : 0.8;
      return { t0, th, line: fillet([[bx0 + 0.6, z0 + 0.4], [bx1 - 0.6, z0 + 0.4], [bx1 - 0.6, zw + 0.3], [t0 + 2.2, zw + 0.3], [t0 + 1.9, zw + 0.3 + th], [t0 + 0.3, zw + 0.3 + th], [t0, zw + 0.3], [bx0 + 0.6, zw + 0.3]], [0.3, 0.3, 0.3, 0.2, 0.3, 0.3, 0.2, 0.3], 2) };
    });
    cards.forEach((el, i) => el.setAttribute("class", i % 3 === 1 ? "sil" : ""));
    p.anim = (v) => {
      const s = 0.5 + v * 10, hf = ay1 + s, out = s > 1.2;
      setD(body, out ? prism(P, front, rrect(bx0, ay1, bx1, hf - 0.5, 0.3), null, z0, zw).sil : "");
      setD(rim, out ? poly(ringAt(P, rrect(bx0 + 0.5, ay1, bx1 - 0.5, hf - 0.9, 0.2), zw)) : "");
      let k = 0;
      cards.forEach((el, i) => {
        const y = hf - 1.6 - i * 1.25, { t0, th, line } = shapes[i], shown = out && y > ay1 + 0.3;
        setD(el, shown ? poly(line.map(([a, b]) => P(a, y, b))) : "");
        if (i % 3 === 1 && k < 2) { dots[k].setAttribute("class", v > 0.6 ? "dot" : "dot m"); setD(dots[k++], shown ? rr(fy(y), 0, t0 + 0.7, zw + th - 0.5, t0 + 1.5, zw + th + 0.1, 0.3) : ""); }
      });
      setD(side, out ? poly([P(bx1, ay1, z0), P(bx1, hf - 0.5, z0), P(bx1, hf - 0.5, zw), P(bx1, ay1, zw)]) : "");
      putD(fr, plate(fy(0), rrect(dx + 0.2, dz + 0.2, dx + ow - 0.2, dz + oh - 0.2, 0.5, 3), hf - 0.5, hf));
      setD(hold, rr(fy(hf), 0.02, dx + ow / 2 - 1.7, dz + oh - 1.6, dx + ow / 2 + 1.7, dz + oh - 0.6, 0.25));
      putD(pl, plate(fy(hf), rrect(dx + ow / 2 - 1.3, dz + 0.8, dx + ow / 2 + 1.3, dz + 1.5, 0.35, 3), 0, 0.55));
    };
    p.hi.push(fr.sil);
  });

  // voice: the microphone, its weighted base, the capsule on its neck, grille, band and the meter on its front
  const meter: SVGPathElement[] = [];
  const mic = part("voice", [[MX - 4, MY - 4, MX + 4, MY + 4, TZ, TZ + 1.4], [MX - 3, MY - 3, MX + 3, MY + 3, TZ + 1.4, TZ + 17.4]], 0, (p) => {
    path("nf lo", curve([[MX - 1.6, MY - 3.3, TZ + 0.5], [MX - 1.4, MY - 7, TZ + 0.2], [LAP[0] - 2.6, LAP[1] + 3, TZ + 0.2], [LAP[0], LAP[1] + 4, TZ + 0.7]]));
    p.hi.push(cyl(MX, MY, 3.9, TZ, TZ + 1.4, 0.6, 40).sil);
    path("nf lo", poly(ringAt(P, at(circ(1.9, 24), MX, MY), TZ + 1.4)));
    cyl(MX, MY, 0.6, TZ + 1.4, TZ + 5.2, 0.2, 14, "");
    const R = 2.75, prof: [number, number][] = [[1.7, 4.8], [2.4, 5.2], [R, 6], [R, 13.6], [2.55, 15.2], [2, 16.4], [1.1, 17.1], [0.2, 17.4]];
    p.hi.push(sol({ sil: poly(hull(prof.flatMap(([r, z]) => ringAt(P, at(circ(r, 36), MX, MY), TZ + z)))), crease: "" }).sil);
    const on = (r: number, a: number, z: number) => P(MX + r * Math.cos(a), MY + r * Math.sin(a), TZ + z);
    path("nf lo", [11.2, 12.1, 13, 13.9, 14.8, 15.7, 16.5].map((z, k) => open(ringAt(P, run(at(circ([R, R, R, R, 2.6, 2.25, 1.7][k], 36), MX, MY), front), TZ + z))).join("")
      + steps(-1.05, 1.05, 6).map((t) => open(steps(10.6, 14.4, 6).map((z) => on(z > 13.6 ? 2.7 - (z - 13.6) * 0.15 : R, Math.PI / 4 + t, z)))).join(""));
    p.hi.push(sol(prism(P, front, ...disc(MX, MY, R + 0.12, 0.12, 36), TZ + 9.7, TZ + 10.3)).sil);
    const bar = (z: number) => { const arc = (zz: number) => steps(Math.PI / 4 - 0.4, Math.PI / 4 + 0.4, 7).map((a) => on(R + 0.03, a, zz)); return poly(arc(z).concat(arc(z + 0.55).reverse())); };
    for (let k = 0; k < 5; k++) meter.push(path("dot off", bar(6.3 + k * 0.62)));
  });

  // console: the laptop, its keyboard and trackpad, the lid leaning back with the Console on its screen
  const [lx0, ly0, lx1, ly1] = LAP, LID = lean(ly0 + 0.5, TZ + 1.1, LEAN);
  let reply: SVGPathElement[] = [], caret: SVGPathElement;
  const lap = part("console", [[lx0, ly0, lx1, ly1, TZ, TZ + 1.4], [lx0, ly0 - 4.6, lx1, ly0 + 1, TZ + 1, TZ + LH + 1.2]], 0, (p) => {
    path("nf lo", curve([[lx1 - 3, ly0 + 0.4, TZ + 0.5], [lx1 - 2.4, ly0 - 4, TZ + 0.1], [61.4, 5.4, TZ + 0.1], [61.4, 3.8, TZ]]));
    sol(prism(P, front, ...rings(lx0, ly0, lx1, ly1, 1.6, 0.7), TZ, TZ + 1.3));
    const kz = TZ + 1.3, kx0 = lx0 + 2.4, kx1 = lx1 - 2.4, ky0 = ly0 + 1.6, ky1 = ly0 + 8.6, xm = (lx0 + lx1) / 2;
    path("nf", onZ(kz, kx0, ky0, kx1, ky1, 0.6) + onZ(kz, xm - 5.2, ky1 + 1.4, xm + 5.2, ly1 - 1.4, 0.7));
    path("nf lo", steps(ky0 + 1.4, ky1 - 1.4, 4).map((y) => ln([kx0 + 0.4, y, kz], [kx1 - 0.4, y, kz])).join("")
      + steps(0, 4, 5).map((r) => steps(kx0 + 1.6 + (r % 2) * 0.8, kx1 - 1.6, 12).map((x) => (r === 4 && x > kx0 + 7 && x < kx1 - 7 ? "" : ln([x, ky0 + r * 1.4 + 0.2, kz], [x, ky0 + r * 1.4 + 1.2, kz]))).join("")).join("")
      + ln([xm - 2, ly1, TZ + 0.65], [xm + 2, ly1, TZ + 0.65]));
    p.hi.push(sol(plate(LID, rrect(lx0, 0, lx1, LH, 1.6, 4), 0, 0.8, rrect(lx0 + 1.1, 1.3, lx1 - 1.1, LH - 1.1, 0.5, 3))).sil);
    const S = (a0: number, b0: number, a1: number, b1: number, r = 0.6) => rr(LID, 0.82, a0, b0, a1, b1, r);
    const L = (a0: number, b: number, a1: number) => fl(LID, 0.82, a0, b, a1, b);
    const sx = lx0 + 7.6, top = LH - 2.6, ex = lx1 - 2.2;
    path("nf lo", L(lx0 + 1.1, top, lx1 - 1.1) + fl(LID, 0.82, sx, 1.3, sx, top) + dot(LID, 0.8, xm, LH - 0.55, 0.22)
      + [10.8, 9.4, 8, 6.6].map((b, k) => L(lx0 + 2.4, b, sx - 1.4 - [0, 1.2, 0.4, 1.8][k])).join("") + S(lx0 + 2.2, 2.2, sx - 1.2, 3.6, 0.7)
      + L(ex - 7.6, 13.3, ex - 1.4) + L(sx + 2, 10.2, sx + 11.6) + L(sx + 2, 8.7, sx + 8.6) + L(ex - 5.4, 6.15, ex - 1.2));
    path("nf", dot(LID, 0.82, lx0 + 4.4, top - 2.2, 1.1) + S(sx + 1, 1.9, lx1 - 2, 3.5, 0.8) + dot(LID, 0.84, lx1 - 3.1, 2.7, 0.5)
      + S(ex - 8.6, 12.2, ex, 14.4, 0.9) + S(sx + 1, 7.6, sx + 13, 11.2, 0.9) + S(ex - 6.4, 5.4, ex, 6.9, 0.7));
    caret = path("nf", fl(LID, 0.84, sx + 2.2, 2.2, sx + 2.2, 3.2));
    reply = [path("nf trace", S(sx + 1, 4.2, sx + 10.4, 4.95, 0.35)), path("nf lo trace", L(sx + 1.8, 4.58, sx + 8.8))];
    reply.forEach((el) => el.setAttribute("pathLength", "1000"));
    p.pick = () => reply.forEach((el) => replay(el));
  });

  // the mug, its handle out to the right, coffee in it
  cyl(71, 23.4, 2.1, TZ, TZ + 4.6, 0.35, 28, "");
  path("nf lo", poly(ringAt(P, at(circ(1.6, 24), 71, 23.4), TZ + 3.8)));
  path("", poly(steps(-Math.PI / 2, Math.PI / 2, 10).map((t) => P(73 + 1.5 * Math.cos(t), 23.4, TZ + 2.6 - 1.25 * Math.sin(t)))
    .concat(steps(Math.PI / 2, -Math.PI / 2, 10).map((t) => P(73 + 0.8 * Math.cos(t), 23.4, TZ + 2.6 - 0.6 * Math.sin(t))))));
  // its steam: two wisps rising, drawn in and fading out as they climb
  const steam = [path("nf lo"), path("nf lo")];
  const drawSteam = (now: number) => steam.forEach((el, i) => {
    const ph = (now / 3400 + i * 0.5) % 1, h0 = Math.max(0, ph * 8.5 - 3.6), h1 = Math.min(6, ph * 8.5);
    setD(el, h1 - h0 < 0.4 ? "" : curve(steps(h0, h1, 9).map((h): Vec3 => [71 + (i ? 0.45 : -0.4) + 0.42 * Math.sin(h * 1.1 + i * 2 + now / 850) * (0.3 + h / 6), 23.3, TZ + 5.2 + h])));
  });

  // code: the code window on its stand, lines of code under a hunk, and the checkpoint stack under its rewind dial
  const tiles: Solid[] = [], notches: SVGPathElement[] = [];
  part("code", [[MON[0], 4.6, MON[1], 12.6, TZ, TZ + 1], [MON[0], MF, MON[1], MF + 1.4, TZ + 5, TZ + 19.4], [SX - 5, SY - 5, SX + 5, SY + 5, TZ, TZ + 9]], 0.25, (p) => {
    const mx = (MON[0] + MON[1]) / 2;
    box(mx - 5.4, 4.6, mx + 5.4, 12.6, TZ, TZ + 0.7, 1.8, 0.6, "");
    box(mx - 1.2, MF - 1.6, mx + 1.2, MF, TZ + 0.7, TZ + 12, 0.6, 0.3, "");
    const F = fy(MF), z0 = TZ + 5.2, z1 = TZ + 19.2;
    p.hi.push(sol(plate(F, rrect(MON[0], z0, MON[1], z1, 1.2, 4), 0, 1.3, rrect(MON[0] + 0.9, z0 + 1.6, MON[1] - 0.9, z1 - 0.9, 0.5, 3))).sil);
    const d = 1.32, g0 = MON[0] + 1.8, g1 = MON[0] + 3.6, rows = steps(z1 - 2.1, z0 + 2.9, 10);
    const ind = [0, 1, 2, 2, 1, 2, 3, 3, 1, 0], len = [9, 11, 8, 12, 6, 10, 7, 9, 5, 4];
    path("nf lo", rows.map((b) => fl(F, d, g0, b, g0 + 0.6, b)).join("") + fl(F, d, g1 - 0.6, z0 + 1.6, g1 - 0.6, z1 - 0.9) + fl(F, d, MON[0] + 0.9, z0 + 2.2, MON[1] - 0.9, z0 + 2.2));
    path("nf", rows.map((b, k) => fl(F, d, g1 + ind[k] * 1.5, b, g1 + ind[k] * 1.5 + len[k], b)).join("") + rr(F, d, g1 - 0.2, rows[6] - 0.7, MON[1] - 1.6, rows[5] + 0.7, 0.4)
      + steps(0, 3, 4).map((k) => dot(F, d, MON[0] + 12 + k * 2.4, z0 + 1.2, 0.34)).join(""));
    // the stack: a tray, four checkpoints, each with a notch, the dial on top
    box(SX - 5, SY - 5, SX + 5, SY + 5, TZ, TZ + 0.6, 1.6, 0.6, "");
    for (let k = 0; k < 4; k++) { tiles.push(solid(cur)); notches.push(path("nf lo")); }
    const knob = solid(cur), knurl = path("nf lo"), tick = path("nf");
    p.hi.push(knob.sil, tick);
    const tileRings = tiles.map((_, k) => rings(SX - 4.4 + k * 0.15, SY - 4.4 + k * 0.15, SX + 4.4 - k * 0.15, SY + 4.4 - k * 0.15, 1.4, 0.5));
    const knobRings = disc(SX, SY, 2.6, 0.5, 36), knurls = steps(0, 23, 24).map((k) => (k / 24) * Math.PI * 2).filter((a) => Math.cos(a - Math.PI / 4) > 0.15);
    p.anim = (v) => {
      let z = TZ + 0.85;
      tiles.forEach((t, k) => {
        const r = 4.4 - k * 0.15;
        putD(t, prism(P, front, ...tileRings[k], z, z + 0.9));
        setD(notches[k], rr(fy(SY + r), 0, SX - 1.2 + k * 0.7, z + 0.2, SX + 0.2 + k * 0.7, z + 0.7, 0.2));
        z += 0.9 + 0.3 + v * 2.6;
      });
      const zd = z - 0.05, rot = -0.7 - v * 2.4, ring = (a: number, r: number, zz: number): Vec3 => [SX + r * Math.cos(a), SY + r * Math.sin(a), zz];
      putD(knob, prism(P, front, ...knobRings, zd, zd + 1.7));
      setD(knurl, knurls.map((a) => ln(ring(a, 2.6, zd + 0.3), ring(a, 2.6, zd + 1.4))).join(""));
      setD(tick, ln(ring(rot, 0.6, zd + 1.7), ring(rot, 1.8, zd + 1.7)));
    };
  });

  // channels: the phone in its dock, a conversation on its screen, chat bubbles rising off it on a dashed thread
  const bubbles: { back: SVGPathElement; face: SVGPathElement; lines: SVGPathElement; o: Vec2[]; a0: number; a1: number; h: number; two: boolean }[] = [];
  const PL = lean(7.6, TZ + 1.5, 0.22), pa0 = DK[0] + 0.8, pa1 = DK[1] - 0.8, ph = 12.6, pm = (pa0 + pa1) / 2;
  part("channels", [[DK[0], 3, DK[1], 9.6, TZ, TZ + 14], [pm - 3.2, 9.4, pm + 11, 10.6, TZ + 13, TZ + 34]], 0.45, (p) => {
    let thread: SVGPathElement;
    box(DK[0], 3.2, DK[1], 9.6, TZ, TZ + 1.5, 1.4, 0.6, "");
    sol(plate(lean(5.4, TZ + 1.5, 0.22), rrect(DK[0] + 1.6, 0, DK[1] - 1.6, 7, 1, 3), -0.8, 0), "");
    p.hi.push(sol(plate(PL, rrect(pa0, 0, pa1, ph, 1.3, 4), 0, 0.7, rrect(pa0 + 0.45, 0.6, pa1 - 0.45, ph - 0.6, 0.9, 3))).sil);
    const S = (a0: number, b0: number, a1: number, b1: number) => rr(PL, 0.72, a0, b0, a1, b1, 0.5);
    path("nf lo", rr(PL, 0.72, pm - 1, ph - 1.3, pm + 1, ph - 0.9, 0.2) + S(pa0 + 0.9, 8.4, pm + 1.4, 10) + S(pm - 1, 6, pa1 - 0.9, 7.4) + S(pa0 + 0.9, 3.4, pm + 2, 5.2) + S(pa0 + 0.9, 1.2, pa1 - 0.9, 2.3));
    box(DK[0] + 1, 8.4, DK[1] - 1, 9.6, TZ + 1.5, TZ + 2.6, 0.5, 0.25, "");
    thread = path("dash nf");
    [[-3, 7.8, false, true], [2, 10.8, true, false], [-2.2, 8.8, false, true]].forEach(([a0, a1, right, two], k) => {
      const h = two ? 4 : 3, o = bubble(pm + (a0 as number), 0, pm + (a1 as number), h, right as boolean);
      bubbles.push({ back: path(""), face: path("sil"), lines: path("nf lo"), o, a0: pm + (a0 as number), a1: pm + (a1 as number), h, two: two as boolean });
      if (k === 0) p.hi.push(bubbles[0].face);
    });
    p.anim = (v) => {
      let z = TZ + 15.2;
      const F = fy(9.8), top = PL(pm, ph, 0.35);
      bubbles.forEach((q) => {
        setD(q.back, poly(q.o.map(([a, b]) => F(a, z + b, 0))));
        setD(q.face, poly(q.o.map(([a, b]) => F(a, z + b, 0.6))));
        setD(q.lines, fl(F, 0.62, q.a0 + 1.4, z + q.h - 1.25, q.a1 - 1.6, z + q.h - 1.25) + (q.two ? fl(F, 0.62, q.a0 + 1.4, z + 1.25, q.a1 - 3.4, z + 1.25) : ""));
        z += q.h + 2.2 + v * 2.4;
      });
      setD(thread, open([top, P(pm, 5.2, z - 3)]));
    };
  });

  // the plant in the far corner: a pot on its saucer, and a rubber plant's broad leaves on two stems, painted back to front
  {
    const cx = 109.5, cyy = 10;
    cyl(cx, cyy, 5.1, 0, 0.6, 0.4, 32, "");
    sol({ sil: poly(hull(ringAt(P, at(circ(3.4, 28), cx, cyy), 0.6).concat(ringAt(P, at(circ(4.4, 28), cx, cyy), 8)))), crease: "" }, "");
    cyl(cx, cyy, 4.7, 8, 9.4, 0.5, 32, "");
    path("nf lo", poly(ringAt(P, at(circ(3.9, 28), cx, cyy), 9.2)));
    const stems = [[0.5, -0.6, 21], [-0.7, 0.7, 16], [0.9, 0.9, 12]] as const;
    path("nf", stems.map(([dx, dy, h]) => curve(steps(0, 1, 8).map((t): Vec3 => [cx + dx * t * 2 + 0.4 * Math.sin(t * 3), cyy + dy * t * 2, 9 + h * t]))).join(""));
    const leaves = steps(0, 17, 18).map((k) => {
      const st = stems[k % 3], t = 0.3 + (0.7 * Math.floor(k / 3)) / 5, a = k * 2.35 + 0.6, el = 0.2 + hash(k) * 0.45, L = 7.4 - t * 2.4 + hash(k + 4) * 1.6, w = L * 0.5;
      const b: Vec3 = [cx + st[0] * t * 2, cyy + st[1] * t * 2, 9 + st[2] * t], dir: Vec3 = [Math.cos(a) * Math.cos(el), Math.sin(a) * Math.cos(el), Math.sin(el)], side: Vec3 = [-Math.sin(a), Math.cos(a), 0];
      const mid = (u: number): Vec3 => [b[0] + dir[0] * L * u, b[1] + dir[1] * L * u, b[2] + dir[2] * L * u - 1.6 * u * u];
      const edge = (u: number, sg: number): Vec3 => { const m = mid(u), hw = (sg * w * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.05)), 0.7)) / 2; return [m[0] + side[0] * hw, m[1] + side[1] * hw, m[2] + 0.25 * sg * hw]; };
      const us = steps(0, 1, 13), m = mid(0.5);
      return { depth: m[0] + m[1] + m[2] * 0.1, d: poly(us.map((u) => P(...edge(u, 1))).concat(us.slice().reverse().map((u) => P(...edge(u, -1))))), rib: curve(steps(0.04, 0.9, 8).map(mid)) };
    }).sort((p, q) => p.depth - q.depth);
    for (const l of leaves) { path("", l.d); path("nf lo", l.rib); }
  }

  // a backpack dropped on the floor by the desk, leaning back: its body, the front pocket and its zip, the top handle, a strap
  {
    const bx = 101.5, by = 36, lean = 0.22, B3 = (u: number, v: number, z: number): Vec3 => [bx + u, by + v - z * Math.sin(lean), z * Math.cos(lean)];
    const shell = (inset: number, z: number) => rrect(-3.6 + inset, -2 + inset, 3.6 - inset, 2 + inset * 0.2, 1.6 - inset * 0.4, 4).map((q): Vec2 => P(...B3(q.u, q.v, z)));
    sol({ sil: poly(hull(shell(0, 0.2).concat(shell(0.5, 8.6), shell(1.6, 10.6)))), crease: "" }, "");
    const Fp = (u: number, z: number, d = 0): Vec2 => P(...B3(u, 2.05 + d, z));
    sol({ sil: poly(hull(rrect(-2.6, 0.9, 2.6, 5.4, 1.2, 4).flatMap((q) => [Fp(q.u, q.v), Fp(q.u, q.v, 0.9)]))), crease: open(steps(-2.1, 2.1, 9).map((u) => Fp(u, 4.6, 0.92))) }, "");
    path("nf dash", open(steps(-3.1, 3.1, 13).map((u) => Fp(u, 8.2 - 0.25 * u * u * 0.2, -0.05))));
    path("nf", curve(steps(0, Math.PI, 9).map((t): Vec3 => B3(1.4 * Math.cos(t), 0, 10.6 + 1.2 * Math.sin(t)))) + curve([B3(-3.5, 1.2, 9), B3(-4.1, 1.6, 6), B3(-3.9, 2.2, 1.4)]));
  }

  /* ---------- the answer ---------- */
  const corners = (b: B6): Vec2[] => hull([b[0], b[2]].flatMap((x) => [b[1], b[3]].flatMap((y) => [P(x, y, b[4]), P(x, y, b[5])])));
  const rests = parts.map((p) => p.boxes.map(corners));
  let picked = -1;
  /**
   * What is drawn on top wins: the parts from the last painted, each by its rest hulls, the pick by those and the same
   * hulls at its target lift too (a lift is a shift up the screen). Stable (rule 01): the pointer that made the pick is
   * in its rest hulls, which stay in its target, and no part's hulls move with the pose on screen.
   */
  const hit = ([x, y]: Vec2) => {
    for (let i = parts.length - 1; i >= 0; i--) {
      const dy = i === picked ? -parts[i].up.to * rise : 0;
      if (rests[i].some((h) => inside([x, y], h) || (dy > 0 && inside([x, y + dy], h)))) return i;
    }
    return -1;
  };
  const restMark = parts.indexOf(lap), voice = parts.indexOf(mic);

  /** Redraws a part's guides: its rest footprint, and from its three outer corners up to where it hangs now. */
  function guides(p: Part, u: number) {
    const b = p.boxes[0];
    setD(p.guide, u < 0.8 ? "" : [[b[0], b[3]], [b[2], b[3]], [b[2], b[1]]].map(([x, y]) => ln([x, y, b[4]], [x, y, b[4] + u - 0.6])).join("") + poly([[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]].map(([x, y]) => P(x, y, b[4] + 0.05))));
  }

  // The ambient clocks: the meter's level in phrases of speech, stepping every 110ms; the clock from 10:08:30; the caret.
  // Under reduced motion the meter holds three bars, the clock 10:08:30 and the caret stays drawn.
  let step = -1, second = -1, born = -1, shown = -1, blink = -1, steamAt = -1e9;
  const level = (k: number, live: boolean) => {
    const phase = ((k % 38) + 38) % 38;
    if (!live && phase >= 17) return hash(k) < 0.25 ? 1 : 0;
    return 1 + Math.floor(hash(k) * (live ? 4.6 : 3.8) * Math.sin((Math.min(1, phase / 3 + 0.2) * Math.PI) / 2));
  };
  const showMeter = (n: number) => {
    if (n + (picked === voice ? 10 : 0) === shown) return;
    shown = n + (picked === voice ? 10 : 0);
    meter.forEach((el, k) => el.setAttribute("class", k < n ? (picked === voice ? "dot" : "dot m") : "dot off"));
  };

  const B = register(stage, (_dt, now) => {
    let moving = false;
    for (const p of parts) {
      const u = tval(p.up, now), a = tval(p.act, now);
      if (u !== p.du) { p.du = u; p.g.setAttribute("transform", u ? `translate(0 ${(u * rise).toFixed(2)})` : ""); guides(p, u); }
      if (a !== p.da) { p.da = a; p.anim?.(a); }
      if (!tdone(p.up, now) || !tdone(p.act, now)) moving = true;
    }
    if (born < 0) born = now;
    if (reducedMotion()) {
      if (second !== 0) { second = 0; hands(30); drawSteam(1700); }
      if (step !== 0) { step = 0; showMeter(3); caret.setAttribute("class", "nf"); }
      return moving;
    }
    const k = Math.floor(now / 110), s = Math.floor((now - born) / 1000);
    if (k !== step) { step = k; showMeter(level(k, picked === voice)); }
    if (s !== second) { second = s; hands(30 + s); }
    if (now - steamAt > 48) { steamAt = now; drawSteam(now); }
    const c = Math.floor(now / 530) % 2;
    if (c !== blink) { blink = c; caret.setAttribute("class", c ? "nf lo" : "nf"); }
    return true;
  });
  bag.add(B.unregister);

  /** Picks part a (-1 is rest): it lifts and answers, the others ease home, staggered out from it by distance. */
  function choose(a: number, force = false) {
    if (a === picked && !force) return;
    const now = performance.now(), from = a >= 0 ? a : picked, fresh = a !== picked;
    const far = (p: Part) => (from < 0 ? 0 : Math.hypot(p.c[0] - parts[from].c[0], p.c[1] - parts[from].c[1]));
    const rank = parts.map((p) => parts.filter((o) => far(o) < far(p)).length);
    picked = a;
    parts.forEach((p, i) => {
      tset(p.up, i === a ? lift : 0, now, rank[i] * STEP);
      tset(p.act, a < 0 ? p.rest : i === a ? 1 : 0, now, rank[i] * STEP);
      p.hi.forEach((el) => el.classList.toggle("hi", i === (a < 0 ? restMark : a)));
    });
    if (a >= 0 && fresh) parts[a].pick?.();
    showMeter(reducedMotion() ? 3 : level(step, a === voice));
    read.textContent = a < 0 ? "rest" : parts[a].name;
    B.wake();
  }
  choose(-1, true);
  bag.add(pointer(stage, { move: (q) => choose(hit(q)), leave: () => choose(-1) }));
  // The keyboard walks the parts in the story's order; Escape, or leaving the figure, puts it back to rest.
  const story = ["voice", "console", "memory", "code", "reminders", "channels", "security"].map((n) => parts.findIndex((p) => p.name === n));
  bag.on(stage, "keydown", (e) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0, at = story.indexOf(picked);
    if (dir) { e.preventDefault(); choose(story[at < 0 ? (dir > 0 ? 0 : story.length - 1) : (at + dir + story.length) % story.length]); }
    else if (e.key === "Escape") choose(-1);
  });
  bag.on(stage, "blur", () => choose(-1));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { lift = Math.min(LMAX, v); if (picked >= 0) choose(picked, true); },
    destroy: bag.dispose,
  };
};
