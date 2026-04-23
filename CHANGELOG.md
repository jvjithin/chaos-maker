# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed

- **`@chaos-maker/core` — `globalThis` refactor (Phase 0 of v0.4.0)**: interceptors read their targets (`fetch`, `XMLHttpRequest`, `WebSocket`) through `globalThis` instead of `window`, so the same engine code now runs in both browser page contexts and service worker / worker contexts. No public API change beyond a new optional `ChaosMaker(config, { target })` constructor argument that defaults to `globalThis`.
- UI-config (`config.ui`) is now skipped with a warning (instead of throwing) when no DOM is available in the current context. XHR and WebSocket patching likewise feature-detect before attaching. This is groundwork for v0.4.0 Phase 1 (Service Worker chaos) — no new surface is exposed yet.

## [0.3.0] - 2026-04-23

### Added

- **WebdriverIO adapter** (`@chaos-maker/webdriverio`): one-line injection via `injectChaos(browser, config)`, `getChaosLog(browser)`, `getChaosSeed(browser)`, `useChaos(browser, config)`. Embeds the UMD bundle in an injected script tag so Firefox geckodriver still sees the config during initial page load.
  - E2E suite: 49 tests across Chrome and Firefox covering resilience baseline, presets, network/WebSocket/UI chaos, seeded reproducibility, and Nth-request counting.
  - New CI jobs `e2e-webdriverio (chrome)` and `e2e-webdriverio (firefox)`.
- **Puppeteer adapter** (`@chaos-maker/puppeteer`): one-line injection via `injectChaos(page, config)`, `removeChaos(page)`, `getChaosLog(page)`, `getChaosSeed(page)`, `useChaos(page, config)`. Uses `page.evaluateOnNewDocument` to patch `fetch`, `XMLHttpRequest`, and `WebSocket` before any page script runs; tracks init-script identifiers in a `WeakMap<ChaosPage>` so `removeChaos` + repeat `injectChaos` tear down cleanly without stacking.
  - E2E suite: 37 tests on headless Chromium, mirroring the Playwright suite where applicable.
  - New CI job `e2e-puppeteer (headless-new)`.
- **Documentation site** (Starlight-powered, published to GitHub Pages at <https://jvjithin.github.io/chaos-maker/>): 28 pages covering Install, per-adapter Getting Started, Concepts (chaos types, presets, builder, seeded reproducibility, Nth counting, observability), eight Recipes, API reference, and a Rationale section. Search via Pagefind.
- **Seeded determinism enforcement**: `Math.random` is now an ESLint error across `packages/**` (via `no-restricted-syntax` AST rule, exempt only in `prng.ts`). Every chaos probability decision must flow through `createPrng(seed)` so replays are bit-exact.

### Changed

- `@chaos-maker/core` bumped to 0.3.0 — emits a bit-exact event log for a given seed; any accidental `Math.random` usage now fails CI.
- `@chaos-maker/playwright` bumped to 0.3.0 to pick up core 0.3.0.
- `@chaos-maker/cypress` bumped to 0.3.0 to pick up core 0.3.0.
- Release workflow: new adapters (`webdriverio`, `puppeteer`) publish via classic `NPM_TOKEN` on first release because npm Trusted Publishing requires a pre-existing package. Existing adapters (`core`, `playwright`, `cypress`) continue using OIDC Trusted Publishing.

### Fixed

- **Puppeteer re-injection**: `injectChaos` now removes the prior page's init scripts before registering new ones, preventing double-patching when pages are reused across test cases.
- **Docs site base path**: inline markdown links and hero actions on the Starlight site are now prefixed with `/chaos-maker/` so they resolve under the GitHub Pages base instead of 404ing.
- **Deterministic replay test**: reverted an ill-fitting event-based wait — chaos events are probabilistic so `waitForChaosLogGrowth` could hang when the rolled probability said "no chaos"; reverted to fixed `waitForTimeout` since the seeded PRNG already guarantees reproducibility.

### Security

- Upgraded Astro (4 → 6) and Starlight (0.21 → 0.38) in the docs workspace, clearing 19 transitive CVEs.
- Added `pnpm.overrides` for `diff`, `tar-fs`, `tmp`, `ws`, `serialize-javascript`, `fast-xml-parser` to patch 8 more transitive CVEs across the repo.
- One residual Dependabot alert (`uuid < 14.0.0` via `@cypress/request@3.0.10`) is accepted as tolerable: dev-only transitive, no patched version in range, exploit path (user-controlled `buf` into `v3/v5/v6`) not reachable from Cypress's usage.

## [0.2.0] - 2026-04-17

### Added

- **Playwright trace integration** (Phase 5): every applied chaos event now appears inline in the Playwright trace action timeline as a `chaos:<type>` `test.step` entry (e.g. `chaos:network:failure /api/users → 503`). Full event log + PRNG seed attached as `chaos-log.json` on test end.
  - New `InjectChaosOptions` on `injectChaos(page, config, opts)`: `{ tracing: boolean | 'auto', testInfo, traceOptions }`.
  - Fixture auto-enables tracing whenever the project's `use.trace !== 'off'`; opt out per-call with `chaos.inject(config, { tracing: false })`.
  - Bridging via `page.exposeBinding('__chaosMakerReport', …)` + an `addInitScript` subscriber on `chaosUtils.instance.on('*')`. Survives cross-navigation and idempotent per page.
  - New `packages/playwright/src/trace.ts` exports `formatStepTitle`, `shouldEmitStep`, `createTraceReporter`, `ChaosTraceAttachment`, `TraceReporterOptions`.
  - E2E coverage: `e2e-tests/playwright/tests/trace-integration.spec.ts` cracks open the produced `trace.zip` (all four projects: chromium, firefox, webkit, edge) and asserts chaos steps present.
  - Unit coverage: 13 formatter/filter tests under `packages/playwright/test/trace.test.ts`.
- **Cypress adapter coverage** (from rc.1): unchanged — Cypress surfaces chaos via `Cypress.log` (the Command Log), no trace-viewer work needed.

## [0.2.0-rc.1] - 2026-04-17

### Added

- **Cypress adapter** (`@chaos-maker/cypress`): one-line chaos injection via `cy.injectChaos(config)`, `cy.removeChaos()`, `cy.getChaosLog()` custom commands. Ships `@chaos-maker/cypress/support` (auto-registration of commands + `afterEach` cleanup) and `@chaos-maker/cypress/tasks` (plugin-process bridge that reads the UMD bundle from disk).
- **Cypress E2E suite**: 60 tests across 7 spec files in `e2e-tests/cypress/` — full parity with Playwright suite (resilience baseline, chaos lifecycle + presets, network, UI, WebSocket, seeded randomness, Nth-request counting). Runs against Chrome and Electron in CI.
- **CI job `e2e-cypress`**: matrix over `[chrome, electron]` with Cypress binary caching. Firefox is omitted because Cypress 13.x's CDP-over-GeckoDriver bridge is broken against Firefox 140+ (a Cypress-infrastructure issue, not a chaos-maker one); Playwright's `e2e-playwright (firefox)` job covers the Firefox browser engine end-to-end.
- **Release job `publish-cypress`**: publishes `@chaos-maker/cypress` to npm on tagged releases after `publish-core` succeeds.

### Changed

- **E2E layout restructured**: `e2e-tests/` now contains `e2e-tests/{framework}/` subdirectories (`playwright/`, `cypress/`) plus shared `e2e-tests/fixtures/`. Cypress layout flattened to `tests/` + `support/` (overriding Cypress defaults of `cypress/e2e/` + `cypress/support/`) for cross-framework directory symmetry.
- **Package filters renamed**: `e2e-tests` workspace package split into `e2e-tests-playwright` and `e2e-tests-cypress`. Root scripts renamed: `test:e2e` → `test:playwright` + `test:cypress`.
- **CI job renamed**: `e2e-test` → `e2e-playwright` (plus new sibling `e2e-cypress`).
- **Fixture ws-echo-server**: `.js` → `.cjs` to prevent Node treating it as ESM under the root `"type": "module"`.

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
