'use strict';
// Compatibility entrypoint for newly seeded vaults. Managed jobs invoke app/goal-loop.js directly, so an
// upgrade does not depend on replacing the owner's existing vault scripts.
const fs = require('fs');
const os = require('os');
const path = require('path');
function enginePath() {
  try {
    const repo = fs.readFileSync(path.join(os.homedir(), '.claude', 'urfael', 'repo'), 'utf8').trim();
    if (repo) return path.join(repo, 'app', 'goal-loop.js');
  } catch {}
  const source = path.resolve(__dirname, '..', '..', 'app', 'goal-loop.js');
  if (fs.existsSync(source)) return source;
  return path.join(os.homedir(), 'urfael-src', 'app', 'goal-loop.js');
}
const engine = require(enginePath());
module.exports = engine;
if (require.main === module) engine.main(process.argv.slice(2)).then((code) => process.exit(code)).catch((e) => {
  process.stderr.write(String(e.message || e) + '\n'); process.exit(1);
});
