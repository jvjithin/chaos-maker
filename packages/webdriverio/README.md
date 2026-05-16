# @chaos-maker/webdriverio

WebdriverIO adapter for [`@chaos-maker/core`](../core/). Custom commands for one-line chaos injection in WebdriverIO E2E tests.

## Install

```bash
npm install --save-dev @chaos-maker/core @chaos-maker/webdriverio
```

Both packages are required. `webdriverio` (>=8) is a peer dependency.

## Setup

Register the custom commands once in `wdio.conf.ts`:

```ts
import { registerChaosCommands, registerSWChaosCommands } from '@chaos-maker/webdriverio';

export const config: WebdriverIO.Config = {
  // ...
  async before() {
    registerChaosCommands(browser);
    registerSWChaosCommands(browser);
  },
};
```

That's it. Every spec now has `browser.injectChaos`, `browser.removeChaos`, `browser.getChaosLog`, `browser.getChaosSeed`, `browser.enableGroup`, `browser.disableGroup`, and the Service Worker group helpers:

- `browser.enableSWGroup(name, opts?: SWChaosOptions)`
- `browser.disableSWGroup(name, opts?: SWChaosOptions)`

These mirror browser-side `browser.enableGroup(name)` and `browser.disableGroup(name)` but operate in the Service Worker context.
Pass `opts.timeoutMs` to override how long the command waits for the Service Worker acknowledgement.

## Usage

```ts
import { browser, $ } from '@wdio/globals';

describe('resilience', () => {
  it('handles API failure', async () => {
    await browser.url('/');
    await browser.injectChaos({
      network: {
        failures: [{ urlPattern: '/api', statusCode: 503, probability: 1.0 }],
      },
    });
    await $('button.refresh').click();
    await expect($('#status')).toHaveText('Error!');
  });
});
```

You can also call the functional API without registering commands:

```ts
import { injectChaos, getChaosLog } from '@chaos-maker/webdriverio';

await browser.url('/');
await injectChaos(browser, { /* config */ });
const log = await getChaosLog(browser);
```

## Presets

Drop a built-in preset by name with the declarative `presets` field:

```ts
await browser.url('/');
await browser.injectChaos({ presets: ['slow-api'] });
```

Register your own bundle inline via `customPresets`:

```ts
await browser.injectChaos({
  customPresets: {
    'team-flow': {
      network: { failures: [{ urlPattern: '/checkout', statusCode: 503, probability: 1 }] },
    },
  },
  presets: ['team-flow'],
});
```

Built-in catalog and validation rules are documented in [`@chaos-maker/core`](../core/README.md#presets).

## Rule Groups

Group rules by scenario and toggle them at runtime.

```ts
import { ChaosConfigBuilder } from '@chaos-maker/core';

const config = new ChaosConfigBuilder()
  .defineGroup('payments', { enabled: false })
  .inGroup('payments')
  .failRequests('/api/pay', 503, 1)
  .inGroup('auth')
  .failRequests('/api/session', 401, 1)
  .build();

await browser.url('/checkout');
await browser.injectChaos(config);

await browser.enableGroup('payments');
await browser.disableGroup('payments');
```

For Service Worker rules, use the SW commands after `browser.injectSWChaos`:

```ts
await browser.enableSWGroup('payments');
await browser.disableSWGroup('payments');
```

Browser-side `browser.enableGroup` and `browser.disableGroup` affect page rules from `browser.injectChaos`. `browser.enableSWGroup` and `browser.disableSWGroup` affect Service Worker rules from `browser.injectSWChaos`.

## Important: inject after navigation

WebDriver has no cross-browser pre-navigation hook, so `@chaos-maker/webdriverio` injects chaos **after** `browser.url(...)` completes. Requests issued during the initial page load are not intercepted.

If your app fires its first API call on boot and you need that request to be chaotic too, use [`@chaos-maker/playwright`](../playwright/) or [`@chaos-maker/cypress`](../cypress/) instead - both support pre-navigation injection.

For requests fired on user interaction (clicks, form submits), the adapter works identically to the Playwright and Cypress ones.

## SSE and GraphQL

Inject after `browser.url()` and before the click or action that creates the stream or request.

```ts
await browser.url('/dashboard');
await browser.injectChaos({
  seed: 42,
  sse: {
    drops: [{ urlPattern: '/events', eventType: 'token', probability: 0.1 }],
  },
  network: {
    failures: [{
      urlPattern: '/graphql',
      graphqlOperation: /^Get/,
      statusCode: 503,
      probability: 1,
    }],
  },
});
await $('#refresh').click();
```

## Validation

`injectChaos` validates the config from Node before `browser.execute` touches the page. A malformed config throws `ChaosConfigError` synchronously from the test runner. `ChaosConfigError.issues` is a structured `ValidationIssue[]`. See the [Rule Validation concept page](https://chaos-maker-dev.github.io/chaos-maker/concepts/validation/).

```ts
await injectChaos(browser, config, {
  validation: { unknownFields: 'warn' },
});
```

## Content Security Policy

`injectChaos` appends an inline `<script>` to the page. A restrictive `script-src` policy (no `'unsafe-inline'` / no matching nonce) blocks it and `injectChaos` throws `[chaos-maker] injectChaos did not start.` - relax CSP for your test environment (e.g. add `'unsafe-inline'` or a matching nonce) or serve a chaos-friendly CSP from your test fixture.

## API

### `registerChaosCommands(browser)`

Attach browser-side custom commands on the given `browser` object. Call once in `wdio.conf.ts`' `before` hook.

Registers:

- `browser.injectChaos(config)`
- `browser.removeChaos()`
- `browser.getChaosLog()`
- `browser.getChaosSeed()`
- `browser.enableGroup(name)`
- `browser.disableGroup(name)`

Service Worker commands are registered separately with `registerSWChaosCommands(browser)`.

### `registerSWChaosCommands(browser)`

Attach Service Worker-specific commands on the given `browser` object. This includes the Service Worker group helpers:

- `browser.enableSWGroup(name, opts?: SWChaosOptions)`
- `browser.disableSWGroup(name, opts?: SWChaosOptions)`

These mirror browser-side `browser.enableGroup(name)` and `browser.disableGroup(name)` but operate in the Service Worker context.
Pass `opts.timeoutMs` to override how long the command waits for the Service Worker acknowledgement.

### `injectChaos(browser, config)`

Inject chaos into the current page. `config` matches `@chaos-maker/core`'s `ChaosConfig`.

### `removeChaos(browser)`

Stop chaos and restore the original `fetch` / `XHR` / `WebSocket` / DOM behaviour on the current page.

Call this from `afterEach` when using direct helpers. Cleanup is best-effort if the WebDriver session or page is already gone, so teardown should not hide the original test failure. WebdriverIO injection is post-navigation, so use a fresh page/session when you need startup requests isolated from a prior test.

### `getChaosLog(browser): Promise<ChaosEvent[]>`

Read every chaos decision emitted since `injectChaos` was called - applied or skipped.

### `getChaosSeed(browser): Promise<number | null>`

Read the PRNG seed used by the active chaos instance. Log this on test failure to replay the exact sequence of chaos decisions with a fixed seed.

### `browser.enableGroup(name)` / `browser.disableGroup(name)`

Toggle a browser-side Rule Group. Requires `registerChaosCommands(browser)`.

### `browser.enableSWGroup(name, opts?)` / `browser.disableSWGroup(name, opts?)`

Toggle a Service Worker Rule Group. Requires `registerSWChaosCommands(browser)`. Pass `opts.timeoutMs` to override the Service Worker acknowledgement timeout.

## Leak diagnostics

Pass `debug: true` on the chaos config to surface leaked-runtime diagnostics in the event log. Filter `browser.getChaosLog()` for `type === 'debug'` events with `detail.reason` covering double-patched globals, stale wrapper handles, orphaned observers, or active-instance conflicts. See [`@chaos-maker/core`](../core/README.md#leak-diagnostics) for the full reason list.

```ts
await browser.url('/');
await browser.injectChaos({ debug: true, network: { /* ... */ } });
const log = await browser.getChaosLog();
const issues = log.filter(
  (e) => e.type === 'debug' && /already-patched|stale|orphaned|active-instance-conflict/.test(String(e.detail.reason ?? '')),
);
```

## Service Worker chaos

Register the SW commands in `wdio.conf.ts`:

```ts
import { registerChaosCommands, registerSWChaosCommands } from '@chaos-maker/webdriverio';
// ...
async before() {
  registerChaosCommands(browser);
  registerSWChaosCommands(browser);
},
```

Spec:

```ts
await browser.url('/app-with-sw/');
await browser.waitUntil(() =>
  browser.execute(() => !!navigator.serviceWorker.controller),
);
await browser.injectSWChaos({
  groups: [{ name: 'payments', enabled: false }],
  network: {
    failures: [{ urlPattern: '/api/data', statusCode: 503, probability: 1, group: 'payments' }],
  },
  seed: 1,
});
await browser.enableSWGroup('payments');
// ...interact...
const log = await browser.getSWChaosLog();
await browser.disableSWGroup('payments');
await browser.removeSWChaos();
```

Use `browser.getSWChaosLog()` for the page-buffered event log. This is the default assertion surface because it reflects events broadcast from the Service Worker to the page. Use `browser.getSWChaosLogFromSW()` when you need a direct pull from the Service Worker's in-memory log, such as debugging a missed page-side broadcast.

`browser.removeSWChaos()` stops the worker engine and clears both the page-buffered and worker-side logs. Unregister the app's Service Worker when you need a fresh registration between tests.

User's SW must `importScripts('/chaos-maker-sw.js')` (classic) or `import { installChaosSW } from '@chaos-maker/core/sw'` (module).

## License

MIT
