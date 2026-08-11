# get.ps1 — one-line Urfael bootstrap for native Windows. Paste this into PowerShell:
#   irm https://raw.githubusercontent.com/maximilliangrand/urfael/main/get.ps1 | iex
#
# It installs the prerequisites for you (Node, git — via winget, built into Windows 10/11), clones Urfael to
# ~\urfael-src, and runs the GUIDED installer (which installs the rest: ffmpeg, Claude Code, the app + Electron
# runtime, then the setup wizard). A non-technical person does not install anything by hand.
$ErrorActionPreference = 'Stop'
function Have($b) { $null -ne (Get-Command $b -ErrorAction SilentlyContinue) }
function Refresh-Path { $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') }
function Ensure($id, $label, $probe, $url) {
  if (& $probe) { Write-Host "  ok  $label"; return }
  if (-not (Have 'winget')) { Write-Host "  x  $label is required. Install it from $url, then re-run."; exit 1 }
  Write-Host "  ..  installing $label"
  winget install --id $id -e --source winget --accept-package-agreements --accept-source-agreements --silent 2>$null | Out-Null
  Refresh-Path
  if (-not (& $probe)) { Write-Host "  x  $label did not install. Get it from $url, then re-run."; exit 1 }
  Write-Host "  ok  $label installed"
}

Write-Host ""
Write-Host "  Urfael bootstrap (Windows) - installing prerequisites, then Urfael"
Write-Host ""
# git + node are needed just to clone and run the installer; the guided installer handles ffmpeg + Claude Code.
Ensure 'Git.Git' 'Git' { Have 'git' } 'https://git-scm.com'
Ensure 'OpenJS.NodeJS.LTS' 'Node.js (LTS)' { Have 'node' } 'https://nodejs.org'

$dest = Join-Path $HOME 'urfael-src'
if (Test-Path (Join-Path $dest '.git')) {
  $origin = git -C $dest remote get-url origin 2>$null
  if ($origin -notmatch 'maximilliangrand/urfael') { Write-Host "  x  $dest exists but is not the official Urfael repo - move it aside and re-run."; exit 1 }
  Write-Host "  >  updating existing clone at $dest"
  git -C $dest pull --ff-only origin main
} elseif (Test-Path $dest) {
  Write-Host "  x  $dest exists and is not a git clone - remove it and re-run:  rmdir /s /q `"$dest`""; exit 1
} else {
  Write-Host "  >  cloning Urfael to $dest"
  git clone --depth 1 https://github.com/maximilliangrand/urfael.git $dest
}
# hand off to the GUIDED installer — it installs ffmpeg + Claude Code + app deps, then runs setup + offers launch.
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dest 'install.ps1') -Guided
