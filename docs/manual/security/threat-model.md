# Threat model and benchmark

Urfael's security benchmark is a **self-authored regression harness**, not an independent audit. It mixes live daemon/dashboard probes, direct module checks, and source-text assertions.

From `app/`, `npm run security` runs the harness. Read its [methodology and operational requirements](../../SECURITY-BENCHMARK.md) first: it uses local daemon state, changes test data and the dashboard token, and may consume authenticated Claude Code turns. It is manual, as is `npm run e2e`; neither runs in credential-free CI.

## Coverage and counts

The source defines **11 groups and 128 check call sites**. These are source counts, not a newly verified passing run. The groups cover network exposure, token handling, prompt-injection controls, skill supply chain, denial of service, autonomous work, defaults, inbound triggers, correctness regressions, plugin loading, and the native engine.

The [full coverage map](../../SECURITY-BENCHMARK.md#coverage-map) explains what is checked. A pass supports a specific tested condition, not resistance to every attack in that category. Unit totals come from the separate `npm test` runtime summary.

## Boundaries

The daemon uses local IPC. Opt-in dashboard, API, webhook, WhatsApp, and PSTN services can listen on loopback TCP ports. A user-configured tunnel or proxy can expose them externally. Fortress restricts remote tools to reading/searching; Full mode adds web reach for owner/member turns. Docker isolation for autonomous coding must be selected explicitly.

Residual risks include a compromised host, unrestricted shell mode, widened profiles, malicious readable content, connector/plugin privileges, provider data exposure, and limited deployment experience. Static scanning and model-based review do not guarantee safety.

Read the [full threat model](../../THREAT-MODEL.md), [security model](model.md), [mode tradeoffs](modes.md), and [quickstart](../start/quickstart.md).
