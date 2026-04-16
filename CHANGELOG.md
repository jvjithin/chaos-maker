# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [0.2.0-beta.1] - 2026-04-16

### Added

- **WebSocket chaos**: intercept `window.WebSocket` to drop, delay, corrupt, or force-close messages and connections (inbound/outbound/both)
  - Config types: `WebSocketDropConfig`, `WebSocketDelayConfig`, `WebSocketCorruptConfig`, `WebSocketCloseConfig`
  - Corruption strategies: `truncate`, `malformed-json`, `empty`, `wrong-type` (JSON strategies emit `applied: false` with `reason: 'incompatible-payload-type'` for binary frames)
  - Ordering per message: drop → corrupt → delay; close chaos cancels pending per-socket timers so pending delays never fire after close
  - Wrapper preserves `instanceof WebSocket` via prototype aliasing so app code using `instanceof` keeps working
  - New `unreliableWebSocket` preset (10% drop both ways, 500ms inbound delay, 5% inbound truncate)
  - Builder: `.dropMessages()`, `.delayMessages()`, `.corruptMessages()`, `.closeConnection()` + `.dropMessagesOnNth()`, `.delayMessagesOnNth()` shortcuts
  - Emitted events: `websocket:drop`, `websocket:delay`, `websocket:corrupt`, `websocket:close` with `direction`, `payloadType`, `closeCode`, `closeReason`, and `reason` detail fields
- **Per-rule request counting** (Phase 2): `onNth`, `everyNth`, `afterN` on every network and websocket rule — deterministic "fail the 3rd request", "drop every other message"
- **Seeded randomness** (Phase 1): `seed` field on `ChaosConfig`, auto-generated if omitted, exposed via `getChaosSeed(page)` for reproducible chaos runs
- **Playwright adapter**: re-exports `WebSocketConfig`, `WebSocketDropConfig`, `WebSocketDelayConfig`, `WebSocketCorruptConfig`, `WebSocketCloseConfig`, `WebSocketDirection`, `WebSocketCorruptionStrategy`
- **E2E coverage**: WebSocket chaos E2E suite across chromium, firefox, webkit, edge (24 tests) — includes seeded replay determinism, per-message `onNth` counting, close-with-custom-code, truncation, relative-latency baseline

### Removed

- **Chrome extension**: Extracted from monorepo to keep focus on core library and framework adapters

## [0.1.0] - 2026-04-03

### Added

- **Network chaos**: failure injection, latency, connection abort, response corruption, CORS simulation
- **UI chaos**: disable, hide, or remove DOM elements by CSS selector via MutationObserver
- **Playwright adapter** (`@chaos-maker/playwright`): `injectChaos`, `removeChaos`, `getChaosLog`, test fixture
- **Config presets**: `unstableApi`, `slowNetwork`, `offlineMode`, `flakyConnection`, `degradedUi`
- **Fluent config builder**: `ChaosConfigBuilder` with chainable methods for all chaos types
- **Event observability**: typed events for every chaos check, wildcard listeners, bounded event log
- **Config validation**: Zod strict mode rejects unknown keys, descriptive error messages
- **CI pipeline**: GitHub Actions with lint, test, build, E2E across Chromium/Firefox/WebKit/Edge
- **Triple format output**: ESM + CJS + UMD for `@chaos-maker/core`
