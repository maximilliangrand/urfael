'use strict';
// Real stdio bridge + private HTTP socket/pipe. Responses are held explicitly;
// no live daemon, credentials or model is used by the transport fixtures.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn, execFileSync } = require('node:child_process');
const ipc = require('../ipc');
const APP = path.join(__dirname, '..');
const WIN = process.platform === 'win32';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(probe, message, timeout = 10000) {
  const end = Date.now() + timeout;
  do { const value = await probe(); if (value) return value; await pause(10); } while (Date.now() < end);
  assert.fail(message);
}

function profile() {
  const root = fs.mkdtempSync(path.join(WIN ? os.tmpdir() : '/tmp', 'urf-acp-'));
  const env = { HOME: root, USERPROFILE: root, TMPDIR: root, TEMP: root, TMP: root,
    URFAEL_STATE_DIR: path.join(root, 'state'), URFAEL_UPDATE_CHECK: '0', URFAEL_HEARTBEAT_MINS: '0',
    PATH: path.dirname(process.execPath) + path.delimiter + (process.env.PATH || process.env.Path || '') };
  for (const key of ['SystemRoot', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT']) if (process.env[key]) env[key] = process.env[key];
  fs.mkdirSync(env.URFAEL_STATE_DIR);
  return { root, env, socket: ipc.daemonSock(env) };
}

function bridge(env) {
  const child = spawn(process.execPath, [path.join(APP, 'acp.js')], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  const frames = []; let buffer = '', errors = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk; let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
      if (line) frames.push(JSON.parse(line));
    }
  });
  child.stderr.on('data', (chunk) => { errors += chunk; });
  child.stdin.on('error', () => {}); // teardown may observe a process already exiting
  let nextId = 0;
  const send = (method, params = {}, notification = false) => {
    const id = notification ? undefined : ++nextId;
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); return id;
  };
  const reply = (id) => until(() => frames.find((frame) => frame.id === id), 'missing ACP reply ' + id + '; stderr: ' + errors);
  const barrier = async () => { const id = send('initialize'); await reply(id); };
  return { child, frames, send, reply, barrier,
    session: async () => (await reply(send('session/new'))).result.sessionId,
    prompt: (sessionId, text) => send('session/prompt', { sessionId, prompt: [{ type: 'text', text }] }),
    async stop() {
      child.stdin.end();
      await until(() => child.exitCode !== null || child.signalCode !== null, 'ACP bridge did not exit after stdin EOF');
      assert.equal(child.exitCode, 0, errors);
    } };
}

async function fixture(t, { shortTimeout = false, headers = true } = {}) {
  const p = profile(), asks = [], requests = [], sockets = new Set();
  if (shortTimeout) {
    const preload = path.join(p.root, 'timeout.cjs');
    fs.writeFileSync(preload, `const h = require('node:http'); const request = h.request; let shortened = false;
h.request = function(options, ...args) {
  if (options.path === '/ask' && !shortened) { shortened = true;
    require('node:assert/strict').equal(options.timeout, 300000);
    options = { ...options, timeout: 100 };
  }
  return request.call(this, options, ...args);
};\n`);
    p.env.NODE_OPTIONS = '--require ' + JSON.stringify(preload);
  }
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const request = { route: req.url, body: JSON.parse(body || '{}'), res };
    requests.push(request);
    if (req.url !== '/ask') { res.end('{"ok":true}'); return; }
    asks.push(request);
    if (headers) { res.writeHead(200, { 'Content-Type': 'application/x-ndjson' }); res.write(JSON.stringify({ kind: 'thinking', delta: 'held' }) + '\n'); }
  });
  server.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(p.socket, resolve); });
  const b = bridge(p.env);
  t.after(async () => {
    try { await b.stop(); }
    finally {
      const closed = new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      for (const socket of sockets) socket.destroy();
      await closed;
      await fs.promises.rm(p.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });
  return { ...p, ...b, asks, requests,
    ask: (index) => until(() => asks[index], 'bridge did not submit prompt ' + index),
    finish: (index, text = 'held answer') => asks[index].res.end(JSON.stringify({ kind: 'done', text }) + '\n'),
  };
}

test('ACP keeps a held prompt single-flight and admits the next only after completion', async (t) => {
  const f = await fixture(t), session = await f.session();
  const first = f.prompt(session, 'first'); await f.ask(0);
  await until(() => f.frames.some((v) => v.method === 'session/update'), 'first prompt did not stream');
  await f.barrier();
  const overlap = await f.reply(f.prompt(session, 'overlap'));
  assert.equal(overlap.error.code, -32603); assert.match(overlap.error.message, /already in flight/);
  assert.equal(f.asks.length, 1); assert.equal(f.frames.some((v) => v.id === first), false);
  f.finish(0); assert.equal((await f.reply(first)).result.stopReason, 'end_turn');
  const next = f.prompt(session, 'next'); await f.ask(1); f.finish(1);
  assert.equal((await f.reply(next)).result.stopReason, 'end_turn');
  assert.notEqual(f.asks[0].body.requestId, f.asks[1].body.requestId);
  assert.equal(f.frames.filter((v) => v.id === first).length, 1);
});

for (const kind of ['disconnect', 'eof', 'timeout', 'before-headers']) {
  test('ACP settles once after ' + kind + ' and the session can recover', async (t) => {
    const f = await fixture(t, { shortTimeout: kind === 'timeout', headers: kind !== 'before-headers' });
    const session = await f.session(), first = f.prompt(session, 'failure');
    const ask = await f.ask(0);
    if (kind === 'disconnect' || kind === 'before-headers') ask.res.destroy();
    else if (kind === 'eof') ask.res.end();
    assert.equal((await f.reply(first)).result.stopReason, 'refusal');
    const next = f.prompt(session, 'recovery'); await f.ask(1);
    await f.barrier();
    assert.equal((await f.reply(f.prompt(session, 'still busy'))).error.code, -32603);
    f.finish(1); assert.equal((await f.reply(next)).result.stopReason, 'end_turn');
    await f.barrier(); assert.equal(f.frames.filter((v) => v.id === first).length, 1);
  });
}

test('ACP refuses HTTP errors and ignores data following the terminal event', async (t) => {
  const f = await fixture(t, { headers: false }), session = await f.session();
  const refused = f.prompt(session, 'unauthorized'); await f.ask(0);
  f.asks[0].res.writeHead(401); f.asks[0].res.end(JSON.stringify({ kind: 'done', text: 'must not succeed' }) + '\n');
  assert.equal((await f.reply(refused)).result.stopReason, 'refusal');
  const good = f.prompt(session, 'unicode'); await f.ask(1);
  const final = Buffer.from(JSON.stringify({ kind: 'done', text: 'café 🎻' }));
  const split = final.indexOf(Buffer.from('🎻')) + 1;
  f.asks[1].res.write(final.subarray(0, split)); f.asks[1].res.end(final.subarray(split));
  assert.equal((await f.reply(good)).result.stopReason, 'end_turn');
  const again = f.prompt(session, 'late data'); await f.ask(2);
  f.asks[2].res.end(JSON.stringify({ kind: 'done', text: 'final' }) + '\n' + JSON.stringify({ kind: 'thinking', delta: 'LEAK' }) + '\n' + JSON.stringify({ kind: 'done', text: 'LEAK' }) + '\n');
  await f.reply(again); await f.barrier();
  assert.ok(f.frames.some((v) => v.params && v.params.update.content && v.params.update.content.text === 'café 🎻'));
  assert.equal(JSON.stringify(f.frames).includes('LEAK'), false);
  assert.equal(f.frames.filter((v) => v.id === again).length, 1);
});

test('ACP cancels only the selected session stream, never the global owner turn', async (t) => {
  const f = await fixture(t), a = await f.session(), b = await f.session(), idle = await f.session();
  const first = f.prompt(a, 'A'), second = f.prompt(b, 'B'); await f.ask(1);
  f.send('session/cancel', { sessionId: 'unknown' }, true);
  f.send('session/cancel', { sessionId: idle }, true); await f.barrier();
  assert.equal(f.frames.some((v) => v.id === first || v.id === second), false);
  f.send('session/cancel', { sessionId: b }, true);
  assert.equal((await f.reply(second)).result.stopReason, 'cancelled');
  await until(() => f.asks[1].res.destroyed, 'cancelled request transport stayed open');
  assert.equal(f.asks[0].res.destroyed, false);
  assert.equal((await f.reply(f.prompt(a, 'overlap'))).error.code, -32603);
  f.finish(0); assert.equal((await f.reply(first)).result.stopReason, 'end_turn');
  const recovered = f.prompt(b, 'B recovered'); await f.ask(2); f.finish(2); await f.reply(recovered);
  assert.equal(f.requests.some((v) => v.route === '/abort'), false);
});

test('a Session signal owns only its queued turn and is removed on completion', async () => {
  const { Session } = require('../session')({ TURN_TIMEOUT_MS: 30000, deDash: String });
  const session = new Session('sonnet'), sent = [];
  let killed = 0;
  session._ensure = () => { session.proc = { stdin: { write: (line) => sent.push(JSON.parse(line)) }, kill: () => { killed++; } }; };
  const running = session.ask('unrelated current turn');
  const cancelled = new AbortController(), later = new AbortController();
  const queued = session.ask('cancelled before promotion', { signal: cancelled.signal });
  const next = session.ask('next turn', { signal: later.signal });
  cancelled.abort();
  assert.equal(await queued, '(stopped)'); assert.equal(killed, 0);
  assert.equal(session.current.text, 'unrelated current turn');
  assert.deepEqual(session.queue.map((v) => v.text), ['next turn']);
  session._handle({ type: 'result', result: 'first answer' });
  assert.equal(await running, 'first answer'); assert.equal(session.current.text, 'next turn');
  session._handle({ type: 'result', result: 'next answer' });
  assert.equal(await next, 'next answer');
  const final = session.ask('future turn');
  later.abort(); assert.equal(killed, 0); assert.equal(session.current.text, 'future turn');
  session._handle({ type: 'result', result: 'last answer' }); assert.equal(await final, 'last answer');
  assert.equal(await session.ask('already cancelled', { signal: cancelled.signal }), '(stopped)');
  assert.equal(sent.length, 3); assert.equal(session.current, null);
});

test('late output from an aborted provider cannot complete the next Session turn', async () => {
  const { EventEmitter } = require('node:events'), children = [];
  const { Session } = require('../session')({
    spawn: () => { const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
      child.stdin = { write() {} }; child.kill = () => { child.killed = true; }; children.push(child); return child; },
    getOverlay: () => null, pluginMcpArgs: () => [], recordBrainPid() {}, logEvent() {},
    CLAUDE_BIN: 'offline', VAULT: '/unused', MEMDIR_ADD: [], TURN_TIMEOUT_MS: 30000, deDash: String,
    classifyError: () => ({}), sendThinking() {}, sendSay() {},
  });
  const session = new Session('sonnet'), controller = new AbortController();
  const first = session.ask('first', { signal: controller.signal }), next = session.ask('next');
  children[0].stdout.emit('data', Buffer.from('{"type":"result","result":"incomplete old line'));
  controller.abort(); assert.equal(await first, '(stopped)'); assert.equal(children.length, 2);
  children[0].stdout.emit('data', Buffer.from('{"type":"result","result":"stale result"}\n'));
  children[0].stderr.emit('data', Buffer.from('stale failure'));
  assert.equal(session.current.text, 'next'); assert.equal(session.errBuf, '');
  children[1].stdout.emit('data', Buffer.from('{"type":"result","result":"next result"}\n'));
  assert.equal(await next, 'next result'); assert.equal(session.current, null);
});

// Exercise cancellation through the actual serialized daemon, not only a mock
// HTTP server. A private executable speaks the warm CLI protocol and holds named
// turns until a fixture file is released; it never invokes tools or the network.
async function daemonFixture(t) {
  const p = profile(), pending = new Set(), bridges = [];
  const provider = path.join(p.root, 'provider.js'), ledger = path.join(p.root, 'children.jsonl');
  const callsFile = path.join(p.root, 'calls.jsonl'), guard = path.join(p.root, 'guard.cjs');
  const lines = (file) => { try { return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse); } catch (e) { if (e.code === 'ENOENT') return []; throw e; } };
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { if (e.code === 'ESRCH') return false; throw e; } };
  Object.assign(p.env, { URFAEL_VAULT_DIR: 'vault', URFAEL_MEMORY_DIR: 'memory', URFAEL_CLAUDE_BIN: provider, URFAEL_REFS: '1',
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: path.join(p.root, 'git-config') });
  for (const dir of ['vault', 'memory']) fs.mkdirSync(path.join(p.root, dir));
  fs.writeFileSync(p.env.GIT_CONFIG_GLOBAL, '');
  fs.writeFileSync(path.join(p.root, 'vault', 'CLAUDE.md'), 'Offline cancellation fixture.\n');
  execFileSync('git', ['init', '-q', path.join(p.root, 'memory')], { env: p.env, stdio: 'pipe' });
  fs.writeFileSync(provider, `#!/usr/bin/env node
const fs = require('node:fs'), path = require('node:path');
const root = __dirname, out = event => process.stdout.write(JSON.stringify(event)+'\\n');
function answer(message) {
  const marker = (JSON.stringify(message).match(/ACP_TEST_[A-Z_]+/g) || ['ACP_TEST_OTHER']).at(-1);
  fs.appendFileSync(path.join(root,'calls.jsonl'), JSON.stringify({marker,pid:process.pid})+'\\n');
  const finish = () => { const text = 'answer '+marker;
    out({type:'stream_event',event:{type:'content_block_delta',index:0,delta:{type:'text_delta',text}}});
    out({type:'assistant',message:{role:'assistant',content:[{type:'text',text}]}});
    out({type:'result',subtype:'success',is_error:false,result:text,usage:{input_tokens:1,output_tokens:1}});
  };
  if (marker.includes('HOLD')) { const timer = setInterval(()=>{if(fs.existsSync(path.join(root,marker))){clearInterval(timer);finish();}},10); }
  else finish();
}
let buffer=''; process.stdin.setEncoding('utf8'); process.stdin.on('data',chunk=>{buffer+=chunk;let end;
  while((end=buffer.indexOf('\\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(line){const m=JSON.parse(line);if(m.type==='user')answer(m.message);}}
}); process.stdin.on('end',()=>process.exit(0));\n`, { mode: 0o700 });
  fs.writeFileSync(guard, `
const fs=require('node:fs'), cp=require('node:child_process'), net=require('node:net');
const refs=require(${JSON.stringify(path.join(APP, 'refs.js'))}), build=refs.build;
refs.build=async function(text, options){
  if(text==='ACP_TEST_RECALL'){
    fs.writeFileSync(${JSON.stringify(path.join(p.root, 'recall-entered'))},'entered');
    await new Promise(resolve=>{const timer=setInterval(()=>{if(fs.existsSync(${JSON.stringify(path.join(p.root, 'release-recall'))})){clearInterval(timer);resolve();}},10);});
  }
  return build(text,options);
};
const connect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){const o=Array.isArray(args[0])?args[0][0]:args[0];const target=typeof o==='string'?o:o&&o.path;
  if(target!==${JSON.stringify(p.socket)})throw new Error('offline fixture refused external connection');return connect.apply(this,args);};
const spawn=cp.spawn;
cp.spawn=function(command,args,options){
  if(command===${JSON.stringify(provider)}){args=[command,...args];command=process.execPath;}
  if(command===process.execPath)args=['--require',__filename,...args];
  const child=spawn(command,args,options);if(child.pid)fs.appendFileSync(${JSON.stringify(ledger)},JSON.stringify({pid:child.pid})+'\\n');return child;
};\n`);
  const daemon = spawn(process.execPath, ['--require', guard, path.join(APP, 'daemon.js')], { env: p.env, cwd: p.root, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; daemon.stdout.on('data', (d) => { output += d; }); daemon.stderr.on('data', (d) => { output += d; });
  function request(route, body, method = 'POST') {
    let req;
    const result = new Promise((resolve) => {
      req = http.request({ socketPath: p.socket, method, path: route, headers: ipc.authHeaders(p.env), timeout: 10000 }, (res) => {
        let raw = ''; res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => { let json; try { json = JSON.parse(raw); } catch { try { json = JSON.parse(raw.trim().split('\n').at(-1)); } catch {} } resolve({ code: res.statusCode, json, raw }); });
        res.on('error', (e) => resolve({ code: 0, error: e.message }));
      });
      req.on('error', (e) => resolve({ code: 0, error: e.message }));
      req.on('timeout', () => req.destroy(new Error('isolated request timeout')));
      req.end(body === undefined ? undefined : JSON.stringify(body)); pending.add(req);
    }).finally(() => pending.delete(req));
    return { result, req };
  }
  const call = (route, body, method) => request(route, body, method).result;
  t.after(async () => {
    let bridgeError;
    try { for (const b of bridges) await b.stop(); } catch (e) { bridgeError = e; }
    finally {
      for (const req of pending) req.destroy();
      await call('/shutdown');
      await until(() => daemon.exitCode !== null || daemon.signalCode !== null, 'private daemon did not exit: ' + output);
      await until(() => { const before = lines(ledger); return before.every((p) => !alive(p.pid)) && before.length === lines(ledger).length; }, 'private daemon descendants did not exit: ' + output);
      await fs.promises.rm(p.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
    if (bridgeError) throw bridgeError;
  });
  await until(async () => (await call('/health', undefined, 'GET')).json?.ok, 'private daemon did not become healthy: ' + output);
  return { ...p, call, request, calls: () => lines(callsFile), alive,
    started: (marker) => until(() => lines(callsFile).find((v) => v.marker === marker), 'offline provider never received ' + marker + ': ' + output),
    release: (marker) => fs.writeFileSync(path.join(p.root, marker), 'release'),
    bridge: () => { const b = bridge(p.env); bridges.push(b); return b; },
  };
}

test('real daemon isolates active, queued, disconnected and unrelated owner cancellation', { timeout: 30000 }, async (t) => {
  const f = await daemonFixture(t);
  const ownerMarker = 'ACP_TEST_OWNER_HOLD', owner = f.request('/ask', { text: ownerMarker });
  const ownerCall = await f.started(ownerMarker);
  assert.equal((await f.call('/abort', { requestId: 'unknown' })).code, 404);
  assert.equal((await f.call('/abort', { requestId: 'unknown', channel: 'telegram' })).code, 403);
  assert.equal((await f.call('/ask', { requestId: 'remote', channel: 'telegram', text: 'ACP_TEST_REMOTE' })).code, 403);
  assert.equal(f.alive(ownerCall.pid), true);

  // The first successful scoped cancellation proves admission happened while the
  // unrelated owner turn is still held. A 404 only means its body is still in
  // transit; at most one cancellation is accepted and no global abort is used.
  const queued = f.request('/ask', { text: 'ACP_TEST_QUEUED', requestId: 'queued' });
  await until(async () => (await f.call('/abort', { requestId: 'queued' })).code === 200, 'queued request was not admitted');
  assert.equal((await queued.result).json.aborted, true);
  assert.equal(f.alive(ownerCall.pid), true);
  assert.equal((await f.call('/abort', { requestId: 'queued' })).code, 404);

  const b = f.bridge(), session = await b.session();
  const editor = b.prompt(session, 'ACP_TEST_EDITOR_QUEUED');
  await b.barrier(); b.send('session/cancel', { sessionId: session }, true);
  assert.equal((await b.reply(editor)).result.stopReason, 'cancelled');
  assert.equal(f.alive(ownerCall.pid), true);
  f.release(ownerMarker); assert.match((await owner.result).raw, /answer ACP_TEST_OWNER_HOLD/);
  const recovered = b.prompt(session, 'ACP_TEST_RECOVERED');
  assert.equal((await b.reply(recovered)).result.stopReason, 'end_turn');
  assert.equal(f.calls().some((v) => v.marker === 'ACP_TEST_QUEUED' || v.marker === 'ACP_TEST_EDITOR_QUEUED'), false);

  const marker = 'ACP_TEST_SCOPED_HOLD', active = f.request('/ask', { text: marker, requestId: 'active' });
  const activeCall = await f.started(marker);
  const chatId = (await f.call('/chat', { model: 'sonnet' })).json.chatId;
  const otherChat = f.request('/chat/' + chatId + '/ask', { text: 'ACP_TEST_CHAT_HOLD' });
  const otherChatCall = await f.started('ACP_TEST_CHAT_HOLD');
  assert.notEqual(otherChatCall.pid, activeCall.pid);
  assert.equal((await f.call('/ask', { text: 'ACP_TEST_DUPLICATE', requestId: 'active' })).code, 409);
  assert.equal((await f.call('/abort', { requestId: 'active', channel: 'telegram' })).code, 403);
  assert.equal(f.alive(activeCall.pid), true);
  assert.equal((await f.call('/abort', { requestId: 'active' })).json.ok, true);
  assert.equal((await active.result).json.aborted, true);
  await until(() => !f.alive(activeCall.pid), 'scoped cancellation left the provider alive');
  assert.equal(f.alive(otherChatCall.pid), true, 'scoped cancellation killed an unrelated chat');
  f.release('ACP_TEST_CHAT_HOLD');
  assert.match((await otherChat.result).raw, /answer ACP_TEST_CHAT_HOLD/);
  assert.equal((await f.call('/abort', { requestId: 'active' })).code, 404);
  assert.match((await f.call('/ask', { text: 'ACP_TEST_REUSED', requestId: 'active' })).raw, /answer ACP_TEST_REUSED/);

  const disconnected = f.request('/ask', { text: 'ACP_TEST_DISCONNECT_HOLD', requestId: 'disconnect' });
  const disconnectedCall = await f.started('ACP_TEST_DISCONNECT_HOLD'); disconnected.req.destroy();
  await until(() => !f.alive(disconnectedCall.pid), 'disconnect left the provider alive');
  assert.equal((await f.call('/abort', { requestId: 'disconnect' })).code, 404);
  assert.match((await f.call('/ask', { text: 'ACP_TEST_AFTER_DISCONNECT' })).raw, /answer ACP_TEST_AFTER_DISCONNECT/);

  const recall = f.request('/ask', { text: 'ACP_TEST_RECALL', requestId: 'recall' });
  await until(() => fs.existsSync(path.join(f.root, 'recall-entered')), 'recall did not reach its asynchronous handoff');
  assert.equal((await f.call('/abort', { requestId: 'recall' })).json.ok, true);
  fs.writeFileSync(path.join(f.root, 'release-recall'), 'release');
  assert.equal((await recall.result).json.aborted, true);
  assert.equal(f.calls().some((v) => v.marker === 'ACP_TEST_RECALL'), false, 'cancelled recall must not launch a provider or fallback');

  const legacy = f.request('/ask', { text: 'ACP_TEST_LEGACY_HOLD' }); await f.started('ACP_TEST_LEGACY_HOLD');
  assert.equal((await f.call('/abort')).json.ok, true);
  assert.equal((await legacy.result).json.aborted, true);
  assert.equal(f.calls().some((v) => v.marker === 'ACP_TEST_DUPLICATE' || v.marker === 'ACP_TEST_REMOTE'), false);
});
