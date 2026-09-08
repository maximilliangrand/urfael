# Architecture

Urfael is a local Node daemon driving the installed `claude` CLI. Console, orb, CLI, and TUI clients use HTTP over local IPC: a `0600` Unix socket on macOS/Linux and an authenticated named pipe on Windows.

The core endpoint has no TCP listener. Optional dashboard, API, webhook, WhatsApp, and PSTN services do open loopback TCP listeners. A tunnel or proxy can expose them externally; other integrations connect outbound. See [security boundaries](../security/model.md).

## Routing and storage

`app/daemon.js` owns request routing, I/O, and subprocess lifecycle. Supporting modules handle profiles (`lib.js`), council tool restrictions (`council.js`), audit integrity (`audit-chain.js`, `seal.js`), and CLI metadata (`registry.js`).

Local owner sessions have the authority configured by the owner. Remote sessions use a restricted profile: Fortress is read-only without web/shell tools; Full mode adds web tools for remote owner/member turns. Credential-deny rules and strict MCP configuration provide additional controls. These harness restrictions are distinct from explicitly selected Docker isolation.

The Obsidian vault stores the archive; a git repository stores learned memory. See [memory](../features/memory.md) and the [quickstart](../start/quickstart.md).

## Evidence

CI runs credential-free unit, fuzz, and SSRF regression suites, with additional dependency and Windows installer checks. The security and end-to-end live harnesses are manual and may use authenticated model turns. They cover selected conditions and are self-authored, not independent audits.

See the [full architecture](../../../ARCHITECTURE.md) and [benchmark methodology](../../SECURITY-BENCHMARK.md).
