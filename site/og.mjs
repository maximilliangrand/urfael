// Builds the social card: `npm run build:og` from the repo root, after `npm run build:site`.
//   docs/media/og-urfael.png  1200 × 630: the mark, the line, and Fig. 1, Uru at home, labelled as a concept drawing
// The card is the real Fig. 1 plate from docs/assets (figures.js, plate.css, site.css), drawn at rest under reduced
// motion, so it changes when the figure does and names the robot from site/figures/uru-kit.ts (ROBOT), like every
// page. It takes a screenshot, so it needs playwright-core and its Chromium; it looks for `playwright-core` from
// here, or at the path in PLAYWRIGHT_CORE. The output is committed, so docs/ stays a static site.
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, extname, join, normalize, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MARK } from './pages/layout.mjs'

const SITE = dirname(fileURLToPath(import.meta.url))
const ROOT = dirname(SITE)
const DOCS = join(ROOT, 'docs')
const OUT = join(DOCS, 'media', 'og-urfael.png')
const ORIGIN = 'https://og.urfael.invalid'

const found = /export const ROBOT = "([^"]+)"/.exec(readFileSync(join(SITE, 'figures', 'uru-kit.ts'), 'utf8'))
if (!found) throw new Error('site/figures/uru-kit.ts: no `export const ROBOT = "…"` to read the robot\'s name from')
const ROBOT = found[1]

let pw
try {
  pw = createRequire(import.meta.url)(process.env.PLAYWRIGHT_CORE || 'playwright-core')
} catch {
  throw new Error('build:og needs playwright-core and its Chromium: `npm i -D playwright-core && npx playwright-core install chromium`, or set PLAYWRIGHT_CORE to an installed copy')
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const card = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="/assets/site.css">
<link rel="stylesheet" href="/assets/plate.css">
<script type="module" src="/assets/figures.js"></script>
<style>
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: var(--oat); }
  .card { box-sizing: border-box; width: 1200px; height: 630px; padding: 40px 56px 40px 72px; display: grid; grid-template-columns: minmax(0, 1fr) 512px; gap: 48px; align-items: center; }
  .card__brand { display: flex; align-items: center; gap: 18px; margin: 0 0 46px; font: 600 40px/1 var(--word); letter-spacing: -0.01em; color: var(--logo); }
  .card__brand .mark { width: 60px; height: 60px; flex: none; }
  .card h1 { margin: 0 0 34px; font: 600 76px/0.98 var(--serif); font-variation-settings: "SOFT" 100, "WONK" 0; letter-spacing: -0.03em; color: var(--ink); }
  .card__line { margin: 0; max-width: 30rem; font: 400 25px/1.45 var(--sans); color: var(--ink-2); }
  .card__line b { color: var(--clay); font-weight: 700; }
  .card .plate { width: 512px; }
</style>
</head>
<body>
<div class="card">
  <div>
    <p class="card__brand">${MARK}<span>Urfael</span></p>
    <h1>Help that lives with&nbsp;you.</h1>
    <p class="card__line">An open-source assistant on your own machine today. <b>${esc(ROBOT)}</b>, a soft helper robot for the home, in research.</p>
  </div>
  <figure class="plate" data-figure="uru-home" data-fig="1" data-size="hero"></figure>
</div>
</body>
</html>`

const TYPES = { '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' }

const browser = await pw.chromium.launch()
try {
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, reducedMotion: 'reduce' })).newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  // the card, and docs/ under it, served from memory: no server, nothing leaves the machine
  await page.route(`${ORIGIN}/**`, (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: card })
    const file = normalize(join(DOCS, decodeURIComponent(path)))
    if (relative(DOCS, file).startsWith('..')) return route.fulfill({ status: 404, body: '' })
    try { return route.fulfill({ contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) }) }
    catch { return route.fulfill({ status: 404, body: '' }) }
  })
  await page.goto(`${ORIGIN}/`, { waitUntil: 'load' })
  await page.waitForFunction(() => document.querySelector('.plate')?.getAttribute('data-plate') === 'mounted' && document.fonts.status === 'loaded')
  // the plate's lower band says what the drawing is, in place of the pointer's hint and the read-out
  await page.evaluate(() => {
    document.querySelector('.plate__corner--bl').textContent = 'Concept drawing'
    document.querySelector('.plate__corner--br').textContent = ''
  })
  // two frames: the engine draws its first, the page paints it
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
  if (errors.length) throw new Error(`the card's page failed: ${errors.join('; ')}`)
  writeFileSync(OUT, await page.screenshot({ type: 'png' }))
  console.log(`${relative(ROOT, OUT)}  1200 × 630, ${ROBOT} at home`)
} finally {
  await browser.close()
}
