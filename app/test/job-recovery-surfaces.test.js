'use strict';
// Execute the real Jobs renderer/CLI dispatch in isolated adapters. No Electron,
// daemon, user profile, provider process, sockets, or installed app is touched.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const APP = path.join(__dirname, '..');
const renderer = fs.readFileSync(path.join(APP, 'console', 'console.js'), 'utf8');
const jobsSource = renderer.slice(renderer.indexOf('// ---- jobs ---'), renderer.indexOf('// ---- hearth ---'));
assert.ok(jobsSource.includes('async function loadJobs()'), 'exercise the actual Jobs renderer');

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.textContent = ''; this.className = ''; this.hidden = false; this.disabled = false; this.attributes = {}; this.classList = { add: (s) => { this.className += ' ' + s; } }; }
  set innerHTML(value) { this.children = []; this.html = value; }
  append(...els) { this.children.push(...els); }
  appendChild(el) { this.append(el); return el; }
  setAttribute(k, v) { this.attributes[k] = v; }
}
function all(el, predicate) { return [el, ...el.children.flatMap((c) => all(c, () => true))].filter(predicate); }
function surface(jobs, overrides = {}) {
  const list = new Element('div'), log = new Element('pre');
  const api = { jobs: async () => jobs, job: async (id) => jobs.find((j) => j.id === id), ...overrides };
  const context = vm.createContext({ document: { createElement: (tag) => new Element(tag) }, $: (id) => id === '#job-list' ? list : log, window: { urfael: api } });
  vm.runInContext(jobsSource, context);
  return { context, api, list, log, buttons: () => all(list, (e) => e.tag === 'button') };
}
const sample = () => ({ id: 'goal-1234', kind: 'goal', state: 'stopped', goal: 'Make project search reliable', resumable: true,
  progress: { iterations: 3, maxIters: 12, outcome: 'stopped', reason: 'turn timeout', verification: { status: 'not_verified' } } });

test('Jobs shows actual goal/progress and exact verification, without leaking session or contract in the list', async () => {
  const j = sample(); j.progress.sessionId = 'private-session'; j.progress.contract = { criteria: 'private-contract' };
  const ui = surface([j]); await ui.context.loadJobs();
  const text = all(ui.list, () => true).map((e) => e.textContent).join('\n');
  assert.match(text, /Make project search reliable/);
  assert.match(text, /Iterations: 3\/12/);
  assert.match(text, /Verification: not_verified/);
  assert.match(text, /turn timeout/);
  assert.doesNotMatch(text, /private-session|private-contract/);
  assert.deepEqual(ui.buttons().map((b) => b.textContent), ['Refresh jobs', 'Details', 'Resume']);
});

test('legacy done jobs have no verification claim and no Resume unless server permits it', async () => {
  const ui = surface([{ id: 'legacy-1234', kind: 'goal', state: 'done' }]); await ui.context.loadJobs();
  assert.match(all(ui.list, () => true).map((e) => e.textContent).join('\n'), /No completion receipt recorded/);
  assert.equal(ui.buttons().some((b) => b.textContent === 'Resume'), false);
  assert.equal(ui.context.jobVerification({ verification: { status: 'check_failed', label: 'verified' } }), 'check_failed');
});

test('Details renders review baseline, contract, exact receipt and result as text', async () => {
  const j = sample(); j.goal = '<img src=x onerror=alert(1)>';
  j.spec = { repo: '/isolated/project' };
  Object.assign(j.progress, { baselineHead: 'abc123', elapsedMs: 9200, contract: { check: 'npm test' }, result: 'Search tests pass; review required' });
  j.log = 'worker log';
  const ui = surface([j]); await ui.context.loadJobs();
  await ui.buttons().find((b) => b.textContent === 'Details').onclick();
  assert.match(ui.log.textContent, /Repository: \/isolated\/project/);
  assert.match(ui.log.textContent, /baseline.*abc123/);
  assert.match(ui.log.textContent, /"check": "npm test"/);
  assert.match(ui.log.textContent, /"status": "not_verified"/);
  assert.match(ui.log.textContent, /Search tests pass; review required/);
  assert.match(ui.log.textContent, /worker log/);
  assert.equal(ui.log.textContent.startsWith(j.goal), true);
  assert.equal(ui.log.html, undefined, 'untrusted receipt/goal is never HTML');
});

test('completion evidence keeps marker, model review, and command check statuses distinct', async () => {
  for (const status of ['pending', 'failed', 'unverified', 'reviewed', 'passed']) {
    const j = sample(); j.state = 'done'; j.resumable = false; j.progress.verification = { status };
    if (status === 'passed') j.progress.verification.checkReceipt = {
      command: 'node --test test/search.test.js', exitCode: 0, timedOut: false,
      startedAt: Date.parse('2026-09-13T10:00:00Z'), endedAt: Date.parse('2026-09-13T10:00:02Z'), workspaceHash: 'checked-tree', logFile: '/isolated/check.log',
    };
    const ui = surface([j]); await ui.context.loadJobs();
    assert.match(all(ui.list, () => true).map((e) => e.textContent).join('\n'), new RegExp('Verification: ' + status));
    await ui.buttons().find((b) => b.textContent === 'Details').onclick();
    if (status === 'passed') {
      for (const text of ['node --test test/search.test.js', '"exitCode": 0', '"timedOut": false', '2026-09-13T10:00:02.000Z', 'checked-tree', '/isolated/check.log']) assert.ok(ui.log.textContent.includes(text));
      assert.match(ui.log.textContent, /Acceptance check: node --test test\/search.test.js/);
      assert.match(ui.log.textContent, /Exit code: 0 · Timed out: false/);
      assert.match(ui.log.textContent, /Check time: 2026-09-13T10:00:00.000Z → 2026-09-13T10:00:02.000Z/);
    } else assert.doesNotMatch(ui.log.textContent, /checkReceipt|Verification: passed/);
  }
});

test('Resume submits the existing id once while pending and reports acceptance without claiming completion', async () => {
  const j = sample(); let calls = 0, resolve;
  const ui = surface([j], { jobResume: (id) => { assert.equal(id, j.id); calls++; return new Promise((r) => { resolve = r; }); } });
  await ui.context.loadJobs();
  const button = ui.buttons().find((b) => b.textContent === 'Resume');
  const first = button.onclick(); await button.onclick();
  assert.equal(calls, 1); assert.equal(button.disabled, true);
  j.state = 'starting'; j.resumable = false; resolve({ id: j.id, state: 'starting' }); await first;
  assert.match(ui.log.textContent, /Resume accepted.*State: starting/);
  assert.doesNotMatch(ui.log.textContent, /completed|verified/);
  assert.equal(ui.buttons().some((b) => b.textContent === 'Resume'), false);
});

test('Resume rejection remains visible and preserves a retryable button; transport uncertainty is explicit', async () => {
  const ui = surface([sample()], { jobResume: async () => ({ error: 'Workspace changed; inspect the goal before resuming' }) });
  await ui.context.loadJobs(); const button = ui.buttons().find((b) => b.textContent === 'Resume');
  await button.onclick();
  assert.match(ui.log.textContent, /Workspace changed/); assert.equal(button.disabled, false);
  ui.api.jobResume = async () => { throw new Error('offline'); };
  await button.onclick(); assert.match(ui.log.textContent, /Could not confirm resume.*Refresh jobs/);
});

test('Starting jobs can be cancelled, cancelling jobs have no duplicate action, and load errors do not look empty', async () => {
  const j = sample(); j.state = 'starting'; j.resumable = false;
  const ui = surface([j], { jobCancel: async () => ({ error: 'Could not signal worker' }) });
  await ui.context.loadJobs(); await ui.buttons().find((b) => b.textContent === 'Cancel').onclick();
  assert.match(ui.log.textContent, /Could not signal worker/);
  j.state = 'cancelling'; await ui.context.loadJobs(); assert.equal(ui.buttons().some((b) => b.textContent === 'Cancel'), false);
  ui.api.jobs = async () => null; await ui.context.loadJobs(); assert.match(ui.log.textContent, /Could not load jobs/);
});

const cli = fs.readFileSync(path.join(APP, 'cli.js'), 'utf8');
const cliSource = cli.slice(cli.indexOf("  if (cmd === 'jobs')"), cli.indexOf("  if (cmd === 'cancel')"));
assert.ok(cliSource.includes("'/resume'"), 'exercise the actual CLI dispatch');
async function runCli(cmd, rest, reply) {
  const requests = [], output = [], errors = [], proc = { exitCode: 0 };
  const context = vm.createContext({ cmd, rest, process: proc, gold: String, dim: String,
    console: { log: (x) => output.push(x), error: (x) => errors.push(x) },
    req: async (...args) => { requests.push(args); if (reply instanceof Error) throw reply; return reply; } });
  await vm.runInContext('(async()=>{' + cliSource + '})()', context);
  return { requests, output: output.join('\n'), errors: errors.join('\n'), exitCode: proc.exitCode };
}

test('CLI resume is exactly one POST on the existing job, with accepted state and nonzero refusal', async () => {
  const good = await runCli('job', ['goal-1234', '--resume'], { id: 'goal-1234', state: 'starting' });
  assert.deepEqual(good.requests[0].slice(0, 3), ['POST', '/job/goal-1234/resume', undefined]);
  assert.equal(good.requests.length, 1); assert.equal(good.requests[0][3].timeoutMs, 5000);
  assert.match(good.output, /resume accepted.*state: starting/); assert.equal(good.exitCode, 0);
  const bad = await runCli('job', ['goal-1234', '--resume'], { error: 'Goal has no remaining iterations' });
  assert.equal(bad.exitCode, 1); assert.match(bad.errors, /no remaining iterations/); assert.equal(bad.output, '');
  const uncertain = await runCli('job', ['goal-1234', '--resume'], new Error('timeout'));
  assert.equal(uncertain.exitCode, 1); assert.match(uncertain.errors, /Could not confirm resume.*before retrying/);
});

test('CLI rejects path-like ids, extra overrides and duplicate flags before any request', async () => {
  for (const args of [['../bad', '--resume'], ['goal-1234', '--resume', '--max-iters', '99'], ['goal-1234', '--resume', '--resume']]) {
    const r = await runCli('job', args, null); assert.equal(r.exitCode, 1); assert.equal(r.requests.length, 0); assert.match(r.errors, /usage:/);
  }
});

test('CLI list/detail retain exact recorded evidence and expose a resume command only when eligible', async () => {
  const j = sample();
  const listing = await runCli('jobs', [], [j]);
  assert.match(listing.output, /Make project search reliable/); assert.match(listing.output, /verification: not_verified/); assert.match(listing.output, /urfael job goal-1234 --resume/);
  j.resumable = false; const detail = await runCli('job', [j.id], j);
  assert.deepEqual(detail.requests, [['GET', '/job/goal-1234']]); assert.match(detail.output, /"status": "not_verified"/); assert.doesNotMatch(detail.output, /resume: urfael/);
  const legacy = await runCli('jobs', [], [{ id: 'legacy-1234', kind: 'goal', state: 'done' }]);
  assert.match(legacy.output, /No completion receipt recorded/);
});

test('Electron bridge exposes only validated resume-by-id capability', async () => {
  const src = fs.readFileSync(path.join(APP, 'main.js'), 'utf8');
  const handlerLine = src.split('\n').find((l) => l.startsWith("ipcMain.handle('urfael:job-resume'"));
  let handler; const calls = [];
  vm.runInNewContext(handlerLine, { SAFE_ID: /^[A-Za-z0-9-]{4,64}$/, ipcMain: { handle: (_name, fn) => { handler = fn; } }, daemonPostJson: (p) => { calls.push(p); return { id: 'goal-1234' }; } });
  assert.ok(handler(null, '../../other').error); assert.equal(calls.length, 0);
  handler(null, 'goal-1234'); assert.deepEqual(calls, ['/job/goal-1234/resume']);
  let exposed; const invokes = [];
  vm.runInNewContext(fs.readFileSync(path.join(APP, 'preload.js'), 'utf8'), { require: (name) => { assert.equal(name, 'electron'); return { contextBridge: { exposeInMainWorld: (_name, obj) => { exposed = obj; } }, ipcRenderer: { invoke: (...args) => invokes.push(args) } }; } });
  exposed.jobResume('goal-1234'); assert.deepEqual(invokes, [['urfael:job-resume', 'goal-1234']]);
});
