import type { Spec } from './mount';

type Tour = NonNullable<Spec['tour']>;

/** The tour's point at progress t, from 0 to 1: the stop it has reached when stepping, the point along its path when gliding. */
export function tourPoint(tour: Tour, t: number): readonly [number, number] {
  const pts = tour.points, p = Math.min(1, Math.max(0, t));
  if (tour.mode === 'step' || pts.length < 2) return pts[Math.min(pts.length - 1, Math.floor(p * pts.length))];
  const legs = pts.slice(1).map((b, i) => Math.hypot(b[0] - pts[i][0], b[1] - pts[i][1]));
  let along = p * legs.reduce((a, b) => a + b, 0);
  for (let i = 0; i < legs.length; i++) {
    if (along <= legs[i] || i === legs.length - 1) {
      const f = legs[i] ? Math.min(1, along / legs[i]) : 0;
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f];
    }
    along -= legs[i];
  }
  return pts[pts.length - 1];
}

/** A real pointer that moved within this long still owns the figure; the kernel holds a touch pose for 1.4s. */
const HAND_MS = 1500;

/**
 * Scrolling drives a figure the way a hand would. While the plate crosses the
 * screen, a pointer that nobody holds walks the figure's tour in step with the
 * scroll: it is sent as ordinary pointer events at the screen point of each
 * tour stop, so the figure answers exactly as it answers a mouse, and leaves
 * at either end so the figure settles back to rest. On phones, where nothing
 * hovers, this is how the figures come alive; on desktop a pointer that is
 * actually moving over the stage takes over, and a cursor merely resting there
 * while the page scrolls does not.
 *
 * Layout is read only when the stage is measured (on entering the screen and
 * on resize), never on a scroll frame, so the figure's own redraw is the only
 * work scrolling causes. A figure already on screen when the page opens
 * starts its tour only once the reader scrolls. Off under reduced motion.
 * `nav` is the height in px of a fixed header covering the top of the screen,
 * so a figure has left the reader's view once its bottom passes under it.
 * Returns the cleanup.
 */
export function driveOnScroll(stage: HTMLElement, tour: Tour, nav = 64): () => void {
  if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};

  let frame = 0, pointing = false, listening = false, handAt = -Infinity;
  // the stage's page offset and size, and its svg's screen matrix at the scroll position it was measured at
  let top = 0, height = 0, matrix: DOMMatrix | null = null, measuredAt = 0;

  const send = (type: 'pointermove' | 'pointerleave', x = 0, y = 0) =>
    stage.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerType: 'mouse' }));
  const release = () => {
    if (!pointing) return;
    pointing = false;
    send('pointerleave');
  };
  const measure = () => {
    const box = stage.getBoundingClientRect();
    measuredAt = window.scrollY;
    top = box.top + measuredAt;
    height = box.height;
    matrix = stage.querySelector('svg')?.getScreenCTM() ?? null;
  };

  const update = () => {
    frame = 0;
    if (performance.now() - handAt < HAND_MS || !matrix) return;
    const view = window.innerHeight, scroll = window.scrollY, span = view - nav + height;
    // progress runs from 0 as the stage's top meets the bottom of the screen to 1 as its bottom passes under the nav
    const progress = (view - (top - scroll)) / span;
    const opening = (view - top) / span;
    const start = Math.max(0.16, opening + 0.04), end = Math.min(0.9, Math.max(start + 0.3, 0.74));
    const t = (progress - start) / (end - start);
    if (t < 0 || t > 1) { release(); return; }
    const [x, y] = tourPoint(tour, t);
    const point = new DOMPoint(x, y).matrixTransform(matrix);
    send('pointermove', point.x, point.y - (scroll - measuredAt));
    pointing = true;
  };
  const queue = () => { if (!frame) frame = requestAnimationFrame(update); };
  const remeasure = () => { measure(); queue(); };

  const listen = (on: boolean) => {
    if (on === listening) return;
    listening = on;
    // scrollend re-measures once per gesture, for content above that changed height without resizing the stage
    if (on) { measure(); window.addEventListener('scroll', queue, { passive: true }); window.addEventListener('scrollend', measure); window.addEventListener('resize', remeasure); queue(); }
    else { window.removeEventListener('scroll', queue); window.removeEventListener('scrollend', measure); window.removeEventListener('resize', remeasure); release(); }
  };
  const seen = new IntersectionObserver((entries) => entries.forEach((entry) => listen(entry.isIntersecting)));
  seen.observe(stage);
  const resized = new ResizeObserver(() => { if (listening) remeasure(); });
  resized.observe(stage);

  // only a pointer that moves or presses is a hand; entering under a still cursor while scrolling is not
  const touched = (e: PointerEvent) => { if (e.isTrusted) { handAt = performance.now(); pointing = false; } };
  // a mouse that leaves gives the figure back at once; a lifted finger keeps it for the kernel's hold
  const left = (e: PointerEvent) => { if (e.isTrusted && e.pointerType === 'mouse') handAt = -Infinity; };
  stage.addEventListener('pointermove', touched);
  stage.addEventListener('pointerdown', touched);
  stage.addEventListener('pointerleave', left);

  return () => {
    seen.disconnect();
    resized.disconnect();
    listen(false);
    if (frame) cancelAnimationFrame(frame);
    stage.removeEventListener('pointermove', touched);
    stage.removeEventListener('pointerdown', touched);
    stage.removeEventListener('pointerleave', left);
  };
}
