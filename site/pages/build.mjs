// Builds the site's pages: `npm run build:pages` from the repo root.
//   site/pages/src/<page>.html  ->  docs/<out>
// Each source starts with a settings comment, `<!--page { …json… } -->`, may follow it with an extra head
// block, `<!--head-->…<!--/head-->`, and the rest is the inside of the page's <main>. layout.mjs wraps it in
// the shared head, header and footer. The outputs are committed, so docs/ stays a static site with no build
// step on deploy, exactly as before.
//
// The robot's working name lives in one place, site/figures/uru-kit.ts (ROBOT), which the figures' labels
// read too. In a source, {{ROBOT}} becomes <span data-robot-name>Uru</span> (visible text, renamed at runtime
// from the page's <meta name="urfael:robot-name">) and {{robot}} the plain name (attributes and the head).
// {{icon:name}} is an icon from docs/assets/icons as an <img>; {{icon:name:compact}} its compact cut;
// {{icon-inline:name}} the icon's svg pasted inline, for a surface icons.css re-themes.
//
// A page marked "verbatim" (the legal pages) is not expanded at all: its body goes into <main> byte for byte.
// A page marked "faqSchema" gets FAQPage structured data built from its own <details> questions.
//
// The brand's text files are written here too, so the robot's name reaches them from the same place:
//   site/pages/src/llms.txt            ->  docs/llms.txt
//   site/pages/src/site.webmanifest    ->  docs/site.webmanifest
//   site/pages/src/llms-full.head.txt  ->  the head of docs/llms-full.txt, up to its first "# FILE:" section
// with {{robot}} as the plain name. docs/manual/reference/generate-llms.js writes plainer versions of the two
// llms files; after running it, run this build again. The social card, docs/media/og-urfael.png, is a picture
// of the name, so it has its own build: npm run build:og.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { document } from './layout.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const DOCS = join(ROOT, 'docs')
const SRC = join(HERE, 'src')

const kit = readFileSync(join(ROOT, 'site', 'figures', 'uru-kit.ts'), 'utf8')
const found = /export const ROBOT = "([^"]+)"/.exec(kit)
if (!found) throw new Error('site/figures/uru-kit.ts: no `export const ROBOT = "…"` to read the robot\'s name from')
const ROBOT = found[1]
const NAME = `<span data-robot-name>${ROBOT}</span>`

const ICONS = join(DOCS, 'assets', 'icons')
const icons = new Set(readdirSync(ICONS).filter((f) => f.endsWith('.svg') && f !== 'sprite.svg').map((f) => f.slice(0, -4)))

function icon(spec, source) {
  const [name, cut] = spec.split(':')
  const file = cut === 'compact' ? `${name}-compact` : name
  if (!icons.has(file)) throw new Error(`${source}: no icon "${file}" in docs/assets/icons`)
  const size = cut === 'compact' ? 48 : 96
  return `<img class="icon" src="/assets/icons/${file}.svg" alt="" width="${size}" height="${size}" loading="lazy" decoding="async">`
}

function inlineIcon(name, source) {
  if (!icons.has(name)) throw new Error(`${source}: no icon "${name}" in docs/assets/icons`)
  return readFileSync(join(ICONS, `${name}.svg`), 'utf8').trim()
}

/** Expands the tokens in a source's text. */
function expand(text, source) {
  return text
    .replace(/\{\{ROBOT\}\}/g, NAME)
    .replace(/\{\{robot\}\}/g, ROBOT)
    .replace(/\{\{icon:([a-z-]+(?::compact)?)\}\}/g, (_, spec) => icon(spec, source))
    .replace(/\{\{icon-inline:([a-z-]+)\}\}/g, (_, name) => inlineIcon(name, source))
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' }
const plain = (html) => html.replace(/<[^>]+>/g, '').replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e) => ENTITIES[e]).replace(/\s+/g, ' ').trim()

/**
 * FAQPage structured data from the questions the page shows, each a
 * <details><summary>question</summary><div class="ans">answer</div></details>,
 * so the schema always says exactly what the reader sees.
 */
function faqSchema(body, url) {
  const items = [...body.matchAll(/<details[^>]*>\s*<summary>([\s\S]*?)<\/summary>\s*<div class="ans">([\s\S]*?)<\/div>\s*<\/details>/g)]
  if (!items.length) throw new Error(`${url}: "faqSchema" is set but the page has no <details> questions`)
  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${url}#faq`,
    url,
    mainEntity: items.map(([, q, a]) => ({ '@type': 'Question', name: plain(q), acceptedAnswer: { '@type': 'Answer', text: plain(a) } })),
  }
  return `<script type="application/ld+json">\n${JSON.stringify(data, null, 2).replace(/</g, '\\u003c')}\n</script>`
}

/** Splits a source into its settings, its extra head and its body. */
function parse(text, source) {
  const m = /^<!--page\s*(\{[\s\S]*?\})\s*-->/.exec(text)
  if (!m) throw new Error(`${source}: a page source starts with <!--page { … } -->`)
  const page = JSON.parse(m[1])
  let rest = text.slice(m[0].length)
  const h = /^\s*<!--head-->([\s\S]*?)<!--\/head-->/.exec(rest)
  if (h) { page.head = h[1].trim(); rest = rest.slice(h[0].length) }
  return { page, body: rest }
}

const sources = readdirSync(SRC).filter((f) => f.endsWith('.html')).sort()
for (const source of sources) {
  const { page, body } = parse(readFileSync(join(SRC, source), 'utf8'), source)
  page.source = source
  for (const key of ['title', 'description', 'ogTitle', 'ogDescription', 'head']) {
    if (typeof page[key] === 'string') page[key] = expand(page[key], source)
  }
  const inner = page.verbatim ? body : expand(body, source)
  if (page.faqSchema) page.head = [page.head, faqSchema(inner, `https://urfael.com${page.path}`)].filter(Boolean).join('\n')
  const html = document(page, inner, ROBOT, NAME)

  // what every page must hold to: one h1, no token left behind, and a verbatim body exactly as written
  const h1s = (html.match(/<h1[\s>]/g) ?? []).length
  if (h1s !== 1) throw new Error(`${source}: ${h1s} h1 elements; a page has exactly one`)
  if (!page.verbatim && /\{\{|\}\}/.test(html)) throw new Error(`${source}: an unexpanded {{token}}`)
  if (page.verbatim && !html.includes(`>${body}</main>`)) throw new Error(`${source}: the verbatim body did not survive intact`)

  const out = join(DOCS, page.out)
  writeFileSync(out, html)
  console.log(`${relative(ROOT, out).padEnd(22)} ${(Buffer.byteLength(html) / 1024).toFixed(1)} kB  from site/pages/src/${source}`)
}

// the brand's text files, with the robot's name filled in
for (const [source, out] of [['llms.txt', 'llms.txt'], ['site.webmanifest', 'site.webmanifest']]) {
  const text = expand(readFileSync(join(SRC, source), 'utf8'), source)
  if (/\{\{|\}\}/.test(text)) throw new Error(`${source}: an unexpanded {{token}}`)
  writeFileSync(join(DOCS, out), text)
  console.log(`${relative(ROOT, join(DOCS, out)).padEnd(22)} from site/pages/src/${source}`)
}
{
  const FULL = join(DOCS, 'llms-full.txt'), SECTION = '\n================================================================================\n# FILE:'
  const full = readFileSync(FULL, 'utf8'), at = full.indexOf(SECTION)
  if (at < 0) throw new Error('docs/llms-full.txt: no "# FILE:" section to keep after the head')
  const head = expand(readFileSync(join(SRC, 'llms-full.head.txt'), 'utf8'), 'llms-full.head.txt').replace(/\n*$/, '\n\n')
  writeFileSync(FULL, head + full.slice(at))
  console.log(`${relative(ROOT, FULL).padEnd(22)} head from site/pages/src/llms-full.head.txt`)
}
console.log(`robot name: ${ROBOT} (site/figures/uru-kit.ts)`)
