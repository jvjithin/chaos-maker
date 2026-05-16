# @chaos-maker/webdriverio Changelog

## Unreleased

### Fixed

- Page cleanup is now best-effort after a WebDriver session or page has already gone away.
- Service Worker cleanup now clears both page-buffered and worker-side logs after stopping the worker engine.
- Cleanup documentation now covers `afterEach`, post-navigation injection limits, and Service Worker unregister guidance.

## 0.4.0 - 2026-04-26

### Added

- Service Worker helpers and custom commands: `injectSWChaos`, `removeSWChaos`, `getSWChaosLog`, and `getSWChaosLogFromSW`.
- Re-exports for SSE config types and GraphQL operation matcher types.
- WDIO E2E coverage for SSE drops, delays, corruptions, closes, and named event matching.
- WDIO E2E coverage for GraphQL operation matching, RegExp transport, persisted GET, multipart diagnostics, anonymous-query skips, and XHR GraphQL.
