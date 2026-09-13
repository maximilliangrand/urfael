# Autonomous coding

Background coding goals run Claude turns in a repository, collect configured completion evidence, and stop when the goal is complete or a limit is reached. Managed host jobs also retain progress for review and eligible resumes.

> [!WARNING]
> A coding goal can edit and commit files using your configured Claude permissions. Choose an isolated checkout and supervise the first run. Host mode does not confine the worker to that directory; Docker and SSH have the access limits described below.

## The loop

You hand the brain a goal and it enqueues a detached background job (`job` kind `goal`), so the work runs concurrently and does not tie up your conversation. Managed host jobs use the current app's `goal-loop.js`; the vault shell script retains the optional Docker/SSH backends. The loop wraps your `claude` CLI and repeats one turn at a time until completion is supported by the configured evidence or a limit stops the run.

For managed host jobs:

- It requires an explicit `--repo` and checks that it is a Git repository. You choose whether that repository is isolated. The recorded baseline helps review changes; it does not automatically undo them.
- It limits iterations and elapsed execution time, with watchdogs for model turns and acceptance commands. The daemon clamps these settings: iterations 1 to 50, execution time 1 to 240 minutes, per-turn timeout 30 to 3600 seconds.
- A no-progress circuit breaker aborts when the git state has not changed for several turns.
- Completion needs the worker's final `URFAEL-GOAL-DONE` marker and a passing `--check` command when one is configured. Optional `--verify --criteria FILE` also requires a fresh read-only model review. A passing baseline test alone cannot finish a goal.
- The runner adds no push or merge step. The worker still has your configured tool permissions, so review its work and activity before publishing.

You inspect and stop a running job from any terminal:

```bash
urfael jobs            # list background jobs and their state
urfael job <id>        # one job's record plus a log tail
urfael job <id> --resume # continue an eligible host goal with its remaining budget
urfael cancel <id>     # request cancellation; inspect the eventual job state
```

See [features/automation.md](features/automation.md) for the wider job and scheduling surface.

Host runs save their model session, progress and verification receipts outside the workspace. A detached supervisor records the result even if the daemon restarts. Checks are tied to tracked and nonignored untracked file contents, including further edits to an already-dirty file. Failed checks feed diagnostics into the next turn. The Jobs view distinguishes unverified worker claims, model reviews, passing checks and incomplete runs. See [coding review and recovery](features/coding.md#background-coding-goals-review-and-recovery) for receipt details, resume conditions and platform limits. Docker/SSH jobs do not support this host recovery protocol.

## Execution backends

The default is host execution with your configured permissions. Docker and SSH are optional backends selected explicitly; neither makes arbitrary repository code safe.

### A throwaway Docker container

`--sandbox docker` (or `URFAEL_SANDBOX=docker`) runs model turns in a fresh `docker run --rm` container with `--network none`, `--memory 2g`, and `--pids-limit 512`. The selected repository is mounted read-write at `/work`; changes persist on the host. The shell backend's acceptance command runs on the host against that checkout, not inside the container.

The setup stages `.credentials.json`, `settings.json`, and `settings.local.json` from `~/.claude` when present and mounts that directory read-only. It also forwards selected Claude/Anthropic provider environment variables, including configured credentials. The model can read those files and credentials. It does not mount the whole `~/.claude` directory. `--sandbox docker-net` enables a bridge network; use it only with credentials and data you intend to expose to that workload.

### A remote host over SSH

`--sandbox ssh` plus `--ssh-host user@host` (and an optional `--ssh-dir`) runs turns and acceptance commands in a remote checkout using that account's permissions. The remote needs `claude` on PATH and its own authentication. The prompt travels over stdin and flags are shell-quoted; the host argument is validated. These transport precautions do not restrict what the remote model can do with its tools. The SSH backend does not run the independent model verifier, so `--verify` cannot confirm completion there.

## Honest edges

- Without `--sandbox`, the loop runs on the host. Docker relies on the container runtime and the access you grant; SSH relies on the remote account's isolation and permissions.
- The container image must carry the `claude` CLI on PATH. A default base image will not have it unless you build it in or point `URFAEL_SANDBOX_IMAGE` at one that does.
- The container runs as root by default. File ownership on the mounted repository depends on the host and runtime; the wrapper does not expose a `--user` option.
- Full capability mode (`URFAEL_YOLO=1`) gives the agent an unrestricted shell. Run that only in a VM, container, or throwaway account.

The managed engine is [app/goal-loop.js](https://github.com/maximilliangrand/urfael/blob/main/app/goal-loop.js). Optional Docker/SSH behavior is implemented in [goal-loop.sh](https://github.com/maximilliangrand/urfael/blob/main/vault-template/_urfael/goal-loop.sh).

## Related

- [security/model.md](security/model.md)
- [security/modes.md](security/modes.md)
- [features/automation.md](features/automation.md)
- [start/quickstart.md](start/quickstart.md)
