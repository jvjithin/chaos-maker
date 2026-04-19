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
import { registerChaosCommands } from '@chaos-maker/webdriverio';

export const config: WebdriverIO.Config = {
  // ...
  async before() {
    registerChaosCommands(browser);
  },
};
```

That's it — every spec now has `browser.injectChaos`, `browser.removeChaos`, `browser.getChaosLog`, and `browser.getChaosSeed`.

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

## Important: inject after navigation

WebDriver has no cross-browser pre-navigation hook, so `@chaos-maker/webdriverio` injects chaos **after** `browser.url(...)` completes. Requests issued during the initial page load are not intercepted.

If your app fires its first API call on boot and you need that request to be chaotic too, use [`@chaos-maker/playwright`](../playwright/) or [`@chaos-maker/cypress`](../cypress/) instead — both support pre-navigation injection.

For requests fired on user interaction (clicks, form submits), the adapter works identically to the Playwright and Cypress ones.

## API

### `registerChaosCommands(browser)`

Attach the `injectChaos`, `removeChaos`, `getChaosLog`, and `getChaosSeed` methods as custom commands on the given `browser` object. Call once in `wdio.conf.ts`' `before` hook.

### `injectChaos(browser, config)`

Inject chaos into the current page. `config` matches `@chaos-maker/core`'s `ChaosConfig`.

### `removeChaos(browser)`

Stop chaos and restore the original `fetch` / `XHR` / `WebSocket` / DOM behaviour on the current page.

### `getChaosLog(browser): Promise<ChaosEvent[]>`

Read every chaos decision emitted since `injectChaos` was called — applied or skipped.

### `getChaosSeed(browser): Promise<number | null>`

Read the PRNG seed used by the active chaos instance. Log this on test failure to replay the exact sequence of chaos decisions with a fixed seed.

## License

MIT
