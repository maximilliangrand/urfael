'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm');
const hookFile = path.join(__dirname, '../packaging/afterPack.js');
const hookSource = fs.readFileSync(hookFile, 'utf8');

for (const platform of ['darwin', 'linux', 'win32']) test('afterPack restores empty vault folders before signing on ' + platform, (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'urf-package-scaffold-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const appDir = path.join(root, 'app'), template = path.join(root, 'vault-template'), output = path.join(root, 'output');
  fs.mkdirSync(appDir);
  for (const dir of ['00_Inbox', '03_Resources/visuals', '_urfael/skills']) fs.mkdirSync(path.join(template, dir), { recursive: true });
  fs.writeFileSync(path.join(template, '00_Inbox/.gitkeep'), '');
  fs.writeFileSync(path.join(template, 'CLAUDE.md'), 'source instructions');
  const resources = platform === 'darwin' ? path.join(output, 'Urfael.app/Contents/Resources') : path.join(output, 'resources');
  const packagedTemplate = path.join(resources, 'vault-template');
  fs.mkdirSync(packagedTemplate, { recursive: true });
  fs.writeFileSync(path.join(packagedTemplate, 'CLAUDE.md'), 'existing packaged instructions');
  const calls = [], context = { exports: {}, console: { log() {} }, require: (name) => name === 'child_process' ? {
    execFileSync: (cmd, args) => {
      for (const dir of ['00_Inbox', '03_Resources/visuals', '_urfael/skills']) assert.ok(fs.statSync(path.join(packagedTemplate, dir)).isDirectory(), 'directories must exist before signing');
      calls.push({ cmd, args });
    },
  } : require(name) };
  vm.runInNewContext(hookSource, context, { filename: hookFile });
  return context.exports.default({ electronPlatformName: platform, appOutDir: output, packager: { projectDir: appDir, appInfo: { productFilename: 'Urfael' } } }).then(() => {
    for (const dir of ['00_Inbox', '03_Resources/visuals', '_urfael/skills']) assert.ok(fs.statSync(path.join(packagedTemplate, dir)).isDirectory());
    assert.equal(fs.readFileSync(path.join(packagedTemplate, 'CLAUDE.md'), 'utf8'), 'existing packaged instructions', 'never overwrites packaged files');
    assert.equal(fs.existsSync(path.join(packagedTemplate, '00_Inbox/.gitkeep')), false, 'placeholder contents are not copied');
    assert.equal(calls.length, platform === 'darwin' ? 2 : 0);
    assert.ok(calls.every((c) => c.cmd === 'codesign'));
  });
});

test('template scaffold ignores source links and refuses destination links or files', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'urf-package-links-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const template = path.join(root, 'template'), destination = path.join(root, 'destination'), outside = path.join(root, 'outside');
  for (const dir of [template, destination, outside, path.join(template, '00_Inbox'), path.join(outside, 'private-folder')]) fs.mkdirSync(dir, { recursive: true });
  const { restoreTemplateDirectories } = require('../packaging/afterPack');
  const kind = process.platform === 'win32' ? 'junction' : 'dir';
  fs.symlinkSync(outside, path.join(template, 'source-link'), kind);
  restoreTemplateDirectories(template, destination);
  assert.equal(fs.existsSync(path.join(destination, 'source-link')), false);
  fs.rmdirSync(path.join(destination, '00_Inbox'));
  fs.symlinkSync(outside, path.join(destination, '00_Inbox'), kind);
  assert.throws(() => restoreTemplateDirectories(template, destination), /not a directory/);
  assert.deepEqual(fs.readdirSync(outside), ['private-folder']);
  fs.unlinkSync(path.join(destination, '00_Inbox'));
  fs.writeFileSync(path.join(destination, '00_Inbox'), 'preserve this file');
  assert.throws(() => restoreTemplateDirectories(template, destination), /not a directory/);
  assert.equal(fs.readFileSync(path.join(destination, '00_Inbox'), 'utf8'), 'preserve this file');
});
