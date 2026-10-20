'use strict';
// Official clients own browser sign-in and credential storage. No credential file reads.
const { spawn } = require('child_process');
const codex = require('./codex-backend');
function command(provider, env = process.env) {
  if (provider === 'chatgpt') { const r = codex.resolve(env); return { ...r, args: r.pre.concat(['login']) }; }
  if (provider === 'subscription') { const r = require('./claude-bin').resolve(env); return { ...r, args: r.pre.concat(['auth', 'login']) }; }
  throw new Error('Choose Claude or ChatGPT subscription sign-in.');
}
function login(provider, env = process.env) {
  const cmd = command(provider, env);
  return new Promise((resolve) => {
    let child, timer, settled = false;
    const finish = (r) => { if (settled) return; settled = true; clearTimeout(timer); resolve(r); };
    const stop = () => {
      if (child && child.pid && process.platform !== 'win32') { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
      else if (child) { try { child.kill(); } catch {} }
    };
    try {
      const childEnv = codex.childEnv(env);
      if (process.versions.electron && cmd.bin === process.execPath && cmd.pre.length) childEnv.ELECTRON_RUN_AS_NODE = '1';
      child = spawn(cmd.bin, cmd.args, { env: childEnv, cwd: require('os').homedir(), stdio: 'ignore', detached: process.platform !== 'win32', windowsHide: true });
      child.once('error', () => finish({ ok: false, error: 'Install the official ' + (provider === 'chatgpt' ? 'Codex' : 'Claude Code') + ' CLI, then try sign-in again.' }));
      child.once('close', (code) => finish({ ok: code === 0, error: code === 0 ? undefined : 'Sign-in did not finish. You can also sign in from your terminal.' }));
      timer = setTimeout(() => { stop(); finish({ ok: false, error: 'Sign-in timed out. Try again when you are ready to complete it in your browser.' }); }, 180000);
    } catch { stop(); finish({ ok: false, error: 'Could not start the official sign-in client.' }); }
  });
}
module.exports = { command, login };
