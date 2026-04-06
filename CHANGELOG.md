# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

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
