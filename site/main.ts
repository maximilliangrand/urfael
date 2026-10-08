import { FIGURES } from './figures';
import { wireHello } from './hello';
import { mountPlates } from './plate';

/**
 * The site's one figure script, built to docs/assets/figures.js. A page loads
 * it as a module, with the plate stylesheet:
 *
 *   <link rel="stylesheet" href="/assets/plate.css">
 *   <script type="module" src="/assets/figures.js"></script>
 *
 * and every <figure class="plate" data-figure="…"> on the page becomes a
 * plate. A [data-say-hello] button points at its figure (hello.ts). A module
 * runs after the document is parsed; the check below only matters for a page
 * that loads it with `async`.
 */

export { FIGURES, mountPlates };

const start = () => { mountPlates(FIGURES); wireHello(FIGURES); };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
