import {
  Cam, circ, clamp, facing, fillet, fit, hull, lerp, open, poly, prism, proj, rad, ringAt, rings, rrect, seg,
  type Ring, type Vec2, type Vec3,
} from "../hairline/core/iso";
import { reducedMotion, tdone, tset, tval, tween, type Tween } from "../hairline/core/motion";
import { disposer, mk, pointer, put, register, solid, type FigureMount } from "../hairline/core/stage";
import { faceMarks, hash, LOOKS, mixLook, POSE, ring2, steps, uru, URU, type Look, type LookName } from "./uru-kit";

/**
 * Uru's faces: a corner of a room in section, its wall and floor cut and
 * hatched where they are cut. Along the wall a sideboard, and standing on it
 * five framed portraits of Uru's face, one expression each, in frames of five
 * shapes, turned a little to the room the way photographs stand: happy in a
 * square frame, curious in a round one, listening in a tall one with a mat,
 * thinking under an arched top, sleepy in an oval. The portraits are line
 * work. Beside the sideboard, on a braided rug, Uru itself, whose face is the
 * drawing's one dark solid. On the sideboard a plant at the far end; on the
 * wall a dado rail, the skirting and a socket.
 *
 * The pointer picks a portrait: it rises off the sideboard by the slider (world
 * units), stands up straight and turns square to us, and takes the bright
 * stroke; its neighbours rise less by distance, staggered outwards (rule 02).
 * Uru turns a little toward it and morphs into that expression over the 700ms
 * lift curve: the eyes reshape, the cheeks swell or shrink, the head tilts or
 * leans and the lantern bead stands up or droops, as section 6.3 says. At rest
 * Uru wears its plain dome eyes and its knit band is bright; it breathes,
 * blinks now and then, and every so often glances along its portraits. Under
 * reduced motion it holds still and changes expression at once. The read-out
 * names the expression.
 *
 * The hit test (rule 01) is each portrait's fixed hull of its rest and lifted
 * poses, nearest first, so nothing moves out from under the pointer.
 */

const NAMES: readonly LookName[] = ["happy", "curious", "listening", "thinking", "sleepy"];
// The room: the wall along x from 0 to RW, WT thick and cut at H; the floor RD deep on a slab SL thick.
const RW = 73, RD = 24, WT = 2.4, H = 28, SL = 3;
// Uru: where it stands and at what scale; its rug's radius.
const UX = 8.4, UY = 12.8, US = 1.12, RUG = 10.8;
// The sideboard: along the wall from SX0 to SX1, SD deep, its top at TOP; its legs' height.
const SX0 = 22, SX1 = 71, SD = 10.4, TOP = 13.2, LEG = 2.8;
type Kind = "square" | "round" | "tall" | "arch" | "oval";
/** Each portrait: its frame, width and height, where it stands on the sideboard, and how it is turned (degrees off square). */
const FRAMES: { kind: Kind; w: number; h: number; x: number; y: number; turn: number }[] = [
  { kind: "square", w: 8.4, h: 8.4, x: 27.2, y: 4.6, turn: -12 },
  { kind: "round", w: 8.2, h: 8.2, x: 37.4, y: 5.3, turn: 7 },
  { kind: "tall", w: 7.6, h: 10.2, x: 47.2, y: 4.4, turn: -5 },
  { kind: "arch", w: 8, h: 10, x: 57, y: 5.2, turn: 10 },
  { kind: "oval", w: 7.4, h: 9.2, x: 66.4, y: 4.8, turn: -9 },
];
// The answer: how far a portrait leans back at rest, the share of the rise by distance, the stagger, the largest rise.
const LEAN = 13, SHARE = [1, 0.3, 0.1], STEP = 45, MAX = 7;

/** A frame's outline in its own plane (a across, b up from its foot), inset by m: convex, so a solid is the hull of two. */
function outline(kind: Kind, w: number, h: number, m: number): Vec2[] {
  const hw = w / 2 - m, hh = h / 2 - m, cb = h / 2;
  if (kind === "round") return ring2(0, cb, hw, hw, 48);
  if (kind === "oval") return ring2(0, cb, hw, hh, 48);
  if (kind === "arch") {
    const top = h - m - hw, pts: Vec2[] = [[-hw, m], [hw, m]];
    for (const t of steps(0, Math.PI, 17)) pts.push([hw * Math.cos(t), top + hw * Math.sin(t)]);
    return fillet(pts, pts.map((_, i) => (i < 2 ? 0.5 : 0)), 3);
  }
  return fillet([[-hw, m], [hw, m], [hw, h - m], [-hw, h - m]], [0.5, 0.5, 0.5, 0.5].map((r) => r + (kind === "square" ? 0.2 : 0)), 3);
}

type Frame = {
  g: SVGGElement; sil: SVGPathElement; cr: SVGPathElement; mat: SVGPathElement; win: SVGPathElement; eyes: SVGPathElement; cheeks: SVGPathElement;
  guide: SVGPathElement; strut: SVGPathElement; tw: Tween; drawn: number; area: Vec2[];
};

export const mount: FigureMount = ({ stage, svg, read }, value) => {
  const bag = disposer();
  let rise = clamp(value, 0, MAX), act = -1;
  const C = Cam(45, 0.5, 4.6);
  fit(C, [[-WT, -WT, H], [RW, -WT, H], [-WT, RD, -SL], [RW, RD, -SL], [RW, -WT, -SL], [-WT, -WT, -SL], [UX, UY, URU.top * US]], 200, 162);
  const P = proj(C), front = facing(C);
  const g = mk("g", {}, svg);

  /* ---------- the pen ---------- */
  const Q = (p: Vec3) => P(p[0], p[1], p[2]);
  const pth = (cls: string, d = "", into: Element = g) => mk("path", { class: cls, d }, into);
  const ln = (a: Vec3, b: Vec3) => seg(Q(a), Q(b));
  const at = (ring: Ring, x: number, y: number): Ring => ring.map((q) => ({ ...q, u: q.u + x, v: q.v + y }));
  const box = (x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, r = 0.6, b = 0.4, cls = "sil") => {
    const s = solid(g); put(s, prism(P, front, ...rings(x0, y0, x1, y1, r, b), z0, z1)); s.sil.setAttribute("class", cls); return s;
  };
  const onY = (Y: number, x0: number, z0: number, x1: number, z1: number, r = 0.4) => poly(rrect(x0, z0, x1, z1, r, 3).map((q) => P(q.u, Y, q.v)));
  const onX = (X: number, y0: number, z0: number, y1: number, z1: number, r = 0.4) => poly(rrect(y0, z0, y1, z1, r, 3).map((q) => P(X, q.u, q.v)));
  /** Section hatch at 45° across the plane y = c (or x = c), from a0 to a1 and z0 to z1. */
  function hatch(axis: "x" | "y", c: number, a0: number, a1: number, z0: number, z1: number, gap = 1.7) {
    const h = z1 - z0, p = (a: number, z: number): Vec3 => (axis === "y" ? [a, c, z] : [c, a, z]);
    let d = "";
    for (let a = a0 - h + gap / 2; a < a1; a += gap) {
      const s0 = Math.max(a, a0), s1 = Math.min(a + h, a1);
      if (s1 - s0 > 0.3) d += ln(p(s0, z0 + (s0 - a)), p(s1, z0 + (s1 - a)));
    }
    return d;
  }

  /* ---------- the room: the slab, its boards, the wall cut and hatched, skirting, a dado rail, a socket ---------- */
  box(-WT, -WT, RW, RD, -SL, 0, 0.6, 0.4);
  pth("nf lo", hatch("y", RD, -WT + 0.4, RW - 0.4, -SL + 0.3, -0.3) + hatch("x", RW, -WT + 0.4, RD - 0.4, -SL + 0.3, -0.3));
  let boards = "";
  for (let y = 3.9, k = 0; y < RD - 0.3; y += 3.9, k++) {
    boards += ln([0, y, 0], [RW, y, 0]);
    for (let x = 4 + hash(k) * 14; x < RW - 2; x += 16 + hash(k * 5 + x) * 9) boards += ln([x, y - 3.6, 0], [x, y - 0.2, 0]);
  }
  pth("nf lo", boards);
  box(-WT, -WT, RW, 0, 0, H, 0.5, 0.45);
  box(-WT, 0, 0, 6, 0, H, 0.5, 0.45);
  pth("nf lo", hatch("x", RW, -WT + 0.3, -0.3, 0.4, H - 0.4, 1.5) + hatch("y", 6, -WT + 0.3, -0.3, 0.4, H - 0.4, 1.5));
  box(0, 0, RW, 0.55, 0, 1.8, 0.2, 0.2, "");
  box(0, 0.55, 0.55, 6, 0, 1.8, 0.2, 0.2, "");
  box(0, 0, RW, 0.5, 10.6, 11.4, 0.2, 0.15, "");
  pth("nf lo", steps(2.2, RW - 14.6, 5).map((x) => onY(0.05, x, 3.2, x + 12.2, 9.2, 0.5)).join("") + onX(0.05, 1.4, 3.2, 4.8, 9.2, 0.5));
  // a picture rail along the wall, and between it and the dado a faint papered diamond, staggered
  box(0, 0, RW, 0.45, H - 3.4, H - 2.8, 0.15, 0.1, "");
  pth("nf lo", steps(13.2, H - 5, 4).flatMap((z, j) => steps(3 + (j % 2) * 2.2, RW - 2, 16).map((x) =>
    poly([[x - 0.45, z], [x, z + 0.55], [x + 0.45, z], [x, z - 0.55]].map(([a, b]): Vec2 => P(a, 0.04, b))))).join(""));
  pth("", onY(0.05, 15.4, 4, 17.8, 6.4, 0.4));
  pth("nf lo", onY(0.1, 16, 5.6, 16.2, 6, 0.08) + onY(0.1, 17, 5.6, 17.2, 6, 0.08));

  /* ---------- the braided rug, and Uru on it ---------- */
  {
    const c = [UX, UY + 0.8] as const;
    put(solid(g), prism(P, front, at(circ(RUG, 72), c[0], c[1]), at(circ(RUG - 0.8, 72), c[0], c[1]), 0, 0.35));
    pth("nf lo", [RUG - 2.2, RUG - 3.8, RUG - 5.4].map((r) => poly(ringAt(P, at(circ(r, 64), c[0], c[1]), 0.35))).join("")
      + steps(0, Math.PI * 2, 61).slice(0, 60).map((t, i) => { const r0 = RUG - 0.9 - (i % 2) * 0.2; return ln([c[0] + r0 * Math.cos(t), c[1] + r0 * Math.sin(t), 0.35], [c[0] + (r0 - 1) * Math.cos(t + 0.05), c[1] + (r0 - 1) * Math.sin(t + 0.05), 0.35]); }).join(""));
  }
  const U = uru(P, C, g, { x: UX, y: UY, s: US });

  /* ---------- the sideboard: tapered legs, its body and top, two drawers and a caned door between them ---------- */
  {
    const y1 = SD, zb = LEG + 0.4;
    for (const [x, y] of [[SX0 + 1.4, 1.6], [SX1 - 1.4, 1.6], [SX0 + 1.4, y1 - 1.4], [SX1 - 1.4, y1 - 1.4]]) {
      put(solid(g), { sil: poly(hull(ringAt(P, at(circ(0.35, 12), x + 0.15, y + 0.15), 0).concat(ringAt(P, at(circ(0.6, 12), x, y), LEG + 0.4)))), crease: "" });
    }
    box(SX0 + 0.4, 0.4, SX1 - 0.4, y1 - 0.4, zb - 0.5, zb, 0.5, 0.3, "");
    box(SX0, 0, SX1, y1, zb, TOP - 0.9, 0.7, 0.4);
    const F = (x0: number, z0: number, x1: number, z1: number, r = 0.5) => onY(y1, x0, z0, x1, z1, r);
    const third = (SX1 - SX0) / 3, xa = SX0 + third, xb = SX1 - third, zm = (zb + TOP - 0.9) / 2;
    pth("nf", F(SX0 + 0.8, zb + 0.7, xa - 0.35, TOP - 1.6) + F(xb + 0.35, zb + 0.7, SX1 - 0.8, TOP - 1.6) + F(xa + 0.35, zb + 0.7, xb - 0.35, TOP - 1.6));
    pth("nf lo", F(SX0 + 0.8, zm - 0.1, xa - 0.35, zm + 0.1, 0.05) + F(xb + 0.35, zm - 0.1, SX1 - 0.8, zm + 0.1, 0.05)
      + F(xa + 1.3, zb + 1.6, xb - 1.3, TOP - 2.5, 0.4)
      + steps(xa + 1.9, xb - 1.9, 16).map((x) => ln([x, y1, zb + 1.9], [x, y1, TOP - 2.8])).join("")
      + steps(zb + 2.6, TOP - 3.4, 5).map((z) => ln([xa + 1.6, y1, z], [xb - 1.6, y1, z])).join(""));
    for (const [x, z] of [[(SX0 + xa) / 2, zm + 1.6], [(SX0 + xa) / 2, zm - 1.6], [(xb + SX1) / 2, zm + 1.6], [(xb + SX1) / 2, zm - 1.6]]) {
      pth("", poly(ring2(...Q([x, y1 + 0.35, z]), 0.42 * C.S, 0.42 * C.S, 14)));
    }
    pth("", poly(ring2(...Q([xb - 1.2, y1 + 0.3, zm]), 0.32 * C.S, 0.32 * C.S, 12)));
    box(SX0 - 0.5, -0.3, SX1 + 0.5, y1 + 0.6, TOP - 0.9, TOP, 0.8, 0.45);
  }

  /* ---------- a woven runner along the sideboard, fringed at its ends ---------- */
  {
    const y0 = 2.6, y1 = 7.8, x0 = SX0 + 2.2, x1 = SX1 - 2.2, z = TOP + 0.04;
    pth("", poly(rrect(x0, y0, x1, y1, 0.3, 2).map((q) => P(q.u, q.v, z))));
    pth("nf lo", poly(rrect(x0 + 0.7, y0 + 0.5, x1 - 0.7, y1 - 0.5, 0.2, 2).map((q) => P(q.u, q.v, z)))
      + steps(x0 + 2, x1 - 2, 22).map((x, i) => (i % 2 ? "" : ln([x, y0 + 0.5, z], [x + 0.8, (y0 + y1) / 2, z]) + ln([x + 0.8, (y0 + y1) / 2, z], [x, y1 - 0.5, z]))).join("")
      + [x0, x1].map((x) => steps(y0 + 0.3, y1 - 0.3, 9).map((y) => ln([x, y, z], [x + (x < SX0 + 5 ? -1 : 1), y, z])).join("")).join(""));
  }

  /* ---------- the portraits: each a frame turned to the room, leaning back on its strut, Uru's face drawn in it ---------- */
  /** A portrait's plane at pose v (0 rest, 1 picked) and rise r: its foot on the sideboard, turned and leaning. */
  function plane(i: number, v: number, r: number) {
    const f = FRAMES[i], phi = rad(45 + f.turn * (1 - v)), tau = rad(lerp(LEAN, 3, v));
    const n: Vec3 = [Math.cos(phi), Math.sin(phi), 0], u: Vec3 = [Math.sin(phi), -Math.cos(phi), 0];
    const upv: Vec3 = [-n[0] * Math.sin(tau), -n[1] * Math.sin(tau), Math.cos(tau)], nt: Vec3 = [n[0] * Math.cos(tau), n[1] * Math.cos(tau), Math.sin(tau)];
    return (a: number, b: number, d = 0): Vec2 => P(f.x + a * u[0] + b * upv[0] + d * nt[0], f.y + a * u[1] + b * upv[1] + d * nt[1], TOP + r + b * upv[2] + d * nt[2]);
  }
  const frames: Frame[] = FRAMES.map((f, i) => {
    const fg = mk("g", {}, g), el = (cls: string) => pth(cls, "", fg);
    const fr: Frame = { g: fg, guide: el("nf dash"), strut: el(""), sil: el("sil"), cr: el("nf lo"), mat: el("nf lo"), win: el("nf"), eyes: el("nf sil"), cheeks: el("nf lo"), tw: tween(0), drawn: NaN, area: [] };
    const pts = (v: number, r: number) => { const pl = plane(i, v, r), o = outline(f.kind, f.w, f.h, 0); return o.map(([a, b]) => pl(a, b, 0)).concat(o.map(([a, b]) => pl(a, b, -0.9))); };
    fr.area = hull(pts(0, 0).concat(pts(1, MAX)));
    return fr;
  });
  /** Redraws portrait i at pose v (0 rest, 1 picked): the frame, its moulding, the mat, and the face, rising by v times the rise. */
  function drawFrame(i: number, v: number) {
    const f = FRAMES[i], fr = frames[i], pl = plane(i, Math.min(1, v), v * rise), kind = f.kind;
    const o = outline(kind, f.w, f.h, 0), ring = (m: number, d: number) => poly(outline(kind, f.w, f.h, m).map(([a, b]) => pl(a, b, d)));
    fr.sil.setAttribute("d", poly(hull(o.map(([a, b]) => pl(a, b, 0)).concat(o.map(([a, b]) => pl(a, b, -0.9))))));
    const mould = kind === "square" ? 1.3 : kind === "tall" ? 0.8 : 0.9;
    fr.cr.setAttribute("d", ring(0.35, 0.02) + (kind === "square" ? ring(0.75, 0.02) : ""));
    fr.mat.setAttribute("d", ring(mould, 0.01) + (kind === "tall" ? ring(mould + 0.9, 0.01) : ""));
    // the strut behind: from the back of the frame down to the sideboard, seen past the frame's edge
    const back = pl(0.25 * f.w, 0.55 * f.h, -0.9), foot = P(f.x - 3.2 * Math.cos(rad(45 + f.turn)) + 0.5, f.y - 3.2 * Math.sin(rad(45 + f.turn)), TOP + v * rise);
    fr.strut.setAttribute("d", open([back, foot]));
    // lifted, dashed guides drop from its foot to where it stood
    const rest = plane(i, 0, 0), lift = v * rise;
    fr.guide.setAttribute("d", lift < 1.4 ? "" : [-0.36, 0.36].map((k) => seg(pl(k * f.w, 0.15, -0.45), rest(k * f.w, 0.15, -0.45))).join("") + open([-0.36, 0.36].map((k) => rest(k * f.w, 0.05, -0.45))));
    // the face: the window, then the eyes and cheeks of this frame's look, at the size the frame allows
    const m = faceMarks(LOOKS[NAMES[i]]), sc = (kind === "round" ? 0.56 * f.w : kind === "oval" ? 0.6 * f.w : 0.72 * f.w) / (2 * 4.9) * (kind === "tall" ? 0.86 : 1);
    const fc = (pts: Vec2[]) => poly(pts.map(([u, w]) => pl(-u * sc, f.h / 2 - 0.15 + w * sc, 0.03)));
    fr.win.setAttribute("d", fc(m.window));
    fr.eyes.setAttribute("d", m.eyes.map(fc).join(""));
    fr.cheeks.setAttribute("d", m.cheeks.map(fc).join(""));
  }

  /* ---------- state, the two clocks, and the answer ---------- */
  const morph = tween(0), turn = tween(0);
  let from: Look = LOOKS.rest, to: Look = LOOKS.rest, blinkAt = performance.now() + 2600, blinks = 0, glanceAt = 0, glanceTo = 0, seen = 0, lastBreath = NaN;
  const restYaw = rad(40), yawFor = (i: number) => restYaw + 0.32 * (Math.atan2(FRAMES[i].y - UY, FRAMES[i].x - UX) - restYaw);
  const glance = tween(0);
  function blinking(now: number) {
    const t = now - blinkAt;
    if (t < 0) return 0;
    if (t >= 260) { blinks++; blinkAt = now + (hash(blinks) < 0.2 ? 150 : 2800 + hash(blinks + 5) * 3700); return 0; }
    return t < 90 ? t / 90 : t < 130 ? 1 : 1 - (t - 130) / 130;
  }
  const B = register(stage, (dt, now) => {
    const rm = reducedMotion();
    let moving = false;
    if (!seen && dt > 0) { seen = now; glanceAt = now + 6500; }
    for (let i = 0; i < frames.length; i++) {
      const fr = frames[i], v = tval(fr.tw, now);
      if (!tdone(fr.tw, now)) moving = true;
      if (v !== fr.drawn) { fr.drawn = v; drawFrame(i, v); }
    }
    // every so often at rest, Uru looks along its portraits and back
    if (!rm && act < 0 && seen && now >= glanceAt) { tset(glance, 1, now, 0); glanceTo = now + 2200; glanceAt = now + 10000 + Math.random() * 5000; }
    if (glanceTo && now >= glanceTo) { glanceTo = 0; tset(glance, 0, now, 0); }
    const m = tval(morph, now), tn = tval(turn, now), gl = tval(glance, now);
    if (!tdone(morph, now) || !tdone(turn, now) || !tdone(glance, now)) moving = true;
    const lk = mixLook(from, to, m), yaw = lerp(restYaw, act >= 0 ? yawFor(act) : restYaw, tn) - 0.12 * gl;
    U.draw(POSE(yaw, { lu: -0.55 * gl - (act >= 0 ? 0.35 * tn : 0), lv: 0.35 * gl }), lk, rm ? 0 : blinking(now));
    if (U.step(dt)) moving = true;
    if (!rm) {
      const br = Math.round(((1 - Math.cos((now / (to === LOOKS.sleepy ? 6400 : 4800)) * Math.PI * 2)) / 2) * 40) / 40;
      if (br !== lastBreath) { lastBreath = br; U.breathe(br); }
    }
    return moving || !rm;
  });
  bag.add(B.unregister);

  /** The portrait under the pointer: each portrait's fixed hull of its rest and lifted poses, nearest first. */
  const order = FRAMES.map((_, i) => i).sort((a, b) => FRAMES[b].x + FRAMES[b].y - FRAMES[a].x - FRAMES[a].y);
  const inside = ([x, y]: Vec2, pg: Vec2[]) => {
    let c = false;
    for (let i = 0, j = pg.length - 1; i < pg.length; j = i++) if ((pg[i][1] > y) !== (pg[j][1] > y) && x < ((pg[j][0] - pg[i][0]) * (y - pg[i][1])) / (pg[j][1] - pg[i][1]) + pg[i][0]) c = !c;
    return c;
  };
  const hit = (p: Vec2) => order.find((i) => inside(p, frames[i].area)) ?? -1;

  /** Picks portrait a (-1 is rest): it rises and turns to us and takes the bright stroke from Uru's band; Uru morphs into its look. */
  function choose(a: number, force = false) {
    if (a === act && !force) return;
    const now = performance.now(), at = a >= 0 ? a : act;
    act = a;
    frames.forEach((fr, i) => {
      const far = Math.abs(i - at);
      tset(fr.tw, a < 0 ? 0 : i === a ? 1 : SHARE[Math.min(2, far)] * 0.5, now, at < 0 ? 0 : far * STEP);
      fr.sil.classList.toggle("hi", i === a);
    });
    U.band.setAttribute("class", a < 0 ? "hi" : "sil");
    const m = tval(morph, now);
    from = mixLook(from, to, m); to = a < 0 ? LOOKS.rest : LOOKS[NAMES[a]];
    morph.from = 0; morph.to = 0; morph.t0 = -1e9; tset(morph, 1, now, 0);
    tset(turn, a < 0 ? 0 : 1, now, 60);
    if (a >= 0) { tset(glance, 0, now, 0); glanceTo = 0; }
    read.textContent = a < 0 ? "rest" : NAMES[a];
    B.wake();
  }
  read.textContent = "rest";
  bag.add(pointer(stage, { move: (p) => choose(hit(p)), leave: () => choose(-1) }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { rise = clamp(v, 0, MAX); frames.forEach((fr) => { fr.drawn = NaN; }); B.wake(); },
    destroy: bag.dispose,
  };
};
