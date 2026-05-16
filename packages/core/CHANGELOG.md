# @chaos-maker/core Changelog

## Unreleased

### Added

- Runtime checks now diagnose already patched globals, stale wrapper handles, and orphaned DOM observers, and fail fast on active instance conflicts.

### Fixed

- Cleanup now clears saved handles after restoring browser APIs, resets counters on stop, resets Service Worker seed state on stop, and cancels delayed WebSocket and EventSource deliveries before they can fire after cleanup.

## 0.4.0 - 2026-04-26

### Added

- Service Worker chaos via the `@chaos-maker/core/sw` subpath and `installChaosSW()`.
- `SW_BRIDGE_SOURCE` for adapter-side Service Worker bridge installation.
- `sse` config support for EventSource drops, delays, corruptions, and closes.
- GraphQL operation-name matching with `graphqlOperation: string | RegExp` on network rules.
- Builder shortcuts for SSE rules and GraphQL operation failure or latency rules.
- `unreliableEventStream` preset.

### Changed

- Interceptors read browser APIs from `globalThis` so core can run in page and Service Worker contexts.
