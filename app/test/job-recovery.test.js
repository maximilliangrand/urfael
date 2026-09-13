'use strict';
// Real launcher, detached worker and bundled goal loop, with only a local scripted model CLI. Every process has a
// temporary HOME and an allowlisted environment, so these tests cannot reach the owner's daemon,
// vault, model credentials, or notification settings.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');

const APP = path.resolve(__dirname, '..');
const ACTIVE = new Set(['starting', 'running', 'cancelling']);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const STUB = String.raw`
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const root = path.join(__dirname, 'Urfael');
const mode = JSON.parse(fs.readFileSync(path.join(root, 'provider.json'), 'utf8')).mode;
const callsFile = path.join(root, 'invocations.jsonl');
let prior = []; try { prior = fs.readFileSync(callsFile, 'utf8').trim().split('\n').filter(Boolean); } catch {}
const environment = Object.fromEntries(['URFAEL_YOLO', 'URFAEL_SANDBOX', 'URFAEL_GOAL_VERIFY', 'URFAEL_GOAL_CRITERIA', 'USERPROFILE']
  .map((key) => [key, process.env[key] || '']));
fs.appendFileSync(callsFile, JSON.stringify({ args, environment, pid: process.pid }) + '\n');
const timer = setInterval(() => {
  if (!fs.existsSync(path.join(root, 'release'))) return;
  clearInterval(timer);
  if (mode === 'nonzero') process.exit(1);
  const marker = !(mode.startsWith('resume') && prior.length < 3);
  process.stdout.write(JSON.stringify({
    result: marker ? 'scripted result\nURFAEL-GOAL-DONE' : 'working, not complete',
    session_id: 'test-session-preserved',
  }));
}, 20);
`;

async function eventually(probe, message, timeoutMs = 15000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const value = probe();
    if (value) return value;
    await sleep(20);
  }
  assert.fail(message);
}

function fixture(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'urfael-job-recovery-'));
  const vault = path.join(home, 'Urfael');
  const host = path.join(vault, '_urfael');
  fs.mkdirSync(host, { recursive: true });
  // Deliberately obsolete vault entrypoints prove managed jobs use the bundled engine.
  fs.writeFileSync(path.join(host, 'goal-loop.js'), 'throw new Error("obsolete vault host must not execute");');
  fs.writeFileSync(path.join(host, 'goal-loop.sh'), 'exit 93\n');
  const provider = path.join(home, 'claude.js');
  fs.writeFileSync(provider, '#!/usr/bin/env node\n' + STUB, { mode: 0o700 });
  const repo = path.join(home, 'repo');
  fs.mkdirSync(repo);
  const gitEnv = { PATH: process.env.PATH, HOME: home, USERPROFILE: home,
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: path.join(home, 'empty-git-config'),
    ...(process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot } : {}) };
  const git = (...args) => execFileSync('git', ['-C', repo, '-c', 'core.hooksPath=' + path.join(home, 'no-hooks'), ...args], { env: gitEnv, stdio: 'pipe' });
  git('init', '-q');
  fs.writeFileSync(path.join(repo, 'source.txt'), 'baseline\n');
  git('add', '.');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture');
  const checkScript = path.join(home, 'check.js');
  fs.writeFileSync(checkScript, 'const fs = require("node:fs"); if (fs.readFileSync("source.txt", "utf8") !== "baseline\\n") process.exit(1);');
  const check = (process.platform === 'win32' ? '& ' : '') + JSON.stringify(process.execPath) + ' ' + JSON.stringify(checkScript);
  const jobs = path.join(home, '.claude', 'urfael', 'jobs');
  const env = {
    HOME: home, USERPROFILE: home, USER: 'urfael-test',
    PATH: path.dirname(process.execPath) + path.delimiter + (process.platform === 'win32' ? (process.env.PATH || '') : '/usr/bin:/bin'),
    URFAEL_VAULT_DIR: 'Urfael', URFAEL_CLAUDE_BIN: provider,
    ...(process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot, TEMP: home, TMP: home } : {}),
  };
  const children = new Set();
  const read = (id) => { try { return JSON.parse(fs.readFileSync(path.join(jobs, id + '.json'), 'utf8')); } catch { return null; } };
  const invocations = () => {
    try { return fs.readFileSync(path.join(vault, 'invocations.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse); }
    catch { return []; }
  };
  async function exec(code, extraEnv = {}) {
    const prelude = `const store = require(${JSON.stringify(path.join(APP, 'jobstore.js'))}); const runner = require(${JSON.stringify(path.join(APP, 'runner.js'))});`;
    const proc = spawn(process.execPath, ['-e', prelude + code], { cwd: home, env: { ...env, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
    children.add(proc);
    let stdout = '', stderr = '';
    proc.stdout.on('data', (b) => { stdout += b; });
    proc.stderr.on('data', (b) => { stderr += b; });
    const exit = await new Promise((resolve, reject) => { proc.once('error', reject); proc.once('close', (code) => resolve(code)); });
    children.delete(proc);
    assert.equal(exit, 0, 'isolated launcher failed: ' + stderr + stdout);
    const line = stdout.trim().split('\n').at(-1);
    return line ? JSON.parse(line) : null;
  }
  const release = () => fs.writeFileSync(path.join(vault, 'release'), 'go');
  const hold = () => fs.rmSync(path.join(vault, 'release'), { force: true });
  const terminal = (id) => eventually(() => { const job = read(id); return job && !ACTIVE.has(job.state) && job.state !== 'queued' ? job : null; }, 'worker did not persist terminal state for ' + id);
  t.after(async () => {
    release();
    for (const proc of children) proc.kill();
    await eventually(() => invocations().every((row) => !alive(row.pid)), 'scripted goal hosts did not exit during cleanup').catch(() => {
      for (const row of invocations()) { try { process.kill(row.pid, 'SIGKILL'); } catch {} }
    });
    // Worker completion is asynchronous relative to its child's exit; allow it to commit before cleanup.
    await sleep(100);
    fs.rmSync(home, { recursive: true, force: true });
  });
  return { home, vault, repo, check, jobs, env, exec, read, invocations, release, hold, terminal };
}

function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
function spec(goal, extra = {}) { return { kind: 'goal', goal, repo: '/offline/repo', maxIters: 6, maxMins: 20, turnTimeout: 30, ...extra }; }
async function start(f, value, extraEnv = {}) {
  fs.writeFileSync(path.join(f.vault, 'provider.json'), JSON.stringify({ mode: value.goal }));
  const accepted = { ...value, repo: value.repo === '/offline/repo' ? f.repo : value.repo,
    check: value.check == null ? f.check : value.check };
  return f.exec(`const job = store.create(${JSON.stringify(accepted)}); runner.run(job); console.log(JSON.stringify({ id: job.id, launcherPid: process.pid })); process.exit(0);`, extraEnv);
}

test('detached worker persists successful receipt after its launcher exits', { timeout: 30000 }, async (t) => {
  const f = fixture(t);
  const launched = await start(f, spec('complete'));
  assert.equal(alive(launched.launcherPid), false, 'launcher must exit before the goal finishes');
  await eventually(() => f.invocations().length === 1, 'scripted goal host never started');
  assert.ok(ACTIVE.has(f.read(launched.id).state));
  f.release();
  const done = await f.terminal(launched.id);
  assert.equal(done.state, 'done');
  assert.equal(done.pid, null);
  const view = await f.exec(`const job = store.get(${JSON.stringify(launched.id)}); console.log(JSON.stringify({ progress: runner.progressFor(job), description: runner.describe(job), jobs: store.list() }));`);
  assert.equal(view.progress.outcome, 'completed');
  assert.equal(view.progress.result.checkPassed, true);
  assert.equal(view.progress.verification.checkReceipt.exitCode, 0);
  assert.equal(view.progress.result.workspaceHash, view.progress.verification.checkReceipt.workspaceHash);
  assert.equal(view.progress.sessionId, 'test-session-preserved');
  assert.equal(view.jobs.length, 1, 'progress receipts are not standalone jobs');
  assert.ok(view.description, 'completion is inspectable after a fresh process starts');
});

test('invalid repository before checkpoint creation cannot become done', { timeout: 30000 }, async (t) => {
  const f = fixture(t);
  f.release();
  const { id } = await start(f, spec('missing', { repo: path.join(f.home, 'missing-repo') }));
  assert.equal((await f.terminal(id)).state, 'failed');
});

test('repeated nonzero provider exits persist failure, never completion', { timeout: 30000 }, async (t) => {
  const f = fixture(t);
  f.release();
  const { id } = await start(f, spec('nonzero'));
  assert.equal((await f.terminal(id)).state, 'failed');
});

test('asynchronous supervisor spawn failure persists an error and releases its claim', { timeout: 30000 }, async (t) => {
  const f = fixture(t);
  // The child launcher is allowed to exit naturally, exercising the real asynchronous spawn error.
  const { id } = await f.exec(`const job = store.create(${JSON.stringify(spec('complete'))});
    runner.run(job); console.log(JSON.stringify({ id: job.id }));`, { URFAEL_VAULT_DIR: 'missing-vault' });
  const job = await f.terminal(id);
  assert.equal(job.state, 'error');
  assert.equal(job.pid, null);
  assert.match(job.result, /spawn failed/i);
  assert.equal(fs.existsSync(path.join(f.jobs, id + '.run-lock')), false);
  assert.equal(f.invocations().length, 0);
});

test('post-spawn ownership persistence failure kills the child before releasing its claim', { timeout: 30000 }, async (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.vault, 'provider.json'), JSON.stringify({ mode: 'complete' }));
  const value = { ...spec('complete'), repo: f.repo, check: f.check };
  const result = await f.exec(`
    const fs = require('node:fs');
    const path = require('node:path');
    const job = store.create(${JSON.stringify(value)});
    const token = store.claimRun(job.id);
    store.update(job.id, { state: 'starting', attemptToken: token, pid: process.pid });
    const original = store.updateAttempt;
    let injected = false, childPid = null;
    const release = store.releaseRun;
    const aliveAtRelease = [];
    store.releaseRun = (id, owner) => {
      let live = false;
      try { process.kill(childPid, 0); live = true; } catch {}
      aliveAtRelease.push(live);
      return release(id, owner);
    };
    store.updateAttempt = (id, owner, patch) => {
      if (!injected && Number.isInteger(patch.childPid) && patch.childPid > 0) {
        injected = true;
        childPid = patch.childPid;
        throw new Error('injected child ownership persistence failure');
      }
      return original(id, owner, patch);
    };
    process.once('beforeExit', () => {
      let childAlive = false;
      try { process.kill(childPid, 0); childAlive = true; } catch {}
      console.log(JSON.stringify({ injected, childPid, childAlive, aliveAtRelease, job: store.get(job.id),
        lockExists: fs.existsSync(path.join(store.JOBS_DIR, job.id + '.run-lock')) }));
    });
    require(${JSON.stringify(path.join(APP, 'job-worker.js'))}).supervise(job.id, token);
  `);
  assert.equal(result.injected, true, 'fault must occur after the actual child was spawned');
  assert.ok(Number.isInteger(result.childPid) && result.childPid > 0);
  assert.equal(result.childAlive, false, 'the spawned child must be reaped before worker exit');
  assert.deepEqual(result.aliveAtRelease, [false], 'claim release must wait for child termination');
  assert.equal(result.lockExists, false);
  assert.equal(result.job.state, 'failed');
  assert.equal(result.job.pid, null);
  assert.equal(result.job.childPid, null);
});

test('stopped goals resume the same job, session and original budgets', { timeout: 30000 }, async (t) => {
  const f = fixture(t);
  f.release();
  const original = spec('resume');
  const { id } = await start(f, original);
  assert.equal((await f.terminal(id)).state, 'stopped');
  const acceptedSpec = f.read(id).spec;
  f.hold();
  const resumed = await f.exec(`const value = runner.resume(${JSON.stringify(id)}); console.log(JSON.stringify(value)); process.exit(0);`);
  assert.equal(resumed.id, id);
  await eventually(() => f.invocations().length === 4, 'resumed host never started');
  const calls = f.invocations();
  const first = calls[0], second = calls.at(-1);
  assert.equal(first.args.includes('--resume'), false);
  assert.equal(second.args[second.args.indexOf('--resume') + 1], 'test-session-preserved');
  assert.equal(resumed.progress.sessionId, 'test-session-preserved');
  assert.equal(resumed.progress.iterations, 3);
  assert.equal(resumed.progress.contract.maxIters, original.maxIters);
  assert.equal(resumed.progress.contract.maxMins, original.maxMins);
  assert.deepEqual(f.read(id).spec, acceptedSpec);
  f.release();
  assert.equal((await f.terminal(id)).state, 'done');
});

test('competing resumes admit one worker and reject the other', { timeout: 30000 }, async (t) => {
  const f = fixture(t);
  f.release();
  const { id } = await start(f, spec('resume'));
  await f.terminal(id);
  f.hold();
  const code = `try { const j = runner.resume(${JSON.stringify(id)}); console.log(JSON.stringify({ accepted: true, id: j.id })); } catch (e) { console.log(JSON.stringify({ accepted: false, code: e.code, message: e.message })); } process.exit(0);`;
  const results = await Promise.all([f.exec(code), f.exec(code)]);
  assert.equal(results.filter((r) => r.accepted).length, 1);
  await eventually(() => f.invocations().length === 4, 'winning resume did not start');
  f.release();
  await f.terminal(id);
  assert.equal(f.invocations().length, 4, 'three initial turns plus exactly one resumed turn');
});

test('resume contract rejection cannot reuse its previous attempt receipt', { timeout: 30000 }, async (t) => {
  const f = fixture(t);
  f.release();
  const { id } = await start(f, spec('resume'));
  assert.equal((await f.terminal(id)).state, 'stopped');
  const before = await f.exec(`console.log(JSON.stringify(runner.progressFor(store.get(${JSON.stringify(id)}))));`);
  await f.exec(`const job = store.get(${JSON.stringify(id)}); store.update(job.id, { spec: { ...job.spec, goal: 'changed contract' } });
    runner.resume(job.id); console.log('{}'); process.exit(0);`);
  assert.equal((await f.terminal(id)).state, 'failed');
  const after = await f.exec(`console.log(JSON.stringify(runner.progressFor(store.get(${JSON.stringify(id)}))));`);
  assert.equal(after.runId, before.runId);
  assert.equal(f.invocations().length, 3, 'contract rejection launches no new provider call');
});

test('cancellation is persisted by the worker after the cancelling launcher exits', { timeout: 30000 }, async (t) => {
  const f = fixture(t);
  const { id } = await start(f, spec('complete'));
  await eventually(() => f.invocations().length === 1 && f.read(id).state === 'running', 'goal never became cancellable');
  const cancelled = await f.exec(`console.log(JSON.stringify({ accepted: runner.cancel(${JSON.stringify(id)}) })); process.exit(0);`);
  assert.equal(cancelled.accepted, true);
  assert.equal((await f.terminal(id)).state, 'cancelled');
  await eventually(() => f.invocations().every((row) => !alive(row.pid)), 'cancelled goal host survived');
});

test('a stale worker cannot overwrite a replacement attempt', { timeout: 30000 }, async (t) => {
  const f = fixture(t);
  const { id } = await start(f, spec('complete'));
  await eventually(() => f.invocations().length === 1, 'scripted goal host never started');
  const token = 'replacement-attempt-token';
  await f.exec(`store.update(${JSON.stringify(id)}, { attemptToken: ${JSON.stringify(token)}, state: 'interrupted', result: 'replacement owns state' }); console.log('{}');`);
  f.release();
  await eventually(() => f.invocations().every((row) => !alive(row.pid)), 'old host did not finish');
  await sleep(100);
  const current = f.read(id);
  assert.equal(current.attemptToken, token);
  assert.equal(current.state, 'interrupted');
  assert.equal(current.result, 'replacement owns state');
});

test('resume refuses live, completed, sandboxed and exhausted work before spawning', { timeout: 30000 }, async (t) => {
  const f = fixture(t);
  const cases = [
    { name: 'starting', state: 'starting', live: true },
    { name: 'running', state: 'running', live: true },
    { name: 'cancelling', state: 'cancelling', live: true },
    { name: 'surviving goal child', state: 'interrupted', childLive: true },
    { name: 'completed', state: 'done', progress: { outcome: 'completed' } },
    { name: 'sandbox', state: 'stopped', spec: { sandbox: 'docker' } },
    { name: 'iteration budget', state: 'stopped', progress: { iterations: 6 } },
    { name: 'time budget', state: 'stopped', progress: { elapsedMs: 20 * 60 * 1000 } },
    { name: 'missing receipt', state: 'interrupted', missing: true },
    { name: 'negative iteration counter', state: 'stopped', progress: { iterations: -1 } },
    { name: 'negative elapsed time', state: 'stopped', progress: { elapsedMs: -1 } },
    { name: 'unknown receipt outcome', state: 'stopped', progress: { outcome: 'made-up' } },
    { name: 'missing provider session', state: 'stopped', progress: { sessionId: null } },
  ];
  const result = await f.exec(`
    const fs = require('node:fs');
    const cases = ${JSON.stringify(cases)};
    const result = cases.map((item) => {
      const job = store.create({ ...${JSON.stringify(spec('resume'))}, ...(item.spec || {}) });
      store.update(job.id, { state: item.state, pid: item.live ? process.pid : null, childPid: item.childLive ? process.pid : null });
      if (!item.missing) fs.writeFileSync(store.progressFile(job.id), JSON.stringify({
        schemaVersion: 1, runId: 'prior-run', outcome: 'stopped', reason: 'interrupted', result: 'partial',
        sessionId: 'test-session', iterations: 2, elapsedMs: 10,
        contract: { maxIters: 6, maxMins: 20 }, resumable: true, ...(item.progress || {}),
      }));
      try { runner.resume(job.id); return { name: item.name, refused: false }; }
      catch (error) { return { name: item.name, refused: true, message: error.message }; }
    });
    console.log(JSON.stringify(result)); process.exit(0);
  `);
  assert.deepEqual(result.filter((row) => !row.refused).map((row) => row.name), [], 'ineligible runs should all refuse resume');
  assert.equal(f.invocations().length, 0);
});

test('job environment preserves platform home and pinned options without mutating the launcher', async (t) => {
  const f = fixture(t);
  const result = await f.exec(`
    process.env.URFAEL_YOLO = 'ambient';
    process.env.URFAEL_GOAL_VERIFY = '1';
    process.env.UNRELATED_TEST_SECRET = 'must-not-cross';
    process.env.SystemRoot = 'platform-root';
    process.env.TEMP = 'platform-temp';
    const before = JSON.stringify(process.env);
    const env = runner.jobEnv({ kind: 'goal', goalEnvironment: { URFAEL_GOAL_VERIFY: '', URFAEL_SANDBOX: '' } });
    console.log(JSON.stringify({ unchanged: before === JSON.stringify(process.env),
      profile: env.USERPROFILE, systemRoot: env.SystemRoot, temp: env.TEMP,
      verify: env.URFAEL_GOAL_VERIFY, yolo: env.URFAEL_YOLO || '', unrelated: Object.hasOwn(env, 'UNRELATED_TEST_SECRET') }));
  `);
  assert.equal(result.unchanged, true);
  assert.equal(result.profile, f.home);
  assert.equal(result.systemRoot, 'platform-root');
  assert.equal(result.temp, 'platform-temp');
  assert.equal(result.verify, '');
  assert.equal(result.yolo, '');
  assert.equal(result.unrelated, false);
});

test('resume keeps explicit verify=false and the original sandbox, criteria and permission environment', { timeout: 30000 }, async (t) => {
  const f = fixture(t);
  f.release();
  const { id } = await start(f, spec('resume', { verify: false, sandbox: '' }), {
    URFAEL_GOAL_VERIFY: '1', URFAEL_YOLO: '1',
  });
  assert.equal((await f.terminal(id)).state, 'stopped');
  const accepted = f.read(id);
  const first = f.invocations()[0];
  assert.equal(first.args.includes('--verify'), false);
  assert.equal(first.environment.URFAEL_GOAL_VERIFY, '');
  assert.equal(first.environment.URFAEL_YOLO, '1');
  assert.equal(first.environment.USERPROFILE, f.home);
  await f.exec(`runner.resume(${JSON.stringify(id)}); console.log('{}'); process.exit(0);`, {
    URFAEL_SANDBOX: 'docker', URFAEL_YOLO: '', URFAEL_GOAL_VERIFY: '1',
    URFAEL_GOAL_CRITERIA: path.join(f.home, 'different-criteria.md'),
  });
  assert.equal((await f.terminal(id)).state, 'done');
  const second = f.invocations()[3];
  assert.equal(second.args.includes('--verify'), false);
  assert.equal(second.args.includes('--sandbox'), false);
  assert.deepEqual(second.environment, first.environment);
  assert.deepEqual(f.read(id).spec, accepted.spec);
  assert.deepEqual(f.read(id).goalEnvironment, accepted.goalEnvironment);
});

test('two resumes reclaim one dead-owner lock without stealing the winning generation', { timeout: 30000 }, async (t) => {
  const f = fixture(t);
  f.release();
  const { id, launcherPid } = await start(f, spec('resume'));
  await f.terminal(id);
  const lock = path.join(f.jobs, id + '.run-lock');
  await eventually(() => !fs.existsSync(lock), 'completed worker did not release its lock');
  assert.equal(alive(launcherPid), false);
  fs.mkdirSync(lock);
  const token = 'a'.repeat(32);
  fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ token, pid: launcherPid, createdAt: Date.now() - 60000 }));
  fs.utimesSync(lock, new Date(Date.now() - 60000), new Date(Date.now() - 60000));
  f.hold();
  const code = `try { runner.resume(${JSON.stringify(id)}); console.log(JSON.stringify({ accepted: true })); }
    catch (error) { console.log(JSON.stringify({ accepted: false, message: error.message })); } process.exit(0);`;
  const results = await Promise.all([f.exec(code), f.exec(code)]);
  assert.equal(results.filter((row) => row.accepted).length, 1);
  await eventually(() => f.invocations().length === 4, 'winning reclaimed run never started');
  const owner = JSON.parse(fs.readFileSync(path.join(lock, 'owner.json'), 'utf8'));
  assert.notEqual(owner.token, token);
  assert.equal(owner.token, f.read(id).attemptToken);
  assert.ok(fs.existsSync(path.join(f.jobs, id + '.retired-' + token, 'owner.json')));
  f.release();
  assert.equal((await f.terminal(id)).state, 'done');
  assert.equal(f.invocations().length, 4);
});

test('a killed supervisor cannot resume over its surviving provider, then resumes after that provider stops',
  { timeout: 30000, skip: process.platform === 'win32' }, async (t) => {
    const f = fixture(t);
    const { id } = await start(f, spec('complete'));
    await eventually(() => f.invocations().length === 1, 'provider did not start before crash injection');
    const worker = f.read(id);
    const providerPid = f.invocations()[0].pid;
    assert.ok(worker.pid && worker.pid !== process.pid);
    // The worker and loop share a group; the provider has its own. Kill only processes created here.
    process.kill(-worker.pid, 'SIGKILL');
    await eventually(() => !alive(worker.pid), 'supervisor did not exit after SIGKILL');
    assert.equal(alive(providerPid), true, 'the separately grouped provider should expose the recovery hazard');
    const refused = await f.exec(`try { runner.resume(${JSON.stringify(id)}); console.log(JSON.stringify({ refused: false })); }
      catch (error) { console.log(JSON.stringify({ refused: true, message: error.message })); } process.exit(0);`);
    assert.equal(refused.refused, true);
    assert.equal(f.invocations().length, 1);
    process.kill(-providerPid, 'SIGKILL');
    await eventually(() => !alive(providerPid), 'provider did not stop');
    const lock = path.join(f.jobs, id + '.run-lock');
    fs.utimesSync(lock, new Date(Date.now() - 60000), new Date(Date.now() - 60000));
    const resumed = await f.exec(`console.log(JSON.stringify(runner.resume(${JSON.stringify(id)}))); process.exit(0);`);
    assert.equal(resumed.id, id);
    f.release();
    const done = await f.terminal(id);
    assert.equal(done.state, 'done');
    const progress = await f.exec(`console.log(JSON.stringify(runner.progressFor(store.get(${JSON.stringify(id)}))));`);
    assert.equal(progress.iterations, 2, 'the interrupted provider call remains charged to the original budget');
    assert.equal(f.invocations().length, 2);
  });
