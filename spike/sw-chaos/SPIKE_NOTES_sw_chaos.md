# Spike — Service Worker chaos feasibility

**Date:** 2026-04-18
**Branch:** `fix-playwright-webserver-npm-warnings`
**Decision:** ✅ **GO for v0.4.0** with caveats below.

---

## Goal
Determine whether chaos-maker can intercept `fetch` calls issued from inside a Service Worker (SW) execution context, with the same observability guarantees as page-context chaos.

## Result
- All four browsers pass (chromium, firefox, webkit, edge — Playwright 1.45)
- Both `network:failure` and `network:latency` rules apply correctly to fetches issued by SW
- Chaos events bridge from SW → page via `postMessage` and are observable on `window.__SW_CHAOS_EVENTS__`
- No JSON-parse / scope / lifecycle issues encountered

Test artifacts:
- Shim: `spike/sw-chaos/sw-chaos-shim.js` (standalone) and `e2e-tests/fixtures/sw-app/sw-chaos.js` (baked into fixture SW)
- Fixture: `e2e-tests/fixtures/sw-app/{index.html, sw.js, sw-chaos.js}`
- Test: `e2e-tests/playwright/tests/spike-sw-chaos.spec.ts` (2 tests × 4 browsers = 8 passes)

## Approaches tried

### Option B (PW route rewrite of SW script) — REJECTED
Tried `page.route('**/sw.js')` then `context.route('**/sw.js')`. Neither intercepted the SW registration request in chromium under Playwright 1.45 — `route` callback never fired (`routeHits === 0`). SW script registration goes through a network path Playwright's request interception does not cover.

**Implication:** chaos-maker cannot transparently inject its shim into a user's existing SW at test runtime via Playwright routing. Must ship a user-facing injection mechanism.

### Option (chosen) — Baked-in shim + URL-encoded config
SW script (`sw-chaos.js`) inlines the chaos shim. Config passed via `?config=<base64-JSON>` URL search param so SW can read it at install time without window access. Page registers the SW and triggers fetches; SW's patched `self.fetch` short-circuits with synthetic responses or applies delays; chaos events postMessage back to page.

This proves the **interception mechanism** works. The **injection mechanism** is the open product question (see Recommendation).

## Cross-browser notes
| Browser | Failure test | Latency test | Notes |
|---|---|---|---|
| chromium | ✅ | ✅ | Sometimes serves `/sw-app/` from 304; cleared via `ensureCleanSW` + reload |
| firefox  | ✅ | ✅ | No issues |
| webkit   | ✅ | ✅ | No issues |
| edge     | ✅ | ✅ | Identical behavior to chromium |

Total run: 8 passes in ~10s wall time (chromium 2.7s + ff/wk 3.9s + edge 2.6s).

## Production design — Recommendation

### Shape of the v0.4.0 SW chaos package

**Refactor required:** core uses `window.fetch`/`window.XMLHttpRequest`/`window.WebSocket` directly. SW global is `self`, no `window`. Need a build target that uses `globalThis` (or `self`) — split build or runtime guard.

**Proposed packages:**
- `@chaos-maker/core` — refactor interceptors to read globals from `globalThis` so the same code runs in window and SW contexts. Keep public API identical for window users.
- `@chaos-maker/core/sw` — published subpath export. Bundle of just network interceptors (no UI, no DOM-dependent code). Exposes `installChaosSW({ source: 'message' | 'self.__CHAOS_CONFIG__' })`.
- `@chaos-maker/playwright` (and `@chaos-maker/cypress`) — adds `injectSWChaos(page, config)` helper that:
  1. Waits for `navigator.serviceWorker.controller` to exist
  2. `controller.postMessage({ __chaosMakerConfig: config })`
  3. Returns when SW acks (also via postMessage) — so first chaos-relevant fetch isn't lost

### User integration (one line in their SW)
```js
// user's sw.js
importScripts('https://cdn.jsdelivr.net/npm/@chaos-maker/core/dist/sw.js');
// or vendored locally, served same-origin
```
Then in test:
```ts
await injectSWChaos(page, config);
```

### Why not transparent injection?
Three options considered, all rejected for v0.4.0:

1. **PW route rewrite** — proven not to fire for SW script registration (this spike).
2. **Patch `navigator.serviceWorker.register` via addInitScript** to wrap the script source through a Blob URL — Blob URLs cannot register SWs with custom scopes; the `Service-Worker-Allowed` header workaround requires HTTP response headers, not blob URLs.
3. **Build-time plugin** (Webpack/Vite/Rollup) — viable but adds 3+ adapter packages to maintain and ties chaos to user's build pipeline. Defer to v0.5.0 if demand emerges.

The one-line `importScripts` requirement is honest, well-scoped, and matches how MSW handles SW. Documentation can stress that this is a test-build-only change.

## Risks for production

| Risk | Mitigation |
|---|---|
| Config arrives async via `postMessage` after SW install — first fetches race | Buffer events until first config message; document `await injectSWChaos()` must precede `page.goto` |
| Module workers (`type: 'module'`) reject `importScripts` | Ship parallel ESM-import shim variant; document both |
| Cross-origin SWs (third-party widgets) | Out of scope — document; chaos is opt-in per origin |
| SW lifecycle (skipWaiting / claim / update) eats config | Re-emit config on `controllerchange`; ack required |
| Caches API hides chaos (cached responses bypass `self.fetch`) | Also patch `caches.match` / `cache.match`? Document as later work |
| Large bundle in SW (Zod, etc.) | Strip Zod at runtime in SW build; config validated on page side before postMessage |
| User's existing `self.fetch` patches collide with chaos | Document precedence: install chaos last, restore on stop |

## Effort estimate for v0.4.0

| Work | Effort |
|---|---|
| Refactor core globals to `globalThis` (window-aware paths gated by `typeof window`) | M (2-3 days, careful — touches fetch + xhr + ws interceptors) |
| New `@chaos-maker/core/sw` subpath build (rollup config, separate entry) | S (1 day) |
| `installChaosSW` API + postMessage protocol + ack handshake | M (2 days) |
| Playwright `injectSWChaos` helper + `getSWChaosLog` | S (1 day) |
| Cypress `cy.injectSWChaos` command | S (1 day) |
| E2E suite (port spike to real packages, add cache + lifecycle + module-worker tests) | M (2-3 days) |
| Docs section + recipe | S (1 day) |
| **Total** | **~10 dev days** |

Fits in v0.4.0 alongside SSE chaos and GraphQL matching if SSE = M and GraphQL = S. Tight but doable.

## What this spike did NOT cover (deferred)

- `caches` API interaction (cached SW responses bypass `self.fetch`)
- Module SWs (`type: 'module'`) — `importScripts` unsupported, need ESM path
- SW updates with new chaos config (`controllerchange` event handling)
- Multiple controlled clients (one config to N pages)
- `WebSocket` chaos in SW (does SW even use WS? yes via `self.WebSocket`)
- Push events / sync events (out of scope for v0.4.0)
- CSP `worker-src` restrictions

These become test cases in the real implementation, not blockers for the go/no-go.

## Cleanup before merge to main

Spike artifacts to keep / remove:
- ✅ Keep `spike/sw-chaos/sw-chaos-shim.js` + this notes file as historical record
- ❌ Remove `e2e-tests/fixtures/sw-app/` after porting fixture into v0.4.0 implementation branch
- ❌ Remove `e2e-tests/playwright/tests/spike-sw-chaos.spec.ts` after real SW chaos tests land
- Spike test currently lives in main test dir → will run in CI. Either tag with `test.fixme` or move under separate spike testMatch before pushing if you want to keep CI green without committing to ship.
