import { Cam, facing, fillet, fit, hull, poly, prism, proj, quad, ringAt, rings, rrect, seg, unproj, type Sample, type Vec2 } from "../hairline/core/iso";
import { tset, tval, tdone, tween, type Tween } from "../hairline/core/motion";
import { disposer, mk, pointer, put, register, solid, wave, type FigureMount, type Solid } from "../hairline/core/stage";

/**
 * Demo: a small card-catalogue cabinet on a recessed plinth, two columns of
 * three drawers, each front with a label holder (its card blank), a bar pull
 * and a rod hole; two loose cards lie on the top. Every drawer holds a row of
 * index cards standing on edge, their tabs staggered, every fourth a guide
 * card with a taller tab and a dot on it.
 *
 * The pointer picks a drawer: it slides out on the 700ms lift curve and takes
 * the bright stroke, and the dots on its guide tabs switch on front to back;
 * the drawers round it slide out less by their distance on the grid,
 * staggered outwards from it. At rest a few drawers stand ajar and drawer 2
 * is bright. The read-out names the drawer, "drawer 1" to "drawer 6" in
 * reading order. The slider is the slide, in world units: 14, 21, 28.
 *
 * The pattern: one of many, as Riffle's. The hit test is the face of the
 * cabinet at rest, cut into one band per drawer, and the picked drawer's
 * target pose in front of it (rule 01); a drawer is drawn only from the face
 * out, so nothing inside the cabinet paints over it (rule 06).
 */

// The cabinet: W wide (x), D deep (y), on a plinth PZ tall; RL the rails between the drawers, OH an opening's
// height, ST the stiles; the top TS thick, overhanging by TO.
const W = 84, D = 50, PZ = 6, RL = 2.4, OH = 14, ST = 2.2, TS = 3.2, TO = 1.6;
const OW = (W - 3 * ST) / 2, TOP = PZ + RL + 3 * (OH + RL);
// A drawer: its front FT thick, proud of the face by LIP; its box TW-walled, WH tall; the cards in it.
const FT = 1.8, LIP = 0.6, TW = 0.9, WH = 8.4, NC = 11, CH = 9.4;
// The answer: each drawer's slide at rest (reading order), the share of the slide by grid distance, the stagger;
// the longest slide, and how far in front of the face the bands reach, past a neighbour's share of it.
const REST = [2.5, 7, 0, 3.5, 1.5, 0], STEP = 45, MAX = 28, REACH = 9;
const SHARE = [1, 0.22, 0.09, 0.04];

type Drawer = {
  c: number; r: number; x0: number; x1: number; zb: number; tw: Tween; drawn: number;
  body: SVGPathElement; rim: SVGPathElement; cards: SVGPathElement[]; dots: SVGPathElement[]; wall: SVGPathElement; edge: SVGPathElement;
  front: Solid; holder: SVGPathElement; blank: SVGPathElement; pull: Solid; hole: SVGPathElement;
};

/** A fixed jitter in [-1, 1], so the cards stand as cards do. */
const jit = (k: number) => Math.sin(k * 12.9898 + 4.1) * 0.5 + Math.sin(k * 3.7) * 0.5;
/** Even-odd: whether a screen point is inside a polygon. */
function inside([x, y]: Vec2, pg: readonly Vec2[]) {
  let c = false;
  for (let i = 0, j = pg.length - 1; i < pg.length; j = i++) {
    const [xi, yi] = pg[i], [xj, yj] = pg[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/** An index card's outline in its own plane, u across and v up: a tab on its top edge, from t0 to t1, th tall. */
const card = (u0: number, u1: number, v0: number, v1: number, t0: number, t1: number, th: number) =>
  fillet([[u0, v0], [u1, v0], [u1, v1], [t1, v1], [t1 - 0.5, v1 + th], [t0 + 0.5, v1 + th], [t0, v1], [u0, v1]], [0.5, 0.5, 0.6, 0.3, 0.5, 0.5, 0.3, 0.6], 2);

export const mount: FigureMount = ({ stage, svg, read }, value) => {
  const bag = disposer();
  let slide = Math.min(MAX, value);
  const C = Cam(45, 0.5, 2.55);
  const front0 = D + LIP + MAX + 1.4;
  fit(C, [[0, 0, 0], [W, 0, 0], [0, D, 0], [-TO, -TO, TOP + TS], [W + TO, D + TO, TOP + TS], [ST, front0, PZ + RL], [W - ST, front0, PZ + RL], [ST, front0, TOP - RL]], 200, 162);
  const P = proj(C);
  // the face's frame: u along x, v up, h out of the wall along y; and which way faces the camera in it
  const u0 = unproj(C, 0, 0, 0), u1 = unproj(C, 0, 0, 1), vx = u1[0] - u0[0];
  const F = (u: number, v: number, h: number) => P(u, h, v), frontF = (q: Sample) => q.nu * vx + q.nv > 0;
  const front = facing(C);
  const on = (h: number) => (a: number, b: number) => F(a, b, h);
  const g = mk("g", {}, svg);
  const path = (cls: string, d = "") => mk("path", { d, class: cls }, g);

  // The plinth, the carcass, the inset panel on its side, the drawers' openings, and the top with two loose cards on it.
  put(solid(g), prism(P, front, ...rings(2.4, 2.4, W - 2.4, D - 2.4, 2, 0.8), 0, PZ));
  put(solid(g), prism(P, front, rrect(0, 0, W, D, 2.4), null, PZ, TOP));
  path("nf lo", poly(rrect(5, PZ + 4, D - 5, TOP - 4, 2.4).map((q) => P(W, q.u, q.v))));
  const row = (r: number) => PZ + RL + (2 - r) * (OH + RL);
  for (let i = 0; i < 6; i++) {
    const x = ST + (i % 2) * (OW + ST), zb = row(Math.floor(i / 2));
    path("nf", quad(on(D), x, zb, x + OW, zb + OH, 1.8));
  }
  put(solid(g), prism(P, front, ...rings(-TO, -TO, W + TO, D + TO, 3.6, 1.2), TOP, TOP + TS));
  const flat = (cx: number, cy: number, w: number, d: number, deg: number, z: number) => {
    const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    return (u: number, v: number): Vec2 => P(cx + (u - w / 2) * c - (v - d / 2) * s, cy + (u - w / 2) * s + (v - d / 2) * c, z);
  };
  const lower = flat(24, 20, 30, 19, 9, TOP + TS), upper = flat(33, 30, 30, 19, -13, TOP + TS + 0.3);
  path("", quad(lower, 0, 0, 30, 19, 0.8));
  path("", quad(upper, 0, 0, 30, 19, 0.8));
  path("nf lo", [5, 8.5, 12, 15.5].map((v) => seg(upper(3, v), upper(27, v))).join("") + seg(upper(3, 3.4), upper(16, 3.4)));

  // The drawers, column by column from the far one, bottom row first, so a nearer or higher drawer paints over.
  const drawers: Drawer[] = [];
  for (const c of [0, 1]) for (const r of [2, 1, 0]) {
    const x0 = ST + c * (OW + ST) + 0.45, x1 = x0 + OW - 0.9, zb = row(r), i = r * 2 + c;
    const body = path("sil"), rim = path("nf lo");
    const cards = Array.from({ length: NC }, () => path("")), dots: SVGPathElement[] = [];
    for (let k = NC - 1; k >= 0; k--) {
      g.appendChild(cards[k]);
      cards[k].classList.toggle("sil", k % 4 === 1);
      if (k % 4 === 1) dots.unshift(path("dot off"));
    }
    drawers[i] = {
      c, r, x0, x1, zb, tw: tween(REST[i]), drawn: NaN, body, rim, cards, dots, wall: path("sil"), edge: path("nf lo"),
      front: solid(g), holder: path("nf"), blank: path("nf lo"), pull: solid(g), hole: path("nf lo"),
    };
  }

  /** Redraws drawer d slid out by s: the box from the face out, its cards, its front and what is on it. */
  function draw(d: Drawer, s: number) {
    if (s === d.drawn) return;
    d.drawn = s;
    const hf = D + LIP + s, hb = Math.max(D, hf - FT), bx0 = d.x0 + 1.2, bx1 = d.x1 - 1.2, zb0 = d.zb + 0.6, zw = d.zb + WH;
    const out = hb - D > 0.3;
    d.body.setAttribute("d", out ? prism(P, front, rrect(bx0, D, bx1, hb, 0.4), null, zb0, zw).sil : "");
    d.rim.setAttribute("d", out ? poly(ringAt(P, rrect(bx0 + TW, D, bx1 - TW, hb - TW, 0.3), zw)) : "");
    // the cards stand from the drawer's back, each its pitch behind the front; only those already out of the face are drawn
    let dot = 0;
    d.cards.forEach((el, k) => {
      const y = hb - 2.2 - k * 3.4 - jit(k + d.c * 7 + d.r * 3) * 0.5, guide = k % 4 === 1;
      const t0 = bx0 + TW + 2 + ((k + d.r) % 3) * 10.5, th = guide ? 2.6 : 1.7;
      const shown = out && y > D + 0.4;
      el.setAttribute("d", shown ? poly(card(bx0 + TW + 0.8, bx1 - TW - 0.8, d.zb + 1.4, d.zb + CH, t0, t0 + 9, th).map(([u, v]) => F(u, v, y))) : "");
      if (guide) d.dots[dot++].setAttribute("d", shown ? quad(on(y), t0 + 3.9, d.zb + CH + 0.7, t0 + 5.1, d.zb + CH + 1.9, 0.6) : "");
    });
    // the near wall's outer face covers the cards' feet; its inner top edge is the wall's thickness
    d.wall.setAttribute("d", out ? poly([P(bx1, D, zb0), P(bx1, hb, zb0), P(bx1, hb, zw), P(bx1, D, zw)]) : "");
    d.edge.setAttribute("d", out ? seg(P(bx1 - TW, D, zw), P(bx1 - TW, hb - TW, zw)) : "");
    put(d.front, prism(F, frontF, ...rings(d.x0, d.zb + 0.5, d.x1, d.zb + OH - 0.5, 1.6, 0.9), hb, hf));
    const cx = (d.x0 + d.x1) / 2, at = on(hf);
    d.holder.setAttribute("d", quad(at, cx - 6.5, d.zb + OH - 5, cx + 6.5, d.zb + OH - 1.7, 0.7));
    d.blank.setAttribute("d", quad(at, cx - 5.6, d.zb + OH - 4.2, cx + 5.6, d.zb + OH - 2.5, 0.3));
    put(d.pull, prism(F, frontF, ...rings(cx - 4, d.zb + 4.4, cx + 4, d.zb + 6.8, 1.2, 0.5), hf, hf + 1.4));
    d.hole.setAttribute("d", quad(at, cx - 0.7, d.zb + 1.5, cx + 0.7, d.zb + 2.9, 0.7));
  }

  // Hit areas. At rest the face is cut into one band per drawer, from rail to rail and a little in front of it; the
  // picked drawer adds its box at its target, in front of the bands it covers (rule 01).
  const box = (x0: number, x1: number, z0: number, z1: number, h1: number): Vec2[] =>
    hull([x0, x1].flatMap((x) => [z0, z1].flatMap((z) => [F(x, z, D), F(x, z, h1)])));
  const bands = drawers.map((d) => box(d.c ? W / 2 : -2, d.c ? W + 2 : W / 2, d.r === 2 ? 0 : d.zb - RL / 2, d.r === 0 ? TOP + TS : d.zb + OH + RL / 2, D + REACH));
  let act = -1;
  const hit = (p: Vec2) => {
    if (act >= 0) { const d = drawers[act]; if (inside(p, box(d.x0, d.x1, d.zb, d.zb + OH, D + LIP + d.tw.to + 1.4))) return act; }
    return bands.findIndex((b) => inside(p, b));
  };

  const B = register(stage, (_dt, now) => {
    let moving = false;
    for (const d of drawers) { draw(d, tval(d.tw, now)); if (!tdone(d.tw, now)) moving = true; }
    return moving;
  });
  bag.add(B.unregister);

  /** Sends every drawer to its target for the pick, staggered out from drawer `from` by distance on the grid (rule 02). */
  function aim(from: number) {
    const now = performance.now(), o = drawers[from];
    drawers.forEach((d, i) => {
      const far = Math.abs(d.c - o.c) + Math.abs(d.r - o.r);
      tset(d.tw, act < 0 ? REST[i] : slide * SHARE[Math.min(3, far)], now, far * STEP);
    });
    B.wake();
  }
  /** Picks drawer a (-1 is rest): it takes the bright stroke and its guide dots switch on, front to back, as it arrives. */
  function choose(a: number) {
    if (a === act) return;
    const from = a >= 0 ? a : act, lit = a >= 0 ? a : 1;
    act = a;
    aim(from);
    drawers.forEach((d, i) => {
      d.front.sil.classList.toggle("hi", i === lit);
      wave(d.dots, i !== a, 60, i === a ? 380 : 0, "off");
    });
    read.textContent = a < 0 ? "rest" : `drawer ${a + 1}`;
  }
  drawers[1].front.sil.classList.add("hi");
  read.textContent = "rest";

  bag.add(pointer(stage, { move: (p) => choose(hit(p)), leave: () => choose(-1) }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { slide = Math.min(MAX, v); if (act >= 0) aim(act); },
    destroy: bag.dispose,
  };
};
