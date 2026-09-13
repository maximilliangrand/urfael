'use strict';
// Real daemon → detached supervisor → bundled goal loop → offline Claude stub.
// A short, temporary profile owns every socket, token, vault, job and git file.
// Child environments are explicit; no credentials or real profile are inherited.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, execFileSync } = require('child_process');
const ipc = require('../ipc');
const APP = path.join(__dirname, '..');
const WIN = process.platform === 'win32';
const STUB = path.join(__dirname, 'stub', WIN ? 'claude.js' : 'claude');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let testRoot, testEnv, socketPath, daemon, jobDir, repo, daemonOutput = '';
const created = new Set();

function request(method, route, body) {
  return new Promise((resolve) => {
    const headers = { 'Content-Type': 'application/json', ...(WIN ? ipc.authHeaders(testEnv, 'win32', fs) : {}) };
    const req = http.request({ socketPath, method, path: route, headers, timeout: 1500 }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => { let json; try { json = JSON.parse(raw); } catch {} resolve({ status: res.statusCode, json, ...(json === undefined ? { raw: raw.slice(-8000) } : {}) }); });
    });
    req.on('error', (error) => resolve({ status: 0, error: error.code || error.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: 'request timed out' }); });
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
async function until(probe, message, limitMs = 15000, diagnostic = () => '') {
  const start = Date.now();
  do { const result = await probe(); if (result) return result; await pause(80); } while (Date.now() - start < limitMs);
  assert.fail(message + diagnostic() + '\nIsolated daemon output: ' + daemonOutput);
}
function jobDiagnostic(id, response) {
  // Read only this fixture's matching files before after() removes its private profile.
  assert.ok(created.has(id) && /^[a-z0-9-]{4,64}$/i.test(id));
  const files = {};
  for (const name of [id + '.json', id + '.progress.json', id + '.log', id + '.progress.json.log', path.join(id + '.run-lock', 'owner.json')]) {
    try { files[name] = fs.readFileSync(path.join(jobDir, name), 'utf8').slice(-16000); }
    catch (error) { files[name] = '[' + (error.code || error.message) + ']'; }
  }
  return '\nIsolated job evidence: ' + JSON.stringify({ observedAt: new Date().toISOString(), lastResponse: response,
    daemon: daemon && { pid: daemon.pid, exitCode: daemon.exitCode, signalCode: daemon.signalCode }, files }, null, 2);
}
async function createGoal(maxIters) {
  const response = await request('POST', '/job', { kind: 'goal', goal: 'Exercise offline coding recovery', repo, maxIters, maxMins: 1, turnTimeout: 30 });
  assert.equal(response.status, 200);
  assert.match(response.json.id, /^[a-z0-9-]{4,64}$/i);
  assert.ok(['starting', 'running'].includes(response.json.state), 'creation reports the actual accepted state');
  created.add(response.json.id);
  return response.json.id;
}
async function stopped(id, iterations, resumable = false) {
  let lastResponse;
  const message = 'goal must persist a stopped receipt after ' + iterations + ' reserved turns with resumable=' + resumable;
  const diagnostic = () => jobDiagnostic(id, lastResponse);
  return until(async () => {
    const r = lastResponse = await request('GET', '/job/' + id);
    if (r.status !== 200 || !r.json) return null;
    const j = r.json;
    const incompatible = ['done', 'failed', 'error', 'interrupted', 'cancelled'].includes(j.state) ||
      (j.state === 'stopped' && j.progress && j.progress.iterations !== iterations) ||
      (j.state === 'stopped' && !resumable && j.resumable === true);
    if (incompatible) assert.fail(message + '; observed incompatible terminal state' + diagnostic() + '\nIsolated daemon output: ' + daemonOutput);
    return j.state === 'stopped' && j.progress && j.progress.iterations === iterations && j.resumable === resumable ? j : null;
  }, message, 15000, diagnostic);
}

describe('coding jobs API (isolated real daemon, offline worker)', { timeout: 60000 }, () => {
  before(async () => {
    // macOS Unix sockets have a small path limit, so avoid its long os.tmpdir().
    testRoot = fs.mkdtempSync(path.join(WIN ? os.tmpdir() : '/tmp', 'urf-job-api-'));
    repo = path.join(testRoot, 'repo');
    jobDir = path.join(testRoot, '.claude', 'urfael', 'jobs');
    for (const dir of [repo, jobDir, path.join(testRoot, 'vault'), path.join(testRoot, 'memory', 'sessions')]) fs.mkdirSync(dir, { recursive: true });
    testEnv = {
      HOME: testRoot, USERPROFILE: testRoot, USER: 'urfael-test', LOGNAME: 'urfael-test',
      APPDATA: path.join(testRoot, 'AppData', 'Roaming'), LOCALAPPDATA: path.join(testRoot, 'AppData', 'Local'),
      TMPDIR: testRoot, TEMP: testRoot, TMP: testRoot,
      PATH: path.join(__dirname, 'stub') + path.delimiter + path.dirname(process.execPath) + path.delimiter + (process.env.PATH || process.env.Path || ''),
      URFAEL_VAULT_DIR: 'vault', URFAEL_MEMORY_DIR: 'memory', URFAEL_CLAUDE_BIN: STUB,
      URFAEL_UPDATE_CHECK: '0', URFAEL_HEARTBEAT_MINS: '0',
      // Git for Windows cannot reliably open Node's \\.\nul device path as a
      // config file. A private, empty regular file is portable and still isolates
      // this fixture from all user/system Git configuration.
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: path.join(testRoot, 'empty-git-config'),
    };
    for (const key of ['SystemRoot', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT']) if (process.env[key]) testEnv[key] = process.env[key];
    socketPath = ipc.daemonSock(testEnv);
    fs.writeFileSync(testEnv.GIT_CONFIG_GLOBAL, '');
    fs.writeFileSync(path.join(testRoot, 'vault', 'CLAUDE.md'), 'Offline API test fixture.\n');
    // Capture stderr so a failed fixture command retains its actual diagnosis in CI.
    const git = (...args) => execFileSync('git', ['-C', repo, ...args], { env: testEnv, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
    git('init', '-q'); git('config', 'user.name', 'Offline Test'); git('config', 'user.email', 'offline@example.invalid');
    fs.writeFileSync(path.join(repo, 'seed.txt'), 'unchanged fixture\n');
    git('add', 'seed.txt'); git('commit', '-qm', 'fixture');
    execFileSync('git', ['-C', path.join(testRoot, 'memory'), 'init', '-q'], { env: testEnv, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
    assert.ok(fs.existsSync(STUB));
    if (!WIN) assert.ok(fs.statSync(STUB).mode & 0o111);
    daemon = spawn(process.execPath, [path.join(APP, 'daemon.js')], { env: testEnv, detached: !WIN, stdio: ['ignore', 'pipe', 'pipe'] });
    const capture = (chunk) => { daemonOutput = (daemonOutput + chunk.toString()).slice(-8000); };
    daemon.stdout.on('data', capture); daemon.stderr.on('data', capture);
    await until(async () => { const r = await request('GET', '/health'); return r.status === 200 && r.json.ok; }, 'isolated daemon must become healthy');
  });

  after(async () => {
    // Only IDs created by this fixture are eligible for cleanup. Synthetic capacity
    // rows point at the daemon and are removed by their test's finally block.
    for (const id of created) {
      const r = await request('GET', '/job/' + id);
      if (r.json && ['starting', 'running', 'cancelling'].includes(r.json.state)) {
        await request('POST', '/job/' + id + '/cancel');
        await pause(100);
        let j; try { j = JSON.parse(fs.readFileSync(path.join(jobDir, id + '.json'), 'utf8')); } catch {}
        if (j && j.pid && j.pid !== daemon.pid) {
          if (WIN) { try { execFileSync('taskkill', ['/pid', String(j.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {} }
          else { try { process.kill(-j.pid, 'SIGKILL'); } catch {} }
        }
      }
    }
    if (daemon && daemon.exitCode == null) {
      await request('POST', '/shutdown');
      await pause(150);
      if (daemon.exitCode == null) { try { daemon.kill('SIGKILL'); } catch {} }
      if (daemon.exitCode == null) await Promise.race([new Promise((r) => daemon.once('exit', r)), pause(1000)]);
    }
    if (testRoot) fs.rmSync(testRoot, { recursive: true, force: true });
  });

  it('runs the bundled host loop and exposes exhausted progress without claiming done', async () => {
    const id = await createGoal(3);
    const full = await stopped(id, 3);
    assert.equal(full.progress.schemaVersion, 1);
    assert.equal(full.progress.contract.repo, fs.realpathSync(repo));
    assert.equal(full.progress.outcome, 'stopped');
    assert.equal(full.progress.contract.maxIters, 3);
    assert.match(full.progress.reason, /progress|limit/);
    assert.equal(full.progress.verification.status, 'pending');
    assert.equal(full.resumable, false);
    assert.equal(full.exitCode, 2);
    assert.match(full.log, /URFAEL_SMOKE_OK/);
    assert.equal(fs.existsSync(path.join(testRoot, 'vault', '_urfael', 'goal-loop.js')), false, 'managed goal ran the app-bundled engine without an installed vault template');
    const list = await request('GET', '/jobs');
    const row = list.json.find((j) => j.id === id);
    assert.equal(row.goal, full.spec.goal);
    assert.equal(row.progress.iterations, 3); assert.equal(row.progress.maxIters, 3);
    assert.equal(row.progress.outcome, 'stopped'); assert.equal(row.resumable, false);
    assert.equal('contract' in row.progress, false); assert.equal('sessionId' in row.progress, false);
    const refused = await request('POST', '/job/' + id + '/resume');
    assert.equal(refused.status, 409); assert.match(refused.json.error, /resume|budget/);
    assert.equal((await request('GET', '/job/' + id)).json.progress.iterations, 3);
  });

  it('resumes the same eligible job with remaining budget and never resets its iteration counter', async () => {
    const id = await createGoal(4);
    const first = await stopped(id, 3, true);
    assert.equal(first.resumable, true);
    // Readiness comes from GET, not retries of the mutating resume request.
    const accepted = await request('POST', '/job/' + id + '/resume');
    assert.equal(accepted.status, 200, 'resume after advertised readiness: ' + JSON.stringify(accepted)); assert.equal(accepted.json.id, id);
    assert.ok(['starting', 'running'].includes(accepted.json.state));
    const final = await stopped(id, 4);
    assert.equal(final.resumable, false);
    assert.equal(final.progress.contract.maxIters, 4);
    assert.equal(final.progress.baselineHead, first.progress.baselineHead);
    assert.notEqual(final.progress.runId, first.progress.runId);
    assert.ok(final.progress.elapsedMs >= first.progress.elapsedMs);
    const list = await request('GET', '/jobs'); assert.equal(list.json.filter((j) => j.id === id).length, 1);
  });

  it('rejects missing state, wrong methods and unknown IDs without starting a worker', async () => {
    const id = 'missing-state-1234', file = path.join(jobDir, id + '.json');
    const fixture = { id, kind: 'goal', state: 'stopped', pid: null, spec: { kind: 'goal', goal: 'legacy goal', repo }, createdAt: new Date().toISOString() };
    fs.writeFileSync(file, JSON.stringify(fixture));
    try {
      const detail = await request('GET', '/job/' + id);
      assert.equal(detail.status, 200); assert.equal(detail.json.progress, null); assert.equal(detail.json.resumable, false);
      assert.equal((await request('POST', '/job/' + id + '/resume')).status, 409);
      assert.equal((await request('GET', '/job/' + id + '/resume')).status, 405);
      assert.equal((await request('POST', '/job/' + id)).status, 405);
      assert.equal((await request('POST', '/job/unknown-1234/resume')).status, 404);
      assert.equal((await request('GET', '/job/unknown-1234')).status, 404);
      assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).state, 'stopped');
      assert.equal(fs.existsSync(path.join(jobDir, id + '.progress.json')), false);
    } finally { fs.rmSync(file, { force: true }); }
  });

  it('counts starting and cancelling jobs toward capacity for create and resume', async () => {
    const files = [];
    try {
      for (const [i, state] of ['starting', 'running', 'cancelling', 'running'].entries()) {
        const id = 'capacity-' + i, file = path.join(jobDir, id + '.json'); files.push(file);
        fs.writeFileSync(file, JSON.stringify({ id, kind: 'goal', state, pid: daemon.pid, spec: { kind: 'goal', repo }, createdAt: new Date().toISOString(), startedAt: new Date().toISOString() }));
      }
      const before = (await request('GET', '/jobs')).json.length;
      const r = await request('POST', '/job', { kind: 'goal', goal: 'must not start', repo });
      assert.equal(r.status, 429); assert.match(r.json.error, /too many jobs/);
      assert.equal((await request('POST', '/job/' + [...created][0] + '/resume')).status, 429);
      assert.equal((await request('GET', '/jobs')).json.length, before, 'rejected submission created no job');
    } finally { for (const file of files) fs.rmSync(file, { force: true }); }
  });
});
