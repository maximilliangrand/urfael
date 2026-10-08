import { circ, clamp, fillet, hull, lerp, open, poly, seg, type Camera, type Projector, type Ring, type Vec2, type Vec3 } from "../hairline/core/iso";
import { spring, stepS } from "../hairline/core/motion";
import { mk } from "../hairline/core/stage";

/**
 * Uru, drawn: the one character every Uru figure shares (uru-home, uru-study,
 * uru-faces), translated from the strategy's design notes (section 6) into
 * hairline. A one-piece pebble, widest low and softly domed, a little narrower
 * at the shoulders, on a flared gliding skirt; the knit band round its waist,
 * ribbed, with a knot and two tails; the stitched patch on its chest with the
 * rune ᚢ sewn into it; seams stitched down its panels; mitten arms with ribbed
 * cuffs and a thumb; the lantern bead on its soft stalk, which lags the body a
 * little on a spring; and the face window, the drawing's one dark solid, with
 * two dome eyes and two blush cheeks, and nothing ever drawn between the eyes.
 * Everything but the window, the eyes and the cheeks is line work.
 *
 * Uru is drawn in its own frame (forward, left, up, in Uru units: its widest
 * radius is 8.8), turned, leaned and tilted about its foot, then scaled and
 * stood at a world point. A line on the body keeps only the samples whose
 * surface faces the camera, so nothing on the far side shows through (rule
 * 06). Nothing here touches the DOM at import.
 *
 * Also here: the small solids the Uru figures share (a body of revolution, a
 * capsule, a hoop round an axis), each drawn the same way.
 */

/**
 * The robot's working name, in one place: the plates' labels read it from here, and it is never drawn. To rename it,
 * change it here and run, from the repo root:
 *   npm run build:site    the figures' labels (docs/assets/figures.js)
 *   npm run build:pages   every page, docs/llms.txt, docs/llms-full.txt's head and docs/site.webmanifest
 *   npm run build:og      the social card, docs/media/og-urfael.png, which shows the name as a picture
 * The page path /uru stays as it is, so links keep working.
 */
export const ROBOT = "Uru";

/* ---------- Uru's measurements, in Uru units ---------- */

// The body: its foot, widest at ZM, shoulders at ZS, crown at ZT; the knit band; the face window; the patch; the shoulders' height.
const ZB = 1.1, ZM = 5.2, ZS = 13.6, ZT = 21.8, RMAX = 8.8, RS = 7.7;
const BAND = [5.3, 8.1] as const, FACE = { v: 16.3, hu: 4.9, hv: 3.1 }, BADGE = 10.65, SHOULDER = 10.6, BD = 0.42;
/** Uru's crown and widest radius, for figures that stack or frame it. */
export const URU = { ZB, ZT, RMAX, top: ZT + 4.8, band: BAND, face: FACE };

/** Uru's radius at height z: a pebble widest low, a little narrower at the shoulders, softly domed. */
export function uruR(z: number) {
  if (z <= ZM) { const t = (ZM - z) / (ZM - ZB + 1.4); return RMAX - 1.15 * t * t; }
  if (z <= ZS) return RS + ((RMAX - RS) * (1 + Math.cos((Math.PI * (z - ZM)) / (ZS - ZM)))) / 2;
  const t = Math.min(1, (z - ZS) / (ZT - ZS));
  return RS * Math.pow(Math.max(0, 1 - Math.pow(t, 2.3)), 1 / 2.3);
}
const dR = (z: number) => (uruR(Math.min(ZT - 0.01, z + 0.05)) - uruR(z - 0.05)) / 0.1;

/* ---------- the look: eyes, cheeks, gaze, lean, bead ---------- */

/** One eye in face units (u across, v up): its centre's u, its foot's v, width and height; `arch` bends it into ^, `lid` into a low ◡. */
export type EyeShape = { x: number; y: number; w: number; h: number; arch: number; lid: number };
/** A whole expression: two eyes, the cheeks' size, the gaze, the head's tilt and lean (radians), and the bead (+ stands, − droops). */
export type Look = { eyes: readonly [EyeShape, EyeShape]; cheek: number; gu: number; gv: number; tilt: number; lean: number; bead: number };
const E = (x: number, y = 15.95, w = 1.7, h = 1.15, arch = 0, lid = 0): EyeShape => ({ x, y, w, h, arch, lid });
const look = (l: EyeShape, r: EyeShape, o: Partial<Look> = {}): Look => ({ eyes: [l, r], cheek: 1, gu: 0, gv: 0, tilt: 0, lean: 0, bead: 0, ...o });
/** The strategy's expressions (section 6.3). Rest is the plain domes, which read as gently smiling. */
export const LOOKS = {
  rest: look(E(1.6), E(-1.6)),
  happy: look(E(1.6, 16.05, 1.75, 1.2, 1), E(-1.6, 16.05, 1.75, 1.2, 1), { cheek: 1.3 }),
  curious: look(E(1.6, 15.85, 1.75, 1.55), E(-1.6, 16.05, 1.6, 0.95), { tilt: 0.13, gu: 0.25, gv: 0.15 }),
  listening: look(E(1.7, 15.75, 1.95, 1.45), E(-1.7, 15.75, 1.95, 1.45), { cheek: 1.05, lean: 0.06, bead: 1 }),
  thinking: look(E(1.6, 16.2, 1.45, 0.95), E(-1.6, 16.2, 1.45, 0.95), { cheek: 0.85, gu: 0.85, gv: 0.7, tilt: -0.06 }),
  sleepy: look(E(1.6, 15.75, 1.8, 0.62, 0, 1), E(-1.6, 15.75, 1.8, 0.62, 0, 1), { cheek: 0.8, lean: -0.04, bead: -1 }),
} satisfies Record<string, Look>;
export type LookName = keyof typeof LOOKS;
const mixE = (a: EyeShape, b: EyeShape, t: number): EyeShape =>
  ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t), arch: lerp(a.arch, b.arch, t), lid: lerp(a.lid, b.lid, t) });
/** A look between two, t of the way from a to b: how one expression morphs into the next. */
export const mixLook = (a: Look, b: Look, t: number): Look => ({
  eyes: [mixE(a.eyes[0], b.eyes[0], t), mixE(a.eyes[1], b.eyes[1], t)],
  cheek: lerp(a.cheek, b.cheek, t), gu: lerp(a.gu, b.gu, t), gv: lerp(a.gv, b.gv, t), tilt: lerp(a.tilt, b.tilt, t), lean: lerp(a.lean, b.lean, t), bead: lerp(a.bead, b.bead, t),
});

/** An eye's outline, `shut` of the way to closed (a blink): the dome shuts onto its foot, the lid onto its top. */
function eyePts(e: EyeShape, gu: number, gv: number, shut: number): Vec2[] {
  const n = 14, hw = e.w / 2, th = Math.min(e.h * 0.62, 0.5), cu = e.x + gu, cv = e.y + gv, top: Vec2[] = [], bot: Vec2[] = [];
  const k = 1 - 0.93 * shut, curl = e.arch * (1 - e.lid);
  for (let i = 0; i <= n; i++) {
    const t = (Math.PI * i) / n, s = Math.pow(Math.sin(t), 0.8), x = hw * Math.cos(t);
    const yT = (1 - e.lid) * e.h * s, yB = curl * (e.h - th) * s - e.lid * e.h * s, yA = lerp(yB, yT, e.lid);
    top.push([cu + x, cv + yA + (yT - yA) * k]);
    bot.push([cu + x * lerp(0.97, 1 - th / e.w, curl), cv + yA + (yB - yA) * k]);
  }
  return top.concat(bot.reverse());
}

/**
 * A look's marks in face units about the window's middle (u across, v up), for drawing Uru's face in line
 * elsewhere, a portrait: the window, the two eyes and the two cheeks, `shut` of the way through a blink.
 */
export function faceMarks(lk: Look, shut = 0): { window: Vec2[]; eyes: Vec2[][]; cheeks: Vec2[][] } {
  const c = (pts: Vec2[]) => pts.map(([u, v]): Vec2 => [u, v - FACE.v]);
  return {
    window: c(squircle(0, FACE.v, FACE.hu, FACE.hv, 4, 48)),
    eyes: lk.eyes.map((e) => c(eyePts(e, lk.gu, lk.gv, shut))),
    cheeks: [1, -1].map((k) => c(ring2(k * 3.05 + lk.gu * 0.4, 14.75 + lk.gv * 0.35, 0.78 * lk.cheek, 0.42 * (0.8 + 0.2 * lk.cheek), 18))),
  };
}

/* ---------- the pose ---------- */

/** Where Uru faces (yaw, world radians), its lean forward and its tilt sideways (radians), its gaze, and each arm's raise and reach. */
export type UruPose = { yaw: number; lean: number; roll: number; lu: number; lv: number; ta: number; fa: number; tb: number; fb: number };
export const POSE = (yaw: number, o: Partial<UruPose> = {}): UruPose => ({ yaw, lean: 0, roll: 0, lu: 0, lv: 0, ta: 0.22, fa: 0.3, tb: 0.22, fb: 0.3, ...o });

export type UruOptions = { x: number; y: number; z?: number; s?: number; skirt?: boolean; ground?: boolean };
export type UruDrawing = {
  /** Everything of Uru's; `body` is what breathes. */
  g: SVGGElement; body: SVGGElement;
  /** The knit band: the rest mark in every Uru figure. */
  band: SVGPathElement;
  /** The outlines that take the bright stroke when Uru itself is the pick: the body, the mittens, the bead. */
  outline: Element[];
  /** Draws Uru in a pose with a look, the eyes `shut` of the way through a blink. Skips what has not changed. */
  draw(pose: UruPose, look: Look, shut?: number): void;
  /** Steps the bead's spring: whether it is still moving. */
  step(dt: number): boolean;
  /** A breath, 0 to 1: the body swells up from its foot. */
  breathe(v: number): void;
  /** The screen hull of Uru in a pose: for a hit test against rest or target, never the pose on screen (rule 01). */
  hull(pose: UruPose): Vec2[];
  /** The screen point of the foot, and of the bead at rest. */
  foot: Vec2; bead: () => Vec2;
};

/** A fixed pseudo-random number in [0, 1) for n. */
export const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
export const steps = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / Math.max(1, n - 1));
/** A screen ellipse about (cx, cy). */
export const ring2 = (cx: number, cy: number, rx: number, ry = rx, n = 24): Vec2[] =>
  Array.from({ length: n }, (_, i) => [cx + rx * Math.cos((i / n) * Math.PI * 2), cy + ry * Math.sin((i / n) * Math.PI * 2)]);
/** A strip of width w(t) along a screen polyline, as a closed outline: a tail, a stalk, a cable. */
export function ribbon(pts: Vec2[], w: (t: number) => number): Vec2[] {
  const n = pts.length, side = (k: number) => pts.map((p, i): Vec2 => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy) || 1, h = (w(i / (n - 1)) * k) / 2;
    return [p[0] - (dy / m) * h, p[1] + (dx / m) * h];
  });
  return side(1).concat(side(-1).reverse());
}

/**
 * Draws Uru into `parent`, back to front: the floor ring, the arm turned away, the body, its seams, skirt, band,
 * knot and patch, the face, the stalk and bead, the arm toward us.
 */
export function uru(P: Projector, C: Camera, parent: Element, o: UruOptions): UruDrawing {
  const s = o.s ?? 1, z0 = o.z ?? 0, S = C.S * s, zf = Math.sqrt(1 - C.k * C.k), V: Vec3 = [Math.sin(C.az) * zf, Math.cos(C.az) * zf, C.k];
  const g = mk("g", {}, parent), pth = (cls: string, into: Element) => mk("path", { class: cls, d: "" }, into);
  if (o.ground !== false) mk("path", { class: "nf lo", d: poly(circ(RMAX + 1.3, 64).map((q) => P(o.x + q.u * s, o.y + q.v * s, z0))) }, g);
  const body = mk("g", {}, g), backArm = mk("g", {}, body);
  const U = {
    body: pth("sil", body), seams: pth("nf dash", body), skirt: pth("sil", body), skirtLine: pth(o.skirt === false ? "nf dash" : "nf lo", body),
    band: pth("hi", body), rib: pth("nf lo", body), knot: pth("", body), tails: pth("nf lo", body),
    patch: pth("", body), stitch: pth("nf dash", body), rune: pth("nf sil", body),
    bezel: pth("sil", body), face: pth("ink", body), cheeks: [pth("blush", body), pth("blush", body)], eyes: [pth("warm", body), pth("warm", body)],
    collar: pth("", body), stalk: pth("", body), bead: pth("sil", body), beadLine: pth("nf lo", body), cap: pth("nf", body),
  };
  const frontArm = mk("g", {}, body);
  const arms = [1, -1].map((side) => {
    const a = mk("g", {}, body);
    return { side, g: a, thumb: pth("sil", a), mitt: pth("sil", a), cuff: pth("nf lo", a), crease: pth("nf lo", a) };
  });
  const foot = P(o.x, o.y, z0);
  const bx = spring(0), by = spring(0);
  let beadReady = false, beadBase: Vec2 = [0, 0], beadMid: Vec2 = [0, 0], drawnBead: Vec2 = [NaN, NaN], key = "";

  /** The pose's frame: Uru's own (forward, left, up) to the screen, and what faces the camera. */
  function frame(p: UruPose, lk: Look) {
    const yaw = p.yaw, lean = p.lean + lk.lean, roll = p.roll + lk.tilt;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cl = Math.cos(lean), sl = Math.sin(lean), cr = Math.cos(roll), sr = Math.sin(roll);
    const rot = (f: number, l: number, z: number): Vec3 => {
      const l1 = l * cr - z * sr, z1 = l * sr + z * cr, f2 = f * cl + z1 * sl, z2 = z1 * cl - f * sl;
      return [f2 * cy - l1 * sy, f2 * sy + l1 * cy, z2];
    };
    const W = (f: number, l: number, z: number): Vec2 => { const w = rot(f, l, z); return P(o.x + w[0] * s, o.y + w[1] * s, z0 + w[2] * s); };
    const facesUs = (n: Vec3) => { const w = rot(n[0], n[1], n[2]); return w[0] * V[0] + w[1] * V[1] + w[2] * V[2]; };
    const surf = (a: number, z: number, dr = 0): Vec2 => { const r = uruR(z) + dr; return W(r * Math.cos(a), r * Math.sin(a), z); };
    const vis = (a: number, z: number, k = dR(z)) => { const m = Math.hypot(1, k); return facesUs([Math.cos(a) / m, Math.sin(a) / m, -k / m]); };
    return { W, facesUs, surf, vis };
  }
  type Frame = ReturnType<typeof frame>;
  const zs = steps(ZB, ZS, 12).concat(steps(0.1, 1, 9).map((t) => ZS + (ZT - ZS) * Math.sin((t * Math.PI) / 2)));
  const silhouette = (F: Frame) => hull(zs.flatMap((z) => Array.from({ length: 40 }, (_, i) => F.surf((i / 40) * Math.PI * 2, z))));
  /** A mitten: its shoulder, its axis and the two directions across it, at the arm's raise and reach. */
  function arm(F: Frame, side: number, th: number, fw: number) {
    const as = side * (Math.PI / 2 + 0.06), rs = uruR(SHOULDER) - 0.6, sh: Vec3 = [rs * Math.cos(as), rs * Math.sin(as), SHOULDER];
    let d: Vec3 = [fw, side * Math.sin(th), -Math.cos(th)];
    const dl = Math.hypot(d[0], d[1], d[2]); d = [d[0] / dl, d[1] / dl, d[2] / dl];
    const f1: Vec3 = [1 - d[0] * d[0], -d[0] * d[1], -d[0] * d[2]], fl = Math.hypot(f1[0], f1[1], f1[2]), e1: Vec3 = [f1[0] / fl, f1[1] / fl, f1[2] / fl];
    const e2: Vec3 = [d[1] * e1[2] - d[2] * e1[1], d[2] * e1[0] - d[0] * e1[2], d[0] * e1[1] - d[1] * e1[0]];
    const along = (t: number, e: Vec3 = [0, 0, 0], k = 0): Vec2 => F.W(sh[0] + d[0] * t + e[0] * k, sh[1] + d[1] * t + e[1] * k, sh[2] + d[2] * t + e[2] * k);
    const disk = (q: Vec2, r: number) => ring2(q[0], q[1], r * S, r * S, 18);
    const mitt = hull(disk(along(0), 1.2).concat(disk(along(2.4), 1.4), disk(along(5), 1.8)));
    return { as, e1, e2, along, disk, mitt };
  }
  const near = (F: Frame, z: number, dr: number, k?: number, n = 72): Vec2[] => {
    const as = Array.from({ length: n }, (_, i) => (i / n) * Math.PI * 2), ok = as.map((a) => F.vis(a, z, k) > 0);
    const st = Math.max(0, ok.findIndex((v, i) => v && !ok[(i + n - 1) % n])), out: Vec2[] = [];
    for (let j = 0; j < n && ok[(st + j) % n]; j++) out.push(F.surf(as[(st + j) % n], z, dr));
    return out;
  };

  function draw(p: UruPose, lk: Look, shut = 0) {
    const k = [p.yaw, p.lean, p.roll, p.lu, p.lv, p.ta, p.fa, p.tb, p.fb, ...lk.eyes.flatMap((e) => [e.x, e.y, e.w, e.h, e.arch, e.lid]),
      lk.cheek, lk.gu, lk.gv, lk.tilt, lk.lean, lk.bead, shut].map((v) => v.toFixed(4)).join();
    if (k === key) return;
    key = k;
    const F = frame(p, lk);
    /** A point of the face's chart (u across, v up), held on the near side of the limb. */
    const onFace = (u: number, v: number, dr = 0.1): Vec2 => {
      let a = u / uruR(v);
      if (F.vis(a, v) < 0.03) { let lo = 0, hi = a; for (let i = 0; i < 10; i++) { const m = (lo + hi) / 2; if (F.vis(m, v) > 0.03) lo = m; else hi = m; } a = lo; }
      return F.surf(a, v, dr);
    };
    const chart = (pts: Vec2[], dr = 0.1) => poly(pts.map(([u, v]) => onFace(u, v, dr)));
    U.body.setAttribute("d", poly(silhouette(F)));
    // the seams, stitched down five panels, above and below the band, only where they face us
    let seams = "";
    for (const a of [0.98, -0.98, 2.15, -2.15, Math.PI]) for (const [za, zb] of [[1.9, BAND[0] - 0.3], [BAND[1] + 0.4, ZT - 0.5]]) {
      let line: Vec2[] = [];
      for (const z of steps(za, zb, 18)) { if (F.vis(a, z) > 0.04) line.push(F.surf(a, z, 0.05)); else { if (line.length > 1) seams += open(line); line = []; } }
      if (line.length > 1) seams += open(line);
    }
    U.seams.setAttribute("d", seams);
    // the gliding skirt, flared, and the bumper line round it
    const skirt = o.skirt !== false;
    U.skirt.setAttribute("d", skirt ? poly(near(F, ZB + 0.9, 0.15).concat(near(F, 0, 0.6).reverse())) : "");
    U.skirtLine.setAttribute("d", skirt ? open(near(F, 0.75, 0.42)) : open(near(F, ZB + 0.55, 0.04)));
    // the knit band: a short cylinder round the waist, so its ends are its own limbs; its ribbing; the knot and two tails
    const bTop = near(F, BAND[1], BD, 0), bandPts = bTop.concat(near(F, BAND[0], BD, 0).reverse()), ends = [0, bTop.length - 1, bTop.length, bandPts.length - 1];
    U.band.setAttribute("d", poly(fillet(bandPts, bandPts.map((_, i) => (ends.includes(i) ? 0.45 * S : 0.2 * S)), 2)));
    let rib = "";
    for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2; if (F.vis(a, (BAND[0] + BAND[1]) / 2, 0) > 0.12) rib += seg(F.surf(a, BAND[0] + 0.32, BD + 0.01), F.surf(a, BAND[1] - 0.32, BD + 0.01)); }
    U.rib.setAttribute("d", rib);
    const ka = -0.55, kz = (BAND[0] + BAND[1]) / 2 + 0.2, kr = uruR(kz) + BD + 0.15;
    const tail = (da: number, len: number) => steps(0, 1, 8).map((t) => { const a = ka + da * (0.35 + t), r = kr + 0.25 * t; return F.W(r * Math.cos(a), r * Math.sin(a), kz - 0.25 - len * t); });
    const knotOk = F.vis(ka, kz, 0) > 0.1;
    const tl = [tail(-0.08, 2.8), tail(0.065, 2.2)];
    U.knot.setAttribute("d", !knotOk ? "" : tl.map((pts) => poly(ribbon(pts, (t) => (0.62 + 0.28 * t) * S))).join("")
      + poly(ring2(0, 0, 0.66, 0.52, 16).map(([u, v]) => F.W(kr * Math.cos(ka + u / kr), kr * Math.sin(ka + u / kr), kz + v))));
    U.tails.setAttribute("d", !knotOk ? "" : tl.map((pts) => open(pts.slice(1))).join("") + tl.map((pts) => { const q = ribbon(pts.slice(-2), () => 0.8 * S); return seg(q[1], q[2]); }).join(""));
    // the stitched patch on the chest, its rune tone on tone: the stem on the left as we see it, the arm stepping down to the right
    U.patch.setAttribute("d", chart(ring2(0, BADGE, 1.38, 1.38), 0.16));
    U.stitch.setAttribute("d", chart(ring2(0, BADGE, 1.06, 1.06), 0.18));
    U.rune.setAttribute("d", open(([[0.46, -0.72], [0.46, 0.72], [-0.46, -0.02], [-0.46, -0.72]] as Vec2[]).map(([u, v]) => onFace(u, BADGE + v, 0.2))));
    // the face: a soft bezel, the dark window, two cheeks and two eyes, nothing between the eyes
    U.bezel.setAttribute("d", chart(squircle(0, FACE.v, FACE.hu + 0.55, FACE.hv + 0.5, 4, 48), 0.06));
    U.face.setAttribute("d", chart(squircle(0, FACE.v, FACE.hu, FACE.hv, 4, 48), 0.12));
    const gu = lk.gu + p.lu, gv = lk.gv + p.lv;
    U.cheeks.forEach((el, i) => el.setAttribute("d", chart(ring2((i ? -1 : 1) * 3.05 + gu * 0.4, 14.75 + gv * 0.35, 0.78 * lk.cheek, 0.42 * (0.8 + 0.2 * lk.cheek), 18), 0.15)));
    U.eyes.forEach((el, i) => el.setAttribute("d", chart(eyePts(lk.eyes[i], gu, gv, shut), 0.16)));
    // the lantern bead on its soft stalk, from a collar on the crown; it lags the body on a spring
    beadBase = F.W(0.1, 0, ZT - 0.25);
    beadMid = F.W(0.25 + Math.max(0, -lk.bead) * 0.5, 0, ZT + 1.5 + lk.bead * 0.35);
    const bc = F.W(0.4 + Math.max(0, -lk.bead) * 1.5, 0, ZT + 3.6 + lk.bead * 0.7 - Math.max(0, -lk.bead) * 0.6);
    if (!beadReady) { bx.x = bc[0]; by.x = bc[1]; beadReady = true; }
    bx.t = bc[0]; by.t = bc[1];
    U.collar.setAttribute("d", poly(hull(steps(0, 19, 20).flatMap((i) => { const a = (i / 20) * Math.PI * 2; return [F.W(0.85 * Math.cos(a), 0.85 * Math.sin(a), ZT - 0.55), F.W(0.55 * Math.cos(a), 0.55 * Math.sin(a), ZT + 0.15)]; }))));
    drawnBead = [NaN, NaN];
    drawBead();
    // the arms: mittens with a thumb peeking out ahead and a ribbed cuff; the one turned away goes behind the body
    for (const A of arms) {
      const M = arm(F, A.side, A.side > 0 ? p.ta : p.tb, A.side > 0 ? p.fa : p.fb);
      A.thumb.setAttribute("d", poly(hull(M.disk(M.along(3.5, M.e1, 1.45), 0.62).concat(M.disk(M.along(4.5, M.e1, 1.65), 0.58)))));
      A.mitt.setAttribute("d", poly(M.mitt));
      let cuff = "";
      for (const t of [2.75, 3.15]) {
        const pts: Vec2[] = [];
        for (let i = 0; i <= 28; i++) {
          const a = (i / 28) * Math.PI * 2, n: Vec3 = [M.e1[0] * Math.cos(a) + M.e2[0] * Math.sin(a), M.e1[1] * Math.cos(a) + M.e2[1] * Math.sin(a), M.e1[2] * Math.cos(a) + M.e2[2] * Math.sin(a)];
          if (F.facesUs(n) > 0) pts.push(M.along(t, n, 1.55)); else if (pts.length) break;
        }
        cuff += open(pts);
      }
      A.cuff.setAttribute("d", cuff);
      A.crease.setAttribute("d", open([M.along(3.7, M.e1, 0.95), M.along(4.6, M.e1, 0.75), M.along(5.4, M.e1, 0.35)]));
      const slot = F.facesUs([Math.cos(M.as), Math.sin(M.as), 0]) > -0.15 ? frontArm : backArm;
      if (A.g.parentNode !== slot) slot.appendChild(A.g);
    }
  }
  function drawBead() {
    if (bx.x === drawnBead[0] && by.x === drawnBead[1]) return;
    drawnBead = [bx.x, by.x];
    const cx = bx.x, cy = by.x, r = 1.12 * S, base = beadBase, mid = beadMid, ctl: Vec2 = [mid[0] * 2 - (base[0] + cx) / 2, mid[1] * 2 - (base[1] + cy + r) / 2];
    const q = (t: number): Vec2 => { const u = 1 - t; return [u * u * base[0] + 2 * u * t * ctl[0] + t * t * cx, u * u * base[1] + 2 * u * t * ctl[1] + t * t * (cy + r * 0.8)]; };
    U.stalk.setAttribute("d", poly(ribbon(steps(0, 1, 10).map(q), (t) => (0.66 - 0.12 * t) * S)));
    U.bead.setAttribute("d", poly(ring2(cx, cy, r, r)));
    U.beadLine.setAttribute("d", open(steps(0, Math.PI, 13).map((t): Vec2 => [cx + r * 0.98 * Math.cos(t), cy + r * 0.9 * C.k * Math.sin(t)])));
    U.cap.setAttribute("d", poly(ring2(cx, cy - r * 0.86, r * 0.38, r * 0.38 * C.k, 14)));
  }
  return {
    g, body, band: U.band, outline: [U.body, U.skirt, arms[0].mitt, arms[1].mitt, arms[0].thumb, arms[1].thumb, U.bead],
    draw,
    step: (dt) => { const a = stepS(bx, dt), b = stepS(by, dt); drawBead(); return a || b; },
    breathe: (v) => body.setAttribute("transform", `translate(${foot[0].toFixed(2)} ${foot[1].toFixed(2)}) scale(${(1 - 0.01 * v).toFixed(4)} ${(1 + 0.025 * v).toFixed(4)}) translate(${(-foot[0]).toFixed(2)} ${(-foot[1]).toFixed(2)})`),
    hull: (p) => {
      const F = frame(p, LOOKS.rest), A = [arm(F, 1, p.ta, p.fa), arm(F, -1, p.tb, p.fb)];
      return hull(silhouette(F).concat(A[0].mitt, A[1].mitt, ring2(...F.W(0.4, 0, ZT + 3.6), 1.4 * S, 1.4 * S, 12), near(F, 0, 0.6)));
    },
    foot, bead: () => [bx.x, by.x],
  };
}

/* ---------- shared solids ---------- */

/** A body of revolution: its radius at height z over its foot, its height, its widest radius and where that is. */
export type Profile = { H: number; R: number; zc: number; r: (z: number) => number };
/** Uru's own profile at scale s, from its foot up, shrunk by `inset` all round: the cover, and the shell and frame inside it. */
export function profile(s: number, inset = 0): Profile {
  const r = (z: number) => Math.max(0, s * uruR(ZB + z / s) - inset);
  let H = (ZT - ZB) * s;
  while (H > 0 && r(H) < 0.4) H -= 0.05;
  return { H, R: RMAX * s - inset, zc: (ZM - ZB) * s, r };
}

/** A ring of radius R about (cx, cy). */
export const disc = (cx: number, cy: number, R: number, n = 48): Ring => circ(R, n).map((q) => ({ ...q, u: q.u + cx, v: q.v + cy }));
/** The world direction toward the camera: what a surface must face to be seen. */
export const toward = (C: Camera): Vec3 => { const zf = Math.sqrt(1 - C.k * C.k); return [Math.sin(C.az) * zf, Math.cos(C.az) * zf, C.k]; };
export const norm = (a: Vec3): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const along3 = (a: Vec3, d: Vec3, t: number): Vec3 => [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t];

/** The visible runs of a sampled curve, as open subpaths; on a closed curve a run may wrap round its end. */
export function runs(pts: readonly Vec2[], vis: readonly boolean[], closed = false): string {
  const n = pts.length, st = closed ? vis.indexOf(false) : -1;
  if (closed && st < 0) return poly(pts);
  let d = "", cur: Vec2[] = [];
  for (let k = 0; k < n; k++) {
    const i = closed ? (st + 1 + k) % n : k;
    if (vis[i]) cur.push(pts[i]);
    else { d += open(cur); cur = []; }
  }
  return d + open(cur);
}

/** A squircle about (a0, b0), A across and B up from its middle, sampled: windows, patches, plates. */
export const squircle = (a0: number, b0: number, A: number, B: number, e = 4.5, m = 64): Vec2[] =>
  Array.from({ length: m }, (_, i) => {
    const t = (2 * Math.PI * i) / m, c = Math.cos(t), sn = Math.sin(t);
    return [a0 + A * Math.sign(c) * Math.pow(Math.abs(c), 2 / e), b0 + B * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / e)];
  });
/** An ellipse about (a0, b0), sampled. */
export const oval = (a0: number, b0: number, A: number, B: number, m = 24): Vec2[] =>
  Array.from({ length: m }, (_, i) => [a0 + A * Math.cos((2 * Math.PI * i) / m), b0 + B * Math.sin((2 * Math.PI * i) / m)]);

/** A body of revolution standing at (cx, cy), and what can be drawn on it. */
export type Body = {
  pf: Profile;
  /** The world point at angle phi and height z, d out of the surface. */
  w(phi: number, z: number, d?: number): Vec3;
  at(phi: number, z: number, d?: number): Vec2;
  /** Whether the surface faces the camera there. */
  sees(phi: number, z: number): boolean;
  /** The latitude at z, d out: its visible run, or the whole ring where all of it faces the camera. */
  lat(z: number, d?: number, n?: number): string;
  /** The meridian at phi from z0 to z1, d out: its visible part. */
  mer(phi: number, z0: number, z1: number, d?: number, n?: number): string;
  /** The silhouette's screen points: rings up the body, each out by bulge(z). */
  outline(n?: number, bulge?: (z: number) => number): Vec2[];
  /** A patch on the surface facing theta: (a, b) is arc length across and height, d out. */
  patch(theta: number, d?: number): (a: number, b: number) => Vec2;
  /** Whether a patch point faces the camera. */
  patchSees(theta: number): (a: number, b: number) => boolean;
};

export function body(P: Projector, C: Camera, pf: Profile, cx = 0, cy = 0): Body {
  const v = toward(C), { r, H } = pf;
  const dr = (z: number) => { const a = clamp(z - 0.05, 0, H), b = clamp(z + 0.05, 0, H); return (r(b) - r(a)) / (b - a); };
  const w = (phi: number, z: number, d = 0): Vec3 => [cx + (r(z) + d) * Math.cos(phi), cy + (r(z) + d) * Math.sin(phi), z];
  const at = (phi: number, z: number, d = 0): Vec2 => { const q = w(phi, z, d); return P(q[0], q[1], q[2]); };
  const sees = (phi: number, z: number) => Math.cos(phi) * v[0] + Math.sin(phi) * v[1] - dr(z) * v[2] > 0;
  const ang = (theta: number, a: number, b: number) => theta + a / Math.max(r(b), 2);
  return {
    pf, w, at, sees,
    lat: (z, d = 0, n = 96) => {
      const phis = Array.from({ length: n }, (_, k) => (2 * Math.PI * k) / n);
      return runs(phis.map((p) => at(p, z, d)), phis.map((p) => sees(p, z)), true);
    },
    mer: (phi, z0, z1, d = 0, n = 18) => {
      const zz = Array.from({ length: n + 1 }, (_, k) => lerp(z0, z1, k / n));
      return runs(zz.map((z) => at(phi, z, d)), zz.map((z) => sees(phi, z)));
    },
    outline: (n = 32, bulge = () => 0) => {
      const pts: Vec2[] = [];
      for (let k = 0; k <= n; k++) {
        const z = H * (1 - Math.pow(1 - k / n, 1.6)), rr = r(z) + bulge(z);
        for (let j = 0; j < 120; j++) { const p = (2 * Math.PI * j) / 120; pts.push(P(cx + rr * Math.cos(p), cy + rr * Math.sin(p), z)); }
      }
      return hull(pts);
    },
    patch: (theta, d = 0.1) => (a, b) => at(ang(theta, a, b), b, d),
    patchSees: (theta) => (a, b) => sees(ang(theta, a, b), b),
  };
}

/** A tapered capsule from A to B, radius ra to rb, as screen points for a hull: a stalk, a pencil, a cable end. */
export function capsule(P: Projector, S: number, A: Vec3, B: Vec3, ra: number, rb: number, n = 7, ease = 1): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, q = P(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)), rr = lerp(ra, rb, Math.pow(t, ease)) * S;
    for (let j = 0; j < 40; j++) pts.push([q[0] + rr * Math.cos((j * Math.PI) / 20), q[1] + rr * Math.sin((j * Math.PI) / 20)]);
  }
  return pts;
}

/** A ring round an axis: centre M, axis dir, radius rr; its visible run (facing the camera from outside). */
export function hoop(P: Projector, C: Camera, M: Vec3, dir: Vec3, rr: number, n = 32): string {
  const v = toward(C), e1 = norm(Math.abs(dir[2]) > 0.95 ? cross(dir, [1, 0, 0]) : cross(dir, [0, 0, 1])), e2 = cross(dir, e1);
  const pts: Vec2[] = [], vis: boolean[] = [];
  for (let k = 0; k < n; k++) {
    const t = (2 * Math.PI * k) / n, nn: Vec3 = [e1[0] * Math.cos(t) + e2[0] * Math.sin(t), e1[1] * Math.cos(t) + e2[1] * Math.sin(t), e1[2] * Math.cos(t) + e2[2] * Math.sin(t)];
    const q = along3(M, nn, rr);
    pts.push(P(q[0], q[1], q[2])); vis.push(dot3(nn, v) > 0);
  }
  return runs(pts, vis, true);
}

/** A flat ring at height z about (x, y), projected. */
export const ringAt3 = (P: Projector, x: number, y: number, z: number, rr: number, n = 24): Vec2[] =>
  Array.from({ length: n }, (_, k) => P(x + rr * Math.cos((2 * Math.PI * k) / n), y + rr * Math.sin((2 * Math.PI * k) / n), z));
