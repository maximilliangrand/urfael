<div align="center">
<img src="vault-template/_urfael/assets/urfael-logo.svg" width="104" alt="Urfael, the Uruz rune" />

# Urfael

**A personal AI assistant you run on your own machine, with local voice, a desktop console, and a searchable archive.**

Urfael drives your installed Claude Code CLI. It can use your existing login; optional API providers and cloud voice have separate costs.

<img src="docs/media/console.png" width="820" alt="Urfael Console with chat, voice input, reminders, jobs, and settings" />
</div>

[Manual](docs/manual/) · [Architecture](ARCHITECTURE.md) · [Security](#security) · [Benchmark scope](docs/SECURITY-BENCHMARK.md) · [Contributing](CONTRIBUTING.md)

## Highlights

- **Local voice.** Push-to-talk or an optional wake word; whisper.cpp transcribes and macOS `say` or Linux `espeak-ng` speaks. Other voice backends are opt-in.
- **Several interfaces, one daemon.** Console, orb HUD, terminal, full-screen TUI, plus an optional web dashboard and OpenAI-compatible API.
- **Searchable memory.** An Obsidian vault stores the archive; a local git repository stores learned memory. BM25 search and optional local embeddings support recall across conversations.
- **Coding tools.** `urfael code "<task>"` adds per-project context and working-tree checkpoints; `urfael rewind` restores a checkpoint.
- **Automation and channels.** Reminders, scheduled jobs, and optional chat bridges. Remote turns are allowlisted and use a restricted profile by default.
- **Optional integrations.** MCP connectors and plugins extend local owner turns. Review their permissions and code before enabling them.

## Install

macOS is the primary development platform. Linux is newer; native Windows support is beta. You need Node.js 20 or later and a configured model backend; the default uses an installed, signed-in Claude Code CLI. Voice and vault integration have additional prerequisites in the [setup guide](docs/SETUP.md).

Clone into `urfael-src`, since `~/urfael` can collide with the `~/Urfael` vault on a case-insensitive filesystem. Review [install.sh](install.sh) before running it:

```bash
git clone https://github.com/maximilliangrand/urfael.git urfael-src
cd urfael-src
./install.sh
urfael setup
```

The installer scaffolds the vault, memory repository, configuration, CLI link, and service files. Follow the [installation guide](docs/manual/start/install.md) for platform prerequisites and Windows instructions.

### Quick start

Start the daemon using your platform's service manager:

```bash
# macOS
launchctl load -w ~/Library/LaunchAgents/com.urfael.daemon.plist
# Linux
# systemctl --user enable --now urfael-daemon
```

From the source checkout, open the Console with `cd app && npm start`, or use `urfael "<question>"` and `urfael tui` in a terminal. See the [quickstart](docs/manual/start/quickstart.md) and [CLI reference](docs/manual/reference/cli.md).

## Security

The daemon's client endpoint uses a `0600` Unix socket on macOS/Linux, rather than a TCP listener. Windows uses a named pipe with token authentication. **This describes the daemon endpoint, not every optional service.**

| Surface | Network boundary |
|---|---|
| Daemon client endpoint | Local IPC; access relies on the operating system and, on Windows, the IPC token |
| Dashboard and OpenAI-compatible API | Opt-in TCP listeners bound to `127.0.0.1`, with token authentication |
| Webhook receiver | Opt-in loopback TCP listener, with per-hook secrets |
| WhatsApp and PSTN webhook bridges | Opt-in loopback TCP listeners, with provider signature checks and sender allowlists; external delivery needs a user-configured tunnel or proxy |
| Other bridges, model providers, and connectors | May make outbound connections; review the individual integration's setup |

Loopback binding prevents direct LAN access under normal host networking. Local processes can still reach these listeners, and a tunnel or reverse proxy can make them externally reachable. Authentication and configuration remain security boundaries.

In default **Fortress** mode, remote turns use read-only tools without web or shell access. **Full** mode adds web tools for remote owner/member turns. These are harness permission profiles, not an OS-level isolation guarantee. Unknown profiles fail closed; sender allowlists, credential-deny rules, and framing of untrusted content provide additional controls.

Autonomous coding can run on the host, in Docker, or over SSH. Docker isolation must be selected explicitly; the goal loop is not automatically containerized. `URFAEL_YOLO=1` enables unrestricted shell access and materially widens risk. Skills are scanned and previewed, but static scanning cannot establish that arbitrary content or code is safe. Some plugin server processes run with the local user's privileges; see the [threat model](docs/THREAT-MODEL.md).

Read [SECURITY.md](SECURITY.md), the [threat model](docs/THREAT-MODEL.md), and [Fortress vs Full](docs/MODES.md) before enabling additional capabilities.

## Tests and evidence

The repository includes self-authored regression tests. **They are not an independent security audit or a guarantee against an entire attack class.**

| Command (from `app/`) | Scope | CI |
|---|---|---|
| `npm test` | Files selected by `test/run-tests.js` from `test/*.test.js`; no model credentials required | Yes |
| `npm run fuzz` | Input-boundary fuzz harness | Yes, with a bounded iteration budget |
| `npm run redteam` | SSRF regression harness using local test servers | Yes |
| `npm run security` | Live daemon/dashboard probes, direct module checks, and source assertions | Manual |
| `npm run e2e` | Selected integration scenarios against a live daemon | Manual |

The [CI workflow](.github/workflows/ci.yml) also includes a runtime dependency audit and Windows installer checks. A configured workflow is not evidence that a particular revision passed.

The security benchmark source defines **11 groups and 128 `check(...)` call sites**. Those are source counts, not a newly verified passing result. The earlier 10-group and 125-check descriptions were stale. Read the [benchmark methodology and limitations](docs/SECURITY-BENCHMARK.md) before running it: live harnesses use local state and may consume authenticated model turns. They are not part of credential-free CI.

## What's lightly tested

- The channel maturity map classifies Matrix, Signal, WhatsApp, QQ, SimpleX, PSTN phone, Mattermost, Google Chat, SMS, DingTalk, Home Assistant, BlueBubbles, Feishu, and WeCom as code-complete, with live-account validation still outstanding. See the [channel guide](docs/manual/channels/overview.md).
- The live harnesses cover selected scenarios, not every feature or integration. Parsing and allowlist tests do not certify operation against real provider accounts.
- Linux and native Windows need more hardware and operational testing. CI coverage does not replace desktop or voice testing on those systems.
- This is a personal project with limited deployment experience. No independent security audit is documented here.
- Experimental features, including the council, native engines, and optional learning/verification loops, need supervision. A second model's review is not an independent security audit.

## Cost

The default CLI backend uses your configured Claude Code account, subject to its plan limits and terms. API providers and optional paid voice services are billed separately. Displayed spend estimates are estimates, not your provider's bill. See [model setup](docs/manual/features/models.md) and [local GPU configuration](docs/LOCAL-GPU.md).

## More documentation

[Channels](docs/manual/channels/overview.md) · [Voice](docs/manual/features/voice.md) · [Memory](docs/manual/features/memory.md) · [Coding](docs/manual/features/coding.md) · [Connectors](docs/manual/features/connectors.md) · [Team mode](docs/TEAM-MODE.md)

## Contributing

Issues, reproducible failures, and PRs are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). Report security issues using [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE), provided as is, without warranty.

An independent open-source project, not affiliated with or endorsed by Anthropic. Claude and Claude Code are trademarks of Anthropic.
