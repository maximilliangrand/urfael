/*! hairline engine: @lucasmarkes/hairline, https://github.com/lucasmarkes/hairline. Copyright (c) 2026 Lucas Marques. MIT licence; its full text, with the copyright and permission notice, ships beside this file as /assets/LICENSE-hairline.txt */
import { inject } from "./core/styles";
import type { FigureMount, Readout } from "./core/stage";

/**
 * Mounts a figure engine on a host element: makes the svg and the live
 * region, dresses the host, and gives back update and destroy. Adapted from
 * @lucasmarkes/hairline's mount.ts (MIT, see LICENSE) by way of MYG's copy,
 * with each figure's slider range carried on its spec, and, for Urfael, the
 * plate's copy too, so one spec says everything a figure says about itself.
 *
 * It only ever removes what it added: the svg, the live region, and the
 * attributes the host did not already have.
 */

export type HairlineOptions = {
  /** How strongly the figure answers the pointer, from 0 (subtle) to 1 (strong). Default 0.5. */
  intensity?: number;
  /** "auto" follows the page; the Urfael plate sets the palette through --hairline-* properties either way. */
  theme?: "auto" | "light" | "dark";
  /** The accessible name. */
  label?: string;
  /** The figure's caption, each time it changes. Called once at mount with the rest caption. */
  onRead?: (text: string) => void;
};

export type Figure = {
  update(options: HairlineOptions): void;
  destroy(): void;
};

/** What a figure is: its engine, and what it says about itself. */
export type Spec = {
  id: string;
  /** The default accessible name: what the drawing shows and what the pointer does to it, in a sentence or two. */
  label: string;
  /** The plate's top-right corner: what the figure shows, in two or three words. */
  subject: string;
  /** The plate's bottom-left corner: what the pointer does, as an instruction. */
  hint: string;
  /** The hint for a finger, shown on touch screens instead; the hint when absent. */
  touch?: string;
  /** The caption at rest, for an engine that writes none until it is touched. */
  rest: string;
  /** The engine's own number at intensity 0, 0.5 and 1. */
  range: readonly [number, number, number];
  engine: FigureMount;
  /** Operable from the keyboard: a focusable group with a live region, not an image. */
  focusable?: boolean;
  /** A crop of the 400 × 320 drawing, [x, y, width, height], for a figure that should fill a stage of another shape. */
  viewBox?: readonly [number, number, number, number];
  /** Where to point, in viewBox units and story order, when scrolling drives the figure instead of a hand. */
  tour?: { mode: 'step' | 'glide'; points: readonly (readonly [number, number])[] };
};

const NS = "http://www.w3.org/2000/svg";
const mounted = new WeakMap<Element, () => void>();

const report = (err: unknown) => {
  if (typeof reportError === "function") reportError(err);
  else setTimeout(() => { throw err; });
};

/** An intensity from anything: what is not a finite number is 0.5, the rest is clamped to 0…1. */
export function intensity(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

/** The figure's own number for an intensity: two straight lines meeting at the default. */
export function parameter(range: Spec["range"], value: unknown): number {
  const [lo, mid, hi] = range;
  const i = intensity(value);
  const v = i <= 0.5 ? lo + (i / 0.5) * (mid - lo) : mid + ((i - 0.5) / 0.5) * (hi - mid);
  return Math.round(v * 1000) / 1000;
}

/** A figure's drawing shape, width over height: the stage's aspect ratio. */
export function ratio(spec: Spec): number {
  const [, , w, h] = spec.viewBox ?? [0, 0, 400, 320];
  return Math.round((w / h) * 1000) / 1000;
}

export function create(spec: Spec, el: HTMLElement, options?: HairlineOptions): Figure {
  mounted.get(el)?.();

  const opts: HairlineOptions = { ...options };
  const doc = el.ownerDocument;
  const root = el.getRootNode();
  inject(root.nodeType === 9 || "host" in root ? (root as Document | ShadowRoot) : doc);

  const owned = new Set<string>();
  const attr = (name: string, value: string | null) => {
    if (!owned.has(name) && el.hasAttribute(name)) return;
    if (value === null) { el.removeAttribute(name); owned.delete(name); }
    else { el.setAttribute(name, value); owned.add(name); }
  };
  const dress = () => {
    attr("data-hairline-theme", opts.theme === "light" || opts.theme === "dark" ? opts.theme : null);
    attr("aria-label", el.hasAttribute("aria-labelledby") ? null : typeof opts.label === "string" ? opts.label : spec.label);
  };
  attr("data-hairline", spec.id);
  attr("role", spec.focusable ? "group" : "img");
  if (spec.focusable) attr("tabindex", "0");
  dress();

  const svg = doc.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", (spec.viewBox ?? [0, 0, 400, 320]).join(" "));
  svg.setAttribute("aria-hidden", "true");
  el.appendChild(svg);
  let live: HTMLElement | null = null;
  if (spec.focusable) {
    live = doc.createElement("span");
    live.setAttribute("data-hairline-live", "");
    live.setAttribute("aria-live", "polite");
    el.appendChild(live);
  }

  let text: string | null = null;
  const read: Readout = {
    get textContent() { return text; },
    set textContent(value) {
      const next = value ?? "";
      if (next === text) return;
      text = next;
      if (live) live.textContent = next;
      const fn = opts.onRead;
      if (typeof fn === "function") try { fn(next); } catch (err) { report(err); }
    },
  };

  let value = parameter(spec.range, opts.intensity);
  const engine = spec.engine({ stage: el, svg, read }, value);
  if (text === null) read.textContent = spec.rest;

  let dead = false;
  const destroy = () => {
    if (dead) return;
    dead = true;
    if (mounted.get(el) === destroy) mounted.delete(el);
    engine.destroy();
    svg.remove();
    live?.remove();
    for (const name of owned) el.removeAttribute(name);
    owned.clear();
  };
  mounted.set(el, destroy);

  return {
    update(next) {
      if (dead || !next) return;
      const own = opts as Record<string, unknown>, given = next as Record<string, unknown>;
      for (const k in given) {
        if (given[k] === undefined) delete own[k];
        else own[k] = given[k];
      }
      const v = parameter(spec.range, opts.intensity);
      if (v !== value) { value = v; engine.set(v); }
      dress();
    },
    destroy,
  };
}
