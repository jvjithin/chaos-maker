# @chaos-maker/core Changelog

## Unreleased

### Added

- Service Worker chaos via the `@chaos-maker/core/sw` subpath and `installChaosSW()`.
- `SW_BRIDGE_SOURCE` for adapter-side Service Worker bridge installation.
- `sse` config support for EventSource drops, delays, corruptions, and closes.
- GraphQL operation-name matching with `graphqlOperation: string | RegExp` on network rules.
- Builder shortcuts for SSE rules and GraphQL operation failure or latency rules.
- `unreliableEventStream` preset.

### Changed

- Interceptors read browser APIs from `globalThis` so core can run in page and Service Worker contexts.
