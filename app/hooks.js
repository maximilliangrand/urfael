'use strict';
// Urfael webhook receiver — a LOOPBACK-ONLY (127.0.0.1) front that lets external events trigger the brain
// WITHOUT ever opening a port on the daemon (the daemon stays a unix socket — the no-inbound-port moat holds).
// OFF by default; started explicitly with `urfael hooks`. Each hook authenticates with its own 256-bit secret,
// which THIS process never stores or validates: it forwards (secret, payload) to the daemon over the socket, and
// the daemon checks the secret CONSTANT-TIME against the hashed registry and runs the sandboxed action. To accept
// events from the public internet, point YOUR OWN tunnel (cloudflared / ngrok / `ssh -R`) at this port — nothing
// is ever exposed on your behalf. Mirrors the dashboard's loopback hardening (Host gate, rate limit, body cap) —
// with the two differences a tunnelled surface forces: the Host allowlist is extensible (URFAEL_HOOKS_ALLOWED_HOSTS,
// because a tunnel forwards its own hostname), and the rate limit is keyed per HOOK, because every request through a
// tunnel shares remoteAddress 127.0.0.1 and a shared bucket is an unauthenticated lockout of the whole feature.
//   node app/hooks.js        (or `urfael hooks`)
const http = require('http');
const os = require('os');
const path = require('path');

const HOST = '127.0.0.1';                                                       // loopback ONLY — never 0.0.0.0 / LAN
const PORT = Math.min(Math.max(parseInt(process.env.URFAEL_HOOKS_PORT, 10) || 7718, 1), 65535);
const ipc = require('./ipc');
const SOCK = ipc.daemonSock();   // 0600 unix socket on POSIX; per-user named pipe + token on native Windows (see app/ipc.js)
const MAX_BODY = 65536;                                                         // 64KB payload cap

// PER-HOOK token bucket. It used to key on req.socket.remoteAddress, which is 127.0.0.1 for EVERY request that
// arrives through the tunnel this receiver is designed to sit behind — one shared bucket that any unauthenticated
// stranger could drain, 429'ing every legitimate CI/payment/monitoring hook. (dashboard.js and openai-api.js hit the
// same trap and fixed it by limiting authenticated traffic only; this process holds no secrets, so it cannot
// authenticate — keying on the hook id is the equivalent containment.) A flood can now only starve the ONE hook whose
// URL the attacker already has; every other hook keeps its own budget, and requests that match no hook route never
// touch a bucket at all. Generous, to not throttle legitimate bursts.
class Bucket { constructor(cap, perMin) { this.cap = cap; this.tok = cap; this.rate = perMin / 60000; this.last = Date.now(); }
  take() { const n = Date.now(); this.tok = Math.min(this.cap, this.tok + (n - this.last) * this.rate); this.last = n; if (this.tok >= 1) { this.tok -= 1; return true; } return false; } }
const buckets = new Map();
function rateOk(key) {
  let b = buckets.get(key); if (!b) { b = new Bucket(120, 600); buckets.set(key, b); }          // 120 burst, ~600/min/hook
  if (buckets.size > 1024) for (const k of buckets.keys()) { buckets.delete(k); if (buckets.size <= 512) break; }
  return b.take();
}

// Anti-DNS-rebinding Host gate. The dashboard and the OpenAI-compatible API are for the owner's own browser/client
// and can hard-require a loopback Host — but this receiver's documented deployment (docs/HOOKS.md) is behind the
// owner's OWN tunnel, and cloudflared / `ssh -R` forward the ORIGINAL Host by default (ngrok needs
// --host-header=rewrite). A loopback-only gate therefore 400s every request the documented setup produces. So:
// loopback is always allowed, and the owner names their tunnel hostname(s) explicitly. Still an ALLOWLIST — a
// rebinding attacker's own domain is not on it — and still no wildcard.
const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost'].concat(
  String(process.env.URFAEL_HOOKS_ALLOWED_HOSTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)));
const warnedHosts = new Set();   // one stderr line per distinct rejected Host (bounded), so a flood can't spam the log
function hostOk(host) {
  if (ALLOWED_HOSTS.has(host)) return true;
  if (warnedHosts.size < 32 && !warnedHosts.has(host)) {
    warnedHosts.add(host);
    process.stderr.write('urfael hooks: refused Host "' + host + '" — add it with URFAEL_HOOKS_ALLOWED_HOSTS=' + host + ' (see docs/HOOKS.md)\n');
  }
  return false;
}

// bounded body reader: resolves null past the cap (the handler 413s) so a huge POST can't balloon memory.
function readBody(req) {
  return new Promise((resolve) => { let b = '', over = false;
    req.on('data', (c) => { if (over) return; b += c; if (b.length > MAX_BODY) { over = true; try { req.destroy(); } catch {} resolve(null); } });
    req.on('end', () => { if (!over) resolve(b); }); req.on('error', () => resolve(null)); });
}

// forward a fire to the daemon over the unix socket. The daemon does the constant-time secret check + dispatch.
function daemonFire(id, secret, payload) {
  return new Promise((resolve) => {
    const data = JSON.stringify({ secret, payload });
    const r = http.request({ socketPath: SOCK, method: 'POST', path: '/hook/' + id, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...ipc.authHeaders() }, timeout: 20000 }, (res) => {
      let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => resolve({ status: res.statusCode || 502, body: b }));
    });
    r.on('error', () => resolve({ status: 502, body: '{"error":"daemon unreachable"}' }));
    r.on('timeout', () => { r.destroy(); resolve({ status: 504, body: '{"error":"timeout"}' }); });
    r.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  // anti-DNS-rebinding: only answer to loopback or a Host the OWNER allowlisted (their tunnel hostname).
  const host = (req.headers.host || '').split(':')[0].toLowerCase();
  if (!hostOk(host)) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end('{"error":"host not allowed — set URFAEL_HOOKS_ALLOWED_HOSTS to your tunnel hostname (docs/HOOKS.md)"}'); return; }

  let u; try { u = new URL(req.url, 'http://127.0.0.1'); } catch { res.writeHead(400); res.end(); return; }
  const m = u.pathname.match(/^\/hook\/(hk_[0-9a-f]{12})$/);                    // the ONLY route; no fs mapping ever
  if (req.method !== 'POST' || !m) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"error":"not found"}'); return; }
  // rate limit AFTER the route match, keyed on the hook id — see the Bucket comment: an ip key is one shared bucket
  // on a surface where every request looks like 127.0.0.1, so any stranger could lock the owner out of every hook.
  if (!rateOk(m[1])) { res.writeHead(429, { 'Content-Type': 'text/plain' }); res.end('slow down'); return; }

  // secret rides in a header (preferred) or ?secret= (for senders that can't set headers). The daemon validates it.
  const hdr = req.headers['x-urfael-hook'];
  const secret = (typeof hdr === 'string' && hdr) || u.searchParams.get('secret') || '';
  const payload = await readBody(req);
  if (payload === null) { res.writeHead(413, { 'Content-Type': 'application/json' }); res.end('{"error":"payload too large"}'); return; }

  const out = await daemonFire(m[1], String(secret), payload);
  res.writeHead(out.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(out.body || '{}');
});

server.on('error', (e) => { process.stderr.write('urfael hooks: cannot bind ' + HOST + ':' + PORT + ' — ' + ((e && e.message) || e) + '\n'); process.exit(1); });

if (require.main === module) {
  server.listen(PORT, HOST, () => { process.stdout.write('Urfael webhook receiver on http://' + HOST + ':' + PORT + '  (loopback only — tunnel to it for external events)\n'); });
  process.on('SIGTERM', () => process.exit(0));
  process.on('SIGINT', () => process.exit(0));
}
module.exports = { server, daemonFire };
