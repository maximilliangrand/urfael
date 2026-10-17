'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

for (const failure of ['synchronous spawn', 'daemon error event', 'dashboard error event']) test('security benchmark cleans up ' + failure + ' without touching owner state', { timeout: 5000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'urf-harness-'));
  const priorHome = path.join(root, 'owner');
  const state = path.join(priorHome, '.claude', 'urfael');
  const sentinels = ['.claude/urfael/daemon.sock', '.claude/urfael/dashboard.token', 'urfael-sec-vault/keep.md'];
  for (const rel of sentinels) {
    const file = path.join(priorHome, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'owner data');
  }
  const commands = [], imports = [], killed = [], timers = new Set();
  let stateExistedAtDaemonExit = false;
  let launched;
  const proc = new EventEmitter();
  proc.env = { HOME: priorHome, USERPROFILE: priorHome, PATH: process.env.PATH,
    URFAEL_STATE_DIR: state, URFAEL_YOLO: '1', ANTHROPIC_API_KEY: 'owner-secret', CLAUDE_CONFIG_DIR: state };
  proc.execPath = process.execPath;
  proc.platform = process.platform;
  proc.stdout = { write() {} };
  const exited = new Promise((resolve) => { proc.exit = (code) => { for (const timer of timers) clearTimeout(timer); resolve(code); }; });
  try {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'security-benchmark.js'), 'utf8'), {
      __dirname, process: proc, console: { error() {} }, clearTimeout,
      setTimeout(fn, ms) { const timer = setTimeout(fn, ms); timers.add(timer); return timer; },
      require(name) {
        if (name === 'os') return { ...os, homedir: () => proc.env.HOME, tmpdir: () => root };
        if (name === 'child_process') return {
          execFileSync(bin) { commands.push(bin); return Buffer.alloc(0); },
          spawn(_bin, args, options) {
            launched = options.env;
            if (failure === 'synchronous spawn') throw new Error('synthetic startup failure');
            const child = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null, stdout: new EventEmitter() });
            if (failure === 'daemon error event' || args[0].endsWith('dashboard.js')) {
              setImmediate(() => {
                try { child.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })); }
                catch { proc.exit(1); } // emulate Node's fatal unhandled error without crashing the test runner
              });
            } else {
              child.pid = 123;
              child.kill = (signal = 'SIGTERM') => {
                killed.push(child.pid);
                setImmediate(() => {
                  stateExistedAtDaemonExit = fs.existsSync(launched.HOME);
                  child.signalCode = signal;
                  child.emit('exit', null, signal);
                });
              };
            }
            return child;
          },
        };
        if (name === 'http') return { request(_options, callback) {
          const req = new EventEmitter();
          req.end = () => callback({ resume() {} });
          return req;
        } };
        if (name === 'net') return { createServer() {
          return Object.assign(new EventEmitter(), { listen(_port, _host, callback) { callback(); }, address() { return { port: 12345 }; }, close(callback) { callback(); } });
        } };
        if (path.isAbsolute(name)) { imports.push(proc.env.HOME); return {}; }
        return require(name);
      },
    }, { filename: 'security-benchmark.js' });
    assert.equal(await exited, 2);
    assert.ok(commands.every((bin) => bin === 'lsof'), 'startup must not kill any pre-existing process');
    for (const rel of sentinels) assert.equal(fs.readFileSync(path.join(priorHome, rel), 'utf8'), 'owner data');
    assert.notEqual(launched.HOME, priorHome);
    assert.equal(launched.USERPROFILE, launched.HOME);
    assert.ok(imports.length > 0 && imports.every((home) => home === launched.HOME), 'isolate before loading stateful modules');
    assert.equal(launched.URFAEL_STATE_DIR, undefined);
    assert.equal(launched.URFAEL_YOLO, undefined);
    assert.equal(launched.ANTHROPIC_API_KEY, undefined);
    assert.equal(launched.CLAUDE_CONFIG_DIR, undefined);
    assert.equal(launched.URFAEL_UPDATE_CHECK, '0');
    assert.equal(launched.URFAEL_CLAUDE_BIN, path.join(__dirname, 'stub', process.platform === 'win32' ? 'claude.js' : 'claude'));
    assert.equal(fs.existsSync(launched.HOME), false, 'remove temporary state after a thrown or emitted startup error');
    assert.deepEqual(killed, failure === 'dashboard error event' ? [123] : [], 'stop only the daemon that this run already started');
    if (failure === 'dashboard error event') assert.equal(stateExistedAtDaemonExit, true, 'wait for the owned daemon to exit before removing its state');
  } finally { for (const timer of timers) clearTimeout(timer); fs.rmSync(root, { recursive: true, force: true }); }
});
