'use strict';
// Tiny durable job store — one JSON file + one .log per job under ~/.claude/urfael/jobs/. No DB.
// Jobs outlive the daemon (they run detached), so state is reconciled on daemon start.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { atomicWriteJSON } = require('./lib');   // tmp+fsync+rename — jobs are "durable by design", so their store must be too

const JOBS_DIR = path.join(os.homedir(), '.claude', 'urfael', 'jobs');
const ID_RE = /^[a-z0-9-]{4,64}$/i; // opaque ids only — never interpolate an unvalidated id into a path/shell

function ensure() { try { fs.mkdirSync(JOBS_DIR, { recursive: true, mode: 0o700 }); } catch {} }
function safeId(id) { return typeof id === 'string' && ID_RE.test(id); }
function jobFile(id) { return path.join(JOBS_DIR, id + '.json'); }
function logFile(id) { return path.join(JOBS_DIR, id + '.log'); }
function progressFile(id) { if (!safeId(id)) throw new Error('invalid job id'); return path.join(JOBS_DIR, id + '.progress.json'); }
function newId() { return Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex'); }
function isAlive(pid) { if (!Number.isInteger(pid) || pid <= 0) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code !== 'ESRCH'; } }

function create(spec) {
  ensure();
  const id = newId();
  const job = { id, kind: spec.kind, state: 'queued', spec, pid: null,
    createdAt: new Date().toISOString(), startedAt: null, endedAt: null, exitCode: null, result: null };
  atomicWriteJSON(jobFile(id), job);   // a torn create/update used to make the job VANISH from list()/reconcile()
  return job;
}
function get(id) { if (!safeId(id)) return null; try { return JSON.parse(fs.readFileSync(jobFile(id), 'utf8')); } catch { return null; } }
function update(id, patch) { const j = get(id); if (!j) return null; Object.assign(j, patch); try { atomicWriteJSON(jobFile(id), j); } catch {} return j; }
// Workers must not report a successful handoff when persistence failed, or let an old attempt overwrite a new one.
function updateAttempt(id, token, patch) {
  const j = get(id);
  if (!j || j.attemptToken !== token) return null;
  Object.assign(j, patch);
  atomicWriteJSON(jobFile(id), j);
  return j;
}
function list() {
  ensure();
  try {
    return fs.readdirSync(JOBS_DIR).filter((f) => f.endsWith('.json') && safeId(f.slice(0, -5)))
      .map((f) => { try { return JSON.parse(fs.readFileSync(path.join(JOBS_DIR, f), 'utf8')); } catch { return null; } })
      .filter(Boolean).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  } catch { return []; }
}
function appendLog(id, line) { if (!safeId(id)) return; try { fs.appendFileSync(logFile(id), line.endsWith('\n') ? line : line + '\n'); } catch {} }
function tailLog(id, n = 40) { if (!safeId(id)) return ''; try { return fs.readFileSync(logFile(id), 'utf8').trim().split('\n').slice(-n).join('\n'); } catch { return ''; } }

// On daemon start: a job marked 'running' whose process is gone (daemon restarted under it, or it crashed)
// is reconciled to 'interrupted'. Live jobs are left running — they are durable by design.
function reconcile() {
  for (const j of list()) {
    if (!['starting', 'running', 'cancelling'].includes(j.state) || isAlive(j.pid)) continue;
    // Allow the detached worker to take ownership if the launcher died just after spawn.
    if (j.state === 'starting' && Date.now() - Date.parse(j.startedAt) < 30000) continue;
    update(j.id, { state: j.state === 'cancelling' ? 'cancelled' : 'interrupted', pid: null, endedAt: new Date().toISOString() });
  }
}

// Atomic, cross-process claim. Retired locks remain nonempty: two contenders that observed the same stale
// generation cannot both rename away a replacement lock (rename over a nonempty directory fails).
function claimRun(id) {
  if (!safeId(id)) throw new Error('invalid job id');
  ensure();
  const dir = path.join(JOBS_DIR, id + '.run-lock');
  const token = crypto.randomBytes(16).toString('hex');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.mkdirSync(dir, { mode: 0o700 });
      atomicWriteJSON(path.join(dir, 'owner.json'), { token, pid: process.pid, createdAt: Date.now() });
      return token;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let owner, stat;
      try { stat = fs.statSync(dir); owner = JSON.parse(fs.readFileSync(path.join(dir, 'owner.json'), 'utf8')); } catch {}
      if (!stat || Date.now() - stat.mtimeMs < 30000 || (owner && isAlive(owner.pid))) throw new Error('job already has an active run');
      const generation = owner && /^[a-f0-9]{32}$/.test(owner.token) ? owner.token : String(stat.ino);
      // Preserve a nonempty tombstone even if the launcher died before writing its owner record.
      try { fs.writeFileSync(path.join(dir, 'retired'), '', { flag: 'wx' }); } catch {}
      try { fs.renameSync(dir, path.join(JOBS_DIR, id + '.retired-' + generation)); }
      catch { throw new Error('job run ownership changed; retry'); }
    }
  }
  throw new Error('could not claim job');
}
function ownRun(id, token, pid) {
  const file = path.join(JOBS_DIR, id + '.run-lock', 'owner.json');
  const owner = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (owner.token !== token) throw new Error('job run ownership changed');
  atomicWriteJSON(file, { ...owner, pid });
}
function releaseRun(id, token) {
  const dir = path.join(JOBS_DIR, id + '.run-lock');
  try {
    const owner = JSON.parse(fs.readFileSync(path.join(dir, 'owner.json'), 'utf8'));
    if (owner.token === token) fs.rmSync(dir, { recursive: true });
  } catch {}
}

module.exports = { create, get, update, updateAttempt, list, appendLog, tailLog, reconcile, isAlive, safeId, logFile, progressFile, claimRun, ownRun, releaseRun, JOBS_DIR };
