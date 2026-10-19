'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCommandRunner, COMMAND_SUPPORTED } = require('../engine/command');
const { buildEngine } = require('../engine');
const { createEngine } = require('../engine/loop');
const { createToolset } = require('../engine/tools');
const { readOnlyToolset } = require('../engine/delegate');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'urf-command-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const run = createCommandRunner({ workspaceDir: dir, env: { PATH: process.env.PATH, HOME: '/not-inherited', MODEL_API_KEY: 'synthetic-secret' } });
  return { dir, run, command(code) {
    const file = path.join(dir, 'command.js'); fs.writeFileSync(file, code);
    return JSON.stringify(process.execPath) + ' ' + JSON.stringify(file);
  } };
}

async function until(check) {
  const deadline = Date.now() + 4000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('condition did not become true');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
function readPid(file) { try { const pid = Number(fs.readFileSync(file, 'utf8')); return Number.isSafeInteger(pid) && pid > 1 ? pid : null; } catch { return null; } }
function alive(pid) { if (!pid || pid <= 1) return false; try { process.kill(pid, 0); return true; } catch { return false; } }
const posix = { skip: process.platform === 'win32' };

test('command runner returns separate streams, status, and a minimal workspace environment', posix, async (t) => {
  const f = fixture(t);
  const r = await f.run(f.command('console.log(JSON.stringify({cwd:process.cwd(),home:process.env.HOME,key:process.env.MODEL_API_KEY})); console.error("temporary failure"); process.exitCode=75;'));
  assert.equal(r.exitCode, 75);
  assert.equal(r.stderr, 'temporary failure\n');
  assert.deepEqual(JSON.parse(r.stdout), { cwd: fs.realpathSync(f.dir), home: fs.realpathSync(f.dir) });
  assert.equal(r.timedOut, false); assert.equal(r.aborted, false);
});

test('cwd accepts workspace subdirectories and rejects traversal, sibling prefixes and symlink escapes', posix, async (t) => {
  const f = fixture(t); const sub = path.join(f.dir, 'sub'); fs.mkdirSync(sub);
  const outside = fs.mkdtempSync(f.dir + '-outside-'); t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.symlinkSync(outside, path.join(f.dir, 'escape'));
  const command = f.command('console.log(process.cwd())');
  assert.equal((await f.run(command, {}, { cwd: 'sub' })).stdout.trim(), fs.realpathSync(sub));
  for (const cwd of ['..', outside, 'escape', 'missing', 'command.js', 1]) {
    const r = await f.run(command, {}, { cwd });
    assert.ok(r.error, String(cwd)); assert.equal(r.exitCode, null);
  }
});

test('invalid commands, limits and missing workspaces fail without launching', posix, async (t) => {
  const f = fixture(t); let started = 0;
  for (const command of ['', ' ', 1, 'x\0y', 'x'.repeat(4097)]) {
    assert.ok((await f.run(command, {}, { onStart: () => started++ })).error);
  }
  for (const timeoutMs of [-1, '100', Infinity]) assert.ok((await f.run('true', {}, { timeoutMs })).error);
  assert.ok((await createCommandRunner({})('true')).error);
  assert.equal(started, 0);
});

test('output is bounded across both streams and excess output terminates the command', posix, async (t) => {
  const f = fixture(t);
  const r = await f.run(f.command('process.stdout.write("€".repeat(100000)); setInterval(()=>{},1000);'), {}, { maxBytes: 256 });
  assert.equal(r.truncated, true);
  assert.ok(Buffer.byteLength(r.stdout) + Buffer.byteLength(r.stderr) <= 256);
  assert.ok(!r.stdout.includes('\uFFFD'));
  assert.equal(r.signal, 'SIGKILL');
});

test('UTF-8 is decoded across child stream chunk boundaries', posix, async (t) => {
  const f = fixture(t);
  const r = await f.run(f.command('const b=Buffer.from("hé🙂"); let i=0; const timer=setInterval(()=>{process.stdout.write(b.subarray(i,i+1)); if(++i===b.length)clearInterval(timer);},5);'));
  assert.equal(r.stdout, 'hé🙂'); assert.equal(r.exitCode, 0);
});

for (const kind of ['timeout', 'abort']) test(kind + ' kills the shell and its ordinary child processes', posix, async (t) => {
  const f = fixture(t); const pidFile = path.join(f.dir, 'child.pid');
  const command = f.command('const cp=require("node:child_process").spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"inherit"}); require("node:fs").writeFileSync("child.pid",String(cp.pid)); setInterval(()=>{},1000);');
  const controller = new AbortController();
  t.after(() => controller.abort());
  const pending = f.run(command, {}, { timeoutMs: kind === 'timeout' ? 1000 : 5000, signal: controller.signal });
  await until(() => readPid(pidFile));
  const pid = readPid(pidFile);
  t.after(() => { try { process.kill(pid, 'SIGKILL'); } catch {} });
  if (kind === 'abort') controller.abort();
  const r = await pending;
  assert.equal(r.timedOut, kind === 'timeout'); assert.equal(r.aborted, kind === 'abort');
  await until(() => !alive(pid));
});

test('a successful shell cannot leave an ordinary background child behind', posix, async (t) => {
  const f = fixture(t);
  const r = await f.run(f.command('const cp=require("node:child_process").spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"}); require("node:fs").writeFileSync("child.pid",String(cp.pid)); cp.unref();'));
  const pid = readPid(path.join(f.dir, 'child.pid'));
  assert.ok(pid > 1);
  t.after(() => { try { process.kill(pid, 'SIGKILL'); } catch {} });
  assert.equal(r.exitCode, 0);
  await until(() => !alive(pid));
});

test('an already-cancelled command never starts', posix, async (t) => {
  const f = fixture(t); const controller = new AbortController(); controller.abort(); let started = false;
  const r = await f.run('touch should-not-exist', {}, { signal: controller.signal, onStart: () => { started = true; } });
  assert.equal(r.aborted, true); assert.equal(started, false);
  assert.equal(fs.existsSync(path.join(f.dir, 'should-not-exist')), false);
});

test('the real factory and tool loop expose a transient failure and successful model-requested retry', posix, async (t) => {
  const f = fixture(t); let starts = 0;
  const command = f.command('const fs=require("node:fs"); if(!fs.existsSync(".attempt")){fs.writeFileSync(".attempt","1"); console.error("Transient export failure. Retry once."); process.exit(75);} fs.writeFileSync("export.json",JSON.stringify({exported:37,status:"complete"})); console.log("Export complete.");');
  const built = buildEngine({ entry: { kind: 'openai', baseUrl: 'http://127.0.0.1:1/v1' }, secret: 'test',
    model: 'test', vaultDir: f.dir, workspaceDir: f.dir, profile: 'local', allowShell: true, runShell: f.run,
    onCommandStart: () => starts++ });
  let calls = 0;
  const adapter = { chat: async () => ++calls <= 2
    ? { ok: true, text: '', stopReason: 'tool_calls', toolCalls: [{ id: String(calls), name: 'exec_shell', args: JSON.stringify({ command }) }] }
    : { ok: true, text: 'Done.', stopReason: 'stop' } };
  const r = await createEngine({ adapter, toolset: built.toolset }).run([{ role: 'user', content: 'Execute export and retry once if transient.' }]);
  assert.equal(r.ok, true); assert.equal(starts, 2);
  const results = r.messages.filter((m) => m.role === 'tool').map((m) => JSON.parse(m.content));
  assert.deepEqual(results.map((m) => m.exit_code), [75, 0]);
  assert.match(results[0].stderr, /Transient/); assert.match(results[1].stdout, /Export complete/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.dir, 'export.json'), 'utf8')), { exported: 37, status: 'complete' });
});

test('cancelling an engine turn aborts its active command without another model call', posix, async (t) => {
  const f = fixture(t); const controller = new AbortController(); let calls = 0;
  t.after(() => controller.abort());
  const toolset = createToolset({ vaultDir: f.dir, profile: 'local', allowShell: true, runShell: f.run,
    onCommandStart: () => setTimeout(() => controller.abort(), 50) });
  const adapter = { chat: async () => { calls++; return { ok: true, stopReason: 'tool_calls', toolCalls: [
    { id: '1', name: 'exec_shell', args: JSON.stringify({ command: f.command('setInterval(()=>{},1000)') }) },
  ] }; } };
  const result = await createEngine({ adapter, toolset }).run([], { signal: controller.signal });
  assert.equal(calls, 1); assert.equal(result.stopReason, 'aborted');
  assert.equal(JSON.parse(result.messages.find((m) => m.role === 'tool').content).aborted, true);
});

test('delegation strips an enabled parent command capability even when passed its entire config', posix, async (t) => {
  const f = fixture(t); let starts = 0;
  const sub = readOnlyToolset({ vaultDir: f.dir, profile: 'local', allowShell: true, runShell: f.run,
    onCommandStart: () => starts++ });
  assert.ok(!sub.defs.some((d) => d.name === 'exec_shell'));
  assert.match(await sub.dispatch('exec_shell', { command: 'touch should-not-exist' }), /read-only/);
  assert.equal(starts, 0);
});

test('platform support is explicit; Windows command execution fails closed', async () => {
  assert.equal(COMMAND_SUPPORTED, process.platform !== 'win32');
  if (!COMMAND_SUPPORTED) assert.match((await createCommandRunner({ workspaceDir: os.tmpdir() })('echo x')).error, /Windows/);
});
