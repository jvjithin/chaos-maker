# Chaos Maker — Project Status

> **Last updated:** 2026-03-29 | **Current phase:** Phase 2 (up next)

## What This Is

An open source chaos engineering toolkit for web applications. Lets developers and SDETs inject controlled failures (network errors, latency, UI disruptions) into frontend apps to test resilience. Framework-agnostic — works with any web app and any E2E test framework.

**Owner:** Jithin (GitHub: jvjithin)
**Repo:** https://github.com/jvjithin/chaos-maker
**License:** MIT

## Architecture

pnpm monorepo with 3 packages:

- **`@chaos-maker/core`** (`packages/core/`) — TypeScript library. Patches `fetch`/`XHR` for network chaos, uses `MutationObserver` for UI chaos. Config-driven, probability-based. Builds to ESM + CJS + UMD via Vite. Validates config with Zod.
- **`@chaos-maker/extension`** (`packages/extension/`) — Chrome Manifest V3 extension. Popup UI for manual chaos injection. Persists config in `chrome.storage.local`, auto-reinjects on navigation.
- **`e2e-tests/`** — Playwright suite demonstrating chaos injection against a local test page.

### Key Technical Details

- **Build:** Vite lib mode → 3 formats: ESM (`.js`), CJS (`.cjs`), UMD (`.umd.js`). Types via `tsc --emitDeclarationOnly`. Post-build Vite plugin copies UMD to extension.
- **Test:** Vitest with jsdom environment. 33 unit tests across 4 files.
- **CI:** GitHub Actions — lint → test → build → e2e. Node 22, pnpm 10 (via corepack `packageManager` field). Playwright browsers cached.
- **Config validation:** Zod with `.strict()` mode — rejects unknown keys/typos. Custom `ChaosConfigError` with readable messages.
- **Package:** `@chaos-maker/core` is npm-publishable. Proper `exports` map with conditional types for ESM/CJS.

## V1 Release Plan

Goal: incrementally build to a polished, plug-and-play public release.

### Phase 1: Make it Publishable ✅ COMPLETE

**Branch:** `feat/phase-1-publishable-core`
**PR:** #2 (base: main)

What was done:
- Restructured build output to `packages/core/dist/` (was going to `extension/dist/`)
- 3 output formats: ESM, CJS, UMD (CJS for Node `require()`, UMD for browser `<script>`/extension)
- TypeScript declarations emitted to `dist/types/`
- npm-ready `package.json`: exports, types, files, keywords, engines, repository
- Zod config validation with `.strict()` mode in `ChaosMaker` constructor
- Custom response support: `body`, `statusText`, `headers` on `NetworkFailureConfig`
- XHR interceptor supports `getResponseHeader()`/`getAllResponseHeaders()`
- Shared `shouldApplyChaos` utility (was duplicated in 3 files)
- CI: bumped actions to v5, Node 22, Playwright browser caching, `packageManager` field
- ESLint ignores all `dist/` directories
- 33 tests passing (15 validation tests added)

### Phase 2: Playwright Adapter + Observability ⬜ UP NEXT

**Branch:** `feat/phase-2-playwright-adapter` (branch off `feat/phase-1-publishable-core`)
**PR:** will target `feat/phase-1-publishable-core` as base

Plan:
- Event system in core: `ChaosEvent` type, emitter, `getLog()` method
- Wire events into all interceptors (network + DOM)
- `onEvent` callback option in config
- New package: `@chaos-maker/playwright`
  - `injectChaos(page, config)` — one-line helper
  - `removeChaos(page)` and `getChaosLog(page)`
  - Playwright test fixture (`{ chaos }`)
- Rewrite e2e tests to use the adapter (eliminate 18-line boilerplate)
- Event + adapter tests

### Phase 3: Presets, Builder API, New Chaos Types ⬜

Plan:
- Config presets: `unstableApi`, `slowNetwork`, `offlineMode`, `flakyConnection`, `degradedUi`
- Fluent config builder: `new ChaosConfigBuilder().failRequests(...).build()`
- Connection abort/timeout (AbortController for fetch, xhr.abort() for XHR)
- Response body corruption (truncate, malformed-json, empty, wrong-type)
- CORS error simulation

### Phase 4: Documentation ⬜

Plan:
- Root README rewrite (UTF-8, quick start, badges)
- npm-facing READMEs for core and playwright packages
- API reference, configuration deep-dive
- Integration guides (Playwright, Cypress, Selenium, Chrome Extension)
- Working examples, CHANGELOG, CONTRIBUTING

### Phase 5: Extension Polish + CI Hardening ⬜

Plan:
- Extension preset dropdown, improved UI
- npm publish workflow on `v*` tags
- DOM chaos unit tests, edge case tests

### Deferred Beyond V1

- Cypress dedicated adapter package
- WebSocket chaos
- Streaming/trickle responses
- Seeded randomness for reproducible probability

## Working Conventions

- **Git:** Clean one-liner commits, conventional-commit style (`feat(core):`, `fix(build):`). No co-author tags. No multi-line bodies.
- **Branching:** Stacked PRs — each phase branches off previous. PRs target prior phase as base. Merge in order.
- **Build suggestions:** Raise any better patterns with reasoning — user is open to improvements.

## Issues & Solutions Log

| Date | Issue | Solution |
|------|-------|----------|
| 2026-03-29 | Vite `emptyOutDir` wiped TypeScript declarations when `tsc` ran before `vite build` | Reversed build order: `vite build && tsc -p tsconfig.build.json` |
| 2026-03-29 | `require` export pointing to `.js` UMD is invalid under `"type": "module"` | Added CJS output format (`.cjs`), kept UMD for browser/extension use |
| 2026-03-29 | ESLint linting build output in `packages/core/dist/` | Changed eslint ignore from `packages/extension/dist` to `**/dist` |
| 2026-03-29 | Zod default strips unknown keys — config typos pass silently | Added `.strict()` to all Zod schemas |
| 2026-03-29 | XHR interceptor didn't apply `failure.headers` (fetch did) | Added `getResponseHeader()`/`getAllResponseHeaders()` to XHR fake response |
| 2026-03-29 | CI warnings: actions using deprecated Node.js 20 runtime | Bumped checkout/setup-node to v5. Remaining warnings (upload-artifact, cache, pnpm-setup @v4) are upstream — no fix available yet |
| 2026-03-29 | pnpm version mismatch: CI used pnpm 8, lockfile was pnpm 9+ | Set `packageManager` field in root package.json, switched to `pnpm/action-setup@v4` which reads it |

## How to Dev

```bash
pnpm install          # install all dependencies
pnpm lint             # eslint across the monorepo
pnpm test             # vitest unit tests (core package)
pnpm build:core       # build core → dist/ (ESM + CJS + UMD) + types
```
