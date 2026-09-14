'use strict';
// Owner-requested forgetting removes active beliefs, not historical records. The existing tombstone
// remains the audit trail; ledger retirement additionally prevents recall/export or a later verifier
// from treating the same item as trusted. Called synchronously while daemon memory passes are idle.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { atomicWriteJSON } = require('./lib');
const learn = require('./learn');
const AUDIT_PENDING = '.forget-audit-pending.json';

function readOptional(file) {
  try { return fs.readFileSync(file, 'utf8'); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
function readArray(file) {
  const raw = readOptional(file);
  if (raw === null) return [];
  const items = JSON.parse(raw);
  if (!Array.isArray(items)) throw new Error('expected a JSON array');
  return items;
}
// A failed write must leave the previous memory file intact. Unlike background best-effort saves,
// every failure here reaches the explicit command. Each replacement is atomic; the group is not a
// multi-file transaction, so a later failure reports exactly which earlier removals took effect.
function writeText(file, body) {
  const tmp = file + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  let fd;
  try {
    fd = fs.openSync(tmp, 'wx', 0o600);
    fs.writeFileSync(fd, body, 'utf8');
    try { fs.fsyncSync(fd); } catch {}
    fs.closeSync(fd); fd = undefined;
    fs.renameSync(tmp, file);
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch {} }
    try { fs.unlinkSync(tmp); } catch {}
  }
}

function auditMarker(record) { return '<!-- urfael-forget:' + record.id + ' -->'; }
function formatAudit(record) {
  return '\n## ' + record.at.slice(0, 16).replace('T', ' ') + ' — ' + (record.partial ? 'partially ' : '')
    + 'forgotten by owner request: "' + record.phrase.slice(0, 100).replace(/"/g, "'") + '"\n'
    + auditMarker(record) + '\n' + record.removed.map((r) => '- (' + r.file + ') ' + r.line).join('\n') + '\n';
}

function forgetMemory(dir, phrase, files = ['MEMORY.md', 'USER.md', 'WORKFLOW.md', 'LESSONS.md']) {
  const p = String(phrase || '').trim();
  if (!p) return { error: 'need a phrase to forget', removed: [], count: 0 };
  const lc = p.toLowerCase(), at = new Date().toISOString();
  const matches = (s) => typeof s === 'string' && s.toLowerCase().includes(lc);
  const plans = [], removed = [], errors = [];
  let current = 'ledger.json', tombBefore, pendingAudit;
  try {
    // Strict reads finish before the first mutation. An unreadable/corrupt ledger is not an empty
    // ledger: never overwrite it or report that the owner successfully forgot its contents.
    const ledger = readArray(path.join(dir, current));
    const retired = [];
    for (const item of ledger) {
      if (!item || !matches(item.ref) || item.forgottenAt != null) continue;
      item.status = 'retired'; item.confidence = 0; item.forgottenAt = at;
      retired.push({ file: current, line: item.ref });
    }
    current = '.learned.json';
    const pending = readArray(path.join(dir, current));
    const rejected = pending.filter((item) => item && matches(item.ref));
    // A pending-only proposal needs the same durable identity barrier as an already verified item.
    // Future exact normalized recurrence finds this retired entry instead of becoming a fresh proposal.
    for (const proposal of rejected) {
      const type = proposal.type === 'skill' || proposal.type === 'user' ? proposal.type : 'lesson';
      const { item } = learn.upsert(ledger, { type, ref: proposal.ref, source: 'owner-forget', now: Date.parse(at) });
      if (item && item.forgottenAt == null) {
        item.status = 'retired'; item.confidence = 0; item.forgottenAt = at;
        retired.push({ file: 'ledger.json', line: item.ref });
      }
    }
    if (retired.length) plans.push({ file: 'ledger.json', json: ledger, removed: retired });
    if (rejected.length) plans.push({ file: current, json: pending.filter((item) => !item || !matches(item.ref)), removed: rejected.map((item) => ({ file: current, line: item.ref })) });
    for (const file of files) {
      current = file;
      const text = readOptional(path.join(dir, file));
      if (text === null) continue;
      const lines = text.split('\n'), hits = lines.filter((line) => line.trim() && matches(line));
      if (hits.length) plans.push({ file, text: lines.filter((line) => !line.trim() || !matches(line)).join('\n'), removed: hits.map((line) => ({ file, line: line.trim() })) });
    }
    current = 'TOMBSTONES.md';
    tombBefore = readOptional(path.join(dir, current)) || '';
    current = AUDIT_PENDING;
    pendingAudit = readArray(path.join(dir, current));
    if (pendingAudit.some((r) => !r || typeof r.id !== 'string' || !/^[a-f0-9]{32}$/.test(r.id)
      || typeof r.at !== 'string' || !Number.isFinite(Date.parse(r.at)) || typeof r.phrase !== 'string'
      || !Array.isArray(r.removed) || r.removed.some((x) => !x || typeof x.file !== 'string' || typeof x.line !== 'string'))) {
      throw new Error('invalid pending audit receipt');
    }
  } catch (e) {
    return { error: 'could not read ' + current + '; nothing was forgotten (' + (e.code || e.message) + ')', removed, count: 0 };
  }
  for (const plan of plans) {
    try {
      const file = path.join(dir, plan.file);
      if (plan.json) atomicWriteJSON(file, plan.json); else writeText(file, plan.text);
      removed.push(...plan.removed);
    } catch (e) {
      errors.push('could not update ' + plan.file + ' (' + (e.code || e.message) + ')');
      break; // never imply later memory files were changed
    }
  }
  let auditRecovered = 0;
  const auditRecords = pendingAudit.slice();
  if (removed.length) auditRecords.push({ id: crypto.randomBytes(16).toString('hex'), at, phrase: p, removed, partial: errors.length > 0 });
  if (auditRecords.length) {
    let step = AUDIT_PENDING;
    try {
      // Keep completed removals recoverable when only the tombstone write fails. The marker makes
      // retry idempotent even if the tombstone landed but clearing this private receipt did not.
      if (removed.length) atomicWriteJSON(path.join(dir, AUDIT_PENDING), auditRecords);
      step = 'TOMBSTONES.md';
      const missing = auditRecords.filter((r) => !tombBefore.includes(auditMarker(r)));
      if (missing.length) writeText(path.join(dir, step), tombBefore + missing.map(formatAudit).join(''));
      step = AUDIT_PENDING;
      atomicWriteJSON(path.join(dir, AUDIT_PENDING), []);
      auditRecovered = pendingAudit.reduce((n, r) => n + r.removed.length, 0);
    } catch (e) { errors.push('could not write ' + step + ' (' + (e.code || e.message) + ')'); }
  }
  const result = { removed, count: removed.length, at, auditRecovered };
  if (errors.length) {
    result.error = errors.join('; ') + (removed.length ? '; some removals took effect — inspect memory and retry' : '; nothing was forgotten');
    result.partial = removed.length > 0;
  }
  return result;
}

module.exports = { forgetMemory };
