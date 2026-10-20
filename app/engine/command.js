'use strict';
// Owner-enabled HOST execution. cwd and a minimal environment are conveniences, not an OS sandbox.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');

// Windows needs Job Objects to retain ownership after a shell exits; taskkill /T alone is insufficient.
const COMMAND_SUPPORTED = process.platform !== 'win32';
const MAX_COMMAND_BYTES = 4096;
const MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_TIMEOUT_MS = 60000;
const activeCommands = new Set();

// The daemon calls this before graceful shutdown; each abort synchronously kills its owned process group.
function stopAllCommands() { for (const abort of activeCommands) abort(); }

function createCommandRunner({ workspaceDir, env = {} } = {}) {
  return async function runShell(command, _extraEnv, opts = {}) {
    const result = { stdout: '', stderr: '', exitCode: null, signal: null, timedOut: false, aborted: false, truncated: false };
    const refuse = (error) => ({ ...result, error });
    if (!COMMAND_SUPPORTED) return refuse('native command execution is unavailable on Windows');
    if (typeof command !== 'string' || !command.trim() || command.includes('\0') || Buffer.byteLength(command) > MAX_COMMAND_BYTES) return refuse('command must be nonempty text of at most 4096 bytes without null bytes');
    if (opts.signal && opts.signal.aborted) return { ...result, aborted: true };
    const timeoutMs = opts.timeoutMs === undefined ? 30000 : opts.timeoutMs;
    const maxBytes = opts.maxBytes === undefined ? MAX_OUTPUT_BYTES : opts.maxBytes;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || !Number.isSafeInteger(maxBytes) || maxBytes <= 0) return refuse('command limits must be positive integers');
    let root, cwd;
    try {
      if (typeof workspaceDir !== 'string' || !path.isAbsolute(workspaceDir)) return refuse('no absolute command workspace configured');
      root = fs.realpathSync(workspaceDir);
      if (opts.cwd !== undefined && (typeof opts.cwd !== 'string' || !opts.cwd.trim() || opts.cwd.includes('\0'))) return refuse('cwd must be a workspace directory');
      cwd = fs.realpathSync(path.resolve(root, opts.cwd || '.'));
      const relative = path.relative(root, cwd);
      if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative) || !fs.statSync(cwd).isDirectory()) return refuse('cwd must stay inside the configured workspace');
    } catch { return refuse('command workspace or cwd does not exist'); }

    return new Promise((resolve) => {
      let child, timer, cleanupTimer, done = false, stopping = false, bytes = 0;
      const cap = Math.min(maxBytes, MAX_OUTPUT_BYTES);
      const decoders = { stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8') };
      function finish() {
        if (done) return;
        done = true; clearTimeout(timer); clearTimeout(cleanupTimer);
        activeCommands.delete(abort);
        if (opts.signal) opts.signal.removeEventListener('abort', abort);
        // A byte cap may split the final codepoint: discard that incomplete tail instead of fabricating U+FFFD.
        if (!result.truncated) for (const stream of ['stdout', 'stderr']) result[stream] += decoders[stream].end();
        resolve(result);
      }
      function killGroup() {
        if (child && child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch (e) { if (e.code !== 'ESRCH') result.error = 'command cleanup failed: ' + e.message; } }
        if (!cleanupTimer) cleanupTimer = setTimeout(() => {
          result.error = result.error || 'command pipes did not close after cleanup';
          child.stdout.destroy(); child.stderr.destroy(); finish();
        }, 1000);
      }
      function stop() { if (done || stopping) return; stopping = true; killGroup(); }
      function abort() { result.aborted = true; stop(); }
      function capture(stream, chunk) {
        const remaining = cap - bytes;
        const kept = chunk.subarray(0, remaining);
        result[stream] += decoders[stream].write(kept); bytes += kept.length;
        if (chunk.length > remaining) { result.truncated = true; stop(); }
      }
      try {
        child = spawn('/bin/sh', ['-c', command], {
          cwd, env: { PATH: typeof env.PATH === 'string' ? env.PATH : '/usr/bin:/bin', HOME: root },
          detached: true, stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (e) { result.error = 'command launch failed: ' + e.message; finish(); return; }
      child.stdout.on('data', (chunk) => capture('stdout', chunk));
      child.stderr.on('data', (chunk) => capture('stderr', chunk));
      child.once('spawn', () => { if (typeof opts.onStart === 'function') { try { opts.onStart(); } catch {} } });
      child.once('error', (e) => { result.error = 'command launch failed: ' + e.message; });
      child.once('exit', (code, signal) => {
        result.exitCode = code; result.signal = signal;
        // Also reap ordinary background children when their shell exits successfully.
        killGroup();
      });
      child.once('close', finish);
      activeCommands.add(abort);
      timer = setTimeout(() => { result.timedOut = true; stop(); }, Math.min(timeoutMs, MAX_TIMEOUT_MS));
      if (opts.signal) {
        opts.signal.addEventListener('abort', abort, { once: true });
        if (opts.signal.aborted) abort();
      }
    });
  };
}

module.exports = { createCommandRunner, stopAllCommands, COMMAND_SUPPORTED };
