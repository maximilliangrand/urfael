import {
  ghost, r2,
  type Camera, type PrismPaths, type Projector, type Sample, type Vec2,
} from "./iso";
import { setReducedMotion } from "./motion";

/**
 * Hairline — the DOM side every figure shares: making svg nodes, the helpers
 * that write a solid or a dot into them, the class switches CSS staggers, one
 * frame loop for every figure, the pointer, and the only reduced-motion query.
 *
 * Urfael change from MYG's copy: the glow kit is gone (its filters, lit decks
 * and light switches), so this is the paper engine: no filter is ever made
 * here, and nothing is lit. `wave` and `replay` stay, for the stylesheet's
 * paper classes.
 *
 * Everything comes apart. A page navigates away and back, and React's
 * StrictMode mounts twice. So `register` hands back an unregister, `pointer`
 * a disposer, and `disposer()` collects them so a figure's `destroy` is one
 * call. Once the last figure is unregistered no frame, observer or media
 * listener is left behind, and the next `register` starts them again.
 *
 * Nothing here touches `window` at import: the module is evaluated during
 * a server render too, so the loop, the observer and the media query are
 * created by the first `register`.
 */

/* ---------- the contract ---------- */

/** Where an engine writes its caption. Only `textContent` is ever touched, so it need not be an element. */
export type Readout = { textContent: string | null };
export type FigureEls = { stage: HTMLElement; svg: SVGSVGElement; read: Readout };
export type FigureHandle = { set(value: number): void; destroy(): void };
export type FigureMount = (els: FigureEls, value: number) => FigureHandle;

/* ---------- svg ---------- */

const NS = "http://www.w3.org/2000/svg";
export type Attrs = Record<string, string | number>;

/** One svg element, with its attributes, appended to `parent` when there is one. */
export function mk<K extends keyof SVGElementTagNameMap>(tag: K, attrs?: Attrs | null, parent?: Element | null): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  if (attrs) for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  if (parent) parent.appendChild(e);
  return e;
}

/** A solid's two paths in one group: the silhouette (`.sil`) and its crease (`.nf.lo`). */
export type Solid = { g: SVGGElement; sil: SVGPathElement; cr: SVGPathElement };
export function solid(parent: Element): Solid {
  const g = mk("g", {}, parent);
  return { g, sil: mk("path", { class: "sil" }, g), cr: mk("path", { class: "nf lo" }, g) };
}
/** Writes a prism's paths into a solid. */
export const put = (el: Solid, s: PrismPaths) => { el.sil.setAttribute("d", s.sil); el.cr.setAttribute("d", s.crease); };

/** A dot lying flat on a horizontal plane: an ellipse squashed by the camera. Position it with `place`. */
export const flatDot = (parent: Element, C: Camera, r: number, cls: string) =>
  mk("ellipse", { rx: r2(r * C.S), ry: r2(r * C.S * C.k), class: cls }, parent);
export const place = (el: SVGElement, q: Vec2) => { el.setAttribute("cx", String(r2(q[0]))); el.setAttribute("cy", String(r2(q[1]))); };

/** A vertical fade, as a mask, for reflections. Returns the `url(#…)` to put in a `mask` attribute. */
let fid = 0;
export function fade(svg: SVGSVGElement, y0: number, y1: number, a0 = 0.7): string {
  const id = "hl-fd" + ++fid, defs = mk("defs", {}, svg);
  const lg = mk("linearGradient", { id: id + "g", gradientUnits: "userSpaceOnUse", x1: 0, y1: r2(y0), x2: 0, y2: r2(y1) }, defs);
  mk("stop", { offset: 0, "stop-color": "#fff", "stop-opacity": a0 }, lg);
  mk("stop", { offset: 1, "stop-color": "#fff", "stop-opacity": 0 }, lg);
  const m = mk("mask", { id, maskUnits: "userSpaceOnUse", x: 0, y: 0, width: 400, height: 320 }, defs);
  mk("rect", { x: 0, y: 0, width: 400, height: 320, fill: `url(#${id}g)` }, m);
  return `url(#${id})`;
}

/** A prism's mirror under its floor: the far edge of the reflection and its two sides, fading out. */
export function reflect(
  svg: SVGSVGElement, parent: Element, P: Projector, front: (q: Sample) => boolean,
  ring: readonly Sample[], z0: number, depth: number,
) {
  const r = ghost(P, front, ring, z0, depth);
  const gh = mk("g", { class: "ghost", mask: fade(svg, r.y0, r.y1) }, parent);
  mk("path", { d: r.d }, gh);
}

/* ---------- switches ---------- */

/**
 * Runs a one-shot class animation again from its start: a `.trace` drawing
 * itself in with `go`, the default. Restarting needs a style flush between
 * taking the class off and putting it back, so call it on input, not per frame.
 */
export function replay(el: Element, cls = "go") {
  el.classList.remove(cls);
  void el.getBoundingClientRect();
  el.classList.add(cls);
}

/**
 * Toggles one class on a run of elements one after another, `step` ms apart in
 * the order given and the first after `delay` ms: each gets its place in the
 * wave as --hl-delay, and the stylesheet delays its stroke or fill change (or
 * a `.trace`'s draw) by it, so CSS staggers the switch and nothing ticks.
 * `cls` is what switches: `hi` for the bright stroke, `off` or `m` on dots,
 * `go` on traces. Order the elements out from the pointer (rule 02). Under
 * reduced motion they all switch at once.
 */
export function wave(els: Iterable<Element>, on: boolean, step = 70, delay = 0, cls = "hi") {
  let k = 0;
  for (const el of els) {
    (el as SVGElement).style.setProperty("--hl-delay", `${delay + k++ * step}ms`);
    el.classList.toggle(cls, on);
  }
}

/* ---------- one loop, asleep offscreen ---------- */

/** A figure's frame: dt in seconds (capped at 50ms), now in ms. Returns whether it wants another frame. */
export type Tick = (dt: number, now: number) => boolean | void;
export type Loop = {
  /** Ask for frames again after input; the loop runs until the tick returns false. */
  wake(): void;
  /** Leave the loop and the observer. Idempotent. */
  unregister(): void;
};
type Board = { stage: Element; tick: Tick; vis: boolean; awake: boolean };
/** On a stage while it is offscreen, so the stylesheet can pause its CSS draws too. */
const ASLEEP = "data-hairline-asleep";

let boards: Board[] = [];
const byStage = new Map<Element, Board>();
let raf = 0, last = 0;
let io: IntersectionObserver | null = null;
let rm: MediaQueryList | null = null;

function frame(now: number) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  let any = false;
  for (const b of boards.slice()) if (b.vis && b.awake) { b.awake = !!b.tick(dt, now); any = any || b.awake; }
  raf = any ? requestAnimationFrame(frame) : 0;
}

function wake(b: Board) {
  b.awake = true;
  if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
}

const onMotion = () => { setReducedMotion(!!rm?.matches); boards.forEach(wake); };

/** The observer and the media query exist while at least one figure is registered. */
function start() {
  if (io) return;
  io = new IntersectionObserver((es) => {
    for (const e of es) {
      const b = byStage.get(e.target);
      if (!b) continue;
      b.vis = e.isIntersecting;
      b.stage.toggleAttribute(ASLEEP, !b.vis);
      if (b.vis) wake(b);
    }
  }, { rootMargin: "80px" });
  rm = matchMedia("(prefers-reduced-motion: reduce)");
  setReducedMotion(rm.matches);
  rm.addEventListener("change", onMotion);
}

function stop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  io?.disconnect(); io = null;
  rm?.removeEventListener("change", onMotion); rm = null;
}

/**
 * Joins the shared loop. The tick runs once now, so the figure is drawn
 * before it is ever on screen, then on every frame while its stage is within
 * 80px of the viewport and it keeps returning true. Offscreen it sleeps, and
 * the stage carries `data-hairline-asleep` until it is first seen.
 */
export function register(stage: Element, tick: Tick): Loop {
  start();
  const b: Board = { stage, tick, vis: false, awake: true };
  boards.push(b);
  byStage.set(stage, b);
  stage.setAttribute(ASLEEP, "");
  io!.observe(stage);
  tick(0, performance.now());
  let gone = false;
  return {
    wake: () => { if (!gone) wake(b); },
    unregister: () => {
      if (gone) return;
      gone = true;
      boards = boards.filter((x) => x !== b);
      if (byStage.get(stage) === b) { byStage.delete(stage); io?.unobserve(stage); stage.removeAttribute(ASLEEP); }
      if (!boards.length) stop();
    },
  };
}

/* ---------- pointer ---------- */

export type PointerHandlers = {
  /** The pointer in viewBox units (400 × 320). */
  move(p: Vec2, e: PointerEvent): void;
  /** A press; `move` when absent. */
  down?(p: Vec2, e: PointerEvent): void;
  leave(e: PointerEvent): void;
};

/**
 * Pointer input in viewBox units. A mouse leaving acts at once; a finger
 * lifting holds the pose for 1.4s first, so a tap reads as a look rather than
 * a flash. Touch releases its capture on press, so dragging across the stage
 * keeps sending moves. Returns the disposer.
 *
 * MYG's change from upstream: the point is mapped through the svg's own screen
 * matrix, so a figure whose viewBox is cropped, or whose stage letterboxes it,
 * still hits what is under the pointer. Without a matrix (no layout, as in
 * jsdom) it maps the stage's box straight onto the viewBox.
 */
export function pointer(stage: HTMLElement, on: PointerHandlers): () => void {
  let tm = 0;
  const pt = (e: PointerEvent): Vec2 => {
    const svg = stage.querySelector("svg");
    const m = svg?.getScreenCTM?.();
    if (m) {
      const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
      return [q.x, q.y];
    }
    const r = stage.getBoundingClientRect(), v = svg?.viewBox?.baseVal;
    const [x, y, w, h] = v && v.width ? [v.x, v.y, v.width, v.height] : [0, 0, 400, 320];
    return [x + ((e.clientX - r.left) / r.width) * w, y + ((e.clientY - r.top) / r.height) * h];
  };
  const move = (e: PointerEvent) => { clearTimeout(tm); on.move(pt(e), e); };
  const down = (e: PointerEvent) => {
    clearTimeout(tm);
    if (e.pointerType !== "mouse") stage.releasePointerCapture?.(e.pointerId);
    if (on.down) on.down(pt(e), e); else on.move(pt(e), e);
  };
  const leave = (e: PointerEvent) => {
    clearTimeout(tm);
    tm = window.setTimeout(() => on.leave(e), e.pointerType === "mouse" ? 0 : 1400);
  };
  stage.addEventListener("pointermove", move);
  stage.addEventListener("pointerdown", down);
  stage.addEventListener("pointerleave", leave);
  return () => {
    clearTimeout(tm);
    stage.removeEventListener("pointermove", move);
    stage.removeEventListener("pointerdown", down);
    stage.removeEventListener("pointerleave", leave);
  };
}

/* ---------- tear-down ---------- */

export type Disposer = {
  /** Something to run on dispose: a Loop's unregister, pointer()'s return, a clearTimeout. */
  add(fn: () => void): void;
  /** addEventListener, removed on dispose. */
  on<K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions): void;
  /** Runs everything added, last first, once. */
  dispose(): void;
};

/**
 * Collects a figure's tear-down, so its `destroy` can be `bag.dispose`:
 *
 *   const bag = disposer();
 *   const B = register(stage, tick); bag.add(B.unregister);
 *   bag.add(pointer(stage, { move, leave }));
 *   bag.on(stage, "keydown", onKey);
 *   bag.add(() => svg.replaceChildren());
 *   return { set, destroy: bag.dispose };
 */
export function disposer(): Disposer {
  let fns: Array<() => void> = [];
  return {
    add: (fn) => { fns.push(fn); },
    on: (target, type, fn, opts) => {
      const h = fn as EventListener;
      target.addEventListener(type, h, opts);
      fns.push(() => target.removeEventListener(type, h, opts));
    },
    dispose: () => {
      const run = fns;
      fns = [];
      for (let i = run.length - 1; i >= 0; i--) run[i]();
    },
  };
}
