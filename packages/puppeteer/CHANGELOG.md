# @chaos-maker/puppeteer Changelog

## Unreleased

### Fixed

- Service Worker cleanup now clears both page-buffered and worker-side logs after stopping the worker engine.
- Local cleanup queue tests now continue through every callback before reporting failures.
- Cleanup documentation now covers direct API `try` / `finally`, init-script removal on reused pages, and Service Worker unregister guidance.

## 0.4.0 - 2026-04-26

### Added

- Service Worker helpers: `injectSWChaos`, `removeSWChaos`, `getSWChaosLog`, and `getSWChaosLogFromSW`.
- Re-exports for SSE config types and GraphQL operation matcher types.
- E2E coverage for Service Worker, SSE, and GraphQL operation chaos.
- Documentation examples for Service Worker, SSE, and GraphQL operation chaos.

## 0.3.0

Initial release. Supports headless-new Chromium (Puppeteer 21+). Trace integration deferred to a future release.
