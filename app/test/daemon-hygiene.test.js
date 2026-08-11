'use strict';
// Source-hygiene guard for daemon.js. The native `recall` tool was silently mis-wired for a while because a NEW
// module-scope `function recallText(q,k)` collided with a pre-existing `function recallText(e)`: two same-named
// function DECLARATIONS hoist so the later one wins, and every `recall: recallText` reference bound to the wrong
// function — returning garbage, invisible to the engine tests (which inject a fake recall). This freezes the class:
// daemon.js must never again declare two module-scope functions with the same name.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('daemon.js has no duplicate module-scope function declarations (the recallText-collision class)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'daemon.js'), 'utf8');
  const seen = new Map();
  const dups = [];
  // module-scope declarations start at column 0: `function foo(` or `async function foo(`
  const re = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
  let m;
  while ((m = re.exec(src)) !== null) {
    const name = m[1];
    const line = src.slice(0, m.index).split('\n').length;
    if (seen.has(name)) dups.push(`${name} (lines ${seen.get(name)} and ${line})`);
    else seen.set(name, line);
  }
  assert.deepStrictEqual(dups, [], 'duplicate module-scope function declarations shadow each other via hoisting: ' + dups.join('; '));
});

// A supervised daemon that swallows an uncaught throw is a daemon that never restarts: both supervisors act on a
// NONZERO exit only (systemd Restart=on-failure, launchd KeepAlive/SuccessfulExit=false), so a log-and-continue
// handler guaranteed the process would keep serving requests from whatever torn state the throw unwound out of.
test('an uncaught throw / unhandled rejection reaps the children and EXITS NONZERO (so the supervisor restarts clean)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'daemon.js'), 'utf8');
  assert.match(src, /process\.on\('uncaughtException', \(e\) => fatal\(/, 'uncaughtException must route to fatal()');
  assert.match(src, /process\.on\('unhandledRejection', \(e\) => fatal\(/, 'unhandledRejection must route to fatal()');
  const fn = src.match(/function fatal\([^)]*\)\s*\{[\s\S]*?\n\}/);
  assert.ok(fn, 'fatal() must exist');
  assert.match(fn[0], /process\.exit\(1\)/, 'fatal must exit NONZERO — a zero/absent exit is never restarted');
  assert.match(fn[0], /for \(const p of inflightScoped\)/, 'fatal must reap inflight scoped children, not orphan them');
  assert.match(fn[0], /for \(const s of sessions\.values\(\)\)/, 'fatal must reap the warm sessions');
  assert.match(fn[0], /fs\.unlinkSync\(SOCK\)/, 'fatal must release the socket so the restarted daemon can bind');
  assert.match(fn[0], /if \(dying\) return;/, 're-entrancy guard: a throw inside fatal must not recurse');
  // the supervisor units this depends on
  const unit = fs.readFileSync(path.join(__dirname, '..', '..', 'config', 'systemd', 'urfael-daemon.service.template'), 'utf8');
  assert.match(unit, /Restart=on-failure/, 'systemd restarts on a nonzero exit — which is what fatal() now produces');
  const plist = fs.readFileSync(path.join(__dirname, '..', '..', 'config', 'launchagents', 'com.urfael.daemon.plist.template'), 'utf8');
  assert.match(plist, /<key>SuccessfulExit<\/key><false\/>/, 'launchd restarts on a nonzero exit too');
});

test('the native recall tool is wired to the BM25 archive search, not the vector-key helper', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'daemon.js'), 'utf8');
  // the native spec must reference the distinctly-named search function, and that function must query the recall index
  assert.match(src, /recall:\s*nativeRecallSearch\b/, 'the native engine spec must bind recall to nativeRecallSearch');
  const fn = src.match(/async function nativeRecallSearch\([^)]*\)\s*\{[\s\S]*?\n\}/);
  assert.ok(fn, 'nativeRecallSearch must exist');
  assert.match(fn[0], /ridx\.(query|entriesFor)/, 'nativeRecallSearch must actually search the recall index (BM25), not extract vector keys');
});
