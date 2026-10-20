'use strict';
// Real daemon and command subprocesses; only the model transport is an offline loopback fixture.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

const APP = path.join(__dirname, '..');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let home, workspace, socket, daemon, provider, command, mode = 'command', output = '', modelCalls = 0;
const modelRequests = [];
const ownedPids = new Set();

function request(body, signal, route = '/engine/ask') {
  return new Promise((resolve) => {
    const req = http.request({ socketPath: socket, method: body === undefined ? 'GET' : 'POST', path: route, signal,
      headers: { 'Content-Type': 'application/json' }, timeout: 15000 }, (res) => {
      let raw = ''; res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => { let json; try { json = JSON.parse(raw); } catch {} resolve({ status: res.statusCode, json, raw }); });
    });
    req.on('error', () => resolve({ status: 0 })); req.on('timeout', () => req.destroy());
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
async function until(check) {
  const deadline = Date.now() + 10000;
  while (!(await check())) {
    if (Date.now() > deadline) assert.fail('fixture timed out: ' + output);
    await pause(20);
  }
}
function pidAt(file) { try { const pid = Number(fs.readFileSync(file, 'utf8')); return Number.isSafeInteger(pid) && pid > 1 ? pid : null; } catch { return null; } }
function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }

describe('native command API (isolated owner profile)', { skip: process.platform === 'win32', timeout: 30000 }, () => {
  before(async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'urf-exec-api-'));
    workspace = path.join(home, 'vault'); socket = path.join(home, '.claude', 'urfael', 'daemon.sock');
    for (const dir of [workspace, path.dirname(socket), path.join(home, 'memory', 'sessions')]) fs.mkdirSync(dir, { recursive: true });
    provider = http.createServer((req, res) => {
      let body = ''; req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        modelCalls++;
        const payload = JSON.parse(body);
        modelRequests.push(payload);
        assert.ok(payload.tools.some((tool) => tool.function.name === 'exec_shell'));
        if (mode === 'error' || (mode === 'error_after_command' && payload.messages.some((message) => message.role === 'tool'))) { res.writeHead(503); res.end('offline fixture unavailable'); return; }
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        if (mode === 'answer' || payload.messages.some((message) => message.role === 'tool')) {
          res.end('data: ' + JSON.stringify({ choices: [{ delta: { content: 'NATIVE_OK' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }) + '\n\ndata: [DONE]\n\n'); return;
        }
        res.end('data: ' + JSON.stringify({ choices: [{ delta: { tool_calls: [
          { index: 0, id: 'test-command', type: 'function', function: { name: 'exec_shell', arguments: JSON.stringify({ command }) } },
        ] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }) + '\n\ndata: [DONE]\n\n');
      });
    });
    await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
    const registry = path.join(home, 'providers.json');
    const base = { kind: 'openai', authKind: 'local', baseUrl: 'http://127.0.0.1:' + provider.address().port + '/v1', localToken: 'fixture' };
    fs.writeFileSync(registry, JSON.stringify({ providers: [
      { ...base, id: 'offline', backend: 'native', big_model: 'offline' },
      { ...base, id: 'legacy', big_model: 'legacy', fallbacks: ['backup'] },
      { ...base, id: 'backup', big_model: 'backup' },
    ] }));
    daemon = spawn(process.execPath, [path.join(APP, 'daemon.js')], { stdio: ['ignore', 'pipe', 'pipe'], env: {
      HOME: home, USERPROFILE: home, PATH: process.env.PATH, URFAEL_STATE_DIR: path.dirname(socket),
      URFAEL_PROVIDER: 'offline',
      URFAEL_VAULT_DIR: 'vault', URFAEL_MEMORY_DIR: 'memory', URFAEL_PROVIDERS_INDEX: registry,
      URFAEL_CLAUDE_BIN: path.join(__dirname, 'stub', 'claude'), URFAEL_NATIVE_EXEC: '1',
      URFAEL_UPDATE_CHECK: '0', URFAEL_FALLBACK: '1', URFAEL_SELF_REVIEW: '0', URFAEL_ACTIVE_RECALL: '0',
      URFAEL_HEARTBEAT_MINS: '0', URFAEL_CURATOR_DAYS: '0', URFAEL_REFLECT: '0',
    } });
    daemon.on('error', (error) => { output += error.message; });
    const capture = (chunk) => { output = (output + chunk.toString()).slice(-8000); };
    daemon.stdout.on('data', capture); daemon.stderr.on('data', capture);
    await until(async () => (await request(undefined, undefined, '/health')).status === 200);
  });

  after(async () => {
    for (const pid of ownedPids) { try { process.kill(pid, 'SIGKILL'); } catch {} }
    if (daemon && daemon.exitCode === null && daemon.signalCode === null) {
      const closed = new Promise((resolve) => daemon.once('close', resolve));
      daemon.kill('SIGTERM');
      const timer = setTimeout(() => daemon.kill('SIGKILL'), 1000);
      await closed; clearTimeout(timer);
    }
    if (provider) await new Promise((resolve) => provider.close(resolve));
    if (home) fs.rmSync(home, { recursive: true, force: true });
  });

  it('rejects every supplied channel, including falsey/malformed values, before model access', async () => {
    for (const channel of ['telegram', '', false, null, 0, [], {}]) {
      const response = await request({ text: 'run a command', providerId: 'offline', channel });
      assert.equal(response.status, 403, JSON.stringify(channel));
    }
    for (const body of [null, [], false]) assert.equal((await request(body)).status, 400);
    assert.equal(modelCalls, 0);
  });

  it('disconnecting /engine/ask cancels an active command and leaves the daemon usable', async () => {
    mode = 'command'; const priorCalls = modelCalls;
    const script = path.join(workspace, 'long-command.js');
    fs.writeFileSync(script, 'require("node:fs").writeFileSync("running.pid",String(process.pid)); setInterval(()=>{},1000);');
    command = JSON.stringify(process.execPath) + ' ' + JSON.stringify(script);
    const controller = new AbortController();
    let earlyResponse;
    const pending = request({ text: 'run fixture', providerId: 'offline' }, controller.signal).then((response) => { earlyResponse = response; return response; });
    let pid;
    try {
      await until(() => {
        if (earlyResponse) assert.fail('command finished before starting fixture: ' + JSON.stringify(earlyResponse));
        pid = pidAt(path.join(workspace, 'running.pid')); return pid;
      });
      ownedPids.add(pid);
      controller.abort();
      await pending;
      await until(() => !alive(pid));
      ownedPids.delete(pid);
      assert.equal(modelCalls, priorCalls + 1);
      assert.equal((await request(undefined, undefined, '/health')).status, 200);
    } finally { controller.abort(); }
  });

  it('the opted-in local endpoint executes a command and reports its structured status', async () => {
    mode = 'command'; command = 'printf native-command > executed.txt; printf stdout; printf stderr >&2; exit 75';
    const result = await request({ text: 'run fixture', providerId: 'offline' });
    assert.equal(result.status, 200); assert.equal(result.json.sideEffects, true);
    assert.equal(fs.readFileSync(path.join(workspace, 'executed.txt'), 'utf8'), 'native-command');
    const tool = modelRequests.at(-1).messages.find((m) => m.role === 'tool');
    const status = JSON.parse(tool.content);
    assert.equal(status.stdout, 'stdout'); assert.equal(status.stderr, 'stderr'); assert.equal(status.exit_code, 75);
  });

  it('ordinary /ask selects the explicit native provider and never falls back to Claude on its failure', async () => {
    mode = 'answer';
    const success = await request({ text: 'reply from native provider' }, undefined, '/ask');
    const done = success.raw.trim().split('\n').map((line) => JSON.parse(line)).find((event) => event.kind === 'done');
    assert.equal(done.text, 'NATIVE_OK'); assert.equal(done.model, 'offline');
    mode = 'error';
    const failure = await request({ text: 'native provider is unavailable' }, undefined, '/ask');
    const failed = failure.raw.trim().split('\n').map((line) => JSON.parse(line)).find((event) => event.kind === 'done');
    assert.ok(failed); assert.notEqual(failed.text, 'NATIVE_OK');
    assert.ok(!failure.raw.includes('URFAEL_SMOKE_OK'), 'the offline Claude stub must never answer an API-mode failure');
    assert.match(failed.text, /503|unavailable|could not finish/);
  });

  it('a legacy native pin does not replay a command through another provider or Claude after a 503', async () => {
    assert.equal((await request({ providerId: 'legacy' }, undefined, '/engine/default')).status, 200);
    const script = path.join(workspace, 'once.js');
    fs.writeFileSync(script, 'require("node:fs").appendFileSync("executions.txt","once\\n");');
    command = JSON.stringify(process.execPath) + ' ' + JSON.stringify(script);
    mode = 'error_after_command'; const priorCalls = modelCalls;
    const response = await request({ text: 'run the command once' }, undefined, '/ask');
    const done = response.raw.trim().split('\n').map((line) => JSON.parse(line)).find((event) => event.kind === 'done');
    assert.equal(fs.readFileSync(path.join(workspace, 'executions.txt'), 'utf8'), 'once\n');
    assert.equal(modelCalls, priorCalls + 2);
    assert.match(done.text, /503|unavailable|could not finish/);
    assert.ok(!response.raw.includes('URFAEL_SMOKE_OK'));
    assert.equal((await request({ providerId: 'offline' }, undefined, '/engine/default')).status, 200);
  });

  it('graceful daemon shutdown kills an active native command', async () => {
    mode = 'command';
    const script = path.join(workspace, 'shutdown-command.js');
    fs.writeFileSync(script, 'require("node:fs").writeFileSync("shutdown.pid",String(process.pid)); setInterval(()=>{},1000);');
    command = JSON.stringify(process.execPath) + ' ' + JSON.stringify(script);
    const pending = request({ text: 'run fixture', providerId: 'offline' });
    let pid;
    await until(() => { pid = pidAt(path.join(workspace, 'shutdown.pid')); return pid; });
    ownedPids.add(pid);
    daemon.kill('SIGTERM');
    await pending;
    await until(() => !alive(pid));
    ownedPids.delete(pid);
  });
});
