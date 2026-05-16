# Security Policy

## Supported versions

Only the latest published minor of each package receives security fixes.

| Package                    | Supported version |
| -------------------------- | ----------------- |
| `@chaos-maker/core`        | 0.6.x             |
| `@chaos-maker/playwright`  | 0.6.x             |
| `@chaos-maker/cypress`     | 0.6.x             |
| `@chaos-maker/webdriverio` | 0.6.x             |
| `@chaos-maker/puppeteer`   | 0.6.x             |

Once a new minor ships, the previous minor stops receiving fixes. Stay on the current minor to receive security updates.

## Reporting a vulnerability

**Do not open a public GitHub issue for security reports.**

Please report vulnerabilities privately through GitHub's coordinated disclosure flow:

1. Go to <https://github.com/chaos-maker-dev/chaos-maker/security/advisories/new>.
2. Describe the vulnerability, the affected package and version, and a reproduction (config, fixture, or repo link).
3. Include the impact you observed and any suggested mitigation.

If GitHub Security Advisories is unavailable, contact the maintainer listed on the package's npm page directly. Do not include exploit payloads in email; share them via the private advisory once acknowledged.

## What to expect

| Stage                 | Target                                                                              |
| --------------------- | ----------------------------------------------------------------------------------- |
| Acknowledgement       | Within 7 days of report.                                                            |
| Initial triage        | Within 14 days. Severity, affected packages, fix viability.                         |
| Fix or coordinated disclosure | Within 90 days for confirmed vulnerabilities, sooner for critical issues. |
| Public advisory       | Published with the fix release, crediting the reporter unless anonymity is requested. |

Chaos Maker has no bug bounty program. Reporters who want acknowledgement in the advisory are welcome to ask.

## Scope

In scope:

- Code under `packages/` published to npm under the `@chaos-maker/*` namespace.
- The Service Worker bundle (`@chaos-maker/core/sw`) and its bridge.
- The adapter helpers (`injectChaos`, `injectSWChaos`, etc.) shipped from each adapter package.

Out of scope:

- The published documentation site at <https://chaos-maker-dev.github.io/chaos-maker/> beyond content correctness.
- Fixtures, E2E test apps, and demo code under `e2e-tests/` (they intentionally accept malformed input and run with relaxed CSP).
- Third-party packages and transitive dependencies. File those upstream; we will track and bump on our end.
- Theoretical issues that require an attacker to already have code execution inside the test process or the page under test.

## Hardening notes

Chaos Maker is intended for use in test environments and CI pipelines. It is not designed to run in production traffic paths. Do not ship the `@chaos-maker/*` packages in production builds: they patch `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, and DOM mutations, and a production user has no reason to opt into that.
