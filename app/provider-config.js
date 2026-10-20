'use strict';
// Shared by the desktop settings and terminal setup. Values are data, never shell text.
const providers = require('./providers');
const MODES = Object.freeze({ subscription: 'claude', chatgpt: 'chatgpt', apikey: 'claude-api', 'openai-key': 'openai' });
function modeFor(env) {
  if (env.URFAEL_PROVIDER === 'chatgpt') return 'chatgpt';
  if (env.URFAEL_PROVIDER === 'openai') return 'openai-key';
  if (env.URFAEL_PROVIDER === 'claude-api') return 'apikey';
  return env.ANTHROPIC_BASE_URL ? 'local' : env.ANTHROPIC_API_KEY ? 'apikey' : 'subscription';
}
function configure(current, cfg) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg) || typeof cfg.mode !== 'string' || (!Object.hasOwn(MODES, cfg.mode) && cfg.mode !== 'local')) throw new Error('Choose a supported provider.');
  const next = { ...current };
  for (const key of [...providers.MANAGED, 'URFAEL_NATIVE_MODEL', 'URFAEL_FABLE_MODEL']) delete next[key];
  const value = (v) => {
    if (typeof v !== 'string' || /[\r\n\0]/.test(v)) throw new Error('Provider settings must be single-line values.');
    return v.trim();
  };
  next.URFAEL_PROVIDER = MODES[cfg.mode] || 'claude';
  if (cfg.mode === 'apikey' || cfg.mode === 'openai-key') {
    const key = value(cfg.key);
    if (!key) throw new Error('Enter the selected provider’s API key.');
    next[cfg.mode === 'apikey' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'] = key;
  }
  if (cfg.mode === 'local') {
    const url = new URL(value(cfg.url));
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Enter an http(s) endpoint without embedded credentials.');
    next.ANTHROPIC_BASE_URL = url.toString().replace(/\/$/, '');
    next.ANTHROPIC_AUTH_TOKEN = cfg.token ? value(cfg.token) : 'local';
  }
  if (cfg.model) next.URFAEL_NATIVE_MODEL = value(cfg.model);
  if (Object.hasOwn(cfg, 'commands')) next.URFAEL_NATIVE_EXEC = cfg.commands === true ? '1' : '0';
  return next;
}
module.exports = { configure, modeFor, MODES };
