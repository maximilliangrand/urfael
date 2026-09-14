// Ad-hoc sign the packaged macOS app so it ships with a VALID code signature.
//
// We do not have an Apple Developer ID in CI, so electron-builder skips its signing
// step (CSC_IDENTITY_AUTO_DISCOVERY=false). That leaves the app with only the linker's
// partial ad-hoc signature and no sealed resources, which Apple Silicon macOS rejects
// outright as "Urfael is damaged / can't be opened". Applying a clean ad-hoc signature
// here produces a signature that the kernel accepts, downgrading that hard block to the
// ordinary "unidentified developer" prompt a user can get past.
//
// This is NOT notarization. A frictionless, warning-free open still requires a Developer
// ID signature plus notarization. This is the best we can do without an Apple Developer
// account, and it is strictly better than shipping an unopenable app.
//
// NOTE: this lives in packaging/ rather than build/ on purpose, build/ is gitignored, so
// a hook placed there would never reach CI and the release would ship unsigned again.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// electron-builder drops .gitkeep files and their otherwise-empty directories.
// Preserve the template's folder scaffold without copying/overwriting any files
// or following source/destination symlinks.
function restoreTemplateDirectories(source, destination) {
  const src = fs.lstatSync(source);
  if (!src.isDirectory() || src.isSymbolicLink()) throw new Error('vault template must be a directory');
  const ensureDirectory = (dir) => {
    let stat; try { stat = fs.lstatSync(dir); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (stat) {
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('vault scaffold destination is not a directory: ' + dir);
      return;
    }
    ensureDirectory(path.dirname(dir));
    fs.mkdirSync(dir);
  };
  ensureDirectory(destination);
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.isDirectory() && !entry.isSymbolicLink()) restoreTemplateDirectories(path.join(source, entry.name), path.join(destination, entry.name));
  }
}

exports.default = async function afterPack(context) {
  const appName = context.packager.appInfo.productFilename; // "Urfael"
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  const resources = context.electronPlatformName === 'darwin' ? path.join(appPath, 'Contents', 'Resources') : path.join(context.appOutDir, 'resources');
  restoreTemplateDirectories(path.join(context.packager.projectDir, '..', 'vault-template'), path.join(resources, 'vault-template'));
  if (context.electronPlatformName !== 'darwin') return;
  console.log(`afterPack: ad-hoc signing ${appPath}`);
  // --deep recursively signs the nested Electron frameworks and helpers, then the outer
  // bundle, sealing resources so the signature is internally consistent.
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--verbose=2', appPath], { stdio: 'inherit' });
  console.log('afterPack: ad-hoc signature applied and verified');
};

exports.restoreTemplateDirectories = restoreTemplateDirectories;
