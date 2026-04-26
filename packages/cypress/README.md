# @chaos-maker/cypress

Cypress adapter for [`@chaos-maker/core`](../core/). Custom commands for one-line chaos injection in Cypress E2E tests.

## Install

```bash
npm install --save-dev @chaos-maker/core @chaos-maker/cypress
```

Both packages are required — `@chaos-maker/cypress` ships the browser-side commands and a plugin-side task that loads the core UMD bundle into the application under test.

## Setup

Wire the plugin-side task in `cypress.config.ts`:

```ts
import { defineConfig } from 'cypress';
import { registerChaosTasks } from '@chaos-maker/cypress/tasks';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    setupNodeEvents(on) {
      registerChaosTasks(on);
    },
  },
});
```

Register the custom commands in `cypress/support/e2e.ts`:

```ts
import '@chaos-maker/cypress/support';
```

That's it. Every spec now has `cy.injectChaos`, `cy.removeChaos`, `cy.getChaosLog`, `cy.getChaosSeed`, and the Service Worker helpers.

## Usage

```ts
describe('checkout resilience', () => {
  it('shows a recoverable error when the payment API flakes', () => {
    cy.injectChaos({
      network: {
        failures: [{ urlPattern: '/api/pay', statusCode: 503, probability: 1 }],
      },
    });

    cy.visit('/checkout');
    cy.contains('Try again').should('be.visible');

    cy.getChaosLog().should((log) => {
      expect(log.some((e) => e.type === 'network:failure' && e.applied)).to.be.true;
    });
  });
});
```

### With presets

```ts
import { presets } from '@chaos-maker/core';

it('works offline', () => {
  cy.injectChaos(presets.offlineMode);
  cy.visit('/');
  cy.contains('No connection').should('be.visible');
});
```

### With the config builder

```ts
import { ChaosConfigBuilder } from '@chaos-maker/core';

it('checkout handles combined chaos', () => {
  const config = new ChaosConfigBuilder()
    .failRequests('/api/checkout', 500, 0.5)
    .addLatency('/api/', 2000, 1.0)
    .build();

  cy.injectChaos(config);
  cy.visit('/checkout');
});
```

### Reproducing failures with a seed

```ts
it('logs the seed so failures can be replayed', () => {
  cy.injectChaos({
    seed: 12345,
    network: {
      failures: [{ urlPattern: '/api', statusCode: 500, probability: 0.5 }],
    },
  });
  cy.visit('/');
  cy.getChaosSeed().then((seed) => {
    cy.log(`chaos seed: ${seed}`);
  });
});
```

### SSE and GraphQL

```ts
cy.injectChaos({
  seed: 42,
  sse: {
    delays: [{ urlPattern: '/events', eventType: 'token', delayMs: 500, probability: 1 }],
  },
  network: {
    failures: [{
      urlPattern: '/graphql',
      graphqlOperation: 'GetUser',
      statusCode: 503,
      probability: 1,
    }],
  },
});
cy.visit('/dashboard');
```

SSE chaos and GraphQL operation matching use the same `cy.injectChaos()` command as network, UI, and WebSocket chaos.

## API

### `cy.injectChaos(config, options?)`

Inject chaos into the next `cy.visit()`. **Call before `cy.visit()`** so the browser's `fetch` / `XMLHttpRequest` / `WebSocket` are patched before the application runs.

- `config` — `ChaosConfig` (see [@chaos-maker/core](../core/) for the full reference).
- `options.persistAcrossNavigations` — `boolean`, default `true`. When true, chaos re-injects on every subsequent `cy.visit()` until `cy.removeChaos()`. When false, chaos applies to the next visit only.

### `cy.removeChaos()`

Stop chaos and restore original `fetch` / `XHR` / `WebSocket` / DOM behaviour. Called automatically in an `afterEach` hook by `@chaos-maker/cypress/support`.

### `cy.getChaosLog()`

Resolve to the chaos event log — every chaos check since injection, with `applied: true | false` and full detail for each type.

### `cy.getChaosSeed()`

Resolve to the PRNG seed used by the current chaos instance, or `null` when chaos is not active. Log this on failure to replay the exact sequence of chaos decisions deterministically.

## How it works

- The plugin-side `chaos:getUmdSource` task (registered by `registerChaosTasks`) reads the `@chaos-maker/core` UMD bundle from disk via `require.resolve`. It runs once per spec; the result is cached in the Node process.
- `cy.injectChaos(config)` subscribes a `Cypress.on('window:before:load', ...)` listener that, on the next navigation, writes `config` to `window.__CHAOS_CONFIG__` and appends the UMD source as an inline `<script>` tag inside the AUT window. The core library's auto-start logic then constructs a `ChaosMaker` and begins intercepting.
- `cy.removeChaos()` detaches the listener and calls `chaosUtils.stop()` inside the AUT window.

## Playwright vs Cypress

| Capability | Playwright adapter | Cypress adapter |
|---|---|---|
| One-line injection | `injectChaos(page, cfg)` | `cy.injectChaos(cfg)` |
| Test-scoped auto-cleanup | Fixture `afterEach` | Support `afterEach` |
| Persists across navigations | Yes (matches `addInitScript`) | Yes by default (configurable) |
| TypeScript types | Exported | Global `Cypress.Chainable` augmentation |

Chaos behaviour is identical — both adapters load the same core UMD into the page.

## Caveats

- **Cross-origin navigations**: the command chain runs inside a single Cypress origin. If the app navigates to a new origin mid-test, wrap the rest of the chain in `cy.origin(...)` and re-inject inside that block.
- **CSP `script-src` 'self' only**: appending an inline `<script>` element requires either `unsafe-inline` in the page's Content Security Policy or a CSP-relaxed test mode. If your production CSP is strict, disable it for Cypress runs (e.g., via a dedicated test build).
- **`cy.intercept` interaction**: Cypress's request interception layer runs above `window.fetch`, so a `cy.intercept` response is delivered to chaos-maker's patched fetch — chaos still applies inside the intercepted response path. Use both together intentionally.

## Service Worker chaos

```js
// cypress/support/e2e.js
import '@chaos-maker/cypress/support';
```

```ts
it('SW fetch fails', () => {
  cy.visit('/app-with-sw/');
  cy.window().should((win) => {
    expect(win.navigator.serviceWorker.controller).to.not.be.null;
  });
  cy.injectSWChaos({
    network: { failures: [{ urlPattern: '/api/data', statusCode: 503, probability: 1 }] },
    seed: 1,
  });
  cy.get('#trigger').click();
  cy.getSWChaosLog().should((log) => {
    expect(log.some((e) => e.type === 'network:failure' && e.applied)).to.be.true;
  });
  cy.removeSWChaos();
});
```

Serve `node_modules/@chaos-maker/core/dist/sw.js` at a URL your SW can reach.

## License

[MIT](../../LICENSE)
