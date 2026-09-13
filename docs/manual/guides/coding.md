# Autonomous coding

Urfael can take a coding goal and work toward it on its own: edit files, run a check, iterate, repeat until done. This is the `/goal` loop. It is opt-in, it is the most capable thing Urfael does, and it is the one feature where the sandbox is the point. Read this before you turn it on.

> [!WARNING]
> The `/goal` loop can edit and commit code without you in the loop. It runs with caps, timeouts, and kill switches, and it never pushes. For anything beyond a trusted local repo, run it in a throwaway Docker container or on a remote host, never on your live checkout and never with your secrets mounted. Supervise the first run.

## The loop

You hand the brain a goal and it enqueues a detached background job (`job` kind `goal`), so the work runs concurrently and does not tie up your conversation. Managed host jobs use the current app's `goal-loop.js`; the vault shell script retains the optional Docker/SSH backends. The loop wraps your `claude` CLI and repeats one turn at a time until completion is supported by the configured evidence or a limit stops the run.

The guardrails are kill switches, not just exit traps:

- It refuses to run without an explicit `--repo` pointing at an isolated git worktree. It never defaults to the current directory, and it refuses if that directory is not a git repo, so you can always `git reset --hard`.
- It caps iterations and wall-clock time, and SIGKILLs a hung turn. The daemon clamps these server-side: iterations 1 to 50, wall clock 1 to 240 minutes, per-turn timeout 30 to 3600 seconds.
- A no-progress circuit breaker aborts when the git state has not changed for several turns.
- Completion needs the worker's final `URFAEL-GOAL-DONE` marker and a passing `--check` command when one is configured. Optional `--verify --criteria FILE` also requires a fresh read-only model review. A passing baseline test alone cannot finish a goal.
- It never auto-merges and never auto-pushes. The result is a worktree you review.

You inspect and stop a running job from any terminal:

```bash
urfael jobs            # list background jobs and their state
urfael job <id>        # one job's record plus a log tail
urfael job <id> --resume # continue an eligible host goal with its remaining budget
urfael cancel <id>     # kill the whole process group
```

See [features/automation.md](features/automation.md) for the wider job and scheduling surface.

Host runs save their model session, progress and verification receipts outside the workspace. A detached supervisor records the result even if the daemon restarts. Checks are tied to tracked and nonignored untracked file contents, including further edits to an already-dirty file. Failed checks feed diagnostics into the next turn. The Jobs view distinguishes unverified worker claims, model reviews, passing checks and incomplete runs. See [coding review and recovery](features/coding.md#background-coding-goals-review-and-recovery) for receipt details, resume conditions and platform limits. Docker/SSH jobs do not support this host recovery protocol.

## The sandbox is the point

By default the loop runs on the host, in the permission mode you set. That is fine for a trusted local repo you are watching. For anything else, isolate it. Two backends, both opt-in and off by default.

### A throwaway Docker container

`--sandbox docker` (or `URFAEL_SANDBOX=docker`) runs each turn inside a fresh `docker run --rm` container that is thrown away after. It is network-isolated by default: the container gets `--network none`, so an injected or runaway turn has nowhere to send anything. Your `--repo` is bind-mounted read-write at `/work`; the host is otherwise untouched, with no host env leaking in. Resources are capped (`--memory 2g`, `--pids-limit 512`).

The credential handling is the load-bearing part. Urfael never mounts your whole `~/.claude`, because that tree also holds `bridge.env`, your API keys, TTS config, and the session archive, and the sandboxed agent has a shell. Instead it stages only the `claude` auth files the CLI needs (`.credentials.json`, `settings.json`, `settings.local.json`) into a temporary directory and mounts that read-only. The secret tree is never staged. If you need network access inside the container, `--sandbox docker-net` gives it a bridge network, but understand the trade: a turn that can both read and reach the internet is a turn that can exfiltrate.

### A remote host over SSH

`--sandbox ssh` plus `--ssh-host user@host` (and an optional `--ssh-dir`) runs each turn on a remote box. The remote needs `claude` on its PATH and the repo checked out there. Turns and their git effects live on the remote tree, so the circuit-breaker's git checks run over SSH against that same tree. The goal text is never spliced into the remote command string: the prompt is piped to the remote `claude -p` on stdin and flags pass through `printf %q`, so a hostile goal cannot inject a remote shell command. The host string is restricted to a benign charset. Urfael never hands secrets to the remote and never pushes.

## Honest edges

- This is opt-in. Without `--sandbox`, the loop runs on the host. The flag is the difference between "edits a worktree I am watching" and "edits a worktree it cannot escape." Use it for anything you would not want a stranger running.
- The container image must carry the `claude` CLI on PATH. A default base image will not have it unless you build it in or point `URFAEL_SANDBOX_IMAGE` at one that does.
- The container runs as root, which maps cleanly to your host user on macOS Docker Desktop. On a Linux host you may want `--user` with a writable HOME.
- Full capability mode (`URFAEL_YOLO=1`) gives the agent an unrestricted shell. Run that only in a VM, container, or throwaway account.

The rationale (why only the auth files, why network-none is the default, the threat class this closes) is documented as Class 6 of the security benchmark. The script itself is the most honest reference: [goal-loop.sh](https://github.com/maximilliangrand/urfael/blob/main/vault-template/_urfael/goal-loop.sh).

## Related

- [security/model.md](security/model.md)
- [security/modes.md](security/modes.md)
- [features/automation.md](features/automation.md)
- [start/quickstart.md](start/quickstart.md)
