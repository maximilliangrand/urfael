#!/usr/bin/env bash
# Urfael installer (macOS + Linux). Idempotent: scaffolds what's missing, never overwrites your vault
# or secrets, and enables NOTHING risky automatically. Read SECURITY.md first.
#
# Run it as YOURSELF with bash:  ./install.sh   (not `sh install.sh`, not `sudo`).
# The two guards below turn the two most common wrong invocations into one clear line instead of a
# cryptic mid-script crash (`sh` lacks BASH_SOURCE/arrays) or a root-owned home you can't write to.
if [ -z "${BASH_VERSION:-}" ]; then echo "✗ Run Urfael's installer with bash:  ./install.sh   (you used sh, which can't run it)"; exit 1; fi
if [ "$(id -u)" = 0 ]; then echo "✗ Do NOT run Urfael's installer with sudo/root — run it as your normal user. It installs into YOUR home, and root-owned files would break the app."; exit 1; fi
# --guided: auto-install the prerequisites (Homebrew + Node/git/ffmpeg + Claude Code) so a non-technical user
# installs nothing by hand, then run the setup wizard + offer to open the app. Off by default (the plain,
# read-it-first install is unchanged). The double-click install-mac.command and the get.sh one-liner use it.
GUIDED=0
for a in "$@"; do case "$a" in --guided) GUIDED=1 ;; esac; done
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JDIR="$HOME/.claude/urfael"
VAULT="$HOME/Urfael"
MEM="$HOME/Urfael-memory"
LA="$HOME/Library/LaunchAgents"
SDU="$HOME/.config/systemd/user"

# ── presentation: a designed terminal experience (gold-on-dark; color on a TTY, plain when piped) ──────
if [ -t 1 ]; then
  G=$'\033[38;5;179m'; GB=$'\033[1;38;5;179m'; AM=$'\033[38;5;214m'; D=$'\033[2m'
  GR=$'\033[38;5;108m'; RD=$'\033[38;5;167m'; CY=$'\033[38;5;109m'; R=$'\033[0m'
else G=''; GB=''; AM=''; D=''; GR=''; RD=''; CY=''; R=''; fi
say(){  printf '%s\n' "$1"; }
ok(){   printf "    ${GR}✓${R}  %s\n" "$1"; }                 # done / present
warn(){ printf "    ${AM}●${R}  %s\n" "$1"; }                # optional / heads-up
bad(){  printf "    ${RD}✗${R}  %s\n" "$1"; }                # missing / problem
# step groups, each marked with the NEXT Elder Futhark rune of the name — so the install spells ᚢᚱᚠᚨᛖᛚ (URFAEL) top→bottom
_RUNES=(ᚢ ᚱ ᚠ ᚨ ᛖ ᛚ); _RI=0
sect(){ local rune="${_RUNES[$((_RI % 6))]}"; _RI=$((_RI + 1)); printf "\n  ${AM}%s${R}  ${GB}%s${R}  ${D}%s${R}\n" "$rune" "$1" "${2:-}"; }
banner(){
  printf "\n${G}"
  cat <<'LOGO'
    ██╗   ██╗██████╗ ███████╗ █████╗ ███████╗██╗
    ██║   ██║██╔══██╗██╔════╝██╔══██╗██╔════╝██║
    ██║   ██║██████╔╝█████╗  ███████║█████╗  ██║
    ██║   ██║██╔══██╗██╔══╝  ██╔══██║██╔══╝  ██║
    ╚██████╔╝██║  ██║██║     ██║  ██║███████╗███████╗
     ╚═════╝ ╚═╝  ╚═╝╚═╝     ╚═╝  ╚═╝╚══════╝╚══════╝
LOGO
  printf "${R}    ${AM}ᚢᚱᚠᚨᛖᛚ${R}   ${D}Liquid Intelligence. At your service.${R}\n"
}

# Which platform are we on? Darwin = macOS, Linux = Linux (incl. WSL). A Git-Bash/MSYS/Cygwin uname means
# someone double-clicked this on native Windows — point them at the real Windows installer instead of a bare
# "unsupported" that flashes past.
OS="$(uname)"
case "$OS" in
  Darwin) ;;
  Linux)  ;;
  MINGW*|MSYS*|CYGWIN*)
    printf "  ${RD}✗ This is the macOS/Linux installer.${R}\n"
    printf "  ${AM}●${R} On native Windows, open PowerShell and run:  ${CY}powershell -ExecutionPolicy Bypass -File .\\install.ps1${R}\n"
    printf "  ${AM}●${R} Or use WSL (a full Linux environment), where this script works as-is.\n"
    read -r -p "  Press Enter to close..." _ 2>/dev/null || true
    exit 1 ;;
  *) printf "  ${RD}✗ Urfael supports macOS, Linux, and Windows (via install.ps1) — uname=%s is unsupported.${R}\n" "$OS"; exit 1 ;;
esac
banner
printf "\n  ${GB}I N S T A L L${R}   ${D}· idempotent · nothing risky enabled · keeps your vault & secrets${R}\n"

# ── HARD preflight ───────────────────────────────────────────────────────────
# The pieces the install genuinely CANNOT proceed without. Fail LOUDLY and up front with the exact fix,
# rather than a green ✓ on a too-old Node followed by a cryptic npm crash 20 lines later (the old behavior:
# node/npm/git were mere warnings and the script barrelled on). Mirrors what install.ps1 already did.
preflight_hard(){
  local ok=1
  if ! command -v node >/dev/null 2>&1; then bad "node is required (Urfael needs Node 20+). Install it: https://nodejs.org"; ok=0
  else
    local major; major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
    if [ "${major:-0}" -lt 20 ]; then bad "Node $(node -v 2>/dev/null) is too old — Urfael needs Node 20+. Upgrade: https://nodejs.org"; ok=0; fi
  fi
  command -v npm >/dev/null 2>&1 || { bad "npm is required (it ships with Node). Reinstall Node: https://nodejs.org"; ok=0; }
  command -v git >/dev/null 2>&1 || { bad "git is required (your private memory repo is a git repo). Install it: https://git-scm.com"; ok=0; }
  [ "$ok" = 1 ] || { printf "\n  ${RD}Install the missing prerequisite(s) above, then re-run ./install.sh${R}\n\n"; exit 1; }
}

# The SAME claude resolution app/claude-bin.js (POSIX) + app/setup.js use: ~/.local/bin is the Claude Code
# installer's current default and is NOT on a login/GUI PATH, so a bare `command -v claude` false-reports
# "MISSING" and sends the user to reinstall something that is already there. Keep all three in agreement.
claude_present(){
  for p in "$HOME/.local/bin/claude" "$HOME/.claude/local/claude" /opt/homebrew/bin/claude /usr/local/bin/claude /usr/bin/claude; do
    [ -x "$p" ] && return 0
  done
  command -v claude >/dev/null 2>&1
}

# Pick the SHA-256 verifier actually present: coreutils `sha256sum` (most Linux) or `shasum -a 256` (macOS +
# perl). Returns a function-like via $HASHER. If NEITHER exists we must NOT delete a good download as a false
# "mismatch" (the old bug on a shasum-less Linux: re-download 142MB every run forever) — we skip verification
# with a loud note instead.
HASHER=""
if command -v sha256sum >/dev/null 2>&1; then HASHER="sha256sum"
elif command -v shasum >/dev/null 2>&1; then HASHER="shasum -a 256"; fi
sha_ok(){ # sha_ok <expected-hex> <file>
  [ -n "$HASHER" ] || return 2                                    # 2 = "no hasher" (caller decides), never a mismatch
  echo "$1  $2" | $HASHER -c - >/dev/null 2>&1
}

# ── GUIDED prerequisites (only with --guided) ────────────────────────────────
# Install everything a non-technical person would otherwise hunt down, so they install nothing by hand.
# macOS: Homebrew (installed if missing) → brew install node/git/ffmpeg. Linux: apt/dnf/pacman if we recognize
# one, else a clear "install these" note (distros vary too much to auto-drive safely). Claude Code via npm.
# Idempotent (skips what is present) and best-effort (a failure degrades to a link + the hard preflight below).
guided_prereqs(){
  [ "$GUIDED" = 1 ] || return 0
  sect "PREREQUISITES" "installing what Urfael needs, so you do not have to"
  if [ "$OS" = "Darwin" ]; then
    if ! command -v brew >/dev/null 2>&1; then
      warn "installing Homebrew (Apple's standard software installer) — it may ask for your Mac password once…"
      NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" </dev/tty || warn "Homebrew install did not complete — see https://brew.sh, then re-run"
      # put brew on PATH for THIS session (Apple Silicon vs Intel prefix)
      for p in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$p" ] && eval "$("$p" shellenv)"; done
    fi
    if command -v brew >/dev/null 2>&1; then
      for pkg in node git ffmpeg; do
        case "$pkg" in
          node) command -v node >/dev/null 2>&1 && { ok "node present"; continue; } ;;
          git)  command -v git  >/dev/null 2>&1 && { ok "git present";  continue; } ;;
          ffmpeg) command -v ffmpeg >/dev/null 2>&1 && { ok "ffmpeg present"; continue; } ;;
        esac
        warn "installing $pkg…"; brew install "$pkg" >/dev/null 2>&1 && ok "$pkg installed" || warn "$pkg did not install — 'brew install $pkg' by hand, then re-run"
      done
    else
      warn "no Homebrew — install Node 20+ (https://nodejs.org) and git, then re-run"
    fi
  else
    # Linux: try the distro package manager; otherwise instruct.
    if command -v apt-get >/dev/null 2>&1; then PM="sudo apt-get install -y"; UPD="sudo apt-get update"
    elif command -v dnf >/dev/null 2>&1; then PM="sudo dnf install -y"; UPD=""
    elif command -v pacman >/dev/null 2>&1; then PM="sudo pacman -S --noconfirm"; UPD=""
    else PM=""; fi
    if [ -n "$PM" ]; then
      [ -n "${UPD:-}" ] && $UPD >/dev/null 2>&1 </dev/tty || true
      for pkg in nodejs npm git ffmpeg; do command -v "${pkg/nodejs/node}" >/dev/null 2>&1 || { warn "installing $pkg…"; $PM "$pkg" >/dev/null 2>&1 </dev/tty && ok "$pkg installed" || warn "$pkg did not install — install it with your package manager, then re-run"; }; done
    else
      warn "unrecognized Linux package manager — install Node 20+, git and ffmpeg with your distro's tools, then re-run"
    fi
  fi
  # Claude Code (the brain) via npm global — once Node exists.
  if claude_present; then ok "Claude Code present"
  elif command -v npm >/dev/null 2>&1; then warn "installing Claude Code…"; npm install -g @anthropic-ai/claude-code >/dev/null 2>&1 && ok "Claude Code installed" || warn "Claude Code did not install — see https://claude.com/claude-code"
  else warn "Claude Code needs Node first — see https://claude.com/claude-code"; fi
}

# ── shared steps ─────────────────────────────────────────────────────────────
# These behave identically on macOS and Linux (no platform-specific shell-outs).

# config dir + the local whisper model (~142MB, one time) so voice works out of the box — no API key.
# Pinned SHA-256 so a tampered/changed upstream artifact is rejected (fail-closed).
fetch_model(){
  mkdir -p "$JDIR"
  MODELDIR="$JDIR/models"; mkdir -p "$MODELDIR"
  WHISPER_SHA256="a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002"
  MODEL="$MODELDIR/ggml-base.en.bin"
  # Re-verify an EXISTING file's checksum, not just its existence. The old code trusted any file at this path
  # forever — so a download interrupted mid-stream (a 142MB file on flaky wifi) left a partial .bin that every
  # future run reported as "present", silently breaking local STT with no way for the user to notice.
  if [ -f "$MODEL" ]; then
    if sha_ok "$WHISPER_SHA256" "$MODEL"; then ok "whisper model present (checksum verified)"; return
    elif [ $? -eq 2 ]; then ok "whisper model present (checksum not verified — no sha256sum/shasum on this box)"; return   # present + no hasher: trust it, never re-download-loop
    else warn "existing model failed its checksum (partial/corrupt) — re-downloading"; rm -f "$MODEL"; fi
  fi
  warn "downloading whisper base.en model (~142MB, one time)…"
  # Download to a .part file, checksum THAT, and only rename into place on success — so an interrupted or
  # tampered download can NEVER masquerade as a valid model. A failure leaves nothing at the real path.
  TMP="$MODEL.part"; rm -f "$TMP"
  if curl -fsSL -o "$TMP" https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin; then
    if sha_ok "$WHISPER_SHA256" "$TMP"; then mv "$TMP" "$MODEL"; ok "local STT model ready (checksum verified)"
    elif [ $? -eq 2 ]; then mv "$TMP" "$MODEL"; warn "STT model downloaded (checksum NOT verified — install coreutils for sha256sum to verify)"   # no hasher: keep the download, say so
    else rm -f "$TMP"; warn "model checksum MISMATCH — discarded. Re-run, or set STT_PROVIDER=elevenlabs"; fi
  else
    rm -f "$TMP"; warn "model download failed (interrupted?) — nothing was left half-written; just re-run, or set STT_PROVIDER=elevenlabs"
  fi
}

# secret templates (never overwrite an existing real file)
write_secret_templates(){
  for f in tts.env api-keys.env bridge.env; do
    if [ -f "$JDIR/$f" ]; then ok "$f already exists (kept)"; else cp "$REPO/config/$f.example" "$JDIR/$f"; chmod 600 "$JDIR/$f"; ok "wrote $JDIR/$f (add your keys)"; fi
  done
}

# scaffold the vault from the template (never overwrite an existing vault)
scaffold_vault(){
  # Guard the case-insensitive-macOS trap: if the REPO clone IS the vault dir (e.g. cloned to ~/urfael, which on
  # APFS equals ~/Urfael), scaffolding would silently no-op and the source tree would masquerade as the vault.
  # `-ef` compares by inode, so it catches the collision regardless of case. Stop with the exact fix.
  if [ "$VAULT" -ef "$REPO" ] 2>/dev/null; then
    bad "You cloned Urfael INTO its vault path ($VAULT). On macOS ~/urfael and ~/Urfael are the same folder."
    say "    Move the clone aside and re-run:  cd ~ && mv \"$REPO\" ~/urfael-src && cd ~/urfael-src && ./install.sh"
    exit 1
  fi
  if [ -e "$VAULT" ]; then ok "$VAULT already exists (kept — not overwritten)"; else
    cp -R "$REPO/vault-template" "$VAULT"
    rm -rf "$VAULT/memory"                                        # memory lives in ~/Urfael-memory, not the vault
    ( cd "$VAULT" && [ -L .claude ] || ln -s _urfael .claude )   # Claude Code reads commands/hooks via .claude
    chmod +x "$VAULT"/_urfael/*.sh 2>/dev/null
    ok "scaffolded $VAULT  ($(printf "${D}")run \`urfael setup\` — it fills your details for you$(printf "${R}"))"
  fi
}

# local, private memory repo (never public)
scaffold_memory(){
  if [ -d "$MEM/.git" ]; then ok "$MEM already exists"; else
    mkdir -p "$MEM"; cp "$REPO/vault-template/memory/"*.md "$MEM/"
    # git presence is guaranteed by preflight_hard, but keep the success message HONEST: only claim the repo
    # was created if git init+commit actually succeeded (the old unconditional ok() could lie).
    if ( cd "$MEM" && git init -q && git add -A && git commit -q -m "init: Urfael memory" ) >/dev/null 2>&1; then
      ok "created private local memory repo at $MEM"
    else
      bad "could not initialize the memory git repo at $MEM — check git, then re-run"; exit 1
    fi
  fi
}

# record where the repo lives — service units get the literal path baked in; vault scripts read this file.
#   (No canonical ~/urfael: on macOS the filesystem is case-INsensitive, so ~/urfael would collide
#   with the ~/Urfael vault. Clone the repo anywhere; everything resolves through this.)
record_repo(){ printf '%s' "$REPO" > "$JDIR/repo"; ok "repo path recorded ($REPO)"; }

# app deps + the `urfael` terminal command. CLI_LINKED is read by the closing banner so we never tell a user
# to run `urfael "hello"` when the CLI didn't actually land on their PATH.
CLI_LINKED=0
# app deps are COMPLETE only when (1) npm finished (node_modules/.package-lock.json) AND (2) electron's binary
# actually downloaded — `npm start` runs `electron .`, electron is a devDependency, and its ~100MB postinstall
# can be skipped (production config) or blocked (firewall/AV). require('electron') returns the binary path;
# existsSync proves the binary landed. Cross-platform (mac/linux dist path differs; node resolves it).
app_deps_ok(){ [ -f "$REPO/app/node_modules/.package-lock.json" ] && ( cd "$REPO/app" && node -e "const f=require('fs');let p;try{p=require('electron')}catch(e){process.exit(3)};process.exit(f.existsSync(p)?0:4)" >/dev/null 2>&1 ); }
install_app_and_cli(){
  if app_deps_ok; then ok "app deps installed (Electron runtime verified)"; else
    warn "installing app dependencies (Node packages + the Electron desktop runtime, ~150MB one time)…"
    ( cd "$REPO/app" && npm_config_production=false npm install --include=dev --no-audit --no-fund )
    # electron installed but its binary missing → run electron's own installer to re-fetch it
    if ! app_deps_ok && [ -f "$REPO/app/node_modules/electron/install.js" ]; then
      warn "Electron binary did not download — re-fetching it (a firewall/proxy can block this)…"
      ( cd "$REPO/app" && node node_modules/electron/install.js )
    fi
    if app_deps_ok; then ok "npm install (app, Electron verified)"
    elif [ -f "$REPO/app/node_modules/.package-lock.json" ]; then bad "Node packages installed, but the Electron desktop binary is missing (firewall/proxy likely blocked its download). The \`urfael\` CLI works; the Console (npm start) will not until Electron installs — allow node through your firewall, then re-run ./install.sh"; exit 1
    else bad "npm install failed (network / disk / proxy?) — the app can't run without it. Fix the cause, then re-run ./install.sh"; exit 1
    fi
  fi
  BINDIR="$(dirname "$(command -v node || echo /opt/homebrew/bin/node)")"
  if [ -w "$BINDIR" ]; then ln -sfn "$REPO/app/cli.js" "$BINDIR/urfael" && chmod +x "$REPO/app/cli.js" && { CLI_LINKED=1; ok "linked \`urfael\` CLI into $BINDIR"; }
  else warn "can't write $BINDIR — run: npm link --prefix \"$REPO/app\" (or add alias urfael=\"node $REPO/app/cli.js\" to your shell rc)"; fi
}

if [ "$OS" = "Darwin" ]; then
  # ════════════════════════════ macOS ════════════════════════════
  # 1) dependency check (report, don't auto-install heavy things)
  sect "DEPENDENCIES" "what the brain + local voice need"
  guided_prereqs                                     # --guided: auto-install prerequisites (brew/apt + claude) first
  preflight_hard                                     # node>=20 + npm + git, or a clear stop
  ok "node $(node -v 2>/dev/null)"; ok "npm"; ok "git"
  claude_present && ok "claude" || warn "claude CLI not found — install Claude Code (https://claude.com/claude-code) and run \`claude\` once to sign in"
  command -v uv >/dev/null && ok "uv" || warn "uv missing — https://docs.astral.sh/uv (needed for some MCP servers)"
  { command -v gtimeout >/dev/null || command -v timeout >/dev/null; } && ok "timeout/gtimeout" || warn "gtimeout missing — 'brew install coreutils' (needed for the autonomous loop)"
  python3 -c 'import matplotlib' 2>/dev/null && ok "matplotlib" || warn "matplotlib missing — 'pip3 install --user matplotlib numpy' (for charts)"
  # local, API-free voice deps
  ok "say (macOS TTS, built-in)"
  command -v ffmpeg >/dev/null && ok "ffmpeg" || warn "ffmpeg missing — 'brew install ffmpeg' (local voice needs it)"
  command -v whisper-server >/dev/null && ok "whisper-cpp (local STT)" || warn "whisper-cpp missing — 'brew install whisper-cpp' (free local speech-to-text)"

  # 2) config dir + model + secret templates
  sect "VOICE & CONFIG" "local speech model (checksum-pinned) + secret templates (chmod 600)"
  fetch_model
  write_secret_templates

  # 3) scaffold the vault from the template (never overwrite an existing vault)
  sect "VAULT & MEMORY" "your second brain (PARA + daily notes) + a private, git-versioned memory repo"
  scaffold_vault

  # 4) local, private memory repo (never public)
  scaffold_memory

  # 5) record where the repo lives — plists get the literal path baked in; vault scripts read this file.
  record_repo

  # 6) app deps + the `urfael` terminal command
  sect "APP & CLI" "node deps + the \`urfael\` terminal command"
  install_app_and_cli

  # 7) launchd plists — fill placeholders, but DO NOT auto-load (you choose what runs in the background)
  sect "BACKGROUND SERVICES" "launchd units — written, NOT loaded (you decide what runs)"
  NODE="$(command -v node || echo /opt/homebrew/bin/node)"
  mkdir -p "$LA"
  for t in "$REPO"/config/launchagents/*.plist.template; do
    out="$LA/$(basename "${t%.template}")"
    sed -e "s|{{HOME}}|$HOME|g" -e "s|{{NODE}}|$NODE|g" -e "s|{{REPO}}|$REPO|g" "$t" > "$out"
  done
  ok "wrote launchd plists to $LA (not loaded)"

  cat <<NEXT

  ${AM}ᛚ${R}  ${GB}FIRST STEPS${R}   ${D}you choose what runs — nothing was started for you${R}
1. Voice works out of the box — FREE & local (macOS \`say\` + whisper.cpp), no API key needed.
   Optional: edit "$JDIR/tts.env" for a higher-quality local voice (Kokoro) or to add an ElevenLabs key.
2. ${D}Optional, not needed to start: the brain already reads + writes ~/Urfael with its file tools.${R}
   For Obsidian-native vault ops, open ~/Urfael in Obsidian, enable community plugins, install "Local REST API",
   then register it:  cd ~/Urfael && claude mcp add -s local --transport http obsidian \\
      http://127.0.0.1:27123/mcp/ --header "Authorization: Bearer <your REST key>"
3. ${GB}urfael setup${R} auto-detects + fills your name / city / timezone / language into ~/Urfael/CLAUDE.md (no hand-editing)
4. Start the brain + UI:
      launchctl load -w "$LA/com.urfael.daemon.plist"      # the always-on brain
      cd "$REPO/app" && npm start                          # the overlay UI
   (optional, opt-in:  launchctl load -w the morningbrief / obsidian-heal plists)
5. ⚠️  Hands/eyes, the autonomous loop, and full permissions are OFF by default.
   Read SECURITY.md, then opt in (URFAEL_YOLO=1 in a sandbox; uncomment MCPs in config/mcp.json.example).

  ${AM}▸${R} ${GB}Run  urfael setup${R}  ${D}— pick how Urfael reaches Claude (your subscription, an API key, or a local model).${R}

  ${GB}ᚢ  Ready, sir.${R}  ${D}Talk to Urfael — tap the orb, or just run  ${R}${CY}urfael "hello"${R}${D}  from any terminal.${R}
NEXT

else
  # ════════════════════════════ Linux ════════════════════════════
  # 1) dependency check (report, don't auto-install heavy things). Package names vary by distro;
  #    we name the binary/library so you can `apt`/`dnf`/`pacman` it however your distro wants.
  sect "DEPENDENCIES" "what the brain + local voice need"
  guided_prereqs                                     # --guided: auto-install prerequisites (brew/apt + claude) first
  preflight_hard                                     # node>=20 + npm + git, or a clear stop
  ok "node $(node -v 2>/dev/null)"; ok "npm"; ok "git"
  claude_present && ok "claude" || warn "claude CLI not found — install Claude Code (https://claude.com/claude-code) and run \`claude\` once to sign in"
  command -v uv >/dev/null && ok "uv" || warn "uv missing — https://docs.astral.sh/uv (needed for some MCP servers)"
  command -v timeout >/dev/null && ok "timeout" || warn "timeout missing — install GNU coreutils (needed for the autonomous loop)"
  python3 -c 'import matplotlib' 2>/dev/null && ok "matplotlib" || warn "matplotlib missing — 'pip3 install --user matplotlib numpy' (for charts)"
  # local, API-free voice deps. The in-app Console/orb TTS (voice.js) REQUIRES espeak-ng/espeak (renders to a
  # file via ffmpeg); spd-say alone only covers the daemon's spoken notifications. So espeak is the one to have.
  if command -v espeak-ng >/dev/null || command -v espeak >/dev/null; then ok "espeak-ng/espeak (Linux TTS)"
  elif command -v spd-say >/dev/null; then warn "only spd-say found — notifications speak, but in-app voice needs 'espeak-ng' (apt install espeak-ng)"
  else warn "no Linux TTS — install 'espeak-ng' (apt install espeak-ng) for in-app voice + the morning brief"; fi
  command -v ffmpeg >/dev/null && ok "ffmpeg" || warn "ffmpeg missing — install 'ffmpeg' (local voice needs it)"
  command -v whisper-server >/dev/null && ok "whisper-cpp (local STT)" || warn "whisper-cpp missing — build whisper.cpp and put 'whisper-server' on PATH (free local speech-to-text)"
  # desktop notifications: libnotify's notify-send
  command -v notify-send >/dev/null && ok "notify-send (libnotify)" || warn "notify-send missing — install 'libnotify' / libnotify-bin (desktop notifications)"
  # screenshot/vision tool — any one of these works (Wayland: grim; X11: scrot/maim; ImageMagick: import)
  for s in grim scrot maim import; do command -v "$s" >/dev/null && { ok "screenshot tool ($s)"; SHOT_OK=1; break; }; done
  [ "${SHOT_OK:-0}" = 1 ] || warn "no screenshot tool — install 'grim' (Wayland) or 'scrot'/'maim' (X11) for vision"

  # 2) config dir + model + secret templates  (identical to macOS)
  sect "VOICE & CONFIG" "local speech model (checksum-pinned) + secret templates (chmod 600)"
  fetch_model
  write_secret_templates

  # 3) scaffold the vault from the template (never overwrite an existing vault)  (identical to macOS)
  sect "VAULT & MEMORY" "your second brain (PARA + daily notes) + a private, git-versioned memory repo"
  scaffold_vault

  # 4) local, private memory repo (never public)  (identical to macOS)
  scaffold_memory

  # 5) record where the repo lives — systemd units get the literal path baked in; vault scripts read this file.
  record_repo

  # 6) app deps + the `urfael` terminal command  (identical to macOS)
  install_app_and_cli

  # 7) systemd --user units — fill placeholders, but DO NOT enable (you choose what runs in the background)
  sect "BACKGROUND SERVICES" "systemd --user units — written, NOT enabled (you decide what runs)"
  NODE="$(command -v node || echo /usr/bin/node)"
  mkdir -p "$SDU"
  for t in "$REPO"/config/systemd/*.template; do
    out="$SDU/$(basename "${t%.template}")"
    sed -e "s|{{HOME}}|$HOME|g" -e "s|{{NODE}}|$NODE|g" -e "s|{{REPO}}|$REPO|g" "$t" > "$out"
  done
  command -v systemctl >/dev/null && systemctl --user daemon-reload >/dev/null 2>&1
  ok "wrote systemd --user units to $SDU (not enabled)"

  cat <<NEXT

  ${AM}ᛚ${R}  ${GB}FIRST STEPS${R}   ${D}you choose what runs — nothing was started for you${R}
1. Voice works out of the box — FREE & local (espeak-ng/spd-say + whisper.cpp), no API key needed.
   Optional: edit "$JDIR/tts.env" for a higher-quality local voice (Kokoro) or to add an ElevenLabs key.
2. ${D}Optional, not needed to start: the brain already reads + writes ~/Urfael with its file tools.${R}
   For Obsidian-native vault ops, open ~/Urfael in Obsidian, enable community plugins, install "Local REST API",
   then register it:  cd ~/Urfael && claude mcp add -s local --transport http obsidian \\
      http://127.0.0.1:27123/mcp/ --header "Authorization: Bearer <your REST key>"
3. ${GB}urfael setup${R} auto-detects + fills your name / city / timezone / language into ~/Urfael/CLAUDE.md (no hand-editing)
4. Start the brain + UI:
      systemctl --user enable --now urfael-daemon          # the always-on brain
      cd "$REPO/app" && npm start                          # the overlay UI
   (optional, opt-in:  systemctl --user enable --now urfael-morningbrief.timer)
   Tip: to keep --user units running after logout, run:  loginctl enable-linger "\$USER"
5. ⚠️  Hands/eyes, the autonomous loop, and full permissions are OFF by default.
   Read SECURITY.md, then opt in (URFAEL_YOLO=1 in a sandbox; uncomment MCPs in config/mcp.json.example).

  ${AM}▸${R} ${GB}Run  urfael setup${R}  ${D}— pick how Urfael reaches Claude (your subscription, an API key, or a local model).${R}

  ${GB}ᚢ  Ready, sir.${R}  ${D}Talk to Urfael — tap the orb, or just run  ${R}${CY}urfael "hello"${R}${D}  from any terminal.${R}
NEXT

fi

# ── GUIDED finale: run the setup wizard + offer to open the app, so a non-technical person never types a
# second command. The `urfael` PATH link only resolves in a NEW terminal, so we call the CLI by full path.
if [ "$GUIDED" = 1 ]; then
  sect "SETUP" "a few friendly questions to connect Urfael to Claude and learn who you are"
  # </dev/tty reconnects stdin to the terminal so the wizard's prompts work even when install.sh was reached
  # through the get.sh one-liner (curl | bash), where stdin is the piped script, not the keyboard.
  node "$REPO/app/cli.js" setup </dev/tty || warn "setup could not run automatically — run it yourself:  urfael setup  (in a new terminal)"
  printf "\n"
  # Only OFFER to launch if we can actually read the answer from the terminal; otherwise just print how to start
  # (so a non-interactive/piped run never silently launches the Console).
  _go=""; _asked=0
  if printf "  Open the Urfael Console now? [Y/n] " && read -r _go </dev/tty 2>/dev/null; then _asked=1; fi
  if [ "$_asked" = 1 ] && [ "$OS" = "Darwin" ] && ! printf '%s' "$_go" | grep -qi '^n'; then
    warn "opening the Console…"
    ( cd "$REPO/app" && npm start >/dev/null 2>&1 & )
    printf "  ${D}(also runs later from any NEW terminal:  ${R}${CY}urfael \"hello\"${R}${D})${R}\n"
  else
    printf "\n  ${D}When ready, open a NEW terminal and run  ${R}${CY}urfael \"hello\"${R}${D}  (or  cd \"%s/app\" && npm start  for the Console).${R}\n" "$REPO"
  fi
fi
