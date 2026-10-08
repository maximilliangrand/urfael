/**
 * Hairline — the stylesheet, as a string, and the one function that puts it
 * in a document or a shadow root.
 *
 * Every selector is inside `:where()`, so each rule has zero specificity: a
 * rule of the page's always wins, and between these rules only their order
 * decides. The order below is therefore part of the design. The
 * `--hairline-*` properties are the public theme; `--hl-*` are private and
 * read them with the palette as the fallback.
 *
 * Urfael change from upstream: a small paper kit, and no light. MYG's glow kit
 * (emissive panes, halos, pulses, LEDs, bloom filters, night decks) is not
 * here, and this sheet never names a filter. What it adds, each a fill or a
 * line and nothing that shines:
 *
 *   .ink    the drawing's one dark solid: a screen, a face window. Filled and
 *           stroked with --hairline-ink, unless .hi or .sil gives it a stroke.
 *   .warm   a mark in the accent, filled, for what sits on the ink: eyes.
 *   .blush  the same, softer: cheeks.
 *   .trace  a line that draws itself in once on `.go` (the path needs
 *           pathLength="1000"); stage's `replay` runs it again.
 *
 * `--hl-delay` on an element delays its stroke or fill change and its trace,
 * so stage's `wave` can stagger a switch along a row without a tick. Traces
 * pause while the stage is offscreen, and under reduced motion nothing
 * transitions or draws in: every change lands at once and traces stand drawn.
 */

const LIGHT = {
  plate: "#ffffff", hi: "#232327", edge: "#a4a4ac", mid: "#c3c3c9", lo: "#e0e0e4",
  ink: "#232327", warm: "#f59a57", blush: "#b36f4a",
};
const DARK = {
  plate: "#08090a", hi: "#d0d6e0", edge: "#5b5d64", mid: "#3e3e44", lo: "#29292d",
  ink: "#020203", warm: "#f59a57", blush: "#b36f4a",
};
const KEYS = ["plate", "hi", "edge", "mid", "lo", "ink", "warm", "blush"] as const;
type Palette = Record<(typeof KEYS)[number], string>;

const vars = (p: Palette) => KEYS.map((k) => `--hl-${k}:var(--hairline-${k},${p[k]});`).join("");
const EASE = "cubic-bezier(0.5,0,0.1,1)";
/** A colour change: how long it takes, after its place in a wave. */
const SWITCH = (prop: string) => `${prop} 260ms ${EASE} var(--hl-delay,0ms)`;
const SVG = ":where([data-hairline]>svg)";

/** The stylesheet. `lightDark` adds the rule that follows the page's `color-scheme`, for browsers that have `light-dark()`. */
export function css(lightDark: boolean): string {
  const both = Object.fromEntries(KEYS.map((k) => [k, `light-dark(${LIGHT[k]},${DARK[k]})`])) as Palette;
  return [
    // the box, and the palette: light unless something below says otherwise
    `:where([data-hairline]){display:block;position:relative;aspect-ratio:5/4;touch-action:pan-y;user-select:none;-webkit-user-select:none;--hl-sw:var(--hairline-stroke,0.9);${vars(LIGHT)}}`,
    // the page's color-scheme
    lightDark ? `:where([data-hairline]){${vars(both)}}` : "",
    // an ancestor that says dark
    `:where(.dark,[data-theme="dark"]) :where([data-hairline]){${vars(DARK)}}`,
    // the figure's own theme option
    `:where([data-hairline][data-hairline-theme="light"]){${vars(LIGHT)}}`,
    `:where([data-hairline][data-hairline-theme="dark"]){${vars(DARK)}}`,
    `:where([data-hairline]:focus-visible){outline:1.5px solid var(--hl-hi);outline-offset:2px}`,
    `${SVG}{position:absolute;inset:0;width:100%;height:100%;display:block}`,
    // Riffle's live region: read, not seen
    `:where([data-hairline]>[data-hairline-live]){position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}`,
    // the drawing: plates are filled with the plate colour and painted back to front
    `${SVG} :where(path,polygon,ellipse,line){fill:var(--hl-plate);stroke:var(--hl-mid);stroke-width:var(--hl-sw);vector-effect:non-scaling-stroke;stroke-linejoin:round;stroke-linecap:round;transition:${SWITCH("stroke")}}`,
    // the one dark solid, before the stroke classes so .hi and .sil can still edge it
    `${SVG} :where(.ink){fill:var(--hl-ink);stroke:var(--hl-ink)}`,
    `${SVG} :where(.nf){fill:none}`,
    `${SVG} :where(.fo){stroke:none}`,
    `${SVG} :where(.sil){stroke:var(--hl-edge)}`,
    `${SVG} :where(.hi){stroke:var(--hl-hi)}`,
    `${SVG} :where(.lo){stroke:var(--hl-lo)}`,
    `${SVG} :where(.dash){stroke-dasharray:1 3}`,
    `${SVG} :where(.dot){stroke:none;fill:var(--hl-hi);transition:${SWITCH("fill")}}`,
    `${SVG} :where(.dot.m){fill:var(--hl-edge)}`,
    `${SVG} :where(.dot.off){fill:var(--hl-lo)}`,
    `${SVG} :where(.warm,.blush){stroke:none;transition:${SWITCH("fill")}}`,
    `${SVG} :where(.warm){fill:var(--hl-warm)}`,
    `${SVG} :where(.blush){fill:var(--hl-blush)}`,
    `${SVG} :where(.ghost path){fill:none;stroke:var(--hl-mid)}`,
    // a line drawing itself in: drawn unless it is playing, held undrawn through its delay
    `${SVG} :where(.trace){stroke-dasharray:1000;stroke-dashoffset:0}`,
    `${SVG} :where(.trace.go){animation:hl-trace var(--hl-trace,900ms) ${EASE} var(--hl-delay,0ms) both}`,
    `@keyframes hl-trace{from{stroke-dashoffset:1000}to{stroke-dashoffset:0}}`,
    // offscreen the stage sleeps, and so do its traces
    `:where([data-hairline][data-hairline-asleep]>svg) :where(.trace){animation-play-state:paused}`,
    `@media (prefers-reduced-motion:reduce){${SVG} :where(*){transition:none}${SVG} :where(.trace){animation:none}}`,
  ].join("");
}

const done = new WeakSet<Document | ShadowRoot>();

/** Puts the stylesheet in a document or a shadow root, once: adopted where that exists, a `<style>` element where it doesn't. */
export function inject(root: Document | ShadowRoot): void {
  if (done.has(root)) return;
  done.add(root);
  const doc = root.nodeType === 9 ? (root as Document) : (root as ShadowRoot).ownerDocument;
  const win = doc.defaultView;
  const text = css(!!win?.CSS?.supports?.("color", "light-dark(#000,#fff)"));
  if (win && "adoptedStyleSheets" in root) {
    try {
      const sheet = new win.CSSStyleSheet();
      sheet.replaceSync(text);
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
      return;
    } catch {
      // no constructable stylesheets here: fall through to an element
    }
  }
  const style = doc.createElement("style");
  style.setAttribute("data-hairline-style", "");
  style.textContent = text;
  (root.nodeType === 9 ? doc.head ?? doc.documentElement : root).appendChild(style);
}
