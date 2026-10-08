// The page chrome every urfael.com page shares: the <head>, the header with its navigation, and the footer.
// site/pages/build.mjs wraps each page source in site/pages/src/ with these. Text that names the robot comes
// in as `name` (a span the page's own script can rename) or `plain` (for attributes and the head).

export const ORIGIN = 'https://urfael.com'
export const GITHUB = 'https://github.com/maximilliangrand/urfael'
export const EMAIL = 'contact@myg-media.com'

/** The default social card: the ᚢ mark, the Uru concept drawing and the tagline. */
const OG_IMAGE = { src: `${ORIGIN}/media/og-urfael.png`, width: 1200, height: 630 }

/** The mark, exactly as media/urfael-logo.svg draws it: the rune Uruz on a dark disc. */
export const MARK = '<svg class="mark" viewBox="0 0 128 128" aria-hidden="true" focusable="false"><circle cx="64" cy="64" r="60" fill="#16110a"/><path d="M46 96.5V35.5L82 56.5V96.5" fill="none" stroke="#e7c280" stroke-width="11" stroke-linejoin="round"/></svg>'

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** The <head>: meta, canonical, social cards, the robot's name, fonts, styles and scripts. */
export function head(page, robot) {
  const url = ORIGIN + page.path
  const ogTitle = page.ogTitle ?? page.title
  const ogDescription = page.ogDescription ?? page.description
  const lines = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}">`,
    `<meta name="robots" content="${page.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large'}">`,
    page.noindex ? '' : `<link rel="canonical" href="${url}">`,
    // the robot's working name, once per page: site.js writes it into every [data-robot-name]
    `<meta name="urfael:robot-name" content="${esc(robot)}">`,
    '<meta name="author" content="MYG Media SRL">',
    // the page's own head: structured data, and on the home page the old-anchor redirect, which runs before any style loads
    page.head ?? '',
    '<link rel="icon" href="/favicon.ico" sizes="32x32">',
    '<link rel="icon" type="image/svg+xml" href="/media/favicon.svg">',
    '<link rel="apple-touch-icon" sizes="180x180" href="/media/apple-touch-icon.png">',
    '<link rel="manifest" href="/site.webmanifest">',
    '<meta name="theme-color" content="#fbf4ea">',
    `<meta property="og:type" content="${page.ogType ?? 'website'}">`,
    '<meta property="og:site_name" content="Urfael">',
    '<meta property="og:locale" content="en_US">',
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:title" content="${esc(ogTitle)}">`,
    `<meta property="og:description" content="${esc(ogDescription)}">`,
    `<meta property="og:image" content="${OG_IMAGE.src}">`,
    `<meta property="og:image:width" content="${OG_IMAGE.width}">`,
    `<meta property="og:image:height" content="${OG_IMAGE.height}">`,
    `<meta property="og:image:alt" content="${esc(`The Urfael mark beside a concept drawing of ${robot}, a soft round helper robot, at home. Help that lives with you.`)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${esc(ogTitle)}">`,
    `<meta name="twitter:description" content="${esc(ogDescription)}">`,
    `<meta name="twitter:image" content="${OG_IMAGE.src}">`,
    '<link rel="preload" href="/assets/fonts/fraunces-latin.woff2" as="font" type="font/woff2" crossorigin>',
    '<link rel="preload" href="/assets/fonts/atkinson-next-latin.woff2" as="font" type="font/woff2" crossorigin>',
    '<link rel="stylesheet" href="/assets/site.css">',
    page.figures ? '<link rel="stylesheet" href="/assets/plate.css">' : '',
    page.iconsCss ? '<link rel="stylesheet" href="/assets/icons/icons.css">' : '',
    // the mobile menu collapses only where its button can open it
    '<script>document.documentElement.classList.add("js")</script>',
    page.figures ? '<script type="module" src="/assets/figures.js"></script>' : '',
    '<script src="/assets/site.js" defer></script>',
  ]
  return lines.filter(Boolean).join('\n')
}

const NAV = [
  { key: 'assistant', href: '/assistant', label: () => 'Assistant' },
  { key: 'uru', href: '/uru', label: (name) => name },
  { key: 'faq', href: '/faq', label: () => 'FAQ' },
  { key: 'manual', href: '/manual/', label: () => 'Manual' },
  { key: 'github', href: GITHUB, label: () => 'GitHub', external: true },
]

/** The skip link and the header. `current` is the nav key of this page, if it has one. */
export function header(current, name) {
  const items = NAV.map((n) => {
    const here = n.key === current ? ' aria-current="page"' : ''
    const out = n.external ? '<span class="ext" aria-hidden="true">↗</span>' : ''
    return `      <li><a href="${n.href}"${here}>${n.label(name)}${out}</a></li>`
  }).join('\n')
  return `<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap site-header__in">
    <a class="brand" href="/" aria-label="Urfael home">${MARK}<span class="brand__word">Urfael</span></a>
    <button class="menu-btn" type="button" aria-expanded="false" aria-controls="site-nav"><span class="menu-btn__bars" aria-hidden="true"></span>Menu</button>
    <nav class="site-nav" id="site-nav" aria-label="Main">
      <ul>
${items}
      </ul>
    </nav>
  </div>
</header>`
}

/** The footer: the lockup, the short story, the four link groups and the small print. */
export function footer(name) {
  const group = (id, title, links) => `      <nav class="footer__group" aria-labelledby="f-${id}">
        <p class="footer__h" id="f-${id}">${title}</p>
        <ul>
${links.map(([href, text]) => `          <li><a href="${href}">${text}</a></li>`).join('\n')}
        </ul>
      </nav>`
  return `<footer class="site-footer">
  <div class="wrap">
    <div class="footer__mast">
      <p class="footer__lockup">${MARK}<span>Urfael</span><span class="footer__dot" aria-hidden="true">·</span><span class="footer__tag">Help that lives with you.</span></p>
      <p class="footer__about">Urfael makes friendly AI that lives with you. Urfael Assistant is open source and runs on your own machine today. ${name}, a soft helper robot for the home, is at the research stage. Locked down by default. Honest about limits.</p>
    </div>
    <div class="footer__cols">
${group('urfael', 'Urfael', [['/', 'Home'], ['/assistant', 'Assistant'], ['/uru', name]])}
${group('learn', 'Learn', [['/manual/', 'Manual'], ['/faq', 'FAQ'], ['/compare', 'Compare'], ['/honesty', 'What’s tested']])}
${group('legal', 'Legal', [['/privacy', 'Privacy'], ['/terms', 'Terms'], ['/imprint', 'Imprint'], [`${GITHUB}/blob/main/LICENSE`, 'MIT License']])}
${group('hello', 'Say hello', [[GITHUB, 'GitHub'], [`mailto:${EMAIL}?subject=Hello%20Urfael`, 'Email us']])}
    </div>
    <div class="footer__small">
      <p>Urfael is an independent open-source project (MIT), not affiliated with, endorsed by or sponsored by Anthropic. Claude and Claude Code are trademarks of Anthropic. Provider names and marks belong to their respective owners and indicate compatibility only.</p>
      <p>${name} is a research project and is not a medical device.</p>
      <p>Urfael and the ᚢ mark identify MYG Media SRL’s projects.</p>
      <p>© 2026 MYG Media SRL</p>
    </div>
  </div>
</footer>`
}

/** A whole page: `body` is the inside of <main>. */
export function document(page, body, robot, name) {
  const mainClass = page.mainClass ? ` class="${page.mainClass}"` : ''
  return `<!DOCTYPE html>
<html lang="en">
<head>
<!-- Generated by site/pages/build.mjs from site/pages/src/${page.source}. Edit the source, then run npm run build:pages. -->
${head(page, robot)}
</head>
<body>
${header(page.nav, name)}
<main id="main"${mainClass}>${body}</main>
${footer(name)}
</body>
</html>
`
}
