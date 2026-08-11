'use strict';
// Live tests for the webhook receiver's two front-door gates (app/hooks.js), both of which were wrong in ways that
// only show up once the surface is actually deployed the way its own documentation deploys it — behind a tunnel:
//   1. The Host gate hard-required 127.0.0.1/localhost. cloudflared and `ssh -R` forward the ORIGINAL Host, so the
//      documented happy path returned a bare, bodyless 400 on every request, correct secret or not.
//   2. The rate limit keyed on req.socket.remoteAddress, which is 127.0.0.1 for EVERY tunnelled request — one shared
//      bucket that any unauthenticated stranger could drain, 429'ing every legitimate hook (dashboard.js and
//      openai-api.js each fixed this same bug and said so in a comment; this surface never got it).
// Env must be set BEFORE the require: the allowlist and the daemon socket path are read at module load. The state dir
// is pointed at a temp path so daemonFire can never reach a real daemon on the developer's machine.
const os = require('os');
const path = require('path');
const fs = require('fs');
process.env.URFAEL_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'urfael-hooks-'));
process.env.URFAEL_HOOKS_ALLOWED_HOSTS = 'hooks.example.com, Tunnel.Example.NET';

const { test } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const hooks = require('../hooks');

const HOOK_A = '/hook/hk_aaaaaaaaaaaa';
const HOOK_B = '/hook/hk_bbbbbbbbbbbb';

function listen() {
  return new Promise((resolve) => hooks.server.listen(0, '127.0.0.1', () => resolve(hooks.server.address().port)));
}
function post(port, p, host) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: p, headers: { Host: host, 'Content-Length': 2 }, timeout: 5000 },
      (res) => { let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => resolve({ status: res.statusCode, body: b })); });
    req.on('error', () => resolve({ status: 0, body: '' }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '' }); });
    req.end('{}');
  });
}

test('the Host gate accepts loopback AND the owner-allowlisted tunnel hostnames, and explains a refusal', async (t) => {
  const port = await listen();
  t.after(() => new Promise((r) => hooks.server.close(r)));

  for (const host of ['127.0.0.1', 'localhost', 'hooks.example.com', 'tunnel.example.net', 'HOOKS.EXAMPLE.COM']) {
    const r = await post(port, HOOK_A, host);
    assert.notEqual(r.status, 400, 'Host ' + host + ' must reach the hook route, not a bare 400');
  }
  const bad = await post(port, HOOK_A, 'attacker.example');
  assert.equal(bad.status, 400, 'a Host nobody allowlisted is still refused (anti-DNS-rebinding)');
  assert.match(bad.body, /URFAEL_HOOKS_ALLOWED_HOSTS/, 'the 400 says how to fix it instead of being bodyless');
});

test('the rate limit is PER HOOK: flooding one hook cannot lock the owner out of the others', async (t) => {
  const port = await listen();
  t.after(() => new Promise((r) => hooks.server.close(r)));

  // 404 noise must not spend anyone's budget — it never matches a hook route.
  for (let i = 0; i < 200; i++) await post(port, '/not-a-hook', 'hooks.example.com');

  let limited = 0;
  for (let i = 0; i < 200; i++) { const r = await post(port, HOOK_A, 'hooks.example.com'); if (r.status === 429) limited++; }
  assert.ok(limited > 0, 'the flood is eventually rate limited (the bucket still works)');

  const other = await post(port, HOOK_B, 'hooks.example.com');
  assert.notEqual(other.status, 429, 'a DIFFERENT hook keeps its own budget — no shared-bucket lockout');
});
