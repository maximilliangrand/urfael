import {
  Cam, circ, clamp, facing, fillet, fit, hull, lerp, open, poly, prism, proj, rad, ringAt, rings, rrect, run, seg,
  type Ring, type Vec2, type Vec3,
} from "../hairline/core/iso";
import { reducedMotion, tdone, tset, tval, tween, type Tween } from "../hairline/core/motion";
import { disposer, mk, pointer, put, register, solid, type FigureMount } from "../hairline/core/stage";
import { FACE, faceMarks, hash, hatch, inside, LOOKS, mixLook, ring2, steps, type Look, type LookName } from "./uru-kit";

/**
 * Uru's faces: a corner of a room in section, its wall and floor cut and
 * hatched where they are cut. Along the wall a sideboard, and standing on it
 * five framed portraits of Uru's face, one expression each, in frames of five
 * shapes, turned a little to the room the way photographs stand: happy in a
 * square frame, curious in a round one, listening in a tall one with a mat,
 * thinking under an arched top, sleepy in an oval. In the corner a floor lamp
 * (an object: it gives no light), its cord run to the socket; on the wall a
 * dado rail, a picture rail, the skirting and a faint papered diamond.
 *
 * The portraits are line work, all but one: the portrait that is awake, whose
 * face window is the drawing's one dark solid, white dome eyes and grey cheeks
 * on it and nothing between the eyes, drawn with the kit (faceMarks, LOOKS,
 * mixLook) as every Uru face is. At rest the happy portrait is awake, its frame
 * the bright mark, and it blinks now and then.
 *
 * The pointer picks a portrait: it rises off the sideboard by the slider (world
 * units), stands up straight and turns square to us, takes the bright stroke
 * and comes alive: its face goes dark, its eyes and cheeks morph from the plain
 * domes into its expression over the 700ms lift curve, and it blinks once it
 * has arrived. Its neighbours rise less by distance, staggered outwards (rule
 * 02), and the portrait that was awake goes still. Under reduced motion every
 * change lands at once and nothing blinks. The read-out names the expression.
 *
 * The hit test (rule 01) walks the portraits nearest first, each by its fixed
 * hull at rest and the pick by the hull of its rest and lifted poses too, so
 * nothing moves out from under the pointer and what is drawn on top wins.
 */

const NAMES: readonly LookName[] = ["happy", "curious", "listening", "thinking", "sleepy"];
// The room: the wall along x from 0 to RW, WT thick and cut at H; a stub of side wall SW deep; the floor RD deep on a slab SL thick.
const RW = 60, RD = 17, WT = 2.4, H = 25, SL = 3, SW = 6;
// The sideboard: along the wall from SX0 to SX1, SD deep, its top at TOP; its legs' height.
const SX0 = 9, SX1 = 58, SD = 10.4, TOP = 13.2, LEG = 2.8;
// The floor lamp in the corner: where it stands, its height, and its shade's foot and top radii.
const LX = 4.1, LY = 5.6, LH = 22.5, SR0 = 3.3, SR1 = 2.1;
type Kind = "square" | "round" | "tall" | "arch" | "oval";
/** Each portrait: its frame, width and height, where it stands on the sideboard, and how it is turned (degrees off square). */
const FRAMES: { kind: Kind; w: number; h: number; x: number; y: number; turn: number }[] = [
  { kind: "square", w: 8.4, h: 8.4, x: 14.2, y: 4.6, turn: -12 },
  { kind: "round", w: 8.2, h: 8.2, x: 24.4, y: 5.3, turn: 7 },
  { kind: "tall", w: 7.6, h: 10.2, x: 34.2, y: 4.4, turn: -5 },
  { kind: "arch", w: 8, h: 10, x: 44, y: 5.2, turn: 10 },
  { kind: "oval", w: 7.4, h: 9.2, x: 53.4, y: 4.8, turn: -9 },
];
// The answer: how far a portrait leans back at rest, the share of the rise by distance, the stagger, the largest rise.
const LEAN = 13, SHARE = [1, 0.15, 0.05], STEP = 45, MAX = 7;
// Which portrait is awake at rest; how far into its expression a portrait wakes from the plain domes; when it blinks after waking.
const REST = 0, WAKE = 0.3, BLINK = 820;

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
  sil: SVGPathElement; cr: SVGPathElement; mat: SVGPathElement; win: SVGPathElement; eyes: SVGPathElement[]; cheeks: SVGPathElement[];
  guide: SVGPathElement; strut: SVGPathElement; tw: Tween; drawn: number; stale: boolean; rest: Vec2[]; lifted: Vec2[];
};

export const mount: FigureMount = ({ stage, svg, read }, value) => {
  const bag = disposer();
  let rise = clamp(value, 0, MAX), act = -1, awake = REST;
  const C = Cam(45, 0.5, 5.85);
  fit(C, [[-WT, -WT, H], [RW, -WT, H], [-WT, RD, -SL], [RW, RD, -SL], [RW, -WT, -SL], [-WT, -WT, -SL]], 200, 162);
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
  /** Writes a path only when it changed: in Chromium d is a style property, so each write costs a style recalc. */
  const drawn = new WeakMap<Element, string>();
  const setD = (el: Element, d: string) => { if (drawn.get(el) !== d) { drawn.set(el, d); el.setAttribute("d", d); } };

  /* ---------- the room: the slab, its boards, the wall cut and hatched, skirting, a dado rail, a socket ---------- */
  box(-WT, -WT, RW, RD, -SL, 0, 0.6, 0.4);
  pth("nf lo", hatch(P, "y", RD, -WT + 0.4, RW - 0.4, -SL + 0.3, -0.3) + hatch(P, "x", RW, -WT + 0.4, RD - 0.4, -SL + 0.3, -0.3));
  let boards = "";
  for (let y = 3.7, k = 0; y < RD - 0.3; y += 3.7, k++) {
    boards += ln([0, y, 0], [RW, y, 0]);
    for (let x = 4 + hash(k) * 14; x < RW - 2; x += 16 + hash(k * 5 + x) * 9) boards += ln([x, y - 3.4, 0], [x, y - 0.2, 0]);
  }
  pth("nf lo", boards);
  box(-WT, -WT, RW, 0, 0, H, 0.5, 0.45);
  box(-WT, 0, 0, SW, 0, H, 0.5, 0.45);
  pth("nf lo", hatch(P, "x", RW, -WT + 0.3, -0.3, 0.4, H - 0.4, 1.5) + hatch(P, "y", SW, -WT + 0.3, -0.3, 0.4, H - 0.4, 1.5));
  box(0, 0, RW, 0.55, 0, 1.8, 0.2, 0.2, "");
  box(0, 0.55, 0.55, SW, 0, 1.8, 0.2, 0.2, "");
  box(0, 0, RW, 0.5, 10.6, 11.4, 0.2, 0.15, "");
  pth("nf lo", steps(2.2, RW - 14.6, 4).map((x) => onY(0.05, x, 3.2, x + 12.2, 9.2, 0.5)).join("") + onX(0.05, 1.4, 3.2, 4.8, 9.2, 0.5));
  // a picture rail along the wall, and between it and the dado a faint papered diamond, staggered
  box(0, 0, RW, 0.45, H - 3.4, H - 2.8, 0.15, 0.1, "");
  pth("nf lo", steps(13.2, H - 5, 3).flatMap((z, j) => steps(3 + (j % 2) * 2.2, RW - 2, 13).map((x) =>
    poly([[x - 0.45, z], [x, z + 0.55], [x + 0.45, z], [x, z - 0.55]].map(([a, b]): Vec2 => P(a, 0.04, b))))).join(""));
  // the socket low on the stub wall, under the dado
  pth("", onX(0.05, 2.6, 4, 5, 6.4, 0.4));
  pth("nf lo", onX(0.1, 3.2, 5.6, 3.4, 6, 0.08) + onX(0.1, 4.2, 5.6, 4.4, 6, 0.08));

  /* ---------- the floor lamp in the corner: a weighted base, its stem, a drum shade, the cord to the socket ---------- */
  {
    const disc = (r: number, n = 36) => at(circ(r, n), LX, LY);
    pth("nf", open([Q([LX - 1.4, LY + 0.6, 0.15]), Q([LX - 2.6, LY - 0.4, 0.1]), Q([1.4, 4.3, 0.1]), Q([0.4, 3.9, 4.2]), Q([0.12, 3.8, 5])]));
    put(solid(g), { sil: poly(hull(ringAt(P, disc(2.3), 0).concat(ringAt(P, disc(1.6), 1.1)))), crease: open(ringAt(P, run(disc(1.4), front), 1.1)) });
    box(LX - 0.28, LY - 0.28, LX + 0.28, LY + 0.28, 1.1, LH - 4.6, 0.28, 0.1, "");
    put(solid(g), prism(P, front, disc(0.5, 16), disc(0.3, 16), LH - 6.2, LH - 5.6));
    put(solid(g), { sil: poly(hull(ringAt(P, disc(SR0), LH - 5.2).concat(ringAt(P, disc(SR1), LH)))), crease: open(ringAt(P, run(disc(SR1 - 0.35), front), LH)) });
    pth("nf lo", open(ringAt(P, run(disc(SR0 - 0.02), front), LH - 4.6)) + open(ringAt(P, run(disc(SR1 + 0.05), front), LH - 0.6)));
  }

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
    const fr: Frame = {
      guide: el("nf dash"), strut: el(""), sil: el("sil"), cr: el("nf lo"), mat: el("nf lo"), win: el("nf"),
      cheeks: [el("nf lo"), el("nf lo")], eyes: [el("nf sil"), el("nf sil")], tw: tween(0), drawn: NaN, stale: true, rest: [], lifted: [],
    };
    const pts = (v: number, r: number) => { const pl = plane(i, v, r), o = outline(f.kind, f.w, f.h, 0); return o.map(([a, b]) => pl(a, b, 0)).concat(o.map(([a, b]) => pl(a, b, -0.9))); };
    fr.rest = hull(pts(0, 0));
    fr.lifted = hull(fr.rest.concat(pts(1, MAX)));
    return fr;
  });
  /** Redraws portrait i's frame at pose v (0 rest, 1 picked): the frame, its moulding, the mat, its strut and guides, rising by v times the rise. */
  function drawFrame(i: number, v: number) {
    const f = FRAMES[i], fr = frames[i], pl = plane(i, Math.min(1, v), v * rise), kind = f.kind;
    const o = outline(kind, f.w, f.h, 0), ring = (m: number, d: number) => poly(outline(kind, f.w, f.h, m).map(([a, b]) => pl(a, b, d)));
    setD(fr.sil, poly(hull(o.map(([a, b]) => pl(a, b, 0)).concat(o.map(([a, b]) => pl(a, b, -0.9))))));
    const mould = kind === "square" ? 1.3 : kind === "tall" ? 0.8 : 0.9;
    setD(fr.cr, ring(0.35, 0.02) + (kind === "square" ? ring(0.75, 0.02) : ""));
    setD(fr.mat, ring(mould, 0.01) + (kind === "tall" ? ring(mould + 0.9, 0.01) : ""));
    // the strut behind: from the back of the frame down to the sideboard, seen past the frame's edge
    const back = pl(0.25 * f.w, 0.55 * f.h, -0.9), foot = P(f.x - 3.2 * Math.cos(rad(45 + f.turn)) + 0.5, f.y - 3.2 * Math.sin(rad(45 + f.turn)), TOP + v * rise);
    setD(fr.strut, open([back, foot]));
    // lifted, dashed guides drop from its foot to where it stood
    const rest = plane(i, 0, 0), lift = v * rise;
    setD(fr.guide, lift < 1.4 ? "" : [-0.36, 0.36].map((k) => seg(pl(k * f.w, 0.15, -0.45), rest(k * f.w, 0.15, -0.45))).join("") + open([-0.36, 0.36].map((k) => rest(k * f.w, 0.05, -0.45))));
  }
  /** Draws portrait i's face in look lk, `shut` through a blink, at the frame's pose v and the size the frame allows. */
  function drawFace(i: number, v: number, lk: Look, shut: number) {
    const f = FRAMES[i], fr = frames[i], kind = f.kind;
    fr.stale = false;
    const pl = plane(i, Math.min(1, v), v * rise), m = faceMarks(lk, shut);
    const sc = (kind === "round" ? 0.56 * f.w : kind === "oval" ? 0.6 * f.w : 0.72 * f.w) / (2 * FACE.hu) * (kind === "tall" ? 0.86 : 1);
    const fc = (pts: Vec2[]) => poly(pts.map(([u, w]) => pl(-u * sc, f.h / 2 - 0.15 + w * sc, 0.03)));
    setD(fr.win, fc(m.window));
    fr.eyes.forEach((el, k) => setD(el, fc(m.eyes[k])));
    fr.cheeks.forEach((el, k) => setD(el, fc(m.cheeks[k])));
  }
  /** Wakes portrait i or puts it back to line work: an awake face is the drawing's one dark solid, white eyes and grey cheeks on it. */
  function dress(i: number, on: boolean) {
    const fr = frames[i];
    fr.win.setAttribute("class", on ? "ink" : "nf");
    fr.eyes.forEach((el) => el.setAttribute("class", on ? "warm" : "nf sil"));
    fr.cheeks.forEach((el) => el.setAttribute("class", on ? "blush" : "nf lo"));
    fr.stale = true;
  }

  /* ---------- state, the two clocks, and the answer ---------- */
  // the awake portrait's look morphs from the plain domes, WAKE of the way into its expression, to all of it
  const morph = tween(1);
  let blinkAt = performance.now() + 2600, blinks = 0, drawnMorph = NaN, drawnShut = NaN;
  function blinking(now: number) {
    const t = now - blinkAt;
    if (t < 0) return 0;
    if (t >= 260) { blinks++; blinkAt = now + (hash(blinks) < 0.2 ? 150 : 2800 + hash(blinks + 5) * 3700); return 0; }
    return t < 90 ? t / 90 : t < 130 ? 1 : 1 - (t - 130) / 130;
  }
  const B = register(stage, (_dt, now) => {
    const rm = reducedMotion();
    let moving = false;
    for (let i = 0; i < frames.length; i++) {
      const fr = frames[i], v = tval(fr.tw, now);
      if (!tdone(fr.tw, now)) moving = true;
      if (v !== fr.drawn) { fr.drawn = v; fr.stale = true; drawFrame(i, v); }
      const expr = LOOKS[NAMES[i]];
      if (i !== awake) { if (fr.stale) drawFace(i, v, expr, 0); continue; }
      // the awake face redraws only when its pose, its morph or its blink moved: between blinks at rest, nothing is written
      const m = tval(morph, now), shut = rm ? 0 : blinking(now);
      if (fr.stale || m !== drawnMorph || shut !== drawnShut) { drawnMorph = m; drawnShut = shut; drawFace(i, v, mixLook(mixLook(LOOKS.rest, expr, WAKE), expr, m), shut); }
    }
    if (!tdone(morph, now)) moving = true;
    return moving || !rm;
  });
  bag.add(B.unregister);

  /** The portrait under the pointer: what is drawn on top wins, so nearest first, each by its rest hull and the pick by its lifted hull too. */
  const order = FRAMES.map((_, i) => i).sort((a, b) => FRAMES[b].x + FRAMES[b].y - FRAMES[a].x - FRAMES[a].y);
  const hit = (p: Vec2) => order.find((i) => inside(p, frames[i].rest) || (i === act && inside(p, frames[i].lifted))) ?? -1;

  /** Picks portrait a (-1 is rest): it rises and turns to us, takes the bright stroke and wakes; the portrait that was awake goes still. */
  function choose(a: number, force = false) {
    if (a === act && !force) return;
    const now = performance.now(), from = a >= 0 ? a : act, wake = a < 0 ? REST : a;
    act = a;
    frames.forEach((fr, i) => {
      const far = Math.abs(i - from);
      tset(fr.tw, a < 0 ? 0 : SHARE[Math.min(2, far)], now, from < 0 ? 0 : far * STEP);
      fr.sil.classList.toggle("hi", i === wake);
    });
    const woke = wake !== awake;
    if (woke) {
      dress(awake, false);
      awake = wake;
      dress(awake, true);
      Object.assign(morph, { from: 0, to: 1, t0: now });
    }
    // a picked portrait blinks once it has arrived, even the one that was already awake
    if (a >= 0 || woke) blinkAt = now + BLINK;
    read.textContent = a < 0 ? "rest" : NAMES[a];
    B.wake();
  }
  // the first frame is the rest pose: the happy portrait already awake, its morph done
  dress(awake, true);
  choose(-1, true);
  bag.add(pointer(stage, { move: (p) => choose(hit(p)), leave: () => choose(-1) }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { rise = clamp(v, 0, MAX); frames.forEach((fr) => { fr.drawn = NaN; }); B.wake(); },
    destroy: bag.dispose,
  };
};
