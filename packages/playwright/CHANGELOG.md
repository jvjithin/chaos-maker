# @chaos-maker/playwright Changelog

## Unreleased

### Fixed

- Service Worker cleanup now clears both page-buffered and worker-side logs after stopping the worker engine.
- Cleanup documentation now calls out fixture cleanup, direct API `try` / `finally`, and `addInitScript` reload behavior on reused pages.

## 0.4.0 - 2026-04-26

### Added

- Service Worker helpers: `injectSWChaos`, `removeSWChaos`, `getSWChaosLog`, and `getSWChaosLogFromSW`.
- Re-exports for SSE config types and GraphQL operation matcher types.
- Documentation examples for Service Worker, SSE, and GraphQL operation chaos.
