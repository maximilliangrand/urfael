import type { Registry } from './plate';

/**
 * "Say hello" on the Uru page. A button written as
 *
 *   <button type="button" data-say-hello="uru-faces">Say hello</button>
 *
 * points at the named figure's first tour stop for a moment, the way a hand
 * would, so the robot in the drawing answers the press (on uru-faces the first
 * stop is the happy portrait). It sends the same synthetic pointer events the
 * scroll tour sends, so the figure needs no extra API. The speech bubble the
 * button also cycles belongs to site.js, which works without this file.
 *
 * Under reduced motion the press only changes the bubble: nothing moves.
 */

/** How long the figure holds the greeting before the pointer leaves. */
const HOLD_MS = 1800;

export function wireHello(registry: Registry, root: ParentNode = document): () => void {
  const buttons = Array.from(root.querySelectorAll<HTMLElement>('[data-say-hello]'));
  let timer = 0;

  const greet = (name: string) => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const spec = Object.prototype.hasOwnProperty.call(registry, name) ? registry[name] : undefined;
    const stop = spec?.tour?.points[0];
    const stage = document.querySelector<HTMLElement>(`.plate[data-figure="${name}"] .plate__stage`);
    const matrix = stage?.querySelector('svg')?.getScreenCTM();
    if (!stop || !stage || !matrix) return;
    const at = new DOMPoint(stop[0], stop[1]).matrixTransform(matrix);
    stage.dispatchEvent(new PointerEvent('pointermove', { clientX: at.x, clientY: at.y, pointerType: 'mouse' }));
    clearTimeout(timer);
    timer = window.setTimeout(() => stage.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' })), HOLD_MS);
  };

  const onClick = (e: Event) => greet((e.currentTarget as HTMLElement).dataset.sayHello ?? '');
  buttons.forEach((b) => b.addEventListener('click', onClick));
  return () => {
    clearTimeout(timer);
    buttons.forEach((b) => b.removeEventListener('click', onClick));
  };
}
