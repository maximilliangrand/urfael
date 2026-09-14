'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { internalNodeEnv, externalEnv, scriptEnv } = require('../internal-node');

function load(name, processStub, mocks = {}) {
  const filename = path.join(__dirname, '..', name + '.js');
  const module = { exports: {} };
  const localRequire = (id) => Object.hasOwn(mocks, id) ? mocks[id] : require(id.startsWith('.') ? path.resolve(path.dirname(filename), id) : id);
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports, require: localRequire,
    __dirname: path.dirname(filename), __filename: filename, process: processStub, console, Buffer,
    setTimeout, clearTimeout, setInterval, clearInterval }, { filename });
  return module.exports;
}
function electronProcess() {
  return Object.assign(new EventEmitter(), { execPath: '/packaged/Urfael', platform: 'darwin', pid: 70,
    versions: { electron: '43.3.0' }, env: { HOME: '/fixture', PATH: '/bin', ELECTRON_RUN_AS_NODE: '0', UNRELATED_SECRET: 'not forwarded' } });
}

test('internal Node mode is explicit for Electron and never widens the supplied environment', () => {
  const env = Object.freeze({ HOME: '/fixture', ELECTRON_RUN_AS_NODE: '0' });
  assert.deepEqual(internalNodeEnv(env, { electron: '43.3.0' }), { HOME: '/fixture', ELECTRON_RUN_AS_NODE: '1' });
  assert.deepEqual(internalNodeEnv(env, { node: '24' }), { HOME: '/fixture' });
  assert.deepEqual(externalEnv(env), { HOME: '/fixture' });
  assert.equal(env.ELECTRON_RUN_AS_NODE, '0');
});

test('an explicitly unwrapped Windows model script gets Node mode only under this executable', () => {
  const runtime = { execPath: 'C:\\Urfael\\Urfael.exe', versions: { electron: '43.3.0' } };
  const env = { HOME: 'C:\\fixture' };
  assert.equal(scriptEnv(runtime.execPath, ['C:\\npm\\cli.js'], env, runtime).ELECTRON_RUN_AS_NODE, '1');
  assert.equal(scriptEnv('C:\\vendor\\claude.exe', ['C:\\npm\\cli.js'], env, runtime).ELECTRON_RUN_AS_NODE, undefined);
  assert.equal(scriptEnv(runtime.execPath, ['--version'], env, runtime).ELECTRON_RUN_AS_NODE, undefined);
});

test('packaged runner starts its supervisor as Node after applying the scoped environment', () => {
  const runtime = electronProcess();
  let job = { id: 'test-job', kind: 'goal', state: 'queued', spec: { goal: 'offline goal', repo: '/fixture/repo' } };
  let spawned;
  const runner = load('runner', runtime, {
    fs: { openSync: () => 3, closeSync: () => {} },
    os: { homedir: () => '/fixture' },
    child_process: { spawn: (cmd, args, options) => { spawned = { cmd, args, options }; return { pid: 71, on() {}, unref() {} }; } },
    './internal-node': load('internal-node', runtime),
    './claude-bin': { resolve: () => ({ bin: '/vendor/claude', pre: [] }) },
    './jobstore': { safeId: () => true, claimRun: () => 'token', get: () => job, logFile: () => '/fixture/job.log', JOBS_DIR: '/fixture/jobs' },
    './lib': { ...require('../lib'), atomicWriteJSON: (_file, value) => { job = value; } },
  });
  assert.equal(runner.run(job), 71);
  assert.equal(spawned.cmd, runtime.execPath);
  assert.match(spawned.args[0], /job-worker\.js$/);
  assert.equal(spawned.options.env.ELECTRON_RUN_AS_NODE, '1');
  assert.equal('UNRELATED_SECRET' in spawned.options.env, false);
  assert.equal('ELECTRON_RUN_AS_NODE' in runner.jobEnv(job), false, 'external job environment stays scoped');
  assert.equal(runtime.env.ELECTRON_RUN_AS_NODE, '0');
});

test('supervisor selects Node mode for JS helpers and unwrapped model scripts, not native models', () => {
  for (const invocation of ['goal', 'native-model', 'model-script']) {
    const kind = invocation === 'goal' ? 'goal' : 'ask';
    const runtime = electronProcess();
    const job = { id: 'test-job', kind, state: 'starting', attemptToken: 'token', spec: {} };
    const child = Object.assign(new EventEmitter(), { pid: 72 });
    let spawned;
    const worker = load('job-worker', runtime, {
      child_process: { spawn: (cmd, args, options) => { spawned = { cmd, args, options }; return child; } },
      './internal-node': load('internal-node', runtime),
      './jobstore': { get: () => job, ownRun() {}, updateAttempt: (_id, _token, patch) => Object.assign(job, patch), releaseRun() {} },
      './runner': { VAULT: '/fixture/vault', argvFor: () => kind === 'goal' ? [runtime.execPath, '/app/goal-loop.js'] : invocation === 'model-script' ? [runtime.execPath, '/vendor/cli.js', '-p', 'task'] : ['/vendor/claude', '-p', 'task'],
        jobEnv: () => ({ HOME: '/fixture' }), progressFor: () => null, supportsRecovery: () => kind === 'goal',
        attribution: () => ({ header: '', caveat: '' }), notify() {} },
    });
    worker.supervise(job.id, 'token');
    child.emit('close', 1, null); // clear the supervisor's actual cancellation poll
    assert.equal(spawned.options.env.ELECTRON_RUN_AS_NODE, invocation === 'native-model' ? undefined : '1');
  }
});

test('model turns and acceptance checks do not inherit Electron Node mode from the goal engine', async () => {
  const runtime = electronProcess();
  runtime.env.ELECTRON_RUN_AS_NODE = '1';
  const observed = [];
  const loop = load('goal-loop', runtime, {
    './internal-node': load('internal-node', runtime),
    child_process: { spawn: (_cmd, _args, options) => {
      observed.push(options.env);
      const child = Object.assign(new EventEmitter(), { pid: 73, stdout: new EventEmitter(), stderr: new EventEmitter() });
      setImmediate(() => child.emit('close', 0));
      return child;
    } },
  });
  for (const phase of ['worker', 'check', 'verifier']) {
    const options = { cwd: '/fixture' };
    if (phase === 'check') options.env = { HOME: '/fixture', PATHEXT: '.EXE', ELECTRON_RUN_AS_NODE: '1' };
    const result = await loop.boundedRun('/vendor/command', [], options, 1, { save() {} }, phase);
    assert.equal(result.rc, 0);
    assert.equal('ELECTRON_RUN_AS_NODE' in observed.at(-1), false);
  }
  assert.equal(observed[1].PATHEXT, '.EXE');
  await loop.boundedRun(runtime.execPath, ['/vendor/cli.js'], { cwd: '/fixture' }, 1, { save() {} }, 'worker');
  assert.equal(observed.at(-1).ELECTRON_RUN_AS_NODE, '1', 'unwrapped Windows CLI uses Node mode');
  await loop.boundedRun(runtime.execPath, ['/fixture/check.js'], { cwd: '/fixture' }, 1, { save() {} }, 'check');
  assert.equal('ELECTRON_RUN_AS_NODE' in observed.at(-1), false, 'acceptance checks do not inherit helper mode');
  assert.equal(runtime.env.ELECTRON_RUN_AS_NODE, '1');
});
