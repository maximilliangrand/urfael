// Loads the icon set in Node: bundles site/icons/svg.ts (the kit, every icon and the serializer) with
// esbuild and imports it, as site/build.mjs does with the figure registry. Shared by build.mjs and sheet.mjs.
import { build } from 'esbuild'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ICON_DIR = dirname(fileURLToPath(import.meta.url))

export async function loadIcons() {
  const r = await build({
    entryPoints: [join(ICON_DIR, 'svg.ts')],
    bundle: true, write: false, format: 'esm', platform: 'neutral', logLevel: 'warning',
  })
  return import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'))
}
