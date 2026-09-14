'use strict';
// Exercise the actual multipart HTTP path with an owned local server and temporary audio files.
// Only ffmpeg conversion is replaced, so these regressions need no codec install, model or microphone.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const vm = require('vm');

async function fixture(t, handler) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'urfael-stt-'));
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../voice'), 'utf8'), {
    module, process, Buffer, URL,
    require: (name) => name === 'os' ? { ...os, tmpdir: () => dir }
      : name === 'child_process' ? { execFile: (_cmd, args, _opts, cb) => {
        assert.deepEqual(Array.from(args.slice(-5, -1)), ['-ar', '16000', '-ac', '1']);
        fs.writeFileSync(args.at(-1), 'RIFF-synthetic-normalized-audio');
        setImmediate(() => cb(null, '', ''));
      } } : require(name),
  }, { filename: require.resolve('../voice') });
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return {
    transcribe: () => module.exports.transcribe(Buffer.from('synthetic input audio'), { sttPort: server.address().port }),
    assertClean: () => assert.deepEqual(fs.readdirSync(dir), [], 'success and failure both remove temporary audio'),
  };
}

test('transcribe requests JSON multipart audio and accepts a string transcript, including silence', async (t) => {
  let calls = 0;
  const f = await fixture(t, (req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      assert.equal(req.method, 'POST'); assert.equal(req.url, '/inference');
      assert.match(req.headers['content-type'], /^multipart\/form-data; boundary=/);
      assert.match(body, /name="file"; filename="a.wav"/);
      assert.match(body, /RIFF-synthetic-normalized-audio/);
      assert.match(body, /name="response_format"\r\n\r\njson/);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ text: calls++ ? '' : '  A real transcript.\n' }));
    });
  });
  assert.equal(await f.transcribe(), 'A real transcript.'); f.assertClean();
  assert.equal(await f.transcribe(), ''); f.assertClean();
});

test('transcribe preserves a UTF-8 codepoint split across actual HTTP response chunks', async (t) => {
  const text = 'Grüße aus Wien — café.';
  const bytes = Buffer.from(JSON.stringify({ text }));
  const split = bytes.indexOf(Buffer.from('ü')) + 1; // split between the two bytes of ü
  const f = await fixture(t, (req, res) => {
    req.resume(); res.writeHead(200, { 'content-type': 'application/json' });
    res.write(bytes.subarray(0, split));
    setTimeout(() => res.end(bytes.subarray(split)), 30);
  });
  assert.equal(await f.transcribe(), text);
  f.assertClean();
});

test('transcribe rejects non-success HTTP statuses even when the body contains text', async (t) => {
  for (const status of [301, 400, 503]) await t.test('HTTP ' + status, async (st) => {
    const f = await fixture(st, (req, res) => {
      req.resume(); res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ text: 'This is an error response, not user speech.' }));
    });
    await assert.rejects(f.transcribe, new RegExp('Local STT unavailable.*HTTP ' + status));
    f.assertClean();
  });
});

test('transcribe rejects malformed JSON and missing or non-string transcript fields', async (t) => {
  for (const body of ['not JSON', '{', 'null', '[]', '{}', '{"error":"decoder unavailable"}', '{"text":42}', '{"text":null}']) {
    await t.test(body, async (st) => {
      const f = await fixture(st, (req, res) => { req.resume(); res.writeHead(200); res.end(body); });
      await assert.rejects(f.transcribe, /Local STT unavailable.*(?:invalid JSON|missing transcript text)/);
      f.assertClean();
    });
  }
});

test('transcribe rejects connection errors and interrupted response bodies', async (t) => {
  for (const afterHeaders of [false, true]) await t.test(afterHeaders ? 'interrupted response' : 'request error', async (st) => {
    const f = await fixture(st, (req, res) => {
      req.resume();
      if (afterHeaders) { res.writeHead(200, { 'content-type': 'application/json' }); res.write('{"text":'); setImmediate(() => res.destroy()); }
      else req.socket.destroy();
    });
    await assert.rejects(f.transcribe, /Local STT unavailable/);
    f.assertClean();
  });
});
