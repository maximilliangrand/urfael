'use strict';
// Durable host-mode goal progress. Receipts describe observed workspace bytes, not a promise that tests
// prove a goal correct. The state directory is private, trusted application state, outside the source tree.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { atomicWriteJSON } = require('./lib');
const digest = (s) => crypto.createHash('sha256').update(s).digest('hex');
const git = (repo, args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
function head(repo) { try { return git(repo, ['rev-parse', 'HEAD']).trim(); } catch { return ''; } }

function workspaceHash(repo) {
  // NUL-delimited names handle spaces/newlines. Include missing tracked files, executable modes and
  // symlink targets; never follow symlinks out of the checkout. Ignored build output is deliberately excluded.
  const list = () => [...new Set(git(repo, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean))].sort();
  const names = list(), initialHead = head(repo);
  const h = crypto.createHash('sha256');
  const add = (s) => { const b = Buffer.isBuffer(s) ? s : Buffer.from(s); h.update(String(b.length) + ':'); h.update(b); };
  add(initialHead);
  for (const name of names) {
    add(name);
    const file = path.join(repo, name);
    let st; try { st = fs.lstatSync(file); } catch (e) { if (e.code === 'ENOENT') { add('missing'); continue; } throw e; }
    if (st.isSymbolicLink()) { add('symlink'); add(fs.readlinkSync(file)); }
    else if (st.isFile()) {
      add('file:' + (st.mode & 0o111)); add(fs.readFileSync(file));
      const after = fs.lstatSync(file);
      if (st.ino !== after.ino || st.size !== after.size || st.mtimeMs !== after.mtimeMs || st.ctimeMs !== after.ctimeMs) throw new Error('workspace changed while hashing: ' + name);
    } else throw new Error('workspace hashing does not support submodules or special files: ' + name);
  }
  if (head(repo) !== initialHead || JSON.stringify(list()) !== JSON.stringify(names)) throw new Error('workspace paths or HEAD changed while hashing');
  return h.digest('hex');
}

function contractFor(o, env = process.env) {
  const repo = fs.realpathSync(o.repo);
  const criteria = o.criteria ? fs.realpathSync(o.criteria) : '';
  return { goal: o.goal, repo, maxIters: o.maxIters, maxMins: o.maxMins, turnTimeout: o.turnTimeout,
    check: o.check, model: o.model, verify: !!o.verify, criteria,
    criteriaDigest: criteria ? digest(fs.readFileSync(criteria)) : '',
    permissionMode: env.URFAEL_YOLO ? 'bypassPermissions' : 'acceptEdits',
    sandbox: o.sandbox || '', sshHost: o.sshHost || '', sshDir: o.sshDir || '' };
}
function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code !== 'ESRCH'; }
}
function childAlive(pid) {
  if (alive(pid)) return true;
  if (process.platform === 'win32' || !Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(-pid, 0); return true; } catch (e) { return e.code !== 'ESRCH'; }
}
function canRecoverChild(state, platform = process.platform) {
  if (state.phase === 'starting') return false;
  // Native Windows cannot query a dead leader's former process tree through process.kill/taskkill.
  // A recorded in-flight turn therefore needs inspection, even when the leader is gone. Normal clean
  // stops clear childPid and return to idle; they can resume without this uncertainty.
  if (platform === 'win32' && Number.isInteger(state.childPid) && state.childPid > 0 &&
      ['worker', 'check', 'verifier'].includes(state.phase)) return false;
  return !childAlive(state.childPid);
}

function acquire(file) {
  const lock = file + '.lock';
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const token = crypto.randomUUID() + '.json';
  const staged = fs.mkdtempSync(lock + '.claim-');
  fs.chmodSync(staged, 0o700);
  fs.writeFileSync(path.join(staged, token), JSON.stringify({ pid: process.pid }), { mode: 0o600 });
  try {
    for (let n = 0; n < 3; n++) {
      try { fs.renameSync(staged, lock); return () => { try { fs.unlinkSync(path.join(lock, token)); fs.rmdirSync(lock); } catch {} }; }
      catch (e) { if (!['EEXIST', 'ENOTEMPTY', 'EPERM', 'EACCES'].includes(e.code)) throw e; }
      const entries = fs.readdirSync(lock);
      if (entries.length > 1) throw new Error('unrecognized goal execution lock; inspect before resuming');
      if (entries.length === 1) {
        const ownerName = entries[0];
        if (!/^[a-f0-9-]+\.json$/.test(ownerName)) throw new Error('unrecognized goal execution lock');
        let owner;
        try { owner = JSON.parse(fs.readFileSync(path.join(lock, ownerName), 'utf8')); }
        catch (e) { if (e.code === 'ENOENT') continue; throw new Error('unreadable goal execution lock'); }
        if (!Number.isInteger(owner.pid) || owner.pid <= 0 || alive(owner.pid)) throw new Error('goal is already running, or its process cannot be ruled out');
        // Every replacement lock is nonempty BEFORE it becomes visible. Remove only this unique dead
        // owner's entry, then rmdir: a racing fresh owner's nonempty lock can never be removed here.
        try { fs.unlinkSync(path.join(lock, ownerName)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      }
      try { fs.rmdirSync(lock); } catch (e) { if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(e.code)) throw e; }
    }
    throw new Error('goal lock contention; retry once the other attempt finishes');
  } finally { try { fs.rmSync(staged, { recursive: true, force: true }); } catch {} }
}

function open(o, env = process.env) {
  const contract = contractFor(o, env);
  const fingerprint = digest(JSON.stringify(contract));
  const defaultDir = git(contract.repo, ['rev-parse', '--git-path', 'urfael-goals']).trim();
  const file = path.resolve(o.state || path.resolve(contract.repo, defaultDir, crypto.randomUUID() + '.json'));
  // State/log writes must not invalidate the source receipt. A git-private directory is valid, including
  // the administrative directory of a linked worktree; arbitrary source-tree paths are rejected.
  const rel = path.relative(contract.repo, file);
  if (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel)) {
    const gitDir = path.resolve(contract.repo, git(contract.repo, ['rev-parse', '--git-dir']).trim());
    const gitRel = path.relative(gitDir, file);
    if (gitRel === '..' || gitRel.startsWith('..' + path.sep) || path.isAbsolute(gitRel)) throw new Error('--state must be outside the workspace or inside its git administrative directory');
  }
  const release = acquire(file);
  try {
    let state;
    if (o.resume) {
      if (!o.state) throw new Error('--resume requires --state');
      state = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (state.schemaVersion !== 1 || state.fingerprint !== fingerprint) throw new Error('resume contract changed: goal, repository, criteria or settings differ');
      if (!Number.isInteger(state.iterations) || state.iterations < 0 || !Number.isFinite(state.elapsedMs) || state.elapsedMs < 0) throw new Error('invalid progress counters');
      if (state.activeSince !== null && (!Number.isFinite(state.activeSince) || state.activeSince <= 0)) throw new Error('invalid active budget timestamp');
      if (typeof state.sessionId !== 'string' || !['running', 'completed', 'stopped', 'failed'].includes(state.outcome) ||
          !['idle', 'starting', 'worker', 'check', 'verifier'].includes(state.phase)) throw new Error('invalid progress session, outcome or phase');
      if (!canRecoverChild(state)) throw new Error('previous turn may still be running; manual inspection is required before resuming');
      if (state.activeSince) {
        if (!Number.isFinite(state.activeSince) || state.activeSince > Date.now()) throw new Error('cannot establish elapsed budget after a clock change');
        state.elapsedMs += Date.now() - state.activeSince; // conservatively charge unobserved time after a crash
      }
      if (state.outcome === 'completed' && (!state.result || state.result.workspaceHash !== workspaceHash(contract.repo))) throw new Error('completed receipt no longer matches workspace; start a new goal');
    } else {
      if (fs.existsSync(file)) throw new Error('state already exists; use --resume or a new state file');
      state = { schemaVersion: 1, contract, fingerprint, sessionId: '', iterations: 0, startedAt: Date.now(),
        elapsedMs: 0, baselineHead: head(contract.repo), lastWorkspaceHash: workspaceHash(contract.repo),
        verification: { status: 'pending', workspaceHash: '', check: contract.check, checkedAt: null, criteriaDigest: contract.criteriaDigest },
        outcome: 'running', reason: '', result: null, stale: 0, errors: 0, refutation: '' };
    }
    state.runId = crypto.randomUUID();
    state.activeSince = null; state.childPid = null; state.phase = 'idle';
    const save = (patch = {}) => {
      Object.assign(state, patch, { updatedAt: Date.now() });
      state.resumable = state.outcome !== 'completed' && state.iterations < contract.maxIters && state.elapsedMs < contract.maxMins * 60000;
      atomicWriteJSON(file, state);
    };
    save();
    return { file, state, save, release, assertContract: () => {
      if (digest(JSON.stringify(contractFor(o, env))) !== fingerprint) throw new Error('goal contract or criteria changed during execution');
    } };
  } catch (e) { release(); throw e; }
}

module.exports = { workspaceHash, contractFor, open, acquire, alive, childAlive, canRecoverChild, digest, head };
