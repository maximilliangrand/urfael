'use strict';
// Launch a detached supervisor that owns both the child and its final durable result, even if the daemon exits.
//   kind 'goal'      -> the guard-railed vault-template/_urfael/goal-loop.sh (isolated --repo, never pushes)
//   kind 'ask'/'research' -> a sandboxed one-shot claude (no bypass, no computer-use) that writes a vault note
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const store = require('./jobstore');
const { delegateScope, scopedEnv } = require('./lib');

const VAULT = path.join(os.homedir(), process.env.URFAEL_VAULT_DIR || 'Urfael');
const CB = require('./claude-bin').resolve();   // { bin, pre } — POSIX identical to the old probe; win32 exe/cli.js
const CLAUDE_BIN = CB.bin;
const CLAUDE_PRE = CB.pre;
const NOTIFY = path.join(__dirname, 'bridge', 'notify.js'); // best-effort; a no-op if no bridge.env

// one-way phone push for "job done / needs you". Single-destination by construction (see the bridge).
function notify(text) {
  try { const p = spawn(process.execPath, [NOTIFY, text], { detached: true, stdio: 'ignore', env: process.env }); p.unref(); } catch {}
}

// Per-principal re-entry attribution: a background child's output is UNREVIEWED, so every result note + notify carries
// who spawned it, over which channel, at which inherited scope, plus an explicit honesty caveat — a delegated result
// is never presented as owner-verified. Pure string build from the job spec.
function attribution(s) {
  const principal = String((s && s.principal) || 'owner');
  const role = String((s && s.role) || 'owner');
  const channel = String((s && s.channel) || 'local');
  const scope = delegateScope(s && s.scope).scope;             // single-sourced; fail-closed to 'untrusted'
  return { principal, role, channel, scope,
    header: 'Delegated by ' + principal + '/' + role + ' over ' + channel + ', scope=' + scope + '.',
    caveat: 'This ran as a background child under the spawning turn\'s scope; results are unreviewed.' };
}

function argvFor(job) {
  const s = job.spec || {};
  if (job.kind === 'goal') {
    // Managed host jobs always use this app version's engine. Existing vaults are user-owned and installers
    // intentionally do not overwrite their old templates on upgrade. Remote backends keep the vault script.
    const args = store.safeId(job.id) && supportsRecovery(job)
      ? [process.execPath, path.join(__dirname, 'goal-loop.js'), String(s.goal || '')]
      : process.platform === 'win32'
      ? [process.execPath, path.join(VAULT, '_urfael', 'goal-loop.js'), String(s.goal || '')]
      : ['bash', path.join(VAULT, '_urfael', 'goal-loop.sh'), String(s.goal || '')];
    if (s.repo) args.push('--repo', String(s.repo));
    if (s.maxIters) args.push('--max-iters', String(s.maxIters));
    if (s.maxMins) args.push('--max-mins', String(s.maxMins));
    if (s.turnTimeout) args.push('--turn-timeout', String(s.turnTimeout));
    if (s.check) args.push('--check', String(s.check));
    if (s.model) args.push('--model', String(s.model));
    // Opt-in two-key completion gate (default OFF → argv byte-identical without it). --verify makes candidate-done
    // adjudicated by an independent read-only refuter; it FAILS CLOSED without a machine-checkable --criteria file,
    // so both cross as argv elements (never shell-interpolated). Absent spec.verify/spec.criteria → neither is added.
    if (s.verify) args.push('--verify');
    if (typeof s.criteria === 'string' && s.criteria) args.push('--criteria', String(s.criteria));
    // Optional throwaway-container isolation. Whitelist server-side; goal-loop.sh re-validates + needs docker.
    if (s.sandbox === 'docker' || s.sandbox === 'docker-net') args.push('--sandbox', s.sandbox);
    // Optional remote SSH backend: turns run on a remote host. Validate the host server-side against the SAME safe
    // pattern goal-loop.sh enforces ([A-Za-z0-9._@-]+, no leading '-') — a bad/missing host is rejected,
    // so we never splice an attacker-shaped string onto an ssh command line. --ssh-dir is a path, passed verbatim
    // (goal-loop.sh %q-escapes it). Only enable ssh mode when the host validates.
    else if (s.sandbox === 'ssh') {
      const host = String(s.sshHost || '');
      if (/^[A-Za-z0-9._@-]+$/.test(host) && host[0] !== '-') {
        args.push('--sandbox', 'ssh', '--ssh-host', host);
        if (s.sshDir) args.push('--ssh-dir', String(s.sshDir));
      }
      else throw new Error('SSH jobs require a valid host');
    }
    if (store.safeId(job.id) && supportsRecovery(job)) {
      args.push('--state', store.progressFile(job.id));
      if (job.resumeAttempt) args.push('--resume');
    }
    return args;
  }
  // ask / research: sandboxed one-shot — no bypass, no computer-use, write a result note into the vault. The toolset
  // is DERIVED from the spawning turn's trust scope (delegateScope), never hardcoded: an untrusted-scoped child is
  // structurally no-egress (Read/Grep/Glob), an owner 'local' job keeps the full floor. The daemon stamps spec.scope
  // ('local' for the owner socket); an absent/garbage scope here fails CLOSED to 'untrusted' (no egress).
  const a = attribution(s);
  const prompt = a.header + '\n' + a.caveat + '\n\n' + String(s.prompt || s.goal || '') +
    '\n\nWhen done, write your findings to a logo-headed note in 03_Resources/ of this vault and open it.';
  const allowed = delegateScope(s.scope).allowedTools.join(',');
  return [CLAUDE_BIN, ...CLAUDE_PRE, '-p', prompt, '--model', String(s.model || 'sonnet'), '--permission-mode', 'acceptEdits',
    '--allowedTools', allowed, '--strict-mcp-config']; // scope-derived allowlist, never a shell
}

// The background child crosses the SAME scopedEnv() boundary every other spawn uses (cron, hook, watch, remote,
// askScoped): PATH/HOME/USER + model knobs + the backend routing/access vars, and NOTHING else — so the daemon's
// unrelated secrets (bridge.env, other providers' keys, anything ambient in its environment) never reach an
// UNREVIEWED background job. This was the LONE spawn path still handing the child the full process env. The
// goal-loop's operational selectors (isolation backend + yolo, the documented env-equivalents of its --sandbox
// / --ssh-* / bypass flags) are forwarded so a normal owner-local job behaves identically; nothing else is.
const JOB_ENV_KEYS = ['URFAEL_YOLO', 'URFAEL_SANDBOX', 'URFAEL_SANDBOX_IMAGE', 'URFAEL_SSH_HOST', 'URFAEL_SSH_DIR', 'URFAEL_GOAL_VERIFY', 'URFAEL_GOAL_CRITERIA'];
function jobEnv(job) {
  // PowerShell uses PATHEXT to distinguish native executables from shell associations; stripping it
  // can make a native acceptance command launch asynchronously and hide its failure status.
  const env = scopedEnv(process.env, JOB_ENV_KEYS.concat(['USERPROFILE', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP', 'PATHEXT']));
  if (job && job.kind === 'goal' && job.goalEnvironment) {
    for (const key of JOB_ENV_KEYS) {
      delete env[key];
      if (job.goalEnvironment[key] != null) env[key] = job.goalEnvironment[key];
    }
  }
  return env;
}

function supportsRecovery(job) {
  const sandbox = job.spec && Object.hasOwn(job.spec, 'sandbox') ? job.spec.sandbox : process.env.URFAEL_SANDBOX || '';
  return job.kind === 'goal' && (!sandbox || sandbox === 'host');
}
function progressFor(job) {
  if (!job || job.kind !== 'goal' || !store.safeId(job.id)) return null;
  try {
    const p = JSON.parse(fs.readFileSync(store.progressFile(job.id), 'utf8'));
    return p.schemaVersion === 1 && p.contract && typeof p.contract === 'object' &&
      typeof p.runId === 'string' && p.runId.length > 0 && typeof p.sessionId === 'string' &&
      ['running', 'completed', 'stopped', 'failed'].includes(p.outcome) &&
      Number.isInteger(p.iterations) && p.iterations >= 0 && Number.isFinite(p.elapsedMs) && p.elapsedMs >= 0 &&
      (p.activeSince == null || (Number.isFinite(p.activeSince) && p.activeSince > 0)) &&
      Number.isInteger(p.contract.maxIters) && p.contract.maxIters > 0 &&
      Number.isFinite(p.contract.maxMins) && p.contract.maxMins > 0 ? p : null;
  } catch { return null; }
}
function resumable(job) {
  if (!job || !supportsRecovery(job) || !['stopped', 'interrupted', 'cancelled', 'failed', 'error'].includes(job.state) || store.isAlive(job.pid) || store.isAlive(job.childPid)) return false;
  const p = progressFor(job);
  if (p && process.platform === 'win32' && Number.isInteger(p.childPid) && p.childPid > 0 && p.phase !== 'idle') return false;
  const elapsedMs = p ? p.elapsedMs + (p.activeSince ? Math.max(0, Date.now() - p.activeSince) : 0) : Infinity;
  return !!(p && p.outcome !== 'completed' && p.resumable !== false && !require('./goal-progress').childAlive(p.childPid) && p.phase !== 'starting' &&
    Number.isFinite(p.iterations) && p.iterations < p.contract.maxIters &&
    elapsedMs < p.contract.maxMins * 60000);
}
function describe(job) {
  return { ...job, goal: (job.spec && (job.spec.goal || job.spec.prompt || job.spec.task)) || '',
    progress: progressFor(job), resumable: resumable(job) };
}
function run(job, options = {}) {
  if (!job || !store.safeId(job.id)) throw new Error('invalid job');
  const id = job.id;
  const token = store.claimRun(id);
  let fd;
  let transitioned = false;
  try {
    const current = store.get(id);
    if (!current || (options.resume ? !resumable(current) : current.state !== 'queued')) throw new Error('job is not resumable or is already running');
    // Pin environment defaults into the spec, so a daemon restart cannot change the resumed contract.
    const spec = { ...current.spec };
    if (current.kind === 'goal') {
      if (!Object.hasOwn(spec, 'sandbox')) spec.sandbox = process.env.URFAEL_SANDBOX || '';
      if (spec.sandbox === 'host') spec.sandbox = '';
      if (spec.sandbox && !['host', 'docker', 'docker-net', 'ssh'].includes(spec.sandbox)) throw new Error('unsupported goal sandbox');
      if (spec.sandbox === 'ssh') {
        if (!spec.sshHost) spec.sshHost = process.env.URFAEL_SSH_HOST;
        if (!spec.sshDir) spec.sshDir = process.env.URFAEL_SSH_DIR;
      }
      if (spec.verify == null) spec.verify = process.env.URFAEL_GOAL_VERIFY === '1';
      if (!options.resume && !spec.criteria && process.env.URFAEL_GOAL_CRITERIA) spec.criteria = process.env.URFAEL_GOAL_CRITERIA;
    }
    // Validate argv before accepting the handoff; an unsupported backend must never fall back to host execution.
    if (spec.sandbox === 'ssh' && !/^[A-Za-z0-9._@][A-Za-z0-9._@-]*$/.test(String(spec.sshHost || process.env.URFAEL_SSH_HOST || ''))) throw new Error('SSH jobs require a valid host');
    fd = fs.openSync(store.logFile(id), 'a', 0o600);
    // This first transition must be durable. The token is then required for every supervisor write.
    const goalEnvironment = current.goalEnvironment || (current.kind === 'goal' ? Object.fromEntries(JOB_ENV_KEYS
      .filter((key) => process.env[key] != null).map((key) => [key, process.env[key]])) : undefined);
    if (goalEnvironment) Object.assign(goalEnvironment, { URFAEL_SANDBOX: spec.sandbox || '',
      URFAEL_GOAL_VERIFY: spec.verify ? '1' : '', URFAEL_GOAL_CRITERIA: spec.criteria || '',
      URFAEL_SSH_HOST: spec.sshHost || '', URFAEL_SSH_DIR: spec.sshDir || '' });
    const starting = { ...current, spec, ...(goalEnvironment ? { goalEnvironment } : {}), state: 'starting', attemptToken: token, resumeAttempt: !!options.resume,
      pid: process.pid, childPid: null, startedAt: new Date().toISOString(), endedAt: null, exitCode: null, result: null };
    require('./lib').atomicWriteJSON(path.join(store.JOBS_DIR, id + '.json'), starting);
    transitioned = true;
    const proc = spawn(process.execPath, [path.join(__dirname, 'job-worker.js'), id, token], {
      cwd: VAULT, env: jobEnv(starting), stdio: ['ignore', fd, fd], detached: true,
    });
    proc.on('error', (e) => {
      try { store.updateAttempt(id, token, { state: 'error', pid: null, endedAt: new Date().toISOString(), result: 'supervisor spawn failed: ' + e.message }); }
      finally { store.releaseRun(id, token); }
    });
    proc.unref();
    return proc.pid;
  } catch (e) {
    if (transitioned) store.updateAttempt(id, token, { state: 'error', pid: null, endedAt: new Date().toISOString(), result: 'supervisor launch failed: ' + e.message });
    store.releaseRun(id, token);
    throw e;
  } finally { if (typeof fd === 'number') fs.closeSync(fd); }
}
function resume(id) {
  store.reconcile();
  const job = store.get(id);
  if (!resumable(job)) throw new Error('job cannot resume: it must be stopped with a checkpoint and remaining budget');
  run(job, { resume: true });
  return describe(store.get(id));
}

// Cancel = signal the whole process GROUP (detached gives the child its own pgid), TERM then KILL after grace.
// win32 has no process groups / negative-pid kill: taskkill /T walks the child TREE, /F after the same grace.
function cancel(id) {
  const j = store.get(id);
  if (!j || !j.pid || !store.isAlive(j.pid)) return false;
  if (!['starting', 'running', 'cancelling'].includes(j.state)) return false;
  // A launcher PID is temporary metadata, never a process group we are authorized to kill.
  if (j.state === 'starting') return false;
  if (j.attemptToken) store.updateAttempt(id, j.attemptToken, { state: 'cancelling' });
  else store.update(id, { state: 'cancelling' });
  const pid = j.pid;
  if (process.platform === 'win32') {
    const { execFile } = require('child_process');
    // New supervisors observe the persisted cancellation intent and save the result themselves.
    if (!j.attemptToken) try { execFile('taskkill', ['/pid', String(pid), '/T'], { windowsHide: true }, () => {}); } catch {}
    setTimeout(() => { if (store.isAlive(pid)) { try { execFile('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true }, () => {}); } catch {} } }, 8000);
    return true;
  }
  try { process.kill(-pid, 'SIGTERM'); } catch { try { process.kill(pid, 'SIGTERM'); } catch {} }
  // re-check liveness before the hard kill so a reaped+reused pid isn't signalled by mistake
  setTimeout(() => { if (store.isAlive(pid)) { try { process.kill(-pid, 'SIGKILL'); } catch {} } }, 8000);
  return true;
}

module.exports = { run, resume, cancel, argvFor, attribution, jobEnv, supportsRecovery, progressFor, resumable, describe, notify, VAULT };
