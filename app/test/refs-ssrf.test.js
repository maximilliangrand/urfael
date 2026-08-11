'use strict';
// SSRF regression for the @url reference fetcher and the shared resolve-and-vet helper.
// Before the fix, refs.validateUrl() (a LITERAL isPrivateHost check) was the ONLY guard on this egress path and
// defaultFetch handed the raw hostname to https.request — so `https://169.254.169.254.nip.io/` and
// `https://127.0.0.1.nip.io/x` were accepted, because the HOSTNAME is public-looking and only its A record points at
// cloud metadata / loopback. skillhub.fetchMd and the plugin egress broker already resolved-and-pinned; @url and the
// relay reply sender did not. The resolver is injectable, so this test never touches the network.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const refs = require('../refs');
const lib = require('../lib');

const PRIVATE = ['169.254.169.254', '127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.9.9', '100.64.0.1', '::1', 'fd00::1'];

test('resolveAndVetHost refuses a public NAME that resolves to a private ip, and pins the vetted ip otherwise', async () => {
  for (const ip of PRIVATE) {
    const r = await lib.resolveAndVetHost('totally-public.example', async () => [ip]);
    assert.equal(r.ok, false, 'name → ' + ip + ' must be refused');
    assert.match(r.reason, /private\/loopback ip \(SSRF\)/);
  }
  const mixed = await lib.resolveAndVetHost('x.example', async () => ['93.184.216.34', '127.0.0.1']);
  assert.equal(mixed.ok, false, 'ONE private ip in a mixed answer refuses the whole set');
  const empty = await lib.resolveAndVetHost('nx.example', async () => []);
  assert.equal(empty.ok, false, 'an unresolvable host is fail-closed');
  assert.match(empty.reason, /could not resolve host/);
  const threw = await lib.resolveAndVetHost('boom.example', async () => { throw new Error('dns down'); });
  assert.equal(threw.ok, false, 'a throwing resolver is fail-closed, never a pass');
  const good = await lib.resolveAndVetHost('public.example', async () => ['93.184.216.34']);
  assert.deepEqual(good, { ok: true, ip: '93.184.216.34' }, 'a public answer returns the ip to pin the socket to');
});

test('@url: a nip.io-style name whose A record is cloud metadata / loopback never opens a socket', async () => {
  for (const [host, ip] of [['169.254.169.254.nip.io', '169.254.169.254'], ['127.0.0.1.nip.io', '127.0.0.1']]) {
    // validateUrl is the LITERAL wall and, by design, cannot see through a name — documented, and asserted here so
    // nobody "fixes" the wrong layer.
    assert.equal(refs.validateUrl('https://' + host + '/x').ok, true, 'the literal wall cannot judge a name');
    const r = await refs.defaultFetch('https://' + host + '/x', { resolveHost: async () => [ip] }, 0);
    assert.equal(r.ok, false, host + ' must be refused before any socket opens');
    assert.match(r.reason, /private\/loopback ip \(SSRF\)/);
  }
});

test('@url: an unresolvable host is refused fail-closed rather than handed to the resolver twice', async () => {
  const r = await refs.defaultFetch('https://nx.example/x', { resolveHost: async () => [] }, 0);
  assert.equal(r.ok, false);
  assert.match(r.reason, /could not resolve host/);
});

test('@url: a literal private host still short-circuits before DNS is consulted', async () => {
  let resolverCalled = false;
  const r = await refs.defaultFetch('https://169.254.169.254/latest/meta-data/', { resolveHost: async () => { resolverCalled = true; return ['93.184.216.34']; } }, 0);
  assert.equal(r.ok, false);
  assert.match(r.reason, /private\/loopback host refused \(SSRF\)/);
  assert.equal(resolverCalled, false, 'the literal wall runs first, so no lookup is even attempted');
});

// The relay reply sender lives inside daemon.js (not requirable — it starts a daemon), so its half of the same fix is
// asserted against the source: it must resolve-and-vet and PIN, not hand the hostname straight to http.request.
test('the relay reply sender (daemon postReply) resolves-and-pins, exactly like the skill-hub fetcher', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'daemon.js'), 'utf8');
  const block = src.slice(src.indexOf('function postReply('), src.indexOf('function afterCron('));
  assert.match(block, /resolveAndVetHost\(u\.hostname\)/, 'postReply resolves the hostname');
  assert.match(block, /host: vet\.ip, servername: u\.hostname/, 'and pins the socket to the vetted ip');
  assert.doesNotMatch(block, /hostname: u\.hostname/, 'it must NOT connect by name after vetting (that is the rebind gap)');
});
