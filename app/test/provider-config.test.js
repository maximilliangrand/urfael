'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { configure, modeFor } = require('../provider-config');
const { command } = require('../provider-login');
test('API providers have separate keys and clear stale CLI routing and model overrides', () => {
  const current = { ANTHROPIC_AUTH_TOKEN: 'stale', ANTHROPIC_BASE_URL: 'https://other.invalid', CLAUDE_CODE_USE_BEDROCK: '1', URFAEL_FABLE_MODEL: 'old', URFAEL_NATIVE_MODEL: 'old', URFAEL_MODE: 'fortress' };
  const openai = configure(current, { mode: 'openai-key', key: 'openai-key', commands: true });
  assert.equal(openai.OPENAI_API_KEY, 'openai-key');
  assert.equal(openai.URFAEL_PROVIDER, 'openai');
  assert.equal(openai.URFAEL_NATIVE_EXEC, '1');
  assert.equal(openai.URFAEL_MODE, 'fortress');
  for (const k of ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_USE_BEDROCK', 'URFAEL_FABLE_MODEL', 'URFAEL_NATIVE_MODEL']) assert.equal(openai[k], undefined);
  const anthropic = configure(openai, { mode: 'apikey', key: 'anthropic-key' });
  assert.equal(anthropic.OPENAI_API_KEY, undefined);
  assert.equal(anthropic.ANTHROPIC_API_KEY, 'anthropic-key');
  assert.equal(anthropic.URFAEL_PROVIDER, 'claude-api');
  assert.equal(modeFor(anthropic), 'apikey');
  assert.equal(current.ANTHROPIC_AUTH_TOKEN, 'stale');
});
test('subscription choice cannot inherit an API credential or enable execution implicitly', () => {
  for (const mode of ['subscription', 'chatgpt']) {
    const env = configure({ OPENAI_API_KEY: 'old', ANTHROPIC_API_KEY: 'old' }, { mode });
    assert.equal(env.OPENAI_API_KEY, undefined);
    assert.equal(env.ANTHROPIC_API_KEY, undefined);
    assert.equal(env.URFAEL_NATIVE_EXEC, undefined);
    assert.equal(modeFor(env), mode);
  }
});
test('reject invalid modes, config line injection, and credential-bearing custom URLs', () => {
  for (const mode of ['anonymous', 'constructor', '__proto__', ['chatgpt'], null]) assert.throws(() => configure({}, { mode }));
  assert.equal(modeFor({ URFAEL_PROVIDER: 'claude-api' }), 'apikey');
  assert.throws(() => configure({}, { mode: 'apikey', key: 'key\nURFAEL_NATIVE_EXEC=1' }));
  assert.throws(() => configure({}, { mode: 'openai-key', key: '' }));
  assert.throws(() => configure({}, { mode: 'local', url: 'https://user:secret@example.com' }));
  assert.throws(() => configure({}, { mode: 'local', url: 'file:///tmp/test' }));
});
test('login commands use only the official provider-specific flow', () => {
  const env = { URFAEL_CODEX_BIN: '/usr/bin/codex', URFAEL_CLAUDE_BIN: '/usr/bin/claude' };
  assert.deepEqual(command('chatgpt', env).args, ['login']);
  assert.deepEqual(command('subscription', env).args, ['auth', 'login']);
  assert.throws(() => command('chatgpt; echo unsafe', env));
});
