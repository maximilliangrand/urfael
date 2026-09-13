# Coding

`urfael code "<task>"` runs Claude Code in your repo with per-project memory, an attempted checkpoint of the working tree, and a rewind command. Background coding goals use a separate loop with bounded iterations, completion evidence, and manual recovery.

```bash
urfael code "add a retry to the API client"
urfael checkpoints
urfael rewind            # undo the last coding turn
```

## What a coding turn does

Run from inside a git repo (or point at one with `--dir`):

1. **Resolves the repo and its memory.** The project id derives from the git remote, so the same repo shares one memory across clones. With no remote it falls back to the directory name plus a hash of the path, so two repos with the same basename never collide.
2. **Loads per-project memory.** A `CONVENTIONS.md` and `HISTORY.md` for that repo live under the private memory repo (`~/Urfael-memory/projects/<id>/`). The conventions load as context every turn, fenced as reference, not instructions. The first run seeds a `CONVENTIONS.md` for you to fill in.
3. **Attempts a checkpoint first.** Before the brain runs, the working tree (tracked and untracked, the set `git add -A` stages) is snapshotted onto a private git shadow ref (`refs/urfael/checkpoints/<id>`) through a temporary index. This leaves your branch, index, and working tree unchanged. If Git cannot create the checkpoint, the command reports that and continues without one.
4. **Runs Claude Code in the repo,** seeded with the project conventions and your task.
5. **Records the turn.** The task and its checkpoint id are appended to the repo's `HISTORY.md` and an append-only log, both inside the git-versioned memory repo.

## Per-project memory

Urfael stores conventions and session history for each project:

- `CONVENTIONS.md` is yours to edit. Put the stack, the layout, the conventions, and the gotchas that bit you before. It loads every turn.
- `HISTORY.md` is appended automatically, one entry per coding turn, each with the checkpoint to rewind to.

Edit the conventions file at the path the command prints after a run. Disable memory for one run with `--no-memory`.

## Checkpoints and rewind

A checkpoint is a snapshot of your whole working tree, stored as a commit on a private shadow ref. It does not appear in `git log`, does not move your branch, and does not touch your index. List them:

```bash
urfael checkpoints
```

Rewind restores your tracked files to a snapshot:

```bash
urfael rewind                 # the latest checkpoint
urfael rewind k3xq9z-1a2b     # a specific one
```

Rewind is safe by construction:

- It **checkpoints the current state first**, so the rewind is itself reversible. The command prints the id that undoes it. If that pre-checkpoint cannot be made (so the rewind would be irreversible), it refuses rather than overwrite your files; `--force` overrides.
- It **keeps files you created since** the snapshot rather than deleting them, and lists them. It never runs a destructive clean.
- It **preserves your existing index.** Restoring uses a temporary index, so your carefully staged changes remain staged exactly as before the rewind. Restored files appear as working-tree changes relative to that index.
- It asks before it touches anything. Pass `--yes` to skip the prompt in a script.

## Flags

- `--dir <path>` run against a repo other than the current directory.
- `--no-checkpoint` skip the snapshot for this run.
- `--no-memory` skip loading and writing per-project memory.
- `--no-run` checkpoint and load memory but do not run the brain (a quick way to take a snapshot).
- `--yes` (on `rewind`) skip the confirmation prompt.
- `--force` (on `rewind`) proceed even if the pre-rewind checkpoint of the current state could not be made.

## Honest scope

The checkpoint mechanism relies on git, so `urfael code` needs a git repo (it tells you to run `git init` if you are not in one).

A checkpoint covers tracked and nonignored untracked files, the same set as `git add -A`. Ignored untracked files are left out, but tracked files remain included even if an ignore rule matches them. This is not a secret scanner. If the agent might change an ignored file you care about, back it up yourself.

Rewind restores files to a snapshot and keeps newer files rather than deleting them, so a rewind is an overlay rather than a byte-for-byte mirror. `urfael code` is the supervised coding session. Background goal jobs are described below; their repository baseline is a review reference, not a checkpoint or an automatic undo.

## Background coding goals: review and recovery

A background job with `kind: "goal"` works toward a goal in an explicitly selected git repository (`spec.repo`). Use an isolated checkout or worktree. The loop has iteration, elapsed-time, and per-turn limits. The runner does not add a push or merge step; review the work before publishing. The worker still runs with your configured tool permissions.

Inspect it in the Console's **Jobs** view or from the terminal:

```bash
urfael jobs
urfael job a1b2c3
urfael job a1b2c3 --resume
urfael cancel a1b2c3
```

Jobs shows the goal, current state, iteration count, stop reason, and recorded verification status. Iterations are charged before a worker turn starts, so an interrupted turn still counts toward the cap. **Details** includes the repository, original git baseline, completion contract, verification receipt, result, and log tail when available. Use **Refresh jobs** to read the latest progress. Older jobs without receipts are identified as having no recorded completion evidence.

A clean process exit alone does not mean the goal was completed. `stopped` means the loop ended without confirmed completion; inspect its reason before resuming. `interrupted` means execution ended without a final outcome. `failed` records a failure. Starting, running, and cancelling jobs remain in those states until the worker has a terminal result.

Host coding jobs save their progress outside the working repository, so the detached worker can continue when the daemon restarts. Resume is available only when the server reports that the existing job can safely continue. It reuses the last recorded model session, goal, settings, and remaining iteration/time limits. Unknown time during an interruption counts against the elapsed-time cap. Changing the completion contract or criteria requires a new job. The Console disables duplicate resume clicks and displays refusals. A CLI refusal exits nonzero. If the request cannot be confirmed, inspect the job before retrying.

The completion receipt distinguishes the evidence actually collected. The worker's final `URFAEL-GOAL-DONE` marker is a completion claim. An owner-supplied `check` command adds an exit-status check. Optional `verify: true` with a criteria file adds a fresh model review with Read/Grep/Glob tools.

| Verification status | Recorded evidence |
|---|---|
| `pending` | The completion gate has not finished. |
| `failed` | The configured gate did not pass; inspect its reason. |
| `unverified` | The worker reported completion with its marker; no acceptance check or model review passed. |
| `reviewed` | A model review passed; no acceptance command passed. |
| `passed` | The configured acceptance command actually exited successfully. |

For a command check, `verification.checkReceipt` records the command, exit code, timeout flag, start/end timestamps, workspace hash, and log path. Its success means that specific command passed against that recorded workspace. Check `independentlyVerified` to see whether the optional model review also passed. A model review reports whether it could refute the criteria from the source; it is not deterministic test evidence. A marker alone does not imply tests or an independent review.

Review the recorded baseline and the resulting repository before accepting the work. The runner adds no publishing step, and recovery does not rewind files. Resume is supported for managed host jobs; container, SSH, and legacy jobs without recovery state are not resumable here. On Windows, an interrupted job that still records an active worker, check, or verifier requires manual inspection because surviving child processes cannot be ruled out from the recorded leader PID. Cleanly stopped Windows jobs can still be eligible. Jobs only offers Resume when the server advertises it.

## Related

- [features/memory.md](features/memory.md)
- [features/automation.md](features/automation.md)
- [reference/cli.md](reference/cli.md)
