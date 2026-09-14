'use strict';
// This process, rather than the daemon, owns a background job through to its final receipt.
const { spawn } = require('child_process');
const store = require('./jobstore');
const runner = require('./runner');
const { scriptEnv } = require('./internal-node');

function supervise(id, token) {
  const job = store.get(id);
  if (!job || job.attemptToken !== token || job.state !== 'starting') throw new Error('stale job attempt');
  store.ownRun(id, token, process.pid);
  if (!store.updateAttempt(id, token, { state: 'running', pid: process.pid })) throw new Error('job ownership lost');
  const previous = runner.progressFor(job);
  let child, settled = false, cancelling = false, hardKill, cancelPoll, launchError;
  const killTurn = (signal) => {
    const p = runner.progressFor(job);
    // Host turns/checks have their own group. Address the current attempt's recorded group as well as
    // the loop, so a wedged loop cannot make the cancellation watchdog abandon its active command.
    if (!p || !p.runId || (previous && p.runId === previous.runId) || !Number.isInteger(p.childPid) || p.childPid <= 0) return;
    if (process.platform === 'win32') {
      try { require('child_process').execFileSync('taskkill', ['/pid', String(p.childPid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch {}
    } else { try { process.kill(-p.childPid, signal); } catch {} }
  };
  const finish = (code, signal, error) => {
    if (settled) return;
    settled = true;
    if (cancelling) killTurn('SIGKILL');
    clearTimeout(hardKill);
    clearInterval(cancelPoll);
    process.removeListener('SIGTERM', cancel);
    process.removeListener('SIGINT', cancel);
    const progress = runner.progressFor(job);
    const fresh = progress && progress.runId && (!previous || progress.runId !== previous.runId);
    let state = error ? 'error' : signal ? 'interrupted' : code === 0 ? 'done' : 'failed';
    let result = error ? 'spawn failed: ' + error.message : null;
    if (runner.supportsRecovery(job)) {
      // Exit zero is insufficient: an old receipt, a capped loop, or a missing receipt cannot certify this attempt.
      state = 'failed';
      result = 'coding run ended without a fresh completion receipt';
      if (fresh) {
        result = progress.result || progress.reason;
        if (progress.outcome === 'completed' && code === 0 && !signal) state = 'done';
        else if (progress.outcome === 'stopped') state = 'stopped';
        else if (progress.outcome === 'failed') state = 'failed';
        else if (signal) state = 'interrupted';
      }
    }
    if (cancelling || (store.get(id) || {}).state === 'cancelling') state = 'cancelled';
    try {
      const saved = store.updateAttempt(id, token, { state, result, pid: null, childPid: null,
        endedAt: new Date().toISOString(), exitCode: code, signal: signal || null });
      if (saved) {
        const a = runner.attribution(job.spec);
        runner.notify('Urfael job ' + id + ' (' + job.kind + ') ' + state + '. ' + a.header + ' ' + a.caveat);
      }
    } finally { store.releaseRun(id, token); }
  };
  function cancel() {
    if (cancelling || settled) return;
    cancelling = true;
    store.updateAttempt(id, token, { state: 'cancelling' });
    killTurn('SIGTERM');
    try { if (child) child.kill('SIGTERM'); } catch {}
    // Own the grace timer here so cancellation still finishes if the daemon goes away.
    hardKill = setTimeout(() => {
      killTurn('SIGKILL');
      if (process.platform === 'win32') {
        if (child) require('child_process').execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => {});
      } else {
        // This worker was detached by runner; the group contains only this job and its descendants.
        store.updateAttempt(id, token, { state: 'cancelled', pid: null, endedAt: new Date().toISOString(), result: 'cancelled after grace period' });
        store.releaseRun(id, token);
        try { process.kill(-process.pid, 'SIGKILL'); } catch {}
      }
    }, 8000);
  }
  process.on('SIGTERM', cancel);
  process.on('SIGINT', cancel);
  // Windows cannot deliver a catchable SIGTERM through taskkill. The durable intent also survives a
  // cancelling daemon's exit; the supervisor remains alive long enough to persist the terminal state.
  cancelPoll = setInterval(() => { if ((store.get(id) || {}).state === 'cancelling') cancel(); }, 100);
  try {
    const [cmd, ...args] = runner.argvFor(job);
    child = spawn(cmd, args, { cwd: runner.VAULT,
      env: scriptEnv(cmd, args, runner.jobEnv(job)),
      stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', (error) => finish(null, null, error));
    child.on('close', (code, signal) => finish(code, signal, launchError));
    if (!store.updateAttempt(id, token, { childPid: child.pid || null })) throw new Error('job ownership lost during spawn');
  } catch (error) {
    launchError = error;
    if (child && child.pid) {
      // The spawn succeeded but its durable handoff did not. Retain ownership until close and stop the
      // actual work; merely recording an error would leave an untracked coding loop running.
      killTurn('SIGKILL');
      try { child.kill('SIGKILL'); } catch { finish(null, null, error); }
    } else finish(null, null, error);
  }
}

if (require.main === module) {
  const [id, token] = process.argv.slice(2);
  try { supervise(id, token); }
  catch (error) {
    if (store.safeId(id)) {
      try { store.updateAttempt(id, token, { state: 'error', pid: null, endedAt: new Date().toISOString(), result: error.message }); }
      finally { store.releaseRun(id, token); }
    }
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { supervise };
