# @chaos-maker/puppeteer

Puppeteer adapter for [`@chaos-maker/core`](https://github.com/jvjithin/chaos-maker) — inject network failures, UI assaults, and WebSocket chaos into Puppeteer tests with a single function call.

## Install

```bash
npm install --save-dev @chaos-maker/puppeteer puppeteer
# or
pnpm add -D @chaos-maker/puppeteer puppeteer
```

## Quick start

```ts
import puppeteer from 'puppeteer';
import { injectChaos, getChaosLog } from '@chaos-maker/puppeteer';

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();

// Inject BEFORE goto — uses evaluateOnNewDocument for full-lifecycle coverage
await injectChaos(page, {
  network: {
    failures: [{ urlPattern: '/api', statusCode: 503, probability: 1.0 }],
  },
});

await page.goto('http://localhost:3000');
// ... drive the page ...
const log = await getChaosLog(page);
console.log('Chaos events:', log);

await browser.close();
```

## API

### `injectChaos(page, config)`

Injects chaos into a Puppeteer page via `evaluateOnNewDocument`. Must be called before `page.goto()` so all network requests are intercepted from the start.

### `removeChaos(page)`

Stops chaos and restores original `fetch`, `XMLHttpRequest`, `WebSocket`, and DOM behaviour. Safe to call after page close.

### `getChaosLog(page)`

Returns the full event log (applied + skipped decisions) since `injectChaos` was called.

### `getChaosSeed(page)`

Returns the PRNG seed used by the active chaos instance. Log this on test failure to replay the exact sequence.

### `useChaos(page, config)`

Convenience helper for `afterEach`-style cleanup — injects chaos and returns an async teardown:

```ts
let teardown: () => Promise<void>;
beforeEach(async () => {
  teardown = await useChaos(page, { network: { failures: [...] } });
});
afterEach(() => teardown());
```

## Service Worker chaos

```ts
import { injectSWChaos, removeSWChaos, getSWChaosLog } from '@chaos-maker/puppeteer';

await page.goto('http://localhost:3000/app-with-sw/');
await page.waitForFunction(() => !!navigator.serviceWorker.controller);
await injectSWChaos(page, {
  network: { failures: [{ urlPattern: '/api/data', statusCode: 503, probability: 1 }] },
  seed: 1,
});
// ...interact...
const log = await getSWChaosLog(page);
await removeSWChaos(page);
```

User's SW must `importScripts('/chaos-maker-sw.js')` (classic) or `import { installChaosSW } from '@chaos-maker/core/sw'` (module).

## Notes

- **Headless Chromium only** (headless-new mode, Puppeteer 21+). Firefox via `puppeteer-core` is untested.
- Trace viewer integration (surfacing chaos events in a trace timeline) is not available in this adapter — use `@chaos-maker/playwright` if you need traces.
- Works with both `puppeteer` and `puppeteer-core` — the type is structural.
