# Urfael security benchmark

This is a **self-authored regression harness**, not an independent audit, penetration test, or certification. It combines live daemon/dashboard requests, direct calls to modules, and assertions about source text. A passing check supports the particular condition tested; it does not prove that a whole attack class is prevented.

## Running it

From the repository's `app/` directory:

```bash
npm run security
```

Read [the harness](../app/test/security-benchmark.js) first. It starts a real daemon and dashboard under a fresh temporary home, with a private state directory, socket, vault, memory, and dashboard token. It clears inherited credentials and application settings, disables update checks, and uses the deterministic offline Claude stub. Cleanup stops only its own child processes and removes its temporary files, including on startup failure or interruption. No Claude login is required. The Unix socket and mode checks require a POSIX host; the listener probe also needs `lsof`.

[CI](../.github/workflows/ci.yml) runs `npm run security` on macOS with Node 24 using the offline Claude stub. The rest of the matrix runs `npm test`, bounded `npm run fuzz`, and `npm run redteam`, plus dependency and Windows installer checks. `npm run e2e` remains a manual live-account harness.

## Counts and results

At this documentation revision, the source contains **11 `attackClass(...)` groups and 128 `check(...)` call sites** inside `main()`. Earlier documentation reported ten groups or 125 checks; those descriptions were stale. The unit runner separately enumerates `test/*.test.js`; its runtime summary is the place to obtain unit-test totals.

These are source counts, not a verified 128/128 passing run. No new live result is asserted here. For a reproducible result, retain the command's full output, exit status, commit SHA, OS, Node version, and relevant configuration. The harness computes its final totals from the rows it actually executes.

## Coverage map

| # | Group | Checks target |
|---|---|---|
| 1 | Network exposure | Daemon startup, Unix socket mode, state permissions, and process TCP listener inspection |
| 2 | Token handling | Dashboard token storage and request authentication/Host handling |
| 3 | Prompt-injection exfiltration | Restricted profiles, credential-deny configuration, framing, and related integrity controls |
| 4 | Skill supply chain | Static scanning, preview/install constraints, and SSRF guards |
| 5 | Denial of service | Selected malformed requests, request limits, and process survival |
| 6 | Runaway autonomous work | Sandbox configuration, secret staging, and goal-loop controls |
| 7 | Defaults | Opt-in power and fail-closed profile resolution |
| 8 | Inbound triggers | Webhook authentication, normalization, and restricted triggered actions |
| 9 | Correctness regressions | CLI behavior, personas, council tool restrictions, and connector configuration |
| 10 | Plugin loader | Manifest handling, capability validation, consent integrity, and plugin attachment boundaries |
| 11 | Native engine | File-tool confinement, default shell denial, adapter validation, and engine routing |

The group labels include correctness checks as well as security checks. Incident descriptions in the source explain author motivation; this document does not independently verify those incidents or compare other projects' security.

## Boundaries and limitations

- **Network scope:** the core daemon uses local IPC. Opt-in dashboard, API, webhook, WhatsApp, and PSTN services open loopback TCP listeners. A user-configured tunnel or proxy can expose those listeners externally. A daemon-only listener check does not cover the whole installation.
- **Probe limitations:** the listener check uses `lsof` and treats a nonzero exit as no listeners. A missing or failing tool can therefore produce a misleading pass. Source-pattern assertions also do not establish runtime behavior.
- **Permission scope:** Fortress remote turns have no web/shell tools; Full mode deliberately adds web reach for remote owner/member turns. These checks do not establish safety for every model, prompt, connector, or user-modified configuration.
- **Supply chain:** static scanning is heuristic. Host-reaching plugins require the Docker cell, but brain-tools-only plugin servers can run as ordinary local processes. Consent-time hashes do not independently authenticate a publisher; install-time signature verification is not wired into the install path.
- **Audit scope:** this suite is maintained by the project itself. Passing it neither establishes independent scrutiny nor guarantees absence of vulnerabilities. Live provider integrations, OS isolation, and production deployment behavior need separate evaluation.

See the [threat model](THREAT-MODEL.md) for residual risks and [README limitations](../README.md#whats-lightly-tested) for maturity notes.
