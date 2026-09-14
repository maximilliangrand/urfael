'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const cp = require('node:child_process');
const { createRequire } = require('node:module');
const { forgetMemory } = require('../forget');
const learn = require('../learn');
const memctx = require('../memctx');
const trajectory = require('../trajectory');
const verify = require('../learn-verify');
const consolidate = require('../consolidate');
const reflect = require('../reflect');
const ipc = require('../ipc');

const APP = path.resolve(__dirname, '..'), WIN = process.platform === 'win32';
const FORGET = 'Always verify synthetic ultraviolet reports before publishing.';
const KEEP = 'Keep unrelated emerald inventory notes.';
const verdict = { correct: true, general: true, safe: true, confidence: 0.95 };
const item = (id, ref) => ({ id, type: 'lesson', ref, status: 'trusted', confidence: 0.95, verify: verdict, learnedAt: 1 });
const read = (dir, file) => fs.readFileSync(path.join(dir, file), 'utf8');
const json = (dir, file) => JSON.parse(read(dir, file));
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'urfael-forget-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'ledger.json'), JSON.stringify([item('gone', FORGET), item('keep', KEEP)]));
  fs.writeFileSync(path.join(dir, 'MEMORY.md'), '# Memory\n- ' + FORGET + '\n- ' + KEEP + '\n');
  return dir;
}
function withFaults(overrides) {
  // Load the actual helper AND shared atomic writer with isolated filesystem faults. No global fs
  // monkeypatch: concurrent tests and other owner stores never see this injected failure.
  const fsx = { ...fs, ...overrides };
  const evaluate = (file, lib) => {
    const module = { exports: {} }, req = createRequire(file);
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
      module, process, console,
      require: (name) => name === 'fs' ? fsx : name === './lib' && lib ? lib : req(name),
    }, { filename: file });
    return module.exports;
  };
  const lib = evaluate(path.join(APP, 'lib.js'));
  return evaluate(path.join(APP, 'forget.js'), lib).forgetMemory;
}
const fail = (code) => Object.assign(new Error('synthetic storage failure'), { code });
const noTemps = (dir) => assert.deepEqual(fs.readdirSync(dir).filter((n) => n.includes('.tmp-')), []);

test('forget retires active ledger beliefs, drains matching pending lessons, and preserves unrelated content', (t) => {
  const dir = fixture(t), originalKeeper = json(dir, 'ledger.json')[1];
  fs.writeFileSync(path.join(dir, 'LESSONS.md'), '- ' + FORGET + '\n');
  fs.writeFileSync(path.join(dir, '.learned.json'), JSON.stringify([{ type: 'lesson', ref: FORGET }, { type: 'user', ref: KEEP }]));
  const r = forgetMemory(dir, 'SYNTHETIC ULTRAVIOLET');
  assert.equal(r.error, undefined);
  assert.equal(r.count, 4); // ledger, pending staging, MEMORY.md, LESSONS.md
  const saved = learn.load(dir), forgotten = saved.find((it) => it.id === 'gone');
  assert.equal(forgotten.status, 'retired');
  assert.equal(forgotten.confidence, 0);
  assert.ok(Number.isFinite(Date.parse(forgotten.forgottenAt)));
  assert.deepEqual(saved.find((it) => it.id === 'keep'), originalKeeper);
  assert.deepEqual(json(dir, '.learned.json'), [{ type: 'user', ref: KEEP }]);
  assert.equal(read(dir, 'MEMORY.md'), '# Memory\n- ' + KEEP + '\n');
  assert.equal(read(dir, 'LESSONS.md'), '');
  assert.match(read(dir, 'TOMBSTONES.md'), /\(ledger.json\).*synthetic ultraviolet/);
  assert.deepEqual(learn.trusted(saved).map((it) => it.id), ['keep']);
  assert.equal(memctx.buildContext({ query: 'ultraviolet', lessons: learn.trusted(saved) }).block, '');
  assert.ok(!trajectory.toJSONL(trajectory.buildLessons(saved).records).includes('ultraviolet'));
  assert.equal(learn.upsert(saved, { type: 'lesson', ref: FORGET }).isNew, false, 'recurrence finds the retired item instead of creating another trusted candidate');
  learn.applyVerdict(saved, 'gone', verdict, Date.now());
  assert.equal(saved.find((it) => it.id === 'gone').status, 'retired', 'a late verifier cannot undo owner retirement');
  noTemps(dir);
});

test('a ledger-only lesson can be forgotten and a repeated request is idempotent', (t) => {
  const dir = fixture(t);
  fs.unlinkSync(path.join(dir, 'MEMORY.md'));
  const first = forgetMemory(dir, 'ultraviolet');
  assert.equal(first.count, 1);
  const tomb = read(dir, 'TOMBSTONES.md'), ledger = read(dir, 'ledger.json');
  assert.equal(forgetMemory(dir, 'ultraviolet').count, 0);
  assert.equal(read(dir, 'TOMBSTONES.md'), tomb);
  assert.equal(read(dir, 'ledger.json'), ledger);
});

test('a pending-only lesson is retired through normal identity before its staging entry is removed', (t) => {
  const dir = fixture(t);
  fs.unlinkSync(path.join(dir, 'ledger.json'));
  fs.unlinkSync(path.join(dir, 'MEMORY.md'));
  fs.writeFileSync(path.join(dir, '.learned.json'), JSON.stringify([{ type: 'lesson', ref: FORGET }]));
  const r = forgetMemory(dir, 'ultraviolet');
  assert.equal(r.error, undefined);
  assert.equal(r.count, 2);
  assert.deepEqual(json(dir, '.learned.json'), []);
  const ledger = learn.load(dir);
  const recurrence = learn.upsert(ledger, { type: 'lesson', ref: FORGET.toUpperCase() });
  assert.equal(recurrence.isNew, false);
  learn.applyVerdict(ledger, recurrence.item.id, verdict);
  assert.equal(recurrence.item.status, 'retired');
  assert.ok(recurrence.item.forgottenAt);
  assert.deepEqual(learn.trusted(ledger), []);
});

test('forgotten markers fail closed in every trusted-lesson consumer even with a stale trusted status', () => {
  const stale = { ...item('gone', FORGET), forgottenAt: new Date().toISOString() };
  assert.deepEqual(learn.trusted([stale]), []);
  assert.equal(memctx.buildContext({ query: 'ultraviolet', lessons: [stale] }).block, '');
  assert.deepEqual(trajectory.buildLessons([stale]).records, []);
  assert.equal(verify.weight(stale), 0);
});

test('curator and reflection compaction preserve forgotten items instead of merging away their recurrence barrier', () => {
  const forgotten = { ...item('gone', FORGET), status: 'retired', confidence: 0, forgottenAt: new Date().toISOString() };
  const similar = item('similar', FORGET.replace('ultraviolet ', ''));
  for (const items of [[forgotten, similar], [similar, forgotten]]) {
    const compacted = consolidate.dedupeLessons(items);
    assert.equal(compacted.merged.length, 0);
    assert.equal(compacted.kept.length, 2);
    assert.deepEqual(compacted.kept.find((it) => it.id === 'gone'), forgotten);
    const reflected = reflect.consolidatePass(compacted.kept, Date.now()).items;
    const recurrence = learn.upsert(reflected, { type: 'lesson', ref: FORGET });
    assert.equal(recurrence.isNew, false);
    assert.equal(recurrence.item.status, 'retired');
    assert.equal(recurrence.item.forgottenAt, forgotten.forgottenAt);
    assert.deepEqual(learn.trusted(reflected).map((it) => it.id), ['similar']);
  }
});

test('corrupt or unreadable stores refuse forgetting before any memory mutation', async (t) => {
  for (const body of ['{invalid', '{}', '']) await t.test(JSON.stringify(body), (t) => {
    const dir = fixture(t), before = read(dir, 'MEMORY.md');
    fs.writeFileSync(path.join(dir, 'ledger.json'), body);
    const r = forgetMemory(dir, 'ultraviolet');
    assert.match(r.error, /could not read ledger.json; nothing was forgotten/);
    assert.equal(r.count, 0);
    assert.equal(read(dir, 'ledger.json'), body);
    assert.equal(read(dir, 'MEMORY.md'), before);
    assert.ok(!fs.existsSync(path.join(dir, 'TOMBSTONES.md')));
  });
  await t.test('unreadable ledger', (t) => {
    const dir = fixture(t), before = read(dir, 'MEMORY.md');
    const forget = withFaults({ readFileSync: (file, ...args) => { if (path.basename(String(file)) === 'ledger.json') throw fail('EACCES'); return fs.readFileSync(file, ...args); } });
    assert.match(forget(dir, 'ultraviolet').error, /could not read ledger.json.*EACCES/);
    assert.equal(read(dir, 'MEMORY.md'), before);
  });
  await t.test('corrupt pending lessons', (t) => {
    const dir = fixture(t), before = read(dir, 'ledger.json');
    fs.writeFileSync(path.join(dir, '.learned.json'), '{invalid');
    assert.match(forgetMemory(dir, 'ultraviolet').error, /could not read .learned.json/);
    assert.equal(read(dir, 'ledger.json'), before);
  });
});

test('a failed ledger replacement preserves trusted data and reports failure, never successful forgetting', (t) => {
  const dir = fixture(t), before = read(dir, 'ledger.json'), memoryBefore = read(dir, 'MEMORY.md');
  const forget = withFaults({ renameSync: (from, to) => { if (path.basename(to) === 'ledger.json') throw fail('ENOSPC'); return fs.renameSync(from, to); } });
  const r = forget(dir, 'ultraviolet');
  assert.match(r.error, /could not update ledger.json.*ENOSPC.*nothing was forgotten/);
  assert.equal(r.count, 0);
  assert.equal(r.partial, false);
  assert.equal(read(dir, 'ledger.json'), before);
  assert.equal(read(dir, 'MEMORY.md'), memoryBefore);
  assert.ok(!fs.existsSync(path.join(dir, 'TOMBSTONES.md')));
  noTemps(dir);
});

test('a later file failure reports precise partial removal, preserves the old file, and supports retry', (t) => {
  const dir = fixture(t), before = read(dir, 'MEMORY.md');
  const forget = withFaults({ renameSync: (from, to) => { if (path.basename(to) === 'MEMORY.md') throw fail('EACCES'); return fs.renameSync(from, to); } });
  const r = forget(dir, 'ultraviolet');
  assert.match(r.error, /could not update MEMORY.md.*some removals took effect/);
  assert.equal(r.partial, true);
  assert.equal(r.count, 1);
  assert.equal(r.removed[0].file, 'ledger.json');
  assert.equal(read(dir, 'MEMORY.md'), before);
  assert.equal(json(dir, 'ledger.json')[0].status, 'retired');
  assert.match(read(dir, 'TOMBSTONES.md'), /partially forgotten/);
  assert.ok(!read(dir, 'TOMBSTONES.md').includes('(MEMORY.md)'));
  const retry = forgetMemory(dir, 'ultraviolet');
  assert.equal(retry.error, undefined);
  assert.equal(retry.count, 1);
  assert.ok(!read(dir, 'MEMORY.md').includes('ultraviolet'));
  noTemps(dir);
});

test('a tombstone write failure cannot be reported as successful forgetting', (t) => {
  const dir = fixture(t);
  const forget = withFaults({ renameSync: (from, to) => { if (path.basename(to) === 'TOMBSTONES.md') throw fail('EPERM'); return fs.renameSync(from, to); } });
  const r = forget(dir, 'ultraviolet');
  assert.match(r.error, /could not write TOMBSTONES.md/);
  assert.equal(r.partial, true);
  assert.equal(json(dir, 'ledger.json')[0].status, 'retired');
  assert.equal(json(dir, '.forget-audit-pending.json').length, 1);
  const retry = forgetMemory(dir, 'ultraviolet');
  assert.equal(retry.error, undefined);
  assert.equal(retry.count, 0, 'recovery does not claim to remove the same beliefs twice');
  assert.equal(retry.auditRecovered, r.count);
  assert.match(read(dir, 'TOMBSTONES.md'), /synthetic ultraviolet/);
  assert.deepEqual(json(dir, '.forget-audit-pending.json'), []);
  assert.equal(forgetMemory(dir, 'ultraviolet').auditRecovered, 0);
  noTemps(dir);
});

test('retry does not duplicate a tombstone if only pending-receipt cleanup failed', (t) => {
  const dir = fixture(t);
  let writes = 0;
  const forget = withFaults({ renameSync: (from, to) => {
    if (path.basename(to) === '.forget-audit-pending.json' && ++writes === 2) throw fail('ENOSPC');
    return fs.renameSync(from, to);
  } });
  const r = forget(dir, 'ultraviolet');
  assert.match(r.error, /could not write .forget-audit-pending.json/);
  const tomb = read(dir, 'TOMBSTONES.md');
  const retry = forgetMemory(dir, 'ultraviolet');
  assert.equal(retry.error, undefined);
  assert.equal(retry.auditRecovered, r.count);
  assert.equal(read(dir, 'TOMBSTONES.md'), tomb);
});

test('the actual daemon forget gate excludes every in-flight memory pass before invoking persistence', () => {
  const source = fs.readFileSync(path.join(APP, 'daemon.js'), 'utf8');
  const start = source.indexOf('function forgetPhrase(phrase) {');
  const end = source.indexOf('\n}\n', start) + 2;
  assert.ok(start >= 0 && end > start);
  for (const busy of ['distilling', 'reviewing', 'curating', 'modelingUser', 'verifying']) {
    const context = { distilling: false, reviewing: false, curating: false, modelingUser: false, verifying: false,
      require: () => { throw new Error('busy gate reached persistence'); } };
    context[busy] = true;
    vm.runInNewContext(source.slice(start, end) + '\nresult = forgetPhrase("ultraviolet");', context);
    assert.match(context.result.error, /a memory pass is running/, busy);
  }
});

test('real daemon forget survives restart and disappears from active recall and CLI lessons export', { timeout: 60000 }, async (t) => {
  const home = fs.mkdtempSync(path.join(WIN ? os.tmpdir() : '/tmp', 'urf-forget-e2e-'));
  const memory = path.join(home, 'memory'), state = path.join(home, '.claude', 'urfael');
  for (const p of [memory, state, path.join(home, 'vault')]) fs.mkdirSync(p, { recursive: true });
  fs.writeFileSync(path.join(memory, 'ledger.json'), JSON.stringify([item('gone', FORGET), item('keep', KEEP)]));
  fs.writeFileSync(path.join(memory, 'LESSONS.md'), '- ' + FORGET + '\n- ' + KEEP + '\n');
  const childLedger = path.join(home, 'children.jsonl'), faultFlag = path.join(home, 'block-tombstone');
  const observer = path.join(home, 'observe.cjs');
  fs.writeFileSync(childLedger, '');
  fs.writeFileSync(observer, `const cp=require('child_process'),fs=require('fs');
for(const name of ['spawn','execFile']){const original=cp[name];cp[name]=function(...args){const p=original.apply(this,args);if(p.pid)fs.appendFileSync(${JSON.stringify(childLedger)},JSON.stringify({pid:p.pid})+'\\n');return p;};}
const rename=fs.renameSync;fs.renameSync=function(from,to){if(String(to)===${JSON.stringify(path.join(memory, 'TOMBSTONES.md'))}&&fs.existsSync(${JSON.stringify(faultFlag)}))throw Object.assign(new Error('synthetic tombstone failure'),{code:'EPERM'});return rename.apply(this,arguments);};
`);
  const env = { PATH: process.env.PATH || '', HOME: home, USERPROFILE: home, TMPDIR: home, TEMP: home, TMP: home,
    URFAEL_STATE_DIR: state, URFAEL_VAULT_DIR: 'vault', URFAEL_MEMORY_DIR: 'memory',
    URFAEL_CLAUDE_BIN: path.join(__dirname, 'stub', WIN ? 'claude.js' : 'claude'),
    URFAEL_UPDATE_CHECK: '0', URFAEL_HEARTBEAT_MINS: '0', URFAEL_CURATOR_DAYS: '0',
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: path.join(home, 'empty-git-config'), NODE_OPTIONS: '--require ' + JSON.stringify(observer) };
  for (const name of ['SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT', 'USERNAME']) if (process.env[name]) env[name] = process.env[name];
  const socketPath = ipc.daemonSock(env), children = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, label, ms = 15000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { try { if (await fn()) return; } catch {} await sleep(40); }
    throw new Error('timed out: ' + label);
  };
  const request = (method, url, body) => new Promise((resolve, reject) => {
    const q = http.request({ socketPath, method, path: url, timeout: 10000,
      headers: { 'content-type': 'application/json', ...ipc.authHeaders(env) } }, (r) => {
      let raw = ''; r.on('data', (d) => raw += d); r.on('end', () => { try { resolve(JSON.parse(raw)); } catch (e) { reject(e); } });
    });
    q.on('error', reject); q.on('timeout', () => q.destroy(new Error('request timeout')));
    q.end(body === undefined ? undefined : JSON.stringify(body));
  });
  const alive = (child) => child.exitCode === null && child.signalCode === null;
  const ownedPids = () => [...new Set(fs.readFileSync(childLedger, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line).pid))];
  const pidAlive = (pid) => {
    try {
      if (process.platform === 'linux' && /\) Z /.test(fs.readFileSync('/proc/' + pid + '/stat', 'utf8'))) return false;
      process.kill(pid, 0); return true;
    } catch { return false; }
  };
  const start = async () => {
    const child = cp.spawn(process.execPath, [path.join(APP, 'daemon.js')], { cwd: home, env, detached: !WIN, stdio: 'ignore', windowsHide: true });
    children.push(child);
    await until(async () => (await request('GET', '/health')).ok, 'daemon health');
    return child;
  };
  const stop = async (child) => {
    await request('POST', '/shutdown');
    await until(() => !alive(child), 'daemon shutdown');
    await until(() => ownedPids().every((pid) => !pidAlive(pid)), 'owned provider and Git descendants');
  };
  t.after(async () => {
    try { if (children.some(alive)) await request('POST', '/shutdown'); } catch {}
    for (const child of children) {
      try { await until(() => !alive(child), 'cleanup shutdown', 3000); } catch {
        if (WIN) cp.spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        else try { process.kill(-child.pid, 'SIGKILL'); } catch {}
        await until(() => !alive(child), 'owned daemon exit', 3000);
      }
    }
    // Descendants can outlive the daemon, notably asynchronous gitChain. Re-read the exact ledger
    // after supervisor exit; do not unlink their cwd while they are still running on Windows.
    try { await until(() => ownedPids().every((pid) => !pidAlive(pid)), 'descendant cleanup', 3000); }
    catch {
      for (const pid of ownedPids().filter(pidAlive)) {
        if (WIN) cp.spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        else { try { process.kill(-pid, 'SIGKILL'); } catch {} try { process.kill(pid, 'SIGKILL'); } catch {} }
      }
      await until(() => ownedPids().every((pid) => !pidAlive(pid)), 'owned descendants exited', 3000);
    }
    await fs.promises.rm(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  const exportLessons = (name) => {
    const out = path.join(home, name);
    const r = cp.spawnSync(process.execPath, [path.join(APP, 'cli.js'), 'dataset', 'export', '--format', 'lessons', '--out', out], { cwd: home, env, encoding: 'utf8', timeout: 15000 });
    assert.equal(r.status, 0, r.stderr || r.error?.message);
    return fs.readFileSync(path.join(out, 'lessons.jsonl'), 'utf8');
  };
  const recallPresent = async () => (await request('GET', '/context?q=ultraviolet')).categories.some((c) => c.key === 'recall' && c.bytes > 0);
  let child = await start();
  assert.equal(await recallPresent(), true, 'fixture starts as actively recalled knowledge');
  assert.match(exportLessons('before'), /ultraviolet/);
  const forgotten = await request('POST', '/forget', { phrase: 'ULTRAVIOLET' });
  assert.equal(forgotten.error, undefined);
  assert.equal(forgotten.count, 2);
  for (let phase = 0; phase < 2; phase++) {
    if (phase) { await stop(child); child = await start(); }
    const learned = await request('GET', '/learn');
    assert.equal(learned.items.find((it) => it.id === 'gone').status, 'retired');
    assert.equal(learned.items.find((it) => it.id === 'keep').status, 'trusted');
    assert.equal(await recallPresent(), false, 'no recalled lesson ' + (phase ? 'after restart' : 'immediately'));
    const dataset = exportLessons('after-' + phase);
    assert.ok(!dataset.includes('ultraviolet'));
    assert.match(dataset, /emerald/);
  }
  assert.equal((await request('POST', '/forget', { phrase: 'ultraviolet' })).count, 0);
  fs.writeFileSync(faultFlag, 'synthetic tombstone failure');
  const partial = await request('POST', '/forget', { phrase: 'emerald' });
  assert.match(partial.error, /could not write TOMBSTONES.md/);
  assert.ok(partial.count > 0);
  await stop(child);
  fs.unlinkSync(faultFlag);
  child = await start();
  const recovered = cp.spawnSync(process.execPath, [path.join(APP, 'cli.js'), 'forget', 'emerald'], { cwd: home, env, encoding: 'utf8', timeout: 15000 });
  assert.equal(recovered.status, 0, recovered.stderr || recovered.error?.message);
  assert.match(recovered.stdout, /audit recovered/i);
  assert.match(recovered.stdout, /No additional beliefs removed/);
  assert.match(read(memory, 'TOMBSTONES.md'), /emerald/);
  assert.deepEqual(json(memory, '.forget-audit-pending.json'), []);
  await stop(child);
});
