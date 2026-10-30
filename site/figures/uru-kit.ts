import { lerp, open, poly, seg, type Camera, type Projector, type Vec2, type Vec3 } from "../hairline/core/iso";

/**
 * Uru, drawn: what every Uru figure shares (uru-sealed, uru-faces, and the
 * icons), so Uru is the same creature wherever it shows. Uru is never drawn
 * whole. What shows is its face: a dark window, the drawing's one dark solid,
 * with two white dome eyes and two grey cheeks on it, and nothing ever drawn
 * between the eyes. Its expressions are here (LOOKS), with the morph from one
 * to the next (mixLook) and the marks of one, blink and all (faceMarks), in
 * face units, for a figure to lay on whatever plane its face is on. So is the
 * rune ᚢ its seals carry. Also here: the few small helpers the figures share.
 * Nothing here touches the DOM at import.
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

/** The face window in face units: its middle's height, and its half width and half height. */
export const FACE = { v: 16.3, hu: 4.9, hv: 3.1 };
/**
 * The rune ᚢ sewn on Uru's seals, as its centre line on a seal of radius 1 (across to the right as we see it, up):
 * the stem on the left, the roof falling to the right at the mark's 32 degrees, and the shorter leg straight down
 * to the stem's baseline. A letter drawn as paths, which rule 10 keeps out of a drawing: it is the one mark the
 * brand puts on Uru's things, so it stays, small, on the seal.
 */
export const RUNE: readonly Vec2[] = [[-0.2406, -0.5217], [-0.2406, 0.5217], [0.2406, 0.2217], [0.2406, -0.5217]];

/** The face window, a squircle about its middle in face units: the same for every look, so it is computed once. */
const WINDOW: Vec2[] = Array.from({ length: 48 }, (_, i) => {
  const t = (2 * Math.PI * i) / 48, c = Math.cos(t), sn = Math.sin(t);
  return [FACE.hu * Math.sign(c) * Math.pow(Math.abs(c), 0.5), FACE.hv * Math.sign(sn) * Math.pow(Math.abs(sn), 0.5)];
});

/* ---------- the look: eyes, cheeks, gaze ---------- */

/** One eye in face units (u across, v up): its centre's u, its foot's v, width and height; `arch` bends it into ^, `lid` into a low ◡. */
export type EyeShape = { x: number; y: number; w: number; h: number; arch: number; lid: number };
/** A whole expression: two eyes, the cheeks' size, and the gaze, in face units across (+ to the left as we see it) and up. */
export type Look = { eyes: readonly [EyeShape, EyeShape]; cheek: number; gu: number; gv: number };
const E = (x: number, y = 15.95, w = 1.7, h = 1.15, arch = 0, lid = 0): EyeShape => ({ x, y, w, h, arch, lid });
const look = (l: EyeShape, r: EyeShape, o: Partial<Look> = {}): Look => ({ eyes: [l, r], cheek: 1, gu: 0, gv: 0, ...o });
/** The strategy's expressions (section 6.3). Rest is the plain domes, which read as gently smiling. */
export const LOOKS = {
  rest: look(E(1.6), E(-1.6)),
  happy: look(E(1.6, 16.05, 1.75, 1.2, 1), E(-1.6, 16.05, 1.75, 1.2, 1), { cheek: 1.3 }),
  curious: look(E(1.6, 15.85, 1.75, 1.55), E(-1.6, 16.05, 1.6, 0.95), { gu: 0.25, gv: 0.15 }),
  listening: look(E(1.7, 15.75, 1.95, 1.45), E(-1.7, 15.75, 1.95, 1.45), { cheek: 1.05 }),
  thinking: look(E(1.6, 16.2, 1.45, 0.95), E(-1.6, 16.2, 1.45, 0.95), { cheek: 0.85, gu: 0.85, gv: 0.7 }),
  sleepy: look(E(1.6, 15.75, 1.8, 0.62, 0, 1), E(-1.6, 15.75, 1.8, 0.62, 0, 1), { cheek: 0.8 }),
} satisfies Record<string, Look>;
export type LookName = keyof typeof LOOKS;
const mixE = (a: EyeShape, b: EyeShape, t: number): EyeShape =>
  ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t), arch: lerp(a.arch, b.arch, t), lid: lerp(a.lid, b.lid, t) });
/** A look between two, t of the way from a to b: how one expression morphs into the next. */
export const mixLook = (a: Look, b: Look, t: number): Look => ({
  eyes: [mixE(a.eyes[0], b.eyes[0], t), mixE(a.eyes[1], b.eyes[1], t)],
  cheek: lerp(a.cheek, b.cheek, t), gu: lerp(a.gu, b.gu, t), gv: lerp(a.gv, b.gv, t),
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
 * A look's marks in face units about the window's middle (u across, + to the left as we see it, v up), for laying
 * Uru's face on a plane: the window, the two eyes and the two cheeks, `shut` of the way through a blink.
 */
export function faceMarks(lk: Look, shut = 0): { window: Vec2[]; eyes: Vec2[][]; cheeks: Vec2[][] } {
  const c = (pts: Vec2[]) => pts.map(([u, v]): Vec2 => [u, v - FACE.v]);
  return {
    window: WINDOW,
    eyes: lk.eyes.map((e) => c(eyePts(e, lk.gu, lk.gv, shut))),
    cheeks: [1, -1].map((k) => c(ring2(k * 3.05 + lk.gu * 0.4, 14.75 + lk.gv * 0.35, 0.78 * lk.cheek, 0.42 * (0.8 + 0.2 * lk.cheek), 18))),
  };
}

/* ---------- small helpers the figures share ---------- */

/** A fixed pseudo-random number in [0, 1) for n. */
export const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
/** n evenly spaced values from a to b, both ends included. */
export const steps = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / Math.max(1, n - 1));
/** A screen ellipse about (cx, cy). */
export const ring2 = (cx: number, cy: number, rx: number, ry = rx, n = 24): Vec2[] =>
  Array.from({ length: n }, (_, i) => [cx + rx * Math.cos((i / n) * Math.PI * 2), cy + ry * Math.sin((i / n) * Math.PI * 2)]);
/** The world direction toward the camera: what a surface must face to be seen. */
export const toward = (C: Camera): Vec3 => { const zf = Math.sqrt(1 - C.k * C.k); return [Math.sin(C.az) * zf, Math.cos(C.az) * zf, C.k]; };

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

/** Even-odd: whether a screen point is inside a polygon. */
export function inside([x, y]: Vec2, pg: readonly Vec2[]) {
  let c = false;
  for (let i = 0, j = pg.length - 1; i < pg.length; j = i++) if ((pg[i][1] > y) !== (pg[j][1] > y) && x < ((pg[j][0] - pg[i][0]) * (y - pg[i][1])) / (pg[j][1] - pg[i][1]) + pg[i][0]) c = !c;
  return c;
}

/** Section hatch at 45° across the cut plane y = c (or x = c), from a0 to a1 along it and z0 to z1 up it. */
export function hatch(P: Projector, axis: "x" | "y", c: number, a0: number, a1: number, z0: number, z1: number, gap = 1.7) {
  const h = z1 - z0, Q = (a: number, z: number) => (axis === "y" ? P(a, c, z) : P(c, a, z));
  let d = "";
  for (let a = a0 - h + gap / 2; a < a1; a += gap) {
    const s0 = Math.max(a, a0), s1 = Math.min(a + h, a1);
    if (s1 - s0 > 0.3) d += seg(Q(s0, z0 + (s0 - a)), Q(s1, z0 + (s1 - a)));
  }
  return d;
}
