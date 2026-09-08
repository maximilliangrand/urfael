# Urfael threat model

This describes intended controls and residual risks, supported by project-maintained tests. It is not an independent security assessment. The [benchmark](SECURITY-BENCHMARK.md) documents what the self-authored harness actually checks.

## Assets

The host and its files, vault and memory, provider credentials, bridge/API tokens, and the integrity of responses and audit records.

## Trust boundaries

| Zone | Authority and exposure |
|---|---|
| Local owner | Can reach daemon IPC and enable powerful tools; processes running as the owner share much of that authority |
| Daemon endpoint | `0600` Unix socket on macOS/Linux; authenticated named pipe on Windows; no core TCP listener |
| Dashboard / API | Optional token-gated TCP listeners on `127.0.0.1` |
| Webhook / WhatsApp / PSTN receivers | Optional loopback TCP listeners; per-hook secrets or provider signatures and sender checks; external delivery requires a user-configured tunnel/proxy |
| Remote senders | Allowlisted before model use; Fortress read-only profile by default; Full mode adds web tools for owner/member turns |
| Model and connectors | Receive the data provided to them and act through configured permissions |
| Untrusted content | May contain prompt injection, malicious code, or sensitive data; framing does not make it harmless |

Loopback is a binding choice, not absence of an attack surface. Local clients can connect, and tunnels/proxies change external reachability. Authentication still matters. Outbound provider and bridge connections also carry data across the host boundary.

## Adversaries and controls

- **Network attacker:** local IPC for the core endpoint; loopback binding and authentication for optional HTTP services. Verify every enabled service and proxy, not just the daemon process.
- **Prompt injector or unauthorized sender:** provider verification where applicable, sender allowlists, restricted tool profiles, strict MCP configuration, credential-deny rules, and untrusted-data framing.
- **Malicious skill/plugin author:** static scans, capability previews, consent and hash checks. Static analysis is heuristic; some plugin processes run with owner privileges, as described below.
- **Runaway autonomous work:** iteration/time caps and cancellation. Docker network and mount restrictions apply when Docker is explicitly selected; host execution and SSH have different boundaries.
- **Malformed or excessive requests:** input validation, body limits, and rate controls on covered endpoints. Regression tests exercise selected cases, not all possible denial-of-service behavior.

## What we do NOT defend against (residual risk — stated, not hidden)

- **A compromised host.** If malware already runs as you, it can read the same `0600` files Urfael uses. Urfael shrinks blast radius; it is not a rootkit detector.
- **`URFAEL_YOLO=1`.** Opt-in unrestricted-shell mode is, by design, an unrestricted shell that also reads untrusted web/email. The docs say in every relevant place: run it only in a VM / container / throwaway account.
- **A widened sandbox.** Full mode adds web tools to remote owner/member turns. Custom profile edits or additional capabilities can introduce further egress or write paths. The default is closed; widen deliberately.
- **The model itself.** Tool restrictions limit what a model can do; they do not guarantee that it ignores prompt injection or avoids disclosing readable data in an allowed reply.
- **The connectors you enable.** Calendar/Gmail/desktop MCPs you turn on carry their own permissions; the email bridge is draft-only, but other connectors may have send or write permissions.
- **The model provider you point at.** The provider processing a turn receives its content. A local model can keep inference on your machine, but enabled bridges, connectors, or cloud voice can still send data out. A remote proxy or provider receives your prompts as it would through direct API use. Tool restrictions do not hide the turn from its provider, and their effectiveness depends on the configured execution path.
- **A brain-tools-only plugin's server process.** A plugin that requests *only* LLM-visible tools (no fs/net/exec/secret grant) is spawned as a plain local stdio process, not inside the Docker cell — the cell confines a host-reaching grant, not the tool server itself. It has no *granted* capabilities, but the server code runs with your privileges, like any program you launch. Installing one is a trust decision; the capability preview labels it "not sandboxed" so the choice is explicit. Host-reaching plugins (fs/net/exec/secret) always run in the `--network none` cell or refuse to enable.
- **Install-time plugin signature verification.** Install today is static-scan + capability preview + consent, and the consented manifest is sha-pinned so a post-consent edit is refused at enable. Verifying a publisher's ed25519 signature *at install* (the primitive ships and is tested) is not yet wired into the install path; until it is, the first install of a publisher is a human-judgement moment, and tamper-evidence across the network depends on the registry sha-pin, not a signature check.
- **Scale.** This is a personal tool with a small user base — far less adversarial scrutiny than a 100k-deployment project. We say so plainly.

## Verification

The repository includes unit regressions, fuzzing, SSRF tests, and manual live harnesses. Some checks call enforcement functions; others inspect source text or issue live requests. The security benchmark source defines 11 groups and 128 check call sites. This count is not evidence of a passing run or complete coverage of this threat model.

See [benchmark limitations](SECURITY-BENCHMARK.md) and [CI configuration](../.github/workflows/ci.yml). A second model used for task verification is separate from the authoring model, but does not constitute an independent security audit.
