# Urfael architecture

Urfael's local Node daemon drives the installed `claude` CLI as subprocesses. Desktop and terminal clients use its HTTP-over-IPC endpoint: a `0600` Unix socket on macOS/Linux, or an authenticated named pipe on Windows. The core endpoint does not listen on TCP.

## System shape

```text
Console / orb / CLI / TUI ───────────────┐
Optional dashboard / API ───────────────┤
Chat bridges / webhook actions ────────┤
                                      ▼
                             local daemon IPC
                                      │
                         profile resolution + routing
                                      │
                         claude subprocess / engine
                                      │
                         vault + git memory repository
```

Dashboard, API, webhook receiver, WhatsApp, and PSTN webhook services can open **opt-in loopback TCP listeners**. These are separate surfaces even though they reach the same daemon. Tunnels and proxies can make them externally reachable. Other integrations make outbound connections. See the [network boundary table](README.md#security).

`daemon.js` owns I/O, process lifecycle, and routing. Supporting modules contain independently testable logic, but the daemon also contains policy and integration logic; a unit-test pass does not validate every route or subprocess interaction.

## Security-relevant entry points

- **`app/lib.js`: `resolveProfile` / `profileFor`.** Unknown profiles resolve to the restricted `untrusted` profile. Fortress remote turns are read-only with no web/shell tools; Full mode adds web reach for remote owner/member turns.
- **`app/council.js`: `intersectTools`.** Intersects requested worker tools with the read-only floor. An empty intersection falls back to that floor.
- **`app/personas.js`: `SAFETY_CLAUSE` / `overlayFor`.** Appends a safety instruction to persona overlays. An instruction is not itself an isolation boundary.
- **`app/audit-chain.js` and `app/seal.js`.** Hash-chain audit events and sign chain heads. Integrity verification depends on trusted keys and retained reference heads; it does not establish that logged behavior was safe.
- **`app/registry.js`.** Defines CLI help and dispatch metadata, with drift checks in the unit suite.

## Module map

| File | Role (one line) |
|---|---|
| `app/daemon.js` | The conductor: `0600` UNIX-socket HTTP server, warm `claude` sessions, routing, bridge polling, loopback dashboard/API/webhook. Owns I/O; delegates logic to the satellites below. |
| `app/lib.js` | Shared routing and permission logic (`resolveProfile`/`profileFor`), roster/principal resolution, reminder/cron/script/hook normalizers, sentence segmentation, and CLI suggestions. |
| `app/council.js` · `council-view.js` | The Council engine (schema-forced planner → bounded streamed worker fan-out → synthesis; `intersectTools` is the narrow-only safety floor, fully testable via injected `emit`/`spawn`) + the live "round table" terminal view. |
| `app/personas.js` | Selectable voice overlays + the immutable `SAFETY_CLAUSE` appended in code; authored personas can never shadow a built-in or strip the clause. |
| `app/audit-chain.js` | Tamper-evident sha256 hash-chained Ledger of Record; pure `verify()` pinpoints the first broken link. |
| `app/seal.js` | Ed25519 signing and verification of chain heads; attribution depends on how the verification key is trusted. |
| `app/jobstore.js` | Durable detached-job store (one JSON + one log per job); opaque `ID_RE`-validated ids, reconciled on daemon start. |
| `app/registry.js` | Single source of truth for CLI help, did-you-mean, and the dispatch contract (drift-guarded). |
| `app/cli.js` | CLI commands and daemon requests; `registry.js` supplies help and dispatch metadata. |
| `app/md.js` | Dependency-free, streaming-tolerant Markdown → ANSI for terminal answers. |
| `app/provenance.js` | Renders `urfael why` as a paste-ready citation (a pure reformat of the stored commit date; no present-time leak). |
| `app/recall.js` · `recall-index.js` | Persistent BM25 inverted index over the whole archive; optional local-vector re-rank via RRF; fail-soft scan. |
| `app/learn.js` · `learn-verify.js` | Candidate lessons are quarantined for a separate model verification pass. That verdict is not proof of correctness or safety. |
| `app/skillhub.js` | `urfael hub`: scan + sha256-pin + preview + never-execute; SSRF-guarded install (guard shared with the relay). |
| `app/tui.js` · `tui-render.js` · `tui-anim.js` · `tui-theme.js` | Flicker-free full-screen terminal cockpit: a differential renderer (only changed rows repaint) + the runic worker animation. |
| `app/main.js` · `console/` · `renderer/` · `preload.js` | The Electron Console (desktop app) and orb HUD — thin clients of the daemon. |
| `app/bridge/` | Chat bridges (including Telegram, Discord, Slack, iMessage, Email, Matrix, Signal, and WhatsApp) + `bridge-core.js` + `notify.js`. Includes outbound clients and opt-in loopback webhook listeners; allowlist before the brain. |
| `app/dashboard.js` · `openai-api.js` | Loopback-only (`127.0.0.1`) token-gated web dashboard and OpenAI-compatible API. |
| `app/scheduler.js` · `runner.js` · `hooks.js` · `voice.js` · `wake-worker.js` · `import.js` · `embed.js` · `setup.js` | Cron/reminders, the goal-loop runner, the webhook receiver, local STT/TTS + wake word, the OpenClaw/Hermes importer, embeddings, the onboarding wizard. |
| `app/test/` | `node:test` regression tests (`*.test.js`, no model credentials) + two live-daemon harnesses (`e2e.js`, `security-benchmark.js`) run only via their own npm scripts. |

## A remote turn

A bridge authenticates the provider where applicable and checks the sender against the configured roster. The daemon selects a permission profile, frames message content as untrusted data, and starts the scoped model session. Fortress restricts tools to reading/searching; Full mode deliberately widens web access. Credential-deny rules and strict MCP configuration provide further restrictions. The response returns through the bridge, and audit events record the turn.

These are harness controls. They reduce available actions but do not guarantee that the model will ignore malicious instructions, that every readable file is non-sensitive, or that allowed replies cannot disclose data. Local owner turns carry greater authority. Docker isolation for autonomous coding is a separate, explicit choice.

## Tests and evidence

`npm test` enumerates `app/test/*.test.js` through `app/test/run-tests.js`. Tests need no model credentials; some exercise subprocesses or local servers. CI also runs input fuzzing and the SSRF regression harness, plus dependency and Windows installer checks. See [the workflow](.github/workflows/ci.yml).

`npm run security` and `npm run e2e` are manual live-daemon harnesses that use local state and may consume authenticated model turns. The security source defines 11 groups and 128 check call sites, mixing runtime probes, module checks, and source assertions. These are not fresh pass counts or an independent audit. See [methodology and limitations](docs/SECURITY-BENCHMARK.md).

The [threat model](docs/THREAT-MODEL.md) describes trust boundaries and residual risks.
