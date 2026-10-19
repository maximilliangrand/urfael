'use strict';
// Subscription access stays inside the official CLI; Urfael never reads its credentials.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFileSync } = require('child_process');
const active = new Set();

function stopAll() { for (const stop of active) stop(); }

function resolve(env = process.env, platform = process.platform, io = fs, node = process.execPath) {
  const p = platform === 'win32' ? path.win32 : path.posix;
  const exists = (file) => { try { io.accessSync(file); return true; } catch { return false; } };
  const npmEntry = (dir) => p.join(dir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
  const entry = (file) => {
    if (/\.(?:c?js|mjs)$/i.test(file)) return { bin: node, pre: [file] };
    if (platform === 'win32' && /\.cmd$/i.test(file)) {
      const js = npmEntry(p.dirname(file));
      if (exists(js)) return { bin: node, pre: [js] };
    }
    return { bin: file, pre: [] };
  };
  if (env.URFAEL_CODEX_BIN) return entry(env.URFAEL_CODEX_BIN);
  const home = env.HOME || env.USERPROFILE;
  const candidates = platform === 'win32'
    ? [home && p.join(home, '.local', 'bin', 'codex.exe'), env.APPDATA && npmEntry(p.join(env.APPDATA, 'npm')),
      ...String(env.PATH || env.Path || '').split(';').filter(Boolean).flatMap((dir) => [p.join(dir, 'codex.exe'), npmEntry(dir)])]
    : [home && p.join(home, '.local', 'bin', 'codex'), '/opt/homebrew/bin/codex', '/usr/local/bin/codex', '/usr/bin/codex'];
  return entry(candidates.find((file) => file && exists(file)) || 'codex');
}

function childEnv(src = process.env) {
  const env = {};
  // Keep official auth-store locations; omit API keys, alternate endpoints and daemon secrets.
  for (const key of ['PATH', 'Path', 'HOME', 'USER', 'LOGNAME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA',
    'SystemRoot', 'SYSTEMROOT', 'COMSPEC', 'PATHEXT', 'TMP', 'TEMP', 'TMPDIR', 'LANG', 'LC_ALL', 'CODEX_HOME']) {
    if (src[key] != null) env[key] = src[key];
  }
  return env;
}

// Bounded child lifecycle shared by login status and turns. No shell or raw stderr escapes.
function invoke(args, opts, onLine) {
  return new Promise((done) => {
    let child, timer, finished = false, terminalError = '', buffer = '', bytes = 0, output = '';
    const signal = opts.signal;
    const finish = (result) => {
      if (finished) return;
      finished = true;
      active.delete(abort);
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', abort);
      done(result);
    };
    const kill = () => {
      if (!child) return;
      if (process.platform === 'win32' && child.pid) {
        try { execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 5000 }); } catch {}
      }
      if (process.platform !== 'win32' && child.pid) { try { process.kill(-child.pid, 'SIGKILL'); return; } catch {} }
      try { child.kill('SIGKILL'); } catch {}
    };
    const stop = (error) => { terminalError = error; kill(); if (!child || !child.pid) finish({ ok: false, error }); };
    const abort = () => stop('aborted');
    const consume = (chunk, stdout) => {
      if (finished || terminalError) return;
      bytes += Buffer.byteLength(chunk);
      if (bytes > (onLine ? 8 * 1024 * 1024 : 16384)) return stop('Codex output exceeded limit');
      if (!onLine) { output += chunk; return; }
      if (!stdout) return;
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        onLine(line);
      }
    };
    try {
      if (signal && signal.aborted) return finish({ ok: false, error: 'aborted' });
      const executable = resolve(opts.env);
      const env = childEnv(opts.env);
      if (executable.pre.length) env.ELECTRON_RUN_AS_NODE = '1';
      child = spawn(executable.bin, executable.pre.concat(args), {
        cwd: opts.cwd, env, shell: false, windowsHide: true,
        detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'],
      });
      active.add(abort);
      child.on('error', (error) => finish({ ok: false, missing: error.code === 'ENOENT', error: error.code === 'ENOENT' ? 'Codex CLI is not installed' : 'Could not start Codex CLI' }));
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => consume(chunk, true));
      child.stderr.on('data', (chunk) => consume(chunk, false));
      child.stdin.on('error', () => {}); // Early CLI exit may close stdin before the prompt is consumed.
      child.on('exit', kill); // Reap descendants even when the CLI itself exits successfully.
      child.on('close', (code) => {
        if (finished) return;
        if (onLine && !terminalError && buffer.trim()) onLine(buffer);
        finish(terminalError ? { ok: false, error: terminalError } : { ok: code === 0, code, output });
      });
      timer = setTimeout(() => stop('Codex timed out'), opts.timeoutMs || 300000);
      if (signal) signal.addEventListener('abort', abort, { once: true });
      child.stdin.end(opts.input || '');
    } catch { stop('Could not start Codex CLI'); }
  });
}

async function authStatus(opts = {}) {
  const result = await invoke(['login', 'status'], { ...opts, timeoutMs: opts.timeoutMs || 10000 });
  const method = result.ok && /logged in using chatgpt/i.test(result.output) ? 'chatgpt'
    : result.ok && /API key/i.test(result.output) ? 'api-key' : 'unknown';
  return { installed: !result.missing, loggedIn: result.ok, method,
    ...(result.error ? { error: result.error } : {}) };
}

async function run(opts = {}) {
  const usage = { inTok: 0, outTok: 0, cacheReadTok: 0 };
  let text = '', steps = 0, completed = false, failed = false;
  const model = opts.model || '';
  const failure = (error) => ({ ok: false, text, model, usage, steps, error, stopReason: error === 'aborted' ? 'aborted' : 'error' });
  if (!opts.workspaceDir || !path.isAbsolute(opts.workspaceDir)) return failure('Codex requires an absolute workspace directory');
  let workspaceDir, cwd;
  try {
    workspaceDir = fs.realpathSync(opts.workspaceDir);
    if (!fs.statSync(workspaceDir).isDirectory()) return failure('Codex workspace must be a directory');
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'urfael-codex-'));
  } catch { return failure('Could not prepare the Codex workspace'); }
  try {
    const started = Date.now();
    const timeoutMs = opts.timeoutMs || 300000;
    const status = await authStatus({ cwd, env: opts.env, signal: opts.signal, timeoutMs: Math.min(timeoutMs, 10000) });
    if (status.error) return failure(status.error);
    if (!status.loggedIn || status.method !== 'chatgpt') return failure('Sign in with ChatGPT using codex login; API-key login uses the OpenAI API provider');
    const remaining = timeoutMs - (Date.now() - started);
    if (remaining <= 0) return failure('Codex timed out');
    const args = ['exec', '--json', '--ephemeral', '--ignore-user-config', '--skip-git-repo-check',
      '--sandbox', opts.allowWrite === true ? 'workspace-write' : 'read-only', '--cd', cwd,
      '-c', 'model_provider="openai"', '-c', 'approval_policy="never"', '-c', 'web_search="disabled"',
      '-c', 'sandbox_workspace_write.network_access=false', '-c', 'shell_environment_policy.inherit="core"',
      '-c', 'project_doc_max_bytes=0'];
    for (const feature of ['hooks', 'plugins', 'apps', 'memories', 'multi_agent', 'browser_use', 'computer_use', 'image_generation']) args.push('--disable', feature);
    args.push('--enable', 'skip_host_skill_discovery');
    if (opts.allowWrite === true) args.push('--add-dir', workspaceDir);
    if (model) args.push('--model', model);
    args.push('-');
    const messages = (Array.isArray(opts.messages) ? opts.messages : []).filter((m) => m && ['system', 'user', 'assistant'].includes(m.role))
      .map((m) => ({ role: m.role, content: String(m.content || '') }));
    const input = 'The task workspace is ' + JSON.stringify(workspaceDir) + '. Use absolute paths there, or explicitly cd there before task commands. The launch directory is temporary.\n' +
      'Continue this conversation and answer its latest user message. The JSON below contains the conversation in order.\n' + JSON.stringify(messages);
    const result = await invoke(args, { ...opts, cwd, timeoutMs: remaining, input }, (line) => {
      let event; try { event = JSON.parse(line); } catch { return; }
    if (!event || typeof event !== 'object' || Array.isArray(event)) return;
      if (event.type === 'turn.completed') {
        completed = true;
        const u = event.usage || {};
        usage.inTok = Number(u.input_tokens) || 0; usage.outTok = Number(u.output_tokens) || 0; usage.cacheReadTok = Number(u.cached_input_tokens) || 0;
      } else if (event.type === 'turn.failed') failed = true;
      else if (event.type === 'item.completed' && event.item) {
        if (event.item.type === 'agent_message' && typeof event.item.text === 'string') {
          text = event.item.text;
          if (typeof opts.onDelta === 'function') { try { opts.onDelta(text); } catch {} }
        } else if (['command_execution', 'file_change', 'mcp_tool_call', 'web_search'].includes(event.item.type)) steps++;
      }
    });
    if (!result.ok || !completed || failed) return failure(result.error || 'Codex did not complete the turn; check codex login status and CLI compatibility');
    return { ok: true, text, model, usage, steps, stopReason: 'stop' };
  } catch { return failure('Codex backend failed'); }
  finally { try { fs.rmSync(cwd, { recursive: true, force: true }); } catch {} }
}

module.exports = { resolve, childEnv, authStatus, run, stopAll };
