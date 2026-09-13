'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const progress = require('../goal-progress');
const {checkInvocation,boundedRun} = require('../goal-loop');
const ROOT = path.resolve(__dirname, '../..');
const LOOP = path.join(ROOT, 'app/goal-loop.js');

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'urfael-progress-'));
  const repo = path.join(dir, 'repo'), home = path.join(dir, 'home');
  fs.mkdirSync(repo); fs.mkdirSync(path.join(home, '.claude/urfael'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude/urfael/repo'), ROOT);
  const git = (...args) => cp.execFileSync('git', ['-C', repo, ...args], { stdio: 'pipe' });
  git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
  fs.writeFileSync(path.join(repo, 'source.txt'), 'baseline');
  fs.writeFileSync(path.join(repo, '.gitignore'), 'ignored\n');
  git('add', '.'); git('commit', '-qm', 'fixture');
  const config = path.join(dir, 'config.json'), calls = path.join(dir, 'calls.json');
  const stub = path.join(dir, 'claude.js');
  fs.writeFileSync(stub, `#!/usr/bin/env node
const fs = require('fs'), path = require('path');
const config = JSON.parse(fs.readFileSync(process.env.URFAEL_TEST_CONFIG));
const callsFile = process.env.URFAEL_TEST_CALLS;
let calls = []; try { calls = JSON.parse(fs.readFileSync(callsFile)); } catch {}
const argv = process.argv.slice(2), prompt = argv[argv.indexOf('-p')+1] || '';
const verifier = prompt.includes('Independent completion review');
const workerN = calls.filter(c => !c.verifier).length;
const step = verifier ? {} : (config.steps || [])[workerN] || {};
calls.push({argv, verifier, pid: process.pid}); fs.writeFileSync(callsFile, JSON.stringify(calls));
if (step.write) fs.writeFileSync(path.join(process.cwd(), 'source.txt'), step.write);
if (step.criteria) fs.writeFileSync(config.criteria, step.criteria);
if (verifier && config.verifierWrite) fs.writeFileSync(path.join(process.cwd(), 'source.txt'), config.verifierWrite);
const emit = () => {
 if (step.fail) process.exit(3);
 if (step.spam) { process.stdout.write('x'.repeat(10 * 1024 * 1024)); return; }
 let result = step.marker === false ? 'still working' : 'did work\\nURFAEL-GOAL-DONE';
 if (verifier) result = JSON.stringify(config.refute ? {verdict:'refute', reason:'fixture incomplete'} : {verdict:'pass', met:[{id:'c1',evidence:'source.txt inspected'}], reason:'ok'});
 process.stdout.write(JSON.stringify({result, session_id: verifier ? 'verifier-session' : 'worker-session', is_error: !!step.isError}));
};
if (step.wait) { const timer = setInterval(() => { if (fs.existsSync(config.barrier)) { clearInterval(timer); emit(); } }, 10); } else emit();
`, { mode: 0o755 });
  const state = path.join(dir, 'job.progress.json');
  const criteria = path.join(dir, 'criteria.txt'); fs.writeFileSync(criteria, 'source is correct\n');
  const env = { PATH: process.env.PATH, HOME: home, USERPROFILE: home, URFAEL_CLAUDE_BIN: stub,
    URFAEL_TEST_CONFIG: config, URFAEL_TEST_CALLS: calls, URFAEL_UPDATE_CHECK: '0',
    SystemRoot: process.env.SystemRoot || '', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: path.join(dir, 'empty-git-config') };
  const args = ['goal', '--repo', repo, '--state', state, '--max-iters', '4', '--max-mins', '2', '--turn-timeout', '10'];
  const set = (c) => fs.writeFileSync(config, JSON.stringify({ criteria, ...c })); set({});
  const run = (extra = []) => cp.spawnSync(process.execPath, [LOOP, ...args, ...extra], { env, encoding: 'utf8', timeout: 30000 });
  const read = () => JSON.parse(fs.readFileSync(state, 'utf8'));
  const readCalls = () => JSON.parse(fs.readFileSync(calls, 'utf8'));
  const diagnostics = (r) => {
    const readOr = (p) => {try{return fs.readFileSync(p,'utf8');}catch{return '<absent>';}};
    return (r.stdout||'')+(r.stderr||'')+'\nProgress: '+readOr(state)+'\nCheck count: '+readOr(path.join(dir,'check-count'))+
      '\nCheck processes: '+readOr(path.join(dir,'check-processes.json'))+'\nLog tail: '+readOr(state+'.log').slice(-5000);
  };
  const cleanup = (primaryError) => {
    let owned=[];try{owned=JSON.parse(fs.readFileSync(path.join(dir,'check-processes.json')));}catch{}
    for(const child of owned)if(child.exitCode===null&&progress.alive(child.pid))try {
      if(process.platform==='win32')cp.execFileSync('taskkill',['/pid',String(child.pid),'/T','/F'],{stdio:'ignore',timeout:5000});
      else process.kill(child.pid,'SIGKILL');
    }catch{}
    try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:8,retryDelay:50});}
    catch(e){if(!primaryError)throw e;primaryError.message+='\nCleanup also failed: '+e.message;}
  };
  const options = {goal:'goal',repo,maxIters:4,maxMins:2,turnTimeout:10,check:'',model:'sonnet',verify:false,criteria:'',state};
  return {dir,repo,git,env,args,state,criteria,set,run,read,readCalls,cleanup,diagnostics,options};
}
function scriptCheck(f, source) {
  const p = path.join(f.dir, "acceptance check's result.js");
  const records = path.join(f.dir,'check-processes.json');
  // Record actual native-process exit codes as test diagnostics, independently of PowerShell's status.
  const observe = `{const fs=require('fs'),p=${JSON.stringify(records)};let a=[];try{a=JSON.parse(fs.readFileSync(p))}catch{}const entry={pid:process.pid,exitCode:null,pathExt:process.env.PATHEXT};a.push(entry);fs.writeFileSync(p,JSON.stringify(a));process.on('exit',code=>{entry.exitCode=code;fs.writeFileSync(p,JSON.stringify(a));});}\n`;
  fs.writeFileSync(p, observe+source);
  if (process.platform === 'win32') {
    const literal = (s) => "'" + s.replace(/'/g, "''") + "'";
    // PowerShell treats a quoted executable path as a string unless invoked with &. Explicitly
    // propagate the native status so the exit-7 feedback fixture tests that actual code, not PS's 1.
    return '& ' + literal(process.execPath) + ' ' + literal(p) + '; exit $LASTEXITCODE';
  }
  const literal = (s) => "'" + s.replace(/'/g, "'\"'\"'") + "'";
  return literal(process.execPath) + ' ' + literal(p);
}

test('workspace receipt detects edits with identical porcelain, untracked bytes, deletion, mode and symlinks', () => {
  const f = fixture();
  try {
    fs.writeFileSync(path.join(f.repo, 'source.txt'), 'one'); const a = progress.workspaceHash(f.repo), status = f.git('status', '--porcelain').toString();
    fs.writeFileSync(path.join(f.repo, 'source.txt'), 'two'); assert.equal(f.git('status', '--porcelain').toString(), status); assert.notEqual(progress.workspaceHash(f.repo), a);
    fs.writeFileSync(path.join(f.repo, 'new.txt'), 'one'); const b = progress.workspaceHash(f.repo);
    fs.writeFileSync(path.join(f.repo, 'new.txt'), 'two'); assert.notEqual(progress.workspaceHash(f.repo), b);
    const c = progress.workspaceHash(f.repo); fs.writeFileSync(path.join(f.repo, 'ignored'), 'build output'); assert.equal(progress.workspaceHash(f.repo), c);
    fs.unlinkSync(path.join(f.repo, 'source.txt')); assert.notEqual(progress.workspaceHash(f.repo), c);
    if (process.platform !== 'win32') {
      const d = progress.workspaceHash(f.repo); fs.chmodSync(path.join(f.repo, 'new.txt'), 0o755); assert.notEqual(progress.workspaceHash(f.repo), d);
      fs.symlinkSync('new.txt', path.join(f.repo, 'link')); const e = progress.workspaceHash(f.repo);
      fs.unlinkSync(path.join(f.repo, 'link')); fs.symlinkSync('elsewhere', path.join(f.repo, 'link')); assert.notEqual(progress.workspaceHash(f.repo), e);
    }
  } finally { f.cleanup(); }
});

test('acceptance receipts retain failing explicit-shell and native-program exit codes', () => {
  for(const kind of ['shell','native']) {
    const f=fixture();try {
      const check=kind==='shell'?'exit 7':scriptCheck(f,'process.exit(7);');
      const r=f.run(['--max-iters','1','--check',check]);
      assert.equal(r.status,2,f.diagnostics(r));assert.equal(f.read().verification.checkReceipt.exitCode,7,f.diagnostics(r));
      assert.equal(f.read().result,null,f.diagnostics(r));
      if(kind==='native')assert.equal(JSON.parse(fs.readFileSync(path.join(f.dir,'check-processes.json')))[0].exitCode,7);
    } finally {f.cleanup();}
  }
});

test('PowerShell transport round-trips complete command source including literal quotes and exit variables', () => {
  const command="& 'C:\\Program Files\\node.exe' 'C:\\owner''s work\\check.js'; exit $LASTEXITCODE";
  const invocation=checkInvocation(command,'win32');
  assert.equal(invocation.bin,'powershell.exe');assert.equal(invocation.args.includes('-NonInteractive'),true);
  assert.equal(Buffer.from(invocation.args[invocation.args.indexOf('-EncodedCommand')+1],'base64').toString('utf16le'),command);
});

test('Windows check environment restores missing executable extensions and rejects asynchronous document dispatch', () => {
  const original={PATH:'fixture-path',HOME:'fixture-home'};
  assert.equal(checkInvocation('exit 7','win32',original).env.PATHEXT,'.COM;.EXE;.BAT;.CMD');
  assert.equal(Object.hasOwn(original,'PATHEXT'),false,'the parent environment is never mutated');
  const custom={...original,PathExt:'.exe;.CUSTOM'};
  const restored=checkInvocation('exit 7','win32',custom).env;
  assert.equal(restored.PATHEXT,'.exe;.CUSTOM');assert.equal(Object.hasOwn(restored,'PathExt'),false);
  assert.throws(()=>checkInvocation('exit 7','win32',{...original,PATHEXT:'.CPL'}),/PATHEXT/);
});

test('failed post-spawn progress persistence waits for owned child close, including asynchronous spawn errors', async () => {
  const f=fixture();try {
    for(const executable of [process.execPath,path.join(f.dir,'missing-executable')]) {
      let pid;
      const result=await boundedRun(executable,['-e','setInterval(()=>{},1000)'],{cwd:f.repo,errTo:path.join(f.dir,'spawn.log')},2,
        {save:(patch)=>{if(patch.phase==='worker'){pid=patch.childPid;throw new Error('fixture handoff write failed');}}},'worker');
      assert.equal(result.rc,127);if(pid)assert.equal(progress.alive(pid),false,'cannot retry while the old child still exists');
    }
  } finally {f.cleanup();}
});

test('passing baseline check without a final worker marker cannot complete or spawn a verifier', () => {
  const f = fixture();
  try {
    f.set({steps:Array(4).fill({marker:false})});
    const count = path.join(f.dir, 'check-count');
    const check = scriptCheck(f, `require('fs').appendFileSync(${JSON.stringify(count)}, 'x');`);
    const r = f.run(['--check',check,'--verify','--criteria',f.criteria]);
    assert.equal(r.status,2,r.stdout+r.stderr); assert.equal(f.read().outcome,'stopped');
    assert.equal(fs.existsSync(count),false,'checks require a candidate marker');
    assert.equal(f.readCalls().some(c => c.verifier),false);
  } finally { f.cleanup(); }
});

test('a marker runs one check and one independent review, with a content-bound receipt', () => {
  const f = fixture();
  try {
    const count = path.join(f.dir, 'check-count');
    const check = scriptCheck(f, `const fs=require('fs'); fs.appendFileSync(${JSON.stringify(count)},'x'); if(fs.readFileSync(${JSON.stringify(count)},'utf8').length>1)process.exit(1);`);
    const r = f.run(['--check',check,'--verify','--criteria',f.criteria]);
    assert.equal(r.status,0,r.stdout+r.stderr);
    const s=f.read(); assert.equal(s.iterations,1); assert.equal(s.outcome,'completed'); assert.equal(s.verification.status,'passed');
    assert.equal(s.result.workspaceHash,progress.workspaceHash(f.repo)); assert.equal(s.result.independentlyVerified,true);
    assert.match(s.result.summary,/did work/);assert.equal(s.result.head,progress.head(f.repo));assert.equal(s.result.baselineHead,s.baselineHead);
    assert.equal(s.result.progressLog,f.state+'.log');
    assert.equal(s.verification.checkReceipt.command, check); assert.equal(s.verification.checkReceipt.exitCode,0);
    assert.equal(s.verification.checkReceipt.timedOut,false); assert.equal(s.verification.checkReceipt.workspaceHash,s.result.workspaceHash);
    assert.equal(f.readCalls().length,2); assert.equal(fs.readFileSync(count,'utf8'),'x');
    const verifier=f.readCalls()[1].argv; assert.equal(verifier.includes('--resume'),false); assert.equal(verifier.includes('Read,Grep,Glob'),true);
    assert.equal(s.resumable,false);
  } finally { f.cleanup(); }
});

test('a red first check cannot be bypassed by running a second green check', () => {
  const f=fixture();
  try {
    const count=path.join(f.dir,'check-count');
    const check=scriptCheck(f,`const fs=require('fs');fs.appendFileSync(${JSON.stringify(count)},'x');process.exit(fs.readFileSync(${JSON.stringify(count)},'utf8').length===1?1:0);`);
    // Localize native status transport independently of the loop before testing its candidate gate.
    const invocation=checkInvocation(check,process.platform,f.env);
    const preflight=cp.spawnSync(invocation.bin,invocation.args,{cwd:f.repo,env:invocation.env||f.env,encoding:'utf8',timeout:10000});
    assert.equal(preflight.status,1,'Direct shell preflight: '+check+'\n'+f.diagnostics(preflight));
    fs.unlinkSync(count);fs.writeFileSync(path.join(f.dir,'check-processes.json'),'[]');
    const r=f.run(['--max-iters','1','--check',check,'--verify','--criteria',f.criteria]);
    assert.equal(r.status,2,f.diagnostics(r));assert.equal(f.read().outcome,'stopped');assert.equal(fs.readFileSync(count,'utf8'),'x');
    assert.equal(f.readCalls().some(c=>c.verifier),false);
  } finally { f.cleanup(); }
});

test('check-only failure feeds command, exit code and bounded diagnostics into the next worker turn', () => {
  const f=fixture();try {
    const count=path.join(f.dir,'check-count');
    const check=scriptCheck(f,`const fs=require('fs');fs.appendFileSync(${JSON.stringify(count)},'x');if(fs.readFileSync(${JSON.stringify(count)},'utf8').length===1){process.stderr.write('fixture assertion failed');process.exit(7);}`);
    const r=f.run(['--check',check]);assert.equal(r.status,0,f.diagnostics(r));assert.equal(f.read().iterations,2,f.diagnostics(r));
    const argv=f.readCalls()[1].argv,prompt=argv[argv.indexOf('-p')+1];
    assert.match(prompt,/untrusted diagnostic output/);assert.match(prompt,/Exit code: 7/);assert.match(prompt,/fixture assertion failed/);assert.ok(prompt.includes(check));
  } finally {f.cleanup();}
});

test('marker-only completion is explicitly unverified, while review alone is not a passing test', () => {
  for(const verify of [false,true]) {
    const f=fixture();try {
      assert.equal(f.run(verify?['--verify','--criteria',f.criteria]:[]).status,0);
      const s=f.read();assert.equal(s.verification.status,verify?'reviewed':'unverified');assert.equal(s.result.checkPassed,false);assert.equal(s.verification.checkReceipt,null);
      assert.match(s.reason,/no acceptance check configured/);
    } finally {f.cleanup();}
  }
});

test('a timed-out check records a failing command receipt; oversized worker output never completes', async () => {
  const f=fixture();let primaryError;try {
    const check=scriptCheck(f,"setInterval(()=>{},1000);");
    const r=f.run(['--max-iters','1','--turn-timeout','2','--check',check]);
    assert.equal(r.status,2,f.diagnostics(r));assert.equal(f.read().verification.checkReceipt.timedOut,true,f.diagnostics(r));assert.equal(f.read().verification.checkReceipt.exitCode,124);
    const owned=JSON.parse(fs.readFileSync(path.join(f.dir,'check-processes.json')));
    try { await until(()=>owned.every(p=>!progress.alive(p.pid))); }
    catch(e) {throw new Error('watchdog left its acceptance-check process alive: '+f.diagnostics(r),{cause:e});}
  } catch(e) {primaryError=e;throw e;} finally {f.cleanup(primaryError);}
  const g=fixture();try {
    g.set({steps:[{spam:true},{spam:true}]});const r=g.run();assert.equal(r.status,1,r.stdout+r.stderr);assert.equal(g.read().result,null);
  } finally {g.cleanup();}
});

test('workspace changes by a check or read-only verifier invalidate the completion candidate', () => {
  for(const who of ['check','verifier']) {
    const f=fixture();
    try {
      f.set({verifierWrite:who==='verifier'?'changed':null});
      const extra=['--max-iters','1','--verify','--criteria',f.criteria];
      if(who==='check') extra.push('--check',scriptCheck(f,"require('fs').writeFileSync('source.txt','changed');"));
      const r=f.run(extra);assert.equal(r.status,2,r.stdout+r.stderr);assert.equal(f.read().result,null);assert.equal(f.read().verification.status,'failed');
    } finally { f.cleanup(); }
  }
});

test('worker is_error and edited acceptance criteria fail closed', () => {
  for(const step of [{isError:true},{criteria:'easier criterion\n'}]) {
    const f=fixture();try {
      f.set({steps:[step,step]});const r=f.run(['--verify','--criteria',f.criteria]);
      assert.equal(r.status,1,r.stdout+r.stderr);assert.equal(f.read().outcome,'failed');assert.equal(f.read().result,null);
    } finally {f.cleanup();}
  }
});

test('resume rejects changed contract and stale completed receipt without changing the run identity', () => {
  const f=fixture();try {
    assert.equal(f.run().status,0);const s=f.read();
    const r=f.run(['--resume','--model','different']);assert.equal(r.status,1);assert.equal(f.read().runId,s.runId);
    fs.writeFileSync(path.join(f.repo,'source.txt'),'changed');const stale=f.run(['--resume']);assert.equal(stale.status,1);assert.match(stale.stdout,/no longer matches/);
    assert.equal(f.read().runId,s.runId);
  } finally {f.cleanup();}
});

test('progress store refuses concurrent execution, corrupted state, or an uncertain live child', () => {
  const f=fixture();try {
    const one=progress.open(f.options,{});assert.throws(()=>progress.open({...f.options,resume:true},{}),/already running/);
    one.save({childPid:process.pid,phase:'worker'});one.release();
    assert.throws(()=>progress.open({...f.options,resume:true},{}),/previous turn/);
    fs.writeFileSync(f.state,'{truncated');assert.throws(()=>progress.open({...f.options,resume:true},{}));
  } finally {f.cleanup();}
});

test('Windows interrupted worker/check/verifier recovery requires inspection even after the leader exits', () => {
  const child=cp.spawnSync(process.execPath,['-e','process.exit(0)'],{stdio:'ignore'});
  assert.equal(child.status,0);assert.equal(progress.alive(child.pid),false);
  for(const phase of ['worker','check','verifier']) {
    assert.equal(progress.canRecoverChild({phase,childPid:child.pid},'win32'),false,phase+' could have orphaned descendants');
  }
  assert.equal(progress.canRecoverChild({phase:'idle',childPid:null},'win32'),true,'normal persisted stops can resume');
  assert.equal(progress.canRecoverChild({phase:'starting',childPid:null},'win32'),false,'an uncertain spawn is never retried');
  assert.equal(progress.canRecoverChild({phase:'worker',childPid:process.pid},process.platform),false,'a known live child cannot overlap on any platform');
});

test('resume rejects corrupted budget timestamps and session/control state without rewriting it', () => {
  const f=fixture();try {
    const p=progress.open(f.options,{});const original=JSON.parse(JSON.stringify(p.state));p.release();
    for(const patch of [{activeSince:'yesterday'},{activeSince:''},{activeSince:0},{activeSince:-1},{activeSince:true},
      {sessionId:42},{outcome:'success-ish'},{phase:'unknown'}]) {
      const corrupt={...original,...patch};fs.writeFileSync(f.state,JSON.stringify(corrupt));
      assert.throws(()=>progress.open({...f.options,resume:true},{}),/invalid/);
      assert.deepEqual(f.read(),corrupt,'a rejected resume must preserve the prior evidence');
    }
  } finally {f.cleanup();}
});

async function until(fn) { const start=Date.now();for(;;){let value;try{value=fn();}catch{}if(value)return value;if(Date.now()-start>10000)throw new Error('fixture condition timed out');await new Promise(r=>setTimeout(r,10));} }

test('interrupted loop resumes the saved session and consumed iteration budget without overlapping a live turn', {skip:process.platform==='win32'}, async () => {
  const f=fixture();let child,workerPid;
  try {
    f.set({steps:[{marker:false,write:'first turn'},{wait:true},{write:'finished'}],barrier:path.join(f.dir,'release')});
    child=cp.spawn(process.execPath,[LOOP,...f.args],{env:f.env,stdio:'ignore'});
    await until(()=>f.readCalls().length===2);workerPid=f.readCalls()[1].pid;
    const before=f.read();assert.equal(before.iterations,2);assert.equal(before.sessionId,'worker-session');
    child.kill('SIGKILL');await new Promise(r=>child.once('close',r));
    const busy=f.run(['--resume']);assert.equal(busy.status,1);assert.match(busy.stdout,/previous turn/);
    process.kill(workerPid,'SIGKILL');await until(()=>!progress.alive(workerPid));workerPid=null;
    const resumed=f.run(['--resume']);assert.equal(resumed.status,0,resumed.stdout+resumed.stderr);
    const after=f.read();assert.equal(after.iterations,3);assert.notEqual(after.runId,before.runId);assert.ok(after.elapsedMs>=before.elapsedMs);
    const argv=f.readCalls()[2].argv;assert.equal(argv[argv.indexOf('--resume')+1],'worker-session');
    assert.equal(after.result.workspaceHash,progress.workspaceHash(f.repo));
  } finally {if(workerPid)try{process.kill(workerPid,'SIGKILL');}catch{}if(child)try{child.kill('SIGKILL');}catch{}f.cleanup();}
});

test('default state works in linked git worktrees and does not enter the workspace digest', () => {
  const f=fixture();try {
    const linked=path.join(f.dir,'linked');f.git('worktree','add','--detach',linked);
    const before=progress.workspaceHash(linked);const p=progress.open({...f.options,repo:linked,state:''},{});
    assert.equal(progress.workspaceHash(linked),before);p.release();assert.ok(fs.existsSync(p.file));
  } finally {f.cleanup();}
});

test('a descendant process group still blocks recovery after its leader exits', {skip:process.platform==='win32'}, async () => {
  const f=fixture();let leader;
  try {
    leader=cp.spawn(process.execPath,['-e',"require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}).unref();"],{detached:true,stdio:'ignore'});
    await new Promise(r=>leader.once('close',r));
    assert.equal(progress.alive(leader.pid),false);assert.equal(progress.childAlive(leader.pid),true);
    const p=progress.open(f.options,{});p.save({childPid:leader.pid,phase:'worker'});p.release();
    assert.throws(()=>progress.open({...f.options,resume:true},{}),/previous turn/);
  } finally {if(leader)try{process.kill(-leader.pid,'SIGKILL');}catch{}f.cleanup();}
});
