'use strict';
// app/persona.js — the ONE place that (a) detects who the owner is, (b) fills the CLAUDE.md {{PLACEHOLDERS}},
// and (c) guarantees a usable vault exists. Shared by the `urfael setup` wizard AND the daemon's boot-time
// self-heal, so a user can NEVER end up with the brain addressing them as "{{USER_NAME}}" or a daemon whose
// working directory (the vault) does not exist — no matter how they installed (install.sh, the .dmg GUI that
// never scaffolds a vault, or a hand-copied tree). Pure functions where possible; fs/spawn injected for tests.

const PLACEHOLDER_RE = /\{\{(USER_NAME|CITY|TIMEZONE|LANGUAGE)\}\}/;

const LANGS = { en: 'English', de: 'German', fr: 'French', es: 'Spanish', it: 'Italian', pt: 'Portuguese', nl: 'Dutch', ru: 'Russian', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', ar: 'Arabic', hi: 'Hindi', pl: 'Polish', tr: 'Turkish', sv: 'Swedish', uk: 'Ukrainian' };

// detectPersona({ env?, spawnSync?, intl? }) → { name, city, timezone, language }. Best-effort, never throws.
// git user.name → email localpart → $USER/$LOGNAME/$USERNAME; timezone/locale from Intl; language from locale.
function detectPersona(deps) {
  deps = deps || {};
  const env = deps.env || process.env || {};
  const spawnSync = deps.spawnSync || require('child_process').spawnSync;
  const tryGit = (k) => { try { return String(spawnSync('git', ['config', k], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).stdout || '').trim(); } catch { return ''; } };
  let name = tryGit('user.name');
  const email = tryGit('user.email');
  if (!name && email) name = email.split('@')[0];
  if (!name) name = String(env.USER || env.LOGNAME || env.USERNAME || '');
  let tz = '', locale = '';
  try { const o = (deps.intl || Intl).DateTimeFormat().resolvedOptions(); tz = o.timeZone || ''; locale = o.locale || ''; } catch {}
  const city = tz.includes('/') ? tz.split('/').pop().replace(/_/g, ' ') : '';
  const language = LANGS[(String(locale).split('-')[0] || 'en').toLowerCase()] || 'English';
  return { name, city, timezone: tz, language };
}

// hasPlaceholders(md) — is there any unfilled {{USER_NAME|CITY|TIMEZONE|LANGUAGE}} left? PURE.
function hasPlaceholders(md) { return PLACEHOLDER_RE.test(String(md || '')); }

// fillPlaceholders(md, persona) — replace the four placeholders with detected values, each with a safe fallback
// so a blank field never leaves a raw token (the brain must never see "{{USER_NAME}}"). PURE.
function fillPlaceholders(md, persona) {
  const p = persona || {};
  return String(md == null ? '' : md)
    .replace(/\{\{USER_NAME\}\}/g, (p.name && String(p.name).trim()) || 'friend')
    .replace(/\{\{CITY\}\}/g, (p.city && String(p.city).trim()) || 'your city')
    .replace(/\{\{TIMEZONE\}\}/g, (p.timezone && String(p.timezone).trim()) || 'local')
    .replace(/\{\{LANGUAGE\}\}/g, (p.language && String(p.language).trim()) || 'English');
}

// ensureVault(vaultDir, templateDir, fsx?) — scaffold the vault from the template if it is absent, so a daemon
// (or the GUI) never runs with a missing working directory. Idempotent + fail-soft: an existing vault is left
// untouched; any error is swallowed and reported via the return value. Returns { created, ok, error? }.
function ensureVault(vaultDir, templateDir, fsx) {
  const fs = fsx || require('fs');
  const path = require('path');
  try {
    if (fs.existsSync(vaultDir)) return { created: false, ok: true };
    if (!templateDir || !fs.existsSync(templateDir)) {
      // No template to copy from (an odd install). Still guarantee a cwd + a minimal CLAUDE.md so turns don't
      // die on a missing directory — better a bare vault than a spawn ENOENT.
      fs.mkdirSync(vaultDir, { recursive: true });
      const md = path.join(vaultDir, 'CLAUDE.md');
      if (!fs.existsSync(md)) fs.writeFileSync(md, 'You are Urfael, a concise, capable personal assistant.\n');
      return { created: true, ok: true, minimal: true };
    }
    fs.cpSync(templateDir, vaultDir, { recursive: true });
    try { fs.rmSync(path.join(vaultDir, 'memory'), { recursive: true, force: true }); } catch {}   // memory lives in ~/Urfael-memory
    // Claude Code reads commands/hooks via .claude → _urfael. A symlink is ideal; a junction/copy is the win32
    // fallback. Best-effort — the vault still works for turns without it.
    const dotClaude = path.join(vaultDir, '.claude'), target = path.join(vaultDir, '_urfael');
    try { if (!fs.existsSync(dotClaude) && fs.existsSync(target)) fs.symlinkSync('_urfael', dotClaude); } catch {
      try { fs.symlinkSync(target, dotClaude, 'junction'); } catch {}
    }
    return { created: true, ok: true };
  } catch (e) { return { created: false, ok: false, error: String((e && e.message) || e) }; }
}

// ensurePersona(vaultDir, fsx?, deps?) — if CLAUDE.md still carries raw placeholders, fill them from
// detectPersona() and rewrite the file. Idempotent (a filled file is a no-op) and fail-soft. Returns
// { filled, ok, error? }. This is the daemon's guarantee that the model never sees "{{USER_NAME}}".
function ensurePersona(vaultDir, fsx, deps) {
  const fs = fsx || require('fs');
  const path = require('path');
  const file = path.join(vaultDir, 'CLAUDE.md');
  try {
    let md; try { md = fs.readFileSync(file, 'utf8'); } catch { return { filled: false, ok: true }; }   // no CLAUDE.md → nothing to fill
    if (!hasPlaceholders(md)) return { filled: false, ok: true };
    const filled = fillPlaceholders(md, detectPersona(deps));
    fs.writeFileSync(file, filled);
    return { filled: true, ok: true };
  } catch (e) { return { filled: false, ok: false, error: String((e && e.message) || e) }; }
}

module.exports = { detectPersona, hasPlaceholders, fillPlaceholders, ensureVault, ensurePersona, PLACEHOLDER_RE };
