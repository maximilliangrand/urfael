'use strict';
// Execute actual desktop handlers and onboarding renderer with in-memory IPC/fs.
// No Electron instance, daemon, credentials, services, or profile is touched.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const APP = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(APP, 'main.js'), 'utf8');
const handlersSource = main.slice(main.indexOf("ipcMain.handle('urfael:provider-status'"), main.indexOf('// ---- click-through:'));
assert.ok(handlersSource.includes("ipcMain.handle('urfael:save-provider'"));

function onboarding(auth = { installed: true, loggedIn: true, method: 'chatgpt' }) {
  const handlers = {}, files = new Map(), writes = [], requests = [];
  let ready = false, settings = { URFAEL_VERBOSITY: 'terse' }, starts = 0;
  vm.runInNewContext(handlersSource, {
    require: (id) => id === './codex-backend' ? { authStatus: async () => auth } : require(path.resolve(APP, id)),
    ipcMain: { handle: (name, fn) => { handlers[name] = fn; } },
    setup: { PROVIDER_ENV: '/fixture/provider.env', readEnv: () => ({ ...settings }), writeEnv: (next) => { settings = { ...next }; files.set('/fixture/provider.env', 'saved'); } },
    fs: { existsSync: (file) => files.has(file), mkdirSync() {}, writeFileSync: (file, value) => { files.set(file, value); writes.push(file); } },
    JDIR: '/fixture', ONBOARDED: '/fixture/onboarded', path,
    ensureDaemon: async () => { starts++; return ready; },
    daemonPostJson: async (route) => { requests.push(route); return {}; },
    setTimeout: (fn) => { fn(); },
  });
  return { handlers, files, writes, requests, setReady: (value) => { ready = value; }, settings: () => settings, starts: () => starts };
}

test('onboarding keeps saved settings but cannot claim success or persist readiness after daemon startup fails', async () => {
  const app = onboarding();
  const save = app.handlers['urfael:save-provider'];
  const failed = await save(null, { mode: 'local', url: 'http://127.0.0.1:9999' });
  assert.equal(failed.ok, false);
  assert.match(failed.error, /settings were saved.*brain did not start/i);
  assert.match(failed.error, /urfael\.log.*try again/i);
  assert.equal(app.settings().ANTHROPIC_BASE_URL, 'http://127.0.0.1:9999');
  assert.equal(app.settings().URFAEL_VERBOSITY, 'terse');
  assert.equal(app.files.has('/fixture/onboarded'), false);
  assert.equal((await app.handlers['urfael:provider-status']()).onboarded, false, 'a provider file alone must not hide failed setup on reload');
  app.setReady(true);
  const accepted = await save(null, { mode: 'local', url: 'http://127.0.0.1:9999' });
  assert.equal(accepted.ok, true);
  assert.equal(app.files.has('/fixture/onboarded'), true);
  assert.equal((await app.handlers['urfael:provider-status']()).onboarded, true);
  assert.deepEqual(app.requests, ['/shutdown', '/shutdown'], 'startup does not add a live provider authentication request');
});

test('configured users stay onboarded when their daemon is ready; a fresh profile still needs setup', async () => {
  const app = onboarding(); app.setReady(true);
  assert.equal((await app.handlers['urfael:provider-status']()).onboarded, false);
  assert.equal(app.starts(), 0);
  app.files.set('/fixture/provider.env', 'existing settings');
  assert.equal((await app.handlers['urfael:provider-status']()).onboarded, true);
  assert.deepEqual(app.writes, [], 'status does not overwrite profile files');
});

test('the real onboarding UI retains a startup failure and dismisses only a successful retry', async () => {
  const app = onboarding();
  const elements = new Map();
  for (const id of ['#onboard', '#ob-note', '#ob-key', '#ob-url', '#ob-go', '#ob-login', '#ob-commands', '#provider-mode', '#input']) elements.set(id, {
    hidden: id === '#onboard', disabled: false, textContent: '', value: '',
    classList: { add() {}, remove() {}, toggle() {} }, querySelectorAll: () => [], querySelector: () => null,
    addEventListener(_event, fn) { this.click = fn; }, focus() {},
  });
  const renderer = fs.readFileSync(path.join(APP, 'console/console.js'), 'utf8');
  const source = renderer.slice(renderer.indexOf('// ---- first-run onboarding'), renderer.indexOf('// ---- Settings:'));
  vm.runInNewContext(source, { $: (id) => elements.get(id), window: { urfael: {
    providerStatus: () => app.handlers['urfael:provider-status'](),
    saveProvider: (cfg) => app.handlers['urfael:save-provider'](null, cfg),
  } }, setTimeout: (fn) => { fn(); } });
  await new Promise(setImmediate);
  const card = elements.get('#onboard'), go = elements.get('#ob-go');
  assert.equal(card.hidden, false);
  await go.click();
  assert.equal(card.hidden, false); assert.equal(go.disabled, false);
  assert.match(elements.get('#ob-note').textContent, /brain did not start/);
  assert.doesNotMatch(elements.get('#ob-note').textContent, /Could not save/, 'saved settings are distinguished from failed startup');
  app.setReady(true);
  await go.click();
  assert.equal(card.hidden, true);
});

test('desktop provider settings preserve selected API identity and reject API-key Codex login', async () => {
  const app = onboarding({ installed: true, loggedIn: true, method: 'api-key' }); app.setReady(true);
  const save = app.handlers['urfael:save-provider'];
  const denied = await save(null, { mode: 'chatgpt' });
  assert.equal(denied.ok, false);
  assert.equal(app.settings().URFAEL_PROVIDER, undefined);
  assert.equal(app.files.size, 0);
  const accepted = await save(null, { mode: 'openai-key', key: 'fixture-key', commands: true });
  assert.equal(accepted.ok, true);
  assert.equal(app.settings().URFAEL_PROVIDER, 'openai');
  assert.equal(app.settings().OPENAI_API_KEY, 'fixture-key');
  assert.equal(app.settings().URFAEL_NATIVE_EXEC, '1');
  const status = await app.handlers['urfael:provider-status']();
  assert.equal(status.mode, 'openai-key');
  assert.equal(status.commands, true);
  assert.equal(JSON.stringify(status).includes('fixture-key'), false);
});

test('desktop health rejects HTTP errors and concurrent startup probes launch only one daemon', async () => {
  const healthSource = main.slice(main.indexOf('function healthCheck('), main.indexOf('function spawnDaemon('));
  for (const statusCode of [200, 403, 500]) {
    const context = { SOCK: '/fixture/socket', ipc: { authHeaders: () => ({}) }, http: { request: (_opts, callback) => {
      const req = new EventEmitter(); req.end = () => callback({ statusCode, resume() {} }); return req;
    } } };
    vm.runInNewContext(healthSource, context);
    assert.equal(await context.healthCheck(), statusCode === 200);
  }
  const startupSource = main.slice(main.indexOf('let ensuring = null;'), main.indexOf('let askInFlight'));
  let launches = 0, probes = 0;
  const context = { healthCheck: async () => { probes++; return false; }, spawnDaemon: () => { launches++; }, setTimeout: (fn) => { fn(); } };
  vm.runInNewContext(startupSource, context);
  const first = context.ensureDaemon(), second = context.ensureDaemon();
  assert.equal(first, second);
  assert.deepEqual(await Promise.all([first, second]), [false, false]);
  assert.equal(launches, 1); assert.equal(probes, 21);
});

test('packaged resources include a full vault template that scaffolds without overwriting an existing vault', (t) => {
  const resources = require('../package.json').build.extraResources;
  const template = resources.find((entry) => entry.to === 'vault-template');
  assert.ok(template, 'the desktop bundle must include the first-run vault template');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'urfael-onboarding-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const vault = path.join(root, 'vault');
  const { ensureVault } = require('../persona');
  const result = ensureVault(vault, path.resolve(APP, template.from));
  assert.equal(result.ok, true); assert.equal(result.minimal, undefined);
  assert.ok(fs.existsSync(path.join(vault, 'CLAUDE.md')));
  assert.ok(fs.existsSync(path.join(vault, '_urfael', 'commands', 'job.md')));
  assert.ok(fs.existsSync(path.join(vault, '.claude', 'commands', 'job.md')));
  fs.writeFileSync(path.join(vault, 'CLAUDE.md'), 'Existing user instructions\n');
  assert.equal(ensureVault(vault, path.resolve(APP, template.from)).created, false);
  assert.equal(fs.readFileSync(path.join(vault, 'CLAUDE.md'), 'utf8'), 'Existing user instructions\n');
});
