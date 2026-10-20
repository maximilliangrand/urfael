'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const backend = require('../codex-backend');

function fixture(t, body, status = 'Logged in using ChatGPT') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'urfael-codex-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const bin = path.join(dir, 'codex.cjs');
  fs.writeFileSync(bin, `const workspace = ${JSON.stringify(dir)};\nif (process.argv.includes('status')) { console.error(${JSON.stringify(status)}); process.exit(0); }\n` + body);
  return { workspaceDir: dir, env: { ...process.env, URFAEL_CODEX_BIN: bin }, timeoutMs: 5000,
    messages: [{ role: 'system', content: 'Be concise.' }, { role: 'user', content: 'Say hello.' }] };
}
const success = `console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Hello 👋'}}));
console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:12,output_tokens:3,cached_input_tokens:5}}));`;

test('Codex resolves npm Windows shims without a shell, and explicit JS entrypoints with Node', () => {
  const win = path.win32;
  const cli = win.join('C:\\npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
  const io = { accessSync(file) { if (file !== cli) throw new Error('missing'); } };
  assert.deepEqual(backend.resolve({ URFAEL_CODEX_BIN: 'C:\\npm\\codex.cmd' }, 'win32', io, 'C:\\node.exe'), { bin: 'C:\\node.exe', pre: [cli] });
  assert.deepEqual(backend.resolve({ APPDATA: 'C:\\' }, 'win32', io, 'C:\\node.exe'), { bin: 'C:\\node.exe', pre: [cli] });
  assert.deepEqual(backend.resolve({ URFAEL_CODEX_BIN: '/tmp/codex.cjs' }, 'linux', io, '/usr/bin/node'), { bin: '/usr/bin/node', pre: ['/tmp/codex.cjs'] });
});

test('Codex child env preserves official login location but strips keys, endpoint overrides and daemon secrets', () => {
  const src = { HOME: '/home/me', PATH: '/usr/bin', CODEX_HOME: '/home/me/.codex', USER: 'me',
    OPENAI_API_KEY: 'openai-secret', CODEX_API_KEY: 'codex-secret', ANTHROPIC_API_KEY: 'anthropic-secret',
    OPENAI_BASE_URL: 'https://wrong.example', CHATGPT_BASE_URL: 'https://wrong.example', URFAEL_BRIDGE_TOKEN: 'bridge-secret' };
  assert.deepEqual(backend.childEnv(src), { HOME: '/home/me', PATH: '/usr/bin', CODEX_HOME: '/home/me/.codex', USER: 'me' });
  assert.equal(src.OPENAI_API_KEY, 'openai-secret');
});

test('Codex official login status returns only safe method metadata', async (t) => {
  assert.deepEqual(await backend.authStatus(fixture(t, success)), { installed: true, loggedIn: true, method: 'chatgpt' });
  const api = await backend.authStatus(fixture(t, success, 'Logged in using an API key - private-value'));
  assert.deepEqual(api, { installed: true, loggedIn: true, method: 'api-key' });
  assert.ok(!JSON.stringify(api).includes('private-value'));
});

test('Codex run sends history through stdin, isolates auth, uses read-only defaults, and parses JSONL usage', async (t) => {
  const opts = fixture(t, `let input=''; process.stdin.setEncoding('utf8'); process.stdin.on('data',s=>input+=s);
process.stdin.on('end',()=>{
 require('fs').writeFileSync(require('path').join(workspace,'received.json'),JSON.stringify({args:process.argv.slice(2),input,hasKey:!!process.env.OPENAI_API_KEY}));
 console.log('non-JSON diagnostic');
 for (const noise of [null, true, 42, 'diagnostic', []]) console.log(JSON.stringify(noise));
 console.log(JSON.stringify({type:'item.completed',item:{type:'command_execution'}}));
 const events = ${JSON.stringify(success)}; eval(events);
});`);
  opts.env.OPENAI_API_KEY = 'fake-key';
  const deltas = [];
  const result = await backend.run({ ...opts, onDelta: (text) => deltas.push(text) });
  assert.equal(result.ok, true);
  assert.equal(result.text, 'Hello 👋');
  assert.deepEqual(result.usage, { inTok: 12, outTok: 3, cacheReadTok: 5 });
  assert.equal(result.steps, 1);
  assert.deepEqual(deltas, ['Hello 👋']);
  const received = JSON.parse(fs.readFileSync(path.join(opts.workspaceDir, 'received.json')));
  assert.equal(received.hasKey, false);
  assert.deepEqual(JSON.parse(received.input.slice(received.input.lastIndexOf('\n') + 1)), opts.messages);
  assert.equal(received.args.at(-1), '-');
  assert.equal(received.args[received.args.indexOf('--sandbox') + 1], 'read-only');
  assert.ok(received.args.includes('--ignore-user-config'));
  assert.ok(received.args.includes('--ephemeral'));
  assert.ok(received.args.includes('approval_policy="never"'));
  assert.ok(!received.args.some((a) => a.includes('forced_login_method') || a.includes('bypass')));
  assert.ok(!received.args.includes('--model'));
});

test('Codex workspace writes require explicit boolean opt-in and model is a separate argv value', async (t) => {
  const opts = fixture(t, `require('fs').writeFileSync(require('path').join(workspace,'args.json'),JSON.stringify(process.argv.slice(2)));\n${success}`);
  const result = await backend.run({ ...opts, allowWrite: true, model: 'gpt-test' });
  assert.equal(result.ok, true);
  const args = JSON.parse(fs.readFileSync(path.join(opts.workspaceDir, 'args.json')));
  assert.equal(args[args.indexOf('--sandbox') + 1], 'workspace-write');
  assert.equal(args[args.indexOf('--model') + 1], 'gpt-test');
  assert.equal(args[args.indexOf('--add-dir') + 1], fs.realpathSync(opts.workspaceDir));
});

test('Codex subscription refuses API-key login before starting a model turn', async (t) => {
  const opts = fixture(t, "require('fs').writeFileSync(require('path').join(workspace,'started'),'yes');", 'Logged in using an API key');
  const result = await backend.run(opts);
  assert.equal(result.ok, false);
  assert.match(result.error, /Sign in with ChatGPT/);
  assert.equal(fs.existsSync(path.join(opts.workspaceDir, 'started')), false);
});

test('Codex refuses missing CLI, failed/incomplete turns and nonzero exits without echoing raw errors', async (t) => {
  const missing = await backend.authStatus({ env: { URFAEL_CODEX_BIN: path.join(os.tmpdir(), 'urfael-missing-codex') } });
  assert.equal(missing.installed, false);
  for (const body of ["console.log(JSON.stringify({type:'turn.failed',error:{message:'private-value'}}));",
    "console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'partial'}}));",
    success + "process.stderr.write('private-value'); process.exitCode=2;"]) {
    const result = await backend.run(fixture(t, body));
    assert.equal(result.ok, false);
    assert.ok(!result.error.includes('private-value'));
  }
});

test('Codex parses a final line without newline and survives a throwing display callback', async (t) => {
  const opts = fixture(t, `console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'ok'}}));
process.stdout.write(JSON.stringify({type:'turn.completed'}));`);
  const result = await backend.run({ ...opts, onDelta() { throw new Error('UI disconnected'); } });
  assert.equal(result.ok, true);
  assert.equal(result.text, 'ok');
});

test('Codex watchdog and cancellation terminate hanging children and return classified errors', async (t) => {
  const opts = fixture(t, 'setInterval(()=>{},1000);');
  const result = await backend.run({ ...opts, timeoutMs: 500 });
  assert.equal(result.ok, false);
  assert.match(result.error, /timed out/);
  const ctrl = new AbortController();
  const pending = backend.run({ ...opts, signal: ctrl.signal });
  const timer = setTimeout(() => ctrl.abort(), 150);
  t.after(() => clearTimeout(timer));
  const aborted = await pending;
  assert.equal(aborted.stopReason, 'aborted');
  assert.equal(aborted.ok, false);
});

test('Codex bounds runaway stdout and rejects before spawn when already aborted or workspace is relative', async (t) => {
  const opts = fixture(t, "process.stdout.write('x'.repeat(9*1024*1024));setInterval(()=>{},1000);");
  assert.match((await backend.run(opts)).error, /output exceeded limit/);
  const ctrl = new AbortController(); ctrl.abort();
  assert.equal((await backend.run({ ...opts, signal: ctrl.signal })).stopReason, 'aborted');
  assert.match((await backend.run({ ...opts, workspaceDir: 'relative' })).error, /absolute workspace/);
});

test('Codex disables ambient customizations and launches outside the project with a temporary cwd', async (t) => {
  const opts = fixture(t, `require('fs').writeFileSync(require('path').join(workspace,'args.json'),JSON.stringify(process.argv.slice(2)));\n${success}`);
  assert.equal((await backend.run(opts)).ok, true);
  const args = JSON.parse(fs.readFileSync(path.join(opts.workspaceDir, 'args.json')));
  for (const feature of ['hooks', 'plugins', 'apps', 'memories', 'multi_agent', 'browser_use', 'computer_use', 'image_generation']) {
    assert.ok(args.some((arg, i) => arg === '--disable' && args[i + 1] === feature), feature);
  }
  assert.ok(args.includes('project_doc_max_bytes=0'));
  const cwd = args[args.indexOf('--cd') + 1];
  assert.notEqual(cwd, opts.workspaceDir);
  assert.equal(fs.existsSync(cwd), false, 'temporary cwd is removed after the child exits');
  assert.ok(!args.includes('--add-dir'));
  assert.ok(args.includes('skip_host_skill_discovery'));
});

test('Codex reaps descendants when the CLI exits normally', { skip: process.platform === 'win32' }, async (t) => {
  const opts = fixture(t, `const child=require('child_process').spawn(process.execPath,['-e',"setTimeout(()=>require('fs').writeFileSync("+JSON.stringify(require('path').join(workspace,'leaked'))+",'yes'),600)"],{stdio:'inherit'});
${success}
child.unref();process.exit(0);`);
  assert.equal((await backend.run(opts)).ok, true);
  await new Promise((done) => setTimeout(done, 750));
  assert.equal(fs.existsSync(path.join(opts.workspaceDir, 'leaked')), false);
});

test('Codex stopAll aborts all active children during daemon shutdown', async (t) => {
  const first = backend.run(fixture(t, 'setInterval(()=>{},1000);'));
  const second = backend.run(fixture(t, 'setInterval(()=>{},1000);'));
  const timer = setTimeout(() => backend.stopAll(), 150);
  t.after(() => clearTimeout(timer));
  for (const result of await Promise.all([first, second])) {
    assert.equal(result.ok, false);
    assert.equal(result.stopReason, 'aborted');
  }
  backend.stopAll();
});
