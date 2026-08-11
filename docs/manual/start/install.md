# Installation

Urfael is an always-on local brain that runs your installed `claude` CLI as a subprocess. There is no API key and nothing to connect: if `claude` works in your terminal, Urfael works. This page covers what you need and the two ways to install. When you are done, go to [start/quickstart.md](start/quickstart.md).

## Prerequisites

- **Claude Code on a paid plan (Pro or Max), signed in.** Run `claude` once and log in before you start Urfael. The brain shells out to that CLI, so it rides your existing subscription. (Opus escalation needs Max. On Pro, set `URFAEL_OPUS_MODEL=sonnet` so hard turns stay on Sonnet instead of failing.)
- **Node 20 or newer.** `app/package.json` declares `"engines": { "node": ">=20" }`, the single source of truth for the floor.
- **An operating system Urfael supports.** macOS on Apple Silicon or Intel is the primary, best-tested target. Linux runs the headless brain and the Electron GUI, but it is newer and has far less mileage. **Native Windows is supported in beta**: `install.ps1` installs the daemon + CLI (the control plane rides a per-user named pipe with a required token instead of the POSIX 0600 socket), and the full unit/fuzz/red-team suite gates it in CI on every push. WSL remains fully supported and is the path to the POSIX-only extras (docker/ssh goal sandboxes, host-reaching plugin cells).
- **Obsidian** with its Local REST API community plugin, for the vault.
- For local voice (the free default): `ffmpeg`, `whisper-cpp`, and `coreutils` on macOS. The installer downloads the speech model (checksum-pinned). Docker is optional and only needed for sandboxed autonomous coding.

One Homebrew line covers the local-voice tools on macOS:

```bash
brew install ffmpeg whisper-cpp coreutils
```

## macOS & Linux — the easy way

You do not need to install anything first. Open Terminal (on a Mac: press ⌘-Space, type `Terminal`, Enter) and paste this one line:

```bash
curl -fsSL https://raw.githubusercontent.com/maximilliangrand/urfael/main/get.sh | bash
```

It installs the prerequisites for you (on macOS via Homebrew, which it installs if missing; on Linux via apt/dnf/pacman) — Node, git, ffmpeg, and Claude Code — downloads Urfael, sets it up, walks you through connecting your Claude account, and offers to open the app. That is the whole install. (You may be asked for your Mac password once, when Homebrew installs.)

Prefer to click? On a Mac, download the repo as a ZIP (green **Code** button on GitHub → **Download ZIP**), unzip it, and **double-click `install-mac.command`**. If macOS says it "cannot be opened because it is from an unidentified developer," right-click the file → **Open** → **Open** (that is Gatekeeper on an unsigned helper, not a problem with the file).

## Path 1: run from source, step by step

Prefer to see every step? This is the same thing by hand. `install.sh` is read-it-first friendly — it never enables anything risky.

```bash
git clone https://github.com/maximilliangrand/urfael.git urfael-src && cd urfael-src
./install.sh        # checks deps, fetches the speech model, scaffolds your vault, writes config templates
urfael setup        # onboarding wizard: subscription (default), an API key, or a local model
cd app && npm start # the Console opens
```

(`./install.sh --guided` does the auto-install-everything version above, if you want it without the one-liner.) `install.sh` writes config templates (`chmod 600`), scaffolds the vault and memory repo, installs the app dependencies (including the Electron desktop runtime, which it verifies), links the `urfael` CLI onto your PATH, and writes the service files (launchd on macOS, `systemd --user` on Linux) without loading them. You start the daemon yourself in [start/quickstart.md](start/quickstart.md).

### Native Windows (beta) — the easy way

You do not need to install anything first, and you do not need to be technical. **Copy this one line, paste it into PowerShell, and press Enter:**

```powershell
irm https://raw.githubusercontent.com/maximilliangrand/urfael/main/get.ps1 | iex
```

To open PowerShell: press the Windows key, type `PowerShell`, and click it. That one line installs the prerequisites for you (Node, git, ffmpeg, and Claude Code, via Windows' built-in `winget`), downloads Urfael, sets it up, walks you through connecting your Claude account, and offers to open the app. That is the whole install.

Prefer to click instead of paste? Download the repo as a ZIP (green **Code** button on GitHub → **Download ZIP**), unzip it, and **double-click `install-windows.cmd`**. It does the same guided install. If Windows shows a blue **"Windows protected your PC"** box, click **More info** → **Run anyway** — that appears because the helper isn't code-signed yet, not because anything is wrong.

You will sign into Claude once during setup (a browser opens — sign in with your Claude Pro/Max account, or paste an API key). After it finishes, open a **new** terminal and type `urfael "hello"`, or use the Console window the installer opened.

<details><summary>Doing it by hand (for developers)</summary>

```powershell
git clone https://github.com/maximilliangrand/urfael.git urfael-src; cd urfael-src
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Guided   # -Guided auto-installs prerequisites + runs setup
```

Drop `-Guided` if you already have Node 20+, git, ffmpeg and Claude Code and just want the plain install. Do not double-click `install.sh` — that is the macOS/Linux installer.
</details>

Windows differences, stated plainly: the daemon's control plane is a per-user named pipe plus a required token file under your profile (the POSIX build uses a `0600` unix socket — same trust statement, different kernel); the Console (`npm start`) uses the Electron desktop runtime, which the installer downloads and verifies; autostart is a Run-key command the installer prints but never adds for you; `--check` commands for goal jobs run under PowerShell; docker/ssh goal sandboxes and host-reaching plugin cells stay POSIX/WSL-only for now. The brain's `curl --unix-socket` examples become `node _urfael/daemonctl.js …` (the installer scaffolds it).

## Path 2: the packaged desktop app

The repo ships an `electron-builder` config in `app/package.json`. Building it produces a `.dmg` and `.zip` on macOS, an `AppImage` on Linux, and an NSIS installer on Windows:

```bash
cd app && npm run dist        # or npm run dist:dir for an unpacked build
```

Note plainly: the packaged app is the Console (the Electron overlay UI). It is a client of the same daemon, so you still install from source once to get the brain, the `urfael` CLI, and the service files. There is no published, signed download that sets up everything in one step today.

## What the installer creates on first run

- **`~/Urfael`**: your Obsidian vault, scaffolded from the template, with a `.claude` symlink to `_urfael`. This is the archive the brain reads.
- **`~/Urfael-memory`**: a private local git repo for what Urfael learns. Per-day conversation logs land in `~/Urfael-memory/sessions/` as JSONL.
- **`~/.claude/urfael/`**: config templates (`tts.env`, `api-keys.env`, and others) written from the examples at `chmod 600`.
- **The daemon socket**: once the daemon is running it listens only on a `0600` unix socket at `~/.claude/urfael/daemon.sock` (on native Windows: a per-user named pipe gated by `~/.claude/urfael/daemon.token`). No TCP port is opened on any OS.

The `~/Urfael` vault and `~/Urfael-memory` repo are yours. They are kept separate from the cloned source (note the capitalisation) so an uninstall of the code never touches your data.

## Next

The full setup detail (voice tiers, persona, Obsidian registration, connectors, bridges, Linux units) is in [SETUP.md on GitHub](https://github.com/maximilliangrand/urfael/blob/main/docs/SETUP.md). To start the daemon and say something, go to [start/quickstart.md](start/quickstart.md).
