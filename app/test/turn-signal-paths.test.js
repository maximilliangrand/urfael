'use strict';
// Execute the daemon's real turn wrappers with offline providers and the actual
// council engine. No daemon, credentials, network, or user files are involved.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const council = require('../council');
const defaultBrain = require('../engine/default-brain');
const source = fs.readFileSync(path.join(__dirname, '..', 'daemon.js'), 'utf8');
function region(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, 'daemon wrapper anchors exist');
  return source.slice(a, b);
}
const nativeSource = region('async function runNativeTurn(', '\n// Reinforce what active recall');
const councilSource = region('async function runCouncilAsBrain(', '\nconst brain = {');
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }

function nativeHarness(over = {}) {
  const entries = ['primary', 'fallback', 'last'].map((id) => ({ id, big_model: id + '-model' }));
  const calls = { builds: [], runs: [], writes: [], deltas: [] };
  const context = {
    Date, nativeDefault: 'primary', turnCounter: 0, lastLocalTurn: 0,
    routeOverride: () => null, sendSay: (o) => calls.deltas.push(o.delta), sendThinking() {},
    providerList: () => entries, providerSessions: { findProvider: (list, id) => list.find((p) => p.id === id) },
    providers: { secretNeeded: () => null, chain: () => entries.slice(1) },
    nativeSecretFor: () => 'local', secretStore: {}, VAULT: '/unused', MEMORY_DIR: '/unused',
    nativeRecallSearch() {}, rememberNative() {}, NATIVE_SELF_REVIEW: false, FALLBACK_ON: true,
    activeRecall: async (text) => ({ promptText: text }), nativeSystemPrompt: () => 'system',
    logEvent() {}, pushTranscript: (r) => calls.writes.push(r), recordSession: (r) => calls.writes.push(r),
    defaultBrain,
    ...over,
  };
  context.engine = {
    pickAdapter: () => ({}), assembleMessages: (m) => m,
    classifyNativeError: (r) => ({ retryable: !r.ok, category: 'network' }),
    nativeFallbackChain: ({ chain }) => chain,
    buildEngine: (spec) => {
      calls.builds.push(spec.entry.id);
      return { _adapter: 'fake', run: async (messages, opts) => {
        calls.runs.push({ id: spec.entry.id, signal: opts.signal });
        return over.run ? over.run(spec, opts, calls) : { ok: true, text: 'answer' };
      } };
    },
  };
  vm.runInNewContext(nativeSource + '\nthis.run = runNativeTurn; this.runDefault = tryNativeDefault;', context);
  return { ...context, calls };
}

test('native cancellation during recall never invokes a provider or persists a reply', async () => {
  const recall = deferred(), ctrl = new AbortController();
  const h = nativeHarness({ activeRecall: () => recall.promise });
  const pending = h.run({ text: 'task', providerId: 'primary', signal: ctrl.signal });
  ctrl.abort(); recall.resolve({ promptText: 'task with memory' });
  const r = await pending;
  assert.equal(r.aborted, true);
  assert.equal(r.text, '(stopped)');
  assert.equal(h.calls.runs.length, 0);
  assert.equal(h.calls.writes.length, 0);
  const before = h.calls.builds.length;
  assert.equal((await h.run({ text: 'task', providerId: 'primary', signal: ctrl.signal })).aborted, true);
  assert.equal(h.calls.builds.length, before, 'pre-aborted request does not even build a provider');
});

test('native default cancellation reaches the engine and prevents fallback, late deltas and false success', async () => {
  const started = deferred(), ctrl = new AbortController();
  const h = nativeHarness({ run: (spec, { signal }) => new Promise((resolve) => {
    assert.equal(signal, ctrl.signal);
    started.resolve();
    signal.addEventListener('abort', () => {
      spec.onDelta('late answer');
      resolve({ ok: true, text: 'late answer' });
    }, { once: true });
  }) });
  const pending = h.runDefault('task', { signal: ctrl.signal });
  await started.promise; ctrl.abort();
  const r = await pending;
  assert.equal(r.aborted, true);
  assert.equal(r.text, '(stopped)');
  assert.deepEqual(h.calls.builds, ['primary']);
  assert.deepEqual(h.calls.deltas, []);
  assert.deepEqual(h.calls.writes, []);
});

test('native fallback shares the request signal and cancellation blocks later providers', async () => {
  const started = deferred(), ctrl = new AbortController();
  const h = nativeHarness({ run: async (spec, { signal }) => {
    assert.equal(signal, ctrl.signal);
    if (spec.entry.id === 'primary') return { ok: false, error: 'HTTP 503' };
    started.resolve();
    return new Promise((resolve) => signal.addEventListener('abort', () => resolve({ ok: false, error: 'network' }), { once: true }));
  } });
  const pending = h.run({ text: 'task', providerId: 'primary', signal: ctrl.signal });
  await started.promise; ctrl.abort();
  assert.equal((await pending).aborted, true);
  assert.deepEqual(h.calls.builds, ['primary', 'fallback']);
  assert.equal(h.calls.writes.length, 0);
});

function councilHarness({ hold = 'planner' } = {}) {
  const started = deferred(), calls = { launches: [], updates: [], killed: [], says: [] };
  const children = new Set(), inflight = new Set();
  const outsider = { kill: () => calls.killed.push('unrelated') }; inflight.add(outsider);
  let nextJob = 0;
  const store = { create: () => ({ id: 'job-' + ++nextJob }), appendLog() {},
    update: (id, patch) => calls.updates.push({ id, ...patch }) };
  function spawnHeld(label) {
    calls.launches.push(label);
    const child = new EventEmitter(); child.stdout = new EventEmitter();
    child.kill = () => { calls.killed.push(label); queueMicrotask(() => child.emit('exit', null, 'SIGKILL')); };
    return child;
  }
  const plan = JSON.stringify({ subtasks: Array.from({ length: 6 }, (_, n) => ({ prompt: 'task ' + n })) });
  const deps = {
    CLAUDE_BIN: 'offline', VAULT: '/unused', scopedEnv: () => ({}), classifyModel: () => 'model', OPUS: 'model',
    budgetWindow: () => ({}), inflightScoped: inflight, store, _children: children,
    spawn: () => { const child = spawnHeld('worker'); started.resolve(); return child; },
    oneShot: async () => {
      if (hold !== 'planner') { calls.launches.push('planner'); return plan; }
      const child = spawnHeld('planner'); children.add(child); inflight.add(child); started.resolve();
      return new Promise((resolve) => child.on('exit', () => { children.delete(child); inflight.delete(child); resolve(plan); }));
    },
    streamOne: async ({ onDelta }) => { calls.launches.push('synthesis'); onDelta('answer'); },
  };
  const context = { Date, process: { pid: 123 }, council, councilInFlight: false, councilAbort: null,
    councilChildren: children, inflightScoped: inflight, jobstore: store, AGENT_MODE: 'fortress',
    logEvent() {}, sendThinking() {}, sendSay: (o) => calls.says.push(o), turnCounter: 0,
    councilDeps: (jobId) => ({ ...deps, jobId }) };
  vm.runInNewContext(councilSource + '\nthis.run = runCouncilAsBrain;', context);
  return { run: context.run, context, calls, started, inflight, outsider };
}

for (const hold of ['planner', 'workers']) test('council cancellation in ' + hold + ' stops owned children and prevents later phases', async () => {
  const h = councilHarness({ hold }), ctrl = new AbortController();
  const pending = h.run('task', { agents: 6, signal: ctrl.signal });
  await h.started.promise; ctrl.abort();
  const r = await pending;
  assert.equal(r.aborted, true);
  assert.equal(r.text, '(stopped)');
  assert.equal(h.calls.launches.includes('synthesis'), false);
  assert.equal(h.calls.launches.filter((x) => x === 'worker').length, hold === 'planner' ? 0 : 4, 'no workers after cancelled planner / no second worker wave');
  assert.equal(h.calls.killed.includes('unrelated'), false);
  assert.ok(h.inflight.has(h.outsider));
  assert.equal(h.context.councilAbort, null);
  assert.equal(h.context.councilInFlight, false);
  assert.ok(h.calls.updates.some((r) => r.state === 'interrupted'));
  assert.equal(h.calls.updates.some((r) => r.state === 'done'), false, 'never persist completed council after cancellation');
  assert.deepEqual(h.calls.says, []);
});

test('pre-aborted council does not reserve the council or open a job', async () => {
  const h = councilHarness(), ctrl = new AbortController(); ctrl.abort();
  assert.equal((await h.run('task', { signal: ctrl.signal })).aborted, true);
  assert.deepEqual(h.calls.updates, []);
  assert.deepEqual(h.calls.launches, []);
  assert.equal(h.context.councilInFlight, false);
});
