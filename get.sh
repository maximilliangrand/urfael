#!/usr/bin/env bash
# Urfael one-line bootstrap — clones (or updates) the repo over HTTPS and hands off to ./install.sh.
#
#   curl -fsSL https://raw.githubusercontent.com/Grandillionaire/urfael/main/get.sh | bash
#
# This is a CONVENIENCE for parity with one-line installers. It is short on purpose so you can read it
# (and you should — piping any script to a shell is a trust decision). It installs NOTHING risky itself:
# it only fetches the source and runs install.sh, which is itself read-it-first friendly and enables
# nothing automatically. The auditable path is identical and recommended: clone the repo, read it, run
# ./install.sh by hand (see the README). Override the target dir with URFAEL_DIR, the source with URFAEL_REPO.
set -euo pipefail

REPO_URL="${URFAEL_REPO:-https://github.com/Grandillionaire/urfael.git}"
# The clone MUST NOT be '~/urfael': macOS default APFS is case-insensitive, so '~/urfael' and the '~/Urfael'
# vault that install.sh scaffolds are the SAME directory — the clone would masquerade as the vault and the
# real vault would never be created (silently). 'urfael-src' matches get.ps1 and the case guard install.sh
# documents. (Left overridable via URFAEL_DIR, but the default is now safe on every filesystem.)
DIR="${URFAEL_DIR:-$HOME/urfael-src}"

say(){ printf '%s\n' "$1"; }
need(){ command -v "$1" >/dev/null 2>&1 || { say "✗ Urfael needs '$1' on your PATH first. Install it, then re-run."; exit 1; }; }

say "── Urfael bootstrap ─────────────────────────────"
[ "$(id -u)" = 0 ] && { say "✗ Do NOT run this with sudo/root — run it as your normal user (Urfael installs into YOUR home)."; exit 1; }
need git; need node; need curl

if [ -d "$DIR/.git" ]; then
  say "→ updating the existing clone at $DIR"
  git -C "$DIR" pull --ff-only || say "  (pull skipped — local changes present; using what's already there)"
elif [ -e "$DIR" ]; then
  say "✗ $DIR exists but is not a complete git clone (an interrupted download?). Remove it and re-run:  rm -rf \"$DIR\""; exit 1
else
  # Clone into a temp sibling and rename into place only on success — an interrupted clone never leaves a
  # half-populated $DIR that the branch above would then reject on the next run.
  say "→ cloning $REPO_URL → $DIR"
  TMP="$DIR.cloning.$$"; rm -rf "$TMP"
  trap 'rm -rf "$TMP"' EXIT
  git clone --depth 1 "$REPO_URL" "$TMP"
  mv "$TMP" "$DIR"; trap - EXIT
fi

cd "$DIR"
say "→ handing off to ./install.sh (read-it-first friendly; enables nothing risky)"
exec bash ./install.sh
