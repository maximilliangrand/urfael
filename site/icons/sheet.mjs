// The icon contact sheet, for drawing and checking icons: every icon (or the ones named) at 28 and 56px
// (compact) and 96 and 192px (full), on the paper card, on the oat page and on the night band (the last two
// through the generated icons.css), written as HTML and as PNGs at 1x and 2x. Nothing here ships.
//
//   node site/icons/sheet.mjs [name ...] [--out /tmp/urfael-icons] [--cols 3] [--zoom 360]
//
// --zoom draws only the full variant, at that size, to read the fine detail.
//
// It needs Playwright. It looks in PLAYWRIGHT_DIR, then the myg-brand skill's copy, then the hairline look cache.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ICON_DIR, loadIcons } from './load.mjs'

const args = process.argv.slice(2)
const option = (flag) => { const at = args.indexOf(flag); return at >= 0 ? args[at + 1] : undefined }
const valued = new Set(['--out', '--cols', '--zoom'].map((f) => args.indexOf(f) + 1).filter((i) => i > 0))
const zoom = Number(option('--zoom') ?? 0)
const out = option('--out') ?? '/tmp/urfael-icons'
const cols = Number(option('--cols') ?? 3)
const picked = args.filter((a, i) => !a.startsWith('--') && !valued.has(i))

const { ICONS, svg } = await loadIcons()
const names = (picked.length ? picked : Object.keys(ICONS)).filter((n) => n in ICONS)

const sizes = (name) => zoom ? svg(name, 'full', zoom) : `${svg(name, 'compact', 28)}${svg(name, 'compact', 56)}${svg(name, 'full', 96)}${svg(name, 'full', 192)}`
const cell = (name, ground) => `<figure class="${ground}"><div class="row">${sizes(name)}</div><figcaption>${name}</figcaption></figure>`
// the generated stylesheet, so the oat and night rows test it (run build.mjs first)
const themes = join(ICON_DIR, '..', '..', 'docs', 'assets', 'icons', 'icons.css')
const iconCss = existsSync(themes) ? readFileSync(themes, 'utf8') : ''

const page = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;padding:24px;background:#fbf4ea;font:12px ui-monospace,monospace;color:#665446}
.sheet{display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));gap:16px}
figure{margin:0;padding:14px 16px 10px;border:1px solid #e7d9c5;border-radius:6px}
figure.paper{background:#fffdf9}
figure.oat{background:#fbf4ea}
figure.night{background:#1a140f;border-color:#1a140f;color:#c3baae}
.row{display:flex;align-items:end;gap:22px}
figcaption{margin-top:6px}
h2{font:600 13px ui-monospace,monospace;color:#2b211a;margin:24px 0 10px}
${iconCss}
</style></head><body>
<h2>On the paper card (#fffdf9): compact 28 and 56, full 96 and 192</h2>
<div class="sheet">${names.map((n) => cell(n, 'paper')).join('')}</div>
${zoom ? '' : `<h2>On the oat page (#fbf4ea): .u-icon-oat from icons.css</h2>
<div class="sheet">${names.map((n) => cell(n, 'oat u-icon-oat')).join('')}</div>
<h2>On the night band (#1a140f): .u-icon-night from icons.css</h2>
<div class="sheet">${names.map((n) => cell(n, 'night u-icon-night')).join('')}</div>`}
</body></html>`

function playwright() {
  const require = createRequire(import.meta.url)
  const tries = [process.env.PLAYWRIGHT_DIR, join(homedir(), '.claude/skills/myg-brand/node_modules/playwright'), join(homedir(), 'Library/Caches/hairline-look/node_modules/playwright-core')].filter(Boolean)
  for (const dir of tries) if (existsSync(dir)) return require(dir)
  throw new Error(`Playwright not found; set PLAYWRIGHT_DIR. Tried: ${tries.join(', ')}`)
}

mkdirSync(out, { recursive: true })
const stem = zoom ? `zoom-${zoom}` : 'icons'
const file = join(out, `${stem}.html`)
writeFileSync(file, page)
const { chromium } = playwright()
const browser = await chromium.launch()
const problems = []
for (const scale of [1, 2]) {
  const tab = await browser.newPage({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: scale })
  tab.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(m.text()) })
  tab.on('pageerror', (e) => problems.push(e.message))
  await tab.goto(`file://${file}`)
  await tab.screenshot({ path: join(out, `${stem}@${scale}x.png`), fullPage: true })
  await tab.close()
}
await browser.close()
// a malformed path is reported on the console (Chrome: "Error: <path> attribute d: ..."), so this checks every one
if (problems.length) { console.error([...new Set(problems)].join('\n')); process.exit(1) }
console.log(`${names.length} icons -> ${join(out, `${stem}@1x.png`)} and ${stem}@2x.png`)
