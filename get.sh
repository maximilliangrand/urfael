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
have(){ command -v "$1" >/dev/null 2>&1; }
need(){ have "$1" || { say "✗ Urfael needs '$1' on your PATH first. Install it, then re-run."; exit 1; }; }

say "── Urfael bootstrap ─────────────────────────────"
[ "$(id -u)" = 0 ] && { say "✗ Do NOT run this with sudo/root — run it as your normal user (Urfael installs into YOUR home)."; exit 1; }
need curl

# Install just enough to CLONE (git) and RUN the installer (node), so a non-technical user starts from nothing.
# The full prerequisite set (ffmpeg, Claude Code) is handled by install.sh --guided below. macOS uses Homebrew
# (installed if missing); Linux uses apt/dnf/pacman when recognized; otherwise we point at the download.
if ! have git || ! have node; then
  if [ "$(uname)" = "Darwin" ]; then
    if ! have brew; then
      say "→ installing Homebrew (Apple's standard installer; it may ask for your Mac password once)"
      NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" </dev/tty || true
      for p in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$p" ] && eval "$("$p" shellenv)"; done
    fi
    have brew && { have git || brew install git >/dev/null 2>&1; have node || brew install node >/dev/null 2>&1; }
  else
    if have apt-get; then sudo apt-get update >/dev/null 2>&1 </dev/tty || true; sudo apt-get install -y git nodejs npm >/dev/null 2>&1 </dev/tty || true
    elif have dnf; then sudo dnf install -y git nodejs npm >/dev/null 2>&1 </dev/tty || true
    elif have pacman; then sudo pacman -S --noconfirm git nodejs npm >/dev/null 2>&1 </dev/tty || true; fi
  fi
fi
need git; need node

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
say "→ handing off to the guided installer (installs the rest, sets up, opens the app)"
# --guided installs ffmpeg + Claude Code + app deps, then runs the setup wizard. </dev/tty reconnects the
# keyboard so the wizard's questions work even though THIS script arrived through `curl … | bash`.
exec bash ./install.sh --guided </dev/tty
