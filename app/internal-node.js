'use strict';

// Electron's executable is also our Node runtime. Set its mode only when invoking an
// internal JavaScript helper; scoped model/check environments must not inherit it.
function internalNodeEnv(env, versions = process.versions) {
  const next = externalEnv(env);
  if (versions.electron) next.ELECTRON_RUN_AS_NODE = '1';
  return next;
}

function externalEnv(env) {
  const next = { ...env };
  delete next.ELECTRON_RUN_AS_NODE;
  return next;
}

// claude-bin can unwrap a Windows npm shim to cli.js under our own runtime. That
// explicit script invocation needs Node mode too; native model binaries do not.
function scriptEnv(command, args, env, runtime = process) {
  return command === runtime.execPath && Array.isArray(args) && typeof args[0] === 'string' && /\.(?:cjs|mjs|js)$/i.test(args[0])
    ? internalNodeEnv(env, runtime.versions) : externalEnv(env);
}

module.exports = { internalNodeEnv, externalEnv, scriptEnv };
