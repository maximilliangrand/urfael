'use strict';
// Static + stubbed-spawn tests over vault-template/_urfael/goal-loop.sh for the OPT-IN --verify gate. Proves:
//   • default worker prompt stays compatible; both host entrypoints share the app-bundled engine;
//   • --verify without --criteria fails closed (non-zero exit);
//   • two-key ordering (a RED --check never spawns the verifier);
//   • exit-only-on-pass + feedback (refute → continue with the refutation fed into the next prompt; pass → DONE).
// The stub replaces `claude` + `timeout` with tiny fakes on PATH so one loop runs offline in milliseconds; the
// verifier verdict is driven by FAKE_VERDICT so the control flow is deterministic.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const REPO_ROOT = path.join(__dirname, '..', '..');            // the worktree root (holds app/, vault-template/)
const GOAL_LOOP = path.join(REPO_ROOT, 'vault-template', '_urfael', 'goal-loop.sh');
const GOAL_LOOP_JS = path.join(REPO_ROOT, 'vault-template', '_urfael', 'goal-loop.js');
const SRC = fs.readFileSync(GOAL_LOOP, 'utf8');
// Every functional scenario below runs against BOTH implementations where the host allows: the bash loop
// (POSIX only — bash does not exist on native Windows) and its JS twin (every OS, including the windows CI
// leg). Same fakes, same assertions — the twin can never drift from the .sh without a red build.
const ENGINES = process.platform === 'win32' ? ['js'] : ['sh', 'js'];

test('host Bash entry delegates to the durable JS loop; sandbox recovery fails closed', () => {
  assert.match(SRC, /exec node .*goal-loop\.js/);
  assert.ok(SRC.includes('--state/--resume recovery is supported only for host goals'));
});

test('the verifier spawn is the read-only floor with NO --resume / bypass (grep-gated, mirrors goal-verify.js)', () => {
  // the VFLAGS line grants only Read/Grep/Glob and never resumes a session or escalates permissions
  assert.match(SRC, /VFLAGS=\(--permission-mode acceptEdits --strict-mcp-config --allowedTools Read,Grep,Glob --output-format json --model "\$MODEL"\)/);
  const vflagsLine = SRC.split('\n').find((l) => l.includes('VFLAGS=('));
  assert.ok(vflagsLine && !/--resume|bypassPermissions|dangerously-skip/.test(vflagsLine), 'verifier flags carry no resume/bypass');
});

// ── FUNCTIONAL harness ────────────────────────────────────────────────────────────────────────────────────
function makeStub() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'urfael-goalloop-'));
  const bin = path.join(dir, 'bin'); fs.mkdirSync(bin);
  const claudeLog = path.join(dir, 'claude-prompts.log');
  // fake `timeout`: drop `-k <n>` and the duration, exec the rest.
  fs.writeFileSync(path.join(bin, 'timeout'),
    '#!/usr/bin/env bash\nwhile [ "$1" = "-k" ]; do shift 2; done\nshift\nexec "$@"\n', { mode: 0o755 });
  // fake `claude`: capture the -p prompt; a verifier turn (its prompt says "Independent completion review") returns
  // a verdict driven by FAKE_VERDICT; a worker turn claims done with the marker.
  fs.writeFileSync(path.join(bin, 'claude'),
    '#!/usr/bin/env bash\n' +
    'prompt=""; args=("$@")\n' +
    'for ((k=0;k<${#args[@]};k++)); do [ "${args[$k]}" = "-p" ] && prompt="${args[$((k+1))]}"; done\n' +
    'printf "===PROMPT===\\n%s\\n" "$prompt" >> "' + claudeLog + '"\n' +
    'if printf "%s" "$prompt" | grep -q "Independent completion review"; then\n' +
    '  if [ "${FAKE_VERDICT:-pass}" = "pass" ]; then\n' +
    '    printf "%s" \'{"result":"{\\"verdict\\":\\"pass\\",\\"met\\":[{\\"id\\":\\"c1\\",\\"evidence\\":\\"found in a.js\\"}],\\"reason\\":\\"ok\\"}","is_error":false,"session_id":"v1"}\'\n' +
    '  else\n' +
    '    printf "%s" \'{"result":"{\\"verdict\\":\\"refute\\",\\"reason\\":\\"criterion one is unmet\\"}","is_error":false,"session_id":"v1"}\'\n' +
    '  fi\n' +
    'else\n' +
    '  printf "%s" \'{"result":"did work\\nURFAEL-GOAL-DONE","is_error":false,"session_id":"w1"}\'\n' +
    'fi\n', { mode: 0o755 });
  // a git repo for the loop to operate on
  const repo = path.join(dir, 'repo'); fs.mkdirSync(repo);
  cp.execFileSync('git', ['init', '-q'], { cwd: repo });
  cp.execFileSync('git', ['config', 'user.email', 't@t'], { cwd: repo });
  cp.execFileSync('git', ['config', 'user.name', 't'], { cwd: repo });
  fs.writeFileSync(path.join(repo, 'seed.txt'), 'seed');
  cp.execFileSync('git', ['add', '-A'], { cwd: repo });
  cp.execFileSync('git', ['commit', '-qm', 'seed'], { cwd: repo });
  // a fake HOME so goal-loop resolves APP → THIS worktree's app/ (not the user's real ~/urfael-src)
  const home = path.join(dir, 'home'); fs.mkdirSync(path.join(home, '.claude', 'urfael'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude', 'urfael', 'repo'), REPO_ROOT);
  const crit = path.join(dir, 'criteria.txt'); fs.writeFileSync(crit, '# the bar\ncriterion one must be implemented\n');
  // the SAME fake claude as a node script, for the JS twin (and the only form native Windows can run).
  // Shebang + 0755 so the POSIX twin run can exec it too; claude-bin's .js branch handles it on win32.
  const claudeJs = path.join(bin, 'claude-fake.js');
  fs.writeFileSync(claudeJs, [
    '#!/usr/bin/env node',
    "'use strict';",
    "const fs = require('fs');",
    "const argv = process.argv.slice(2);",
    "let prompt = ''; const i = argv.indexOf('-p'); if (i >= 0) prompt = argv[i + 1] || '';",
    'fs.appendFileSync(' + JSON.stringify(claudeLog) + ", '===PROMPT===\\n' + prompt + '\\n');",
    "if (prompt.includes('Independent completion review')) {",
    "  if ((process.env.FAKE_VERDICT || 'pass') === 'pass') process.stdout.write(JSON.stringify({ result: JSON.stringify({ verdict: 'pass', met: [{ id: 'c1', evidence: 'found in a.js' }], reason: 'ok' }), is_error: false, session_id: 'v1' }));",
    "  else process.stdout.write(JSON.stringify({ result: JSON.stringify({ verdict: 'refute', reason: 'criterion one is unmet' }), is_error: false, session_id: 'v1' }));",
    '} else {',
    "  process.stdout.write(JSON.stringify({ result: 'did work\\nURFAEL-GOAL-DONE', is_error: false, session_id: 'w1' }));",
    '}',
  ].join('\n'), { mode: 0o755 });
  return { dir, bin, claudeLog, repo, home, crit, claudeJs };
}

function runLoop(stub, extraArgs, extraEnv, engine) {
  const common = ['do the thing', '--repo', stub.repo, '--max-iters', '2', '--turn-timeout', '30', '--model', 'sonnet', ...extraArgs];
  // Pin the fixture for BOTH entrypoints. In particular, do not inherit a daemon-smoke CLI override
  // from an outer test runner, or any real account environment from the developer's shell.
  const env = Object.assign({
    HOME: stub.home, USERPROFILE: stub.home,
    PATH: stub.bin + path.delimiter + process.env.PATH,
    SystemRoot: process.env.SystemRoot || '',
    URFAEL_CLAUDE_BIN: stub.claudeJs,
    URFAEL_UPDATE_CHECK: '0',
  }, extraEnv || {});
  let r;
  if (engine === 'js') {
    r = cp.spawnSync(process.execPath, [GOAL_LOOP_JS, ...common], { env, encoding: 'utf8', timeout: 60000 });
  } else {
    r = cp.spawnSync('bash', [GOAL_LOOP, ...common], { env, encoding: 'utf8', timeout: 60000 });
  }
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), prompts: (() => { try { return fs.readFileSync(stub.claudeLog, 'utf8'); } catch { return ''; } })() };
}

for (const engine of ENGINES) test('MANDATORY CONTRACT [' + engine + ']: --verify without --criteria exits non-zero (fail-closed)', () => {
  const stub = makeStub();
  try {
    const r = runLoop(stub, ['--verify'], {}, engine);   // no --criteria
    assert.notEqual(r.code, 0, 'must exit non-zero');
    assert.match(r.out, /--verify requires --criteria/);
  } finally { fs.rmSync(stub.dir, { recursive: true, force: true }); }
});

for (const engine of ENGINES) test('DEFAULT BYTE-IDENTICAL [' + engine + ']: flag-off worker prompt is the baseline (no COMPLETION CONTRACT injected)', () => {
  const stub = makeStub();
  try {
    const r = runLoop(stub, ['--max-iters', '1'], {}, engine);   // no --verify
    assert.ok(r.prompts.includes('Work toward this goal in this repo'), 'baseline prompt present');
    assert.ok(!r.prompts.includes('COMPLETION CONTRACT'), 'no contract text is injected when the gate is off');
    assert.ok(!r.prompts.includes('Independent completion review'), 'no verifier is ever spawned when the gate is off');
  } finally { fs.rmSync(stub.dir, { recursive: true, force: true }); }
});

for (const engine of ENGINES) test('CONTRACT INJECTED [' + engine + '] under --verify: the worker prompt carries the up-front bar', () => {
  const stub = makeStub();
  try {
    const r = runLoop(stub, ['--verify', '--criteria', stub.crit, '--max-iters', '1'], { FAKE_VERDICT: 'refute' }, engine);
    assert.ok(r.prompts.includes('COMPLETION CONTRACT'), 'the contract bar is prepended to the worker turn');
    assert.ok(r.prompts.includes('criterion one must be implemented'), 'the criteria are shown to the worker');
  } finally { fs.rmSync(stub.dir, { recursive: true, force: true }); }
});

for (const engine of ENGINES) test('EXIT ON PASS [' + engine + ']: a pass verdict falls through to DONE (independently verified)', () => {
  const stub = makeStub();
  try {
    const r = runLoop(stub, ['--verify', '--criteria', stub.crit], { FAKE_VERDICT: 'pass' }, engine);
    assert.ok(r.prompts.includes('Independent completion review'), 'the verifier WAS spawned at candidate-done');
    assert.match(r.out, /Result: COMPLETED/);
    assert.match(r.out, /independently verified/);
  } finally { fs.rmSync(stub.dir, { recursive: true, force: true }); }
});

for (const engine of ENGINES) test('REFUTE → continue + FEEDBACK [' + engine + ']: a refute never DONEs and feeds the reason into the next prompt', () => {
  const stub = makeStub();
  try {
    const r = runLoop(stub, ['--verify', '--criteria', stub.crit], { FAKE_VERDICT: 'refute' }, engine);
    assert.ok(!/Result: COMPLETED/.test(r.out), 'a refuted candidate is never COMPLETED');
    assert.match(r.out, /not independently verified/);
    // the refutation reason is injected into a later worker turn's prompt
    assert.ok(r.prompts.includes('a prior INDEPENDENT read-only review REFUTED completion'), 'the refutation is fed back');
    assert.ok(r.prompts.includes('criterion one is unmet'), 'the specific reason is carried into the next turn');
  } finally { fs.rmSync(stub.dir, { recursive: true, force: true }); }
});

for (const engine of ENGINES) test('TWO-KEY ORDERING [' + engine + ']: a RED --check never spawns the verifier (Layer 1 gates Layer 2)', () => {
  const stub = makeStub();
  try {
    // --check "exit 1" never passes → candidate-done never reached → verifier never spawned. (`exit 1` is red
    // under bash AND PowerShell, so the same scenario drives both engines on every OS.)
    const r = runLoop(stub, ['--verify', '--criteria', stub.crit, '--check', 'exit 1'], { FAKE_VERDICT: 'pass' }, engine);
    assert.ok(!r.prompts.includes('Independent completion review'), 'a red check must never spawn the independent verifier');
    assert.ok(!/Result: COMPLETED/.test(r.out), 'a red check can never reach DONE');
  } finally { fs.rmSync(stub.dir, { recursive: true, force: true }); }
});
