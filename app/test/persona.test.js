'use strict';
// Tests for app/persona.js — the shared owner-detection + placeholder-fill + vault self-heal used by BOTH the
// setup wizard and the daemon boot, so the brain can never see a raw {{USER_NAME}} and a GUI/.dmg user (who
// never ran install.sh) is never left with a missing vault. Pure functions + injected fs, no real spawn.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const persona = require('../persona');

test('hasPlaceholders detects any of the four tokens, and a filled file has none', () => {
  assert.equal(persona.hasPlaceholders('Hi {{USER_NAME}}'), true);
  assert.equal(persona.hasPlaceholders('based in {{CITY}} ({{TIMEZONE}})'), true);
  assert.equal(persona.hasPlaceholders('respond in {{LANGUAGE}}'), true);
  assert.equal(persona.hasPlaceholders('Hi friend, based in Vienna'), false);
  assert.equal(persona.hasPlaceholders(''), false);
  assert.equal(persona.hasPlaceholders(null), false);
});

test('fillPlaceholders substitutes all four, and a BLANK field never leaves a raw token', () => {
  const md = 'You are {{USER_NAME}} in {{CITY}} ({{TIMEZONE}}), reply in {{LANGUAGE}}.';
  const full = persona.fillPlaceholders(md, { name: 'Max', city: 'Vienna', timezone: 'Europe/Vienna', language: 'German' });
  assert.equal(full, 'You are Max in Vienna (Europe/Vienna), reply in German.');
  // the critical case: every field empty → sensible fallbacks, ZERO raw tokens remain (the brain must never see {{...}})
  const fallback = persona.fillPlaceholders(md, { name: '', city: '  ', timezone: null, language: undefined });
  assert.equal(fallback, 'You are friend in your city (local), reply in English.');
  assert.equal(persona.hasPlaceholders(fallback), false);
  // repeated occurrences all fill (global replace)
  assert.equal(persona.fillPlaceholders('{{USER_NAME}} {{USER_NAME}}', { name: 'A' }), 'A A');
});

test('detectPersona: git name wins, falls back to email localpart then env USER; never throws', () => {
  const spawnSync = (cmd, args) => {
    const k = args[1];
    if (k === 'user.name') return { stdout: 'Ada Lovelace\n' };
    if (k === 'user.email') return { stdout: 'ada@example.com\n' };
    return { stdout: '' };
  };
  const p = persona.detectPersona({ spawnSync, env: {}, intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: 'Europe/London', locale: 'en-GB' }) }) } });
  assert.equal(p.name, 'Ada Lovelace');
  assert.equal(p.city, 'London');
  assert.equal(p.timezone, 'Europe/London');
  assert.equal(p.language, 'English');
  // no git name → email localpart
  const noName = persona.detectPersona({ spawnSync: (c, a) => ({ stdout: a[1] === 'user.email' ? 'bob@corp.io' : '' }), env: {}, intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: 'America/New_York', locale: 'en-US' }) }) } });
  assert.equal(noName.name, 'bob');
  assert.equal(noName.city, 'New York');
  // no git at all → env USER; a throwing spawn is swallowed
  const envOnly = persona.detectPersona({ spawnSync: () => { throw new Error('no git'); }, env: { USER: 'carol' }, intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: 'UTC', locale: 'fr-FR' }) }) } });
  assert.equal(envOnly.name, 'carol');
  assert.equal(envOnly.language, 'French');
});

test('ensureVault scaffolds from the template when absent, and is a no-op when the vault exists', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'urfael-persona-'));
  const template = path.join(dir, 'tpl'); const vault = path.join(dir, 'Urfael');
  fs.mkdirSync(path.join(template, '_urfael'), { recursive: true });
  fs.writeFileSync(path.join(template, 'CLAUDE.md'), 'You are {{USER_NAME}}.');
  fs.mkdirSync(path.join(template, 'memory'), { recursive: true });
  fs.writeFileSync(path.join(template, 'memory', 'x.md'), 'mem');
  const r = persona.ensureVault(vault, template, fs);
  assert.equal(r.created, true); assert.equal(r.ok, true);
  assert.ok(fs.existsSync(path.join(vault, 'CLAUDE.md')), 'vault CLAUDE.md copied');
  assert.equal(fs.existsSync(path.join(vault, 'memory')), false, 'the template memory/ dir is removed (memory lives elsewhere)');
  // idempotent: a second call leaves it untouched
  fs.writeFileSync(path.join(vault, 'CLAUDE.md'), 'EDITED');
  assert.equal(persona.ensureVault(vault, template, fs).created, false);
  assert.equal(fs.readFileSync(path.join(vault, 'CLAUDE.md'), 'utf8'), 'EDITED', 'an existing vault is never overwritten');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('ensureVault falls back to a minimal vault when no template exists (never leaves the daemon without a cwd)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'urfael-persona-'));
  const vault = path.join(dir, 'Urfael');
  const r = persona.ensureVault(vault, path.join(dir, 'nonexistent-template'), fs);
  assert.equal(r.created, true); assert.equal(r.minimal, true);
  assert.ok(fs.existsSync(path.join(vault, 'CLAUDE.md')), 'a minimal CLAUDE.md exists so turns have a valid cwd');
  assert.equal(persona.hasPlaceholders(fs.readFileSync(path.join(vault, 'CLAUDE.md'), 'utf8')), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('ensurePersona fills a placeholdered CLAUDE.md and is a no-op on an already-filled one', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'urfael-persona-'));
  const vault = path.join(dir, 'Urfael'); fs.mkdirSync(vault);
  fs.writeFileSync(path.join(vault, 'CLAUDE.md'), 'You are {{USER_NAME}} in {{CITY}}.');
  const deps = { spawnSync: () => ({ stdout: '' }), env: { USER: 'dave' }, intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: 'Europe/Berlin', locale: 'de-DE' }) }) } };
  const r = persona.ensurePersona(vault, fs, deps);
  assert.equal(r.filled, true);
  const md = fs.readFileSync(path.join(vault, 'CLAUDE.md'), 'utf8');
  assert.equal(persona.hasPlaceholders(md), false);
  assert.match(md, /dave/); assert.match(md, /Berlin/);
  // second run: nothing left to fill
  assert.equal(persona.ensurePersona(vault, fs, deps).filled, false);
  // missing CLAUDE.md is a safe no-op, not an error
  const empty = path.join(dir, 'empty'); fs.mkdirSync(empty);
  assert.deepEqual(persona.ensurePersona(empty, fs, deps), { filled: false, ok: true });
  fs.rmSync(dir, { recursive: true, force: true });
});
