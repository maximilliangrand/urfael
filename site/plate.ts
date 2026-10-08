import { create, ratio, type Figure, type Spec } from './hairline/mount';
import { driveOnScroll } from './hairline/scroll';

/**
 * The Fig. plate, without a framework: MYG's FigurePlate (components/offer/
 * FigurePlate.tsx) for a static page. A page writes one empty element,
 *
 *   <figure class="plate" data-figure="demo" data-fig="1"></figure>
 *
 * and this turns it into an instrument plate round the figure: the figure
 * number and its subject across the top, what the pointer does and the
 * figure's live read-out along the bottom, the chip corner cut top right, and
 * the stage in the drawing's own shape (its spec's viewBox). The copy comes
 * from the figure's spec; the page may add a <figcaption>, which stays below.
 *
 * Optional attributes on the figure:
 *   data-size="card|hero|sheet"  card in a grid (the default), hero beside a headline, sheet across the page
 *   data-label="…"               an accessible name other than the spec's
 *   data-decorative              hide the whole plate from assistive technology, for a plate inside a link that names it
 *
 * The plate is built at once, which is cheap; the figure itself mounts only
 * when the plate comes within a screen of the viewport, and from then on the
 * engine sleeps whenever it is offscreen. Scrolling walks the figure through
 * its tour on every device, so it comes alive on phones too. Under reduced
 * motion the engine lands every change at once and the tour is off: the
 * figure stands composed at rest and still answers a hand.
 *
 * The corner text repeats what the figure's accessible name already says, so
 * it is hidden from assistive technology.
 */

export type Registry = Readonly<Record<string, Spec>>;

type Plate = { el: HTMLElement; spec: Spec; stage: HTMLElement; read: HTMLElement; figure?: Figure; stop?: () => void };

/** How near the viewport a plate mounts its figure: a screen ahead, so the drawing is there before it is seen. */
const NEAR = '100% 0px';
/** The nav height the scroll tour allows for when the page sets no --plate-nav. */
const NAV = 64;

/** Read-outs are a few words and numbers: a hyphen before a digit is a minus sign. */
const minus = (text: string) => text.replace(/-(?=\d)/g, '−');

function part(parent: Element, cls: string, text?: string): HTMLDivElement {
  const el = parent.ownerDocument.createElement('div');
  el.className = cls;
  if (text !== undefined) el.textContent = text;
  parent.appendChild(el);
  return el;
}

function corner(surface: Element, where: string, text?: string): HTMLDivElement {
  const el = part(surface, `plate__corner plate__corner--${where}`, text);
  el.setAttribute('aria-hidden', 'true');
  return el;
}

/** Builds the plate inside a figure element. Returns null, and says why on the console, when its figure is not in the registry. */
export function dress(el: HTMLElement, registry: Registry): Plate | null {
  const name = el.dataset.figure ?? '';
  const spec = Object.prototype.hasOwnProperty.call(registry, name) ? registry[name] : undefined;
  if (!spec) {
    console.error(`plate: no figure named "${name}" in the registry (site/figures/index.ts)`);
    return null;
  }
  const doc = el.ownerDocument;
  const frame = doc.createElement('div');
  frame.className = 'plate__frame';
  const surface = part(frame, 'plate__surface');
  const stage = part(surface, 'plate__stage');
  if (el.dataset.fig) corner(surface, 'tl', `Fig. ${el.dataset.fig}`);
  corner(surface, 'tr', spec.subject);
  const hint = corner(surface, 'bl');
  part(hint, 'plate__hint plate__hint--pointer', spec.hint);
  part(hint, 'plate__hint plate__hint--touch', spec.touch ?? spec.hint);
  const read = corner(surface, 'br', minus(spec.rest));
  read.classList.add('plate__read');
  // before a caption the page wrote, so the caption stays under the plate
  el.insertBefore(frame, el.querySelector(':scope > figcaption'));
  // the drawing's shape: the build wrote it into plate.css too, so the plate held its height before this ran
  el.style.setProperty('--fig-ratio', String(ratio(spec)));
  if (el.hasAttribute('data-decorative')) el.setAttribute('aria-hidden', 'true');
  el.setAttribute('data-plate', 'dressed');
  return { el, spec, stage, read };
}

/** Mounts the figure in a dressed plate and starts its scroll tour. Idempotent. */
function mount(p: Plate) {
  if (p.figure) return;
  p.figure = create(p.spec, p.stage, {
    label: p.el.dataset.label || undefined,
    onRead: (text) => { p.read.textContent = minus(text) || ' '; },
  });
  p.el.setAttribute('data-plate', 'mounted');
  if (!p.spec.tour) return;
  const nav = parseFloat(getComputedStyle(p.el).getPropertyValue('--plate-nav'));
  p.stop = driveOnScroll(p.stage, p.spec.tour, Number.isFinite(nav) ? nav : NAV);
}

/**
 * Dresses every plate under `root` not dressed yet, and mounts each figure as
 * its plate nears the viewport. Returns the cleanup, which destroys them all.
 */
export function mountPlates(registry: Registry, root: ParentNode = document): () => void {
  const plates = Array.from(root.querySelectorAll<HTMLElement>('figure.plate[data-figure]:not([data-plate])'))
    .map((el) => dress(el, registry))
    .filter((p): p is Plate => p !== null);
  const byEl = new Map(plates.map((p) => [p.el as Element, p]));
  const near = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const p = byEl.get(entry.target);
      if (!p || !entry.isIntersecting) continue;
      near.unobserve(entry.target);
      mount(p);
    }
  }, { rootMargin: NEAR });
  plates.forEach((p) => near.observe(p.el));
  return () => {
    near.disconnect();
    for (const p of plates) { p.stop?.(); p.figure?.destroy(); }
  };
}
