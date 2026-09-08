# Security model

The daemon endpoint uses local IPC: a `0600` Unix socket on macOS/Linux and a token-authenticated named pipe on Windows. It does not listen on TCP.

Optional dashboard and API services open token-gated TCP listeners on `127.0.0.1`. Webhook, WhatsApp, and PSTN receivers also open loopback listeners, using per-hook secrets or provider signatures and sender checks. Local processes can reach these ports. User-configured tunnels or proxies can make them externally reachable.

## Remote turns

Bridges check the sender against the configured roster before invoking the model. Profile resolution fails closed for unknown profiles. Default Fortress mode offers read/search tools without shell, write, or web access; Full mode adds web tools for remote owner/member turns. Scoped sessions use strict MCP configuration, and credential-deny rules restrict sensitive paths.

Messages are framed as untrusted data. This helps separate instructions from content but does not guarantee immunity to prompt injection. Tool restrictions cannot prevent every harmful response or disclosure of readable data. See [Fortress vs Full](modes.md) and [team mode](team.md).

## Autonomous work and integrations

The goal loop has execution caps and cancellation, but it can run on the host. Select Docker explicitly for its network and mount isolation, or SSH for execution on another host. `URFAEL_YOLO=1` enables unrestricted shell access and requires a deliberately isolated environment if untrusted input is involved.

Connectors and plugins carry their own authority. Static scans, previews, and consent hashes help review an installation; they do not prove code is safe. Brain-tools-only plugin servers can run as ordinary local processes with owner privileges. Read the [residual risks](../../THREAT-MODEL.md).

## Evidence

The project maintains unit regressions, fuzzing, SSRF tests, and manual live-daemon harnesses. They are self-authored checks, not an independent security audit. The security source has 11 groups and 128 check call sites; this is not a newly verified pass count. The live security and end-to-end harnesses are excluded from credential-free CI.

See [benchmark scope and limitations](threat-model.md) before interpreting or running the tests.
