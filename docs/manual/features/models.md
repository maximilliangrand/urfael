# Models and providers

Urfael's main local conversation can use Claude Code, Codex with ChatGPT sign-in, or a direct Anthropic/OpenAI API connection. Subscription sign-in is authenticated access: you sign in with the official client, and your plan's limits, credits, and terms apply.

| Provider ID | Connection | Credential |
| --- | --- | --- |
| `claude` | Official Claude Code CLI | `claude auth login` |
| `chatgpt` | Official Codex CLI | `codex login` with ChatGPT |
| `claude-api` | Direct Anthropic Messages API | `ANTHROPIC_API_KEY` |
| `openai` | Direct OpenAI API | `OPENAI_API_KEY` |

Choose one in **Console → Settings → Change provider**, or run:

```bash
urfael model login claude        # official browser sign-in
urfael model login chatgpt       # official browser sign-in
urfael model use chatgpt         # switch the main conversation
urfael model use claude-api      # hidden API-key prompt
urfael model use openai          # hidden API-key prompt
urfael model test openai         # small, billable API probe
urfael model use claude          # return to Claude Code
```

Install the official Claude Code or Codex CLI before selecting its subscription route. This integration was live-tested with Claude Code 2.1.300 and Codex 0.162.1; older clients may not support its isolation flags. Urfael launches that client's sign-in flow; it does not read, copy, or export OAuth tokens. The ChatGPT route rejects a Codex API-key login instead of silently billing it as subscription usage. Direct API routes use their own keys and do not require Claude Code or a translating proxy.

The terminal setup wizard offers the same five choices as the Console, including the existing local/custom Claude-compatible endpoint option. Settings are saved atomically in `~/.claude/urfael/provider.env` with owner-only permissions. `URFAEL_PROVIDER` selects the main local backend. For an API model override, use `urfael model use openai --big MODEL_ID`; `URFAEL_NATIVE_MODEL` stores that override. Codex otherwise chooses its default model. Fresh API/Codex turns include the last four completed local exchanges (up to 4,000 characters per message), plus applicable recalled memory. Tool calls are not replayed as history.

Explicit API and ChatGPT selections fail visibly if the chosen provider is unavailable or missing authentication. They do not silently send your prompt to a different account. Remote channels, separate provider chat sessions, scheduled jobs, and auxiliary Claude workflows retain their existing Claude-compatible implementation. A non-Claude main conversation does not migrate those workflows. New API/Codex entries cannot be opened in the separate Chats view; use the main conversation.

## Local command execution

Native API tools can run commands on macOS and Linux after explicit owner opt-in:

```bash
urfael model commands on
urfael model commands status
urfael model commands off
```

The Console and setup wizard expose the same setting (`URFAEL_NATIVE_EXEC=1`). It applies to the main local conversation and local `/engine/ask` requests. Remote channels, read-only tools, and delegated native workers cannot acquire the native shell tool. Windows native execution is unavailable until process-tree cleanup can be implemented reliably.

`exec_shell` accepts a command, an optional directory within the vault workspace, and an optional timeout. It returns separate stdout/stderr, exit code, signal, and timeout/cancellation/truncation flags. Commands are capped at 4 KiB, combined output at 64 KiB, and runtime at 60 seconds (30 by default). Cancellation and completion terminate the owned POSIX process group. A failed command is reported to the model so it can decide how to recover; the runner never retries it automatically. Once a command starts, automatic provider fallback is disabled to avoid replaying side effects.

**Native commands execute on the host with your user's permissions.** The initial directory is constrained to the workspace and the child receives only PATH and a workspace HOME. This removes inherited API keys from its environment, but it is not an OS sandbox: a command can still access files and the network available to your user. Use a dedicated account or container when stronger isolation is needed.

The Codex route uses the official client's read-only sandbox by default; the command setting enables its workspace-write sandbox. Codex does not inherit Claude-specific permission rules or guarantee vault-only reads. Urfael disables Codex web search and workspace command network access, ignores user configuration, and launches outside the task project to avoid discovering its configuration. Managed client policies may still apply. It never uses a bypass-permissions flag.

## Claude tiers and other providers

For the Claude CLI backend, `urfael model opus`, `sonnet`, and `auto` retain their existing tier routing. An explicit `/opus` or `/sonnet` turn override selects the Claude CLI for that turn even when a native provider is selected. Availability depends on your account. API model IDs are configured separately.

`urfael model providers` lists the registry in `config/providers.json`. Existing Claude-compatible, cloud, local, and proxy rows keep their prior routing. Rows with `proxyHint` require the indicated separately managed proxy. `URFAEL_PROVIDERS_INDEX` can replace the registry. Endpoint/model availability must be checked before relying on a row; indicative cost/speed/quality tiers are not benchmarks.

## Authentication references

As checked on 19 October 2026, Anthropic's [subscription usage update](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan) says its planned restriction was paused and describes current CLI/SDK usage and credits. Its [login guidance](https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account) distinguishes official application sign-in from API authentication and third-party restrictions. This integration uses the official CLI and preserves direct API access; it does not promise anonymous, unlimited, or free cloud inference.

OpenAI documents [Codex authentication](https://learn.chatgpt.com/docs/auth) and the [CLI reference](https://learn.chatgpt.com/docs/cli/reference). API usage is billed separately from subscription access. Authentication and plan terms may change.

## Related

- [Local GPU configuration](guides/local-gpu.md)
- [Security model](security/model.md)
- [Configuration](using/configuration.md)
