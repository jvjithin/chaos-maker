# @chaos-maker/cypress

Cypress adapter for [`@chaos-maker/core`](../core/). Custom commands for one-line chaos injection in Cypress E2E tests.

## Install

```bash
npm install --save-dev @chaos-maker/core @chaos-maker/cypress
```

Both packages are required - `@chaos-maker/cypress` ships the browser-side commands and a plugin-side task that loads the core UMD bundle into the application under test.

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

That's it. Every spec now has `cy.injectChaos`, `cy.removeChaos`, `cy.getChaosLog`, `cy.getChaosSeed`, `cy.enableGroup`, `cy.disableGroup`, and the Service Worker helpers including `cy.enableSWGroup` and `cy.disableSWGroup`.

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

Drop a built-in preset by name with the declarative `presets` field:

```ts
cy.injectChaos({ presets: ['slow-api'] });
```

Register your own bundle inline via `customPresets`:

```ts
cy.injectChaos({
  customPresets: {
    'team-flow': {
      network: { failures: [{ urlPattern: '/checkout', statusCode: 503, probability: 1 }] },
    },
  },
  presets: ['team-flow'],
});
```

The legacy spread style still works for migration:

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

### Rule Groups

Use Rule Groups to switch related chaos rules on or off during a test.

```ts
import { ChaosConfigBuilder } from '@chaos-maker/core';

it('toggles payment chaos', () => {
  const config = new ChaosConfigBuilder()
    .defineGroup('payments', { enabled: false })
    .inGroup('payments')
    .failRequests('/api/pay', 503, 1)
    .build();

  cy.injectChaos(config);
  cy.visit('/checkout');

  cy.enableGroup('payments');
  cy.disableGroup('payments');
});
```

For Service Worker rules, use the SW commands after `cy.injectSWChaos`:

```ts
cy.enableSWGroup('payments');
cy.disableSWGroup('payments');
```

Browser-side `cy.enableGroup` and `cy.disableGroup` affect page rules from `cy.injectChaos`. `cy.enableSWGroup` and `cy.disableSWGroup` affect Service Worker rules from `cy.injectSWChaos`.

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

- `config` - `ChaosConfig` (see [@chaos-maker/core](../core/) for the full reference).
- `options.persistAcrossNavigations` - `boolean`, default `true`. When true, chaos re-injects on every subsequent `cy.visit()` until `cy.removeChaos()`. When false, chaos applies to the next visit only.

### `cy.removeChaos()`

Stop chaos and restore original `fetch` / `XHR` / `WebSocket` / DOM behaviour. Called automatically in an `afterEach` hook by `@chaos-maker/cypress/support`.

The support hook runs only when chaos is active. Direct users should still call `cy.removeChaos()` in their own cleanup flow before the next `cy.visit()`. The command detaches the `window:before:load` listener so future visits are clean unless you call `cy.injectChaos()` again.

### `cy.getChaosLog()`

Resolve to the chaos event log - every chaos check since injection, with `applied: true | false` and full detail for each type.

### `cy.getChaosSeed()`

Resolve to the PRNG seed used by the current chaos instance, or `null` when chaos is not active. Log this on failure to replay the exact sequence of chaos decisions deterministically.

### `cy.enableGroup(name)` / `cy.disableGroup(name)`

Toggle a browser-side Rule Group at runtime.

### `cy.enableSWGroup(name, options?)` / `cy.disableSWGroup(name, options?)`

Toggle a Service Worker Rule Group at runtime. Pass `options.timeoutMs` to override the Service Worker acknowledgement timeout.

## Validation

`cy.injectChaos` validates the config synchronously inside the command body. A malformed config throws `ChaosConfigError` and fails the step before `cy.visit()` runs. `ChaosConfigError.issues` is a structured `ValidationIssue[]` with `path`, `code`, `ruleType`, and optional `expected` / `received`. See the [Rule Validation concept page](https://chaos-maker-dev.github.io/chaos-maker/concepts/validation/).

```ts
cy.injectChaos(config, {
  validation: { unknownFields: 'warn' },
});
```

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

Chaos behaviour is identical - both adapters load the same core UMD into the page.

## Caveats

- **Cross-origin navigations**: the command chain runs inside a single Cypress origin. If the app navigates to a new origin mid-test, wrap the rest of the chain in `cy.origin(...)` and re-inject inside that block.
- **CSP `script-src` 'self' only**: appending an inline `<script>` element requires either `unsafe-inline` in the page's Content Security Policy or a CSP-relaxed test mode. If your production CSP is strict, disable it for Cypress runs (e.g., via a dedicated test build).
- **`cy.intercept` interaction**: Cypress's request interception layer runs above `window.fetch`, so a `cy.intercept` response is delivered to chaos-maker's patched fetch - chaos still applies inside the intercepted response path. Use both together intentionally.

## Cypress Command Log

The support module subscribes to applied chaos events and writes `Cypress.log({ name: 'chaos', ... })` entries. Skipped probability events and `type: 'debug'` events stay in `cy.getChaosLog()` so the Command Log remains focused on visible chaos.

## Leak diagnostics

Pass `debug: true` to `cy.injectChaos` to surface leaked-runtime diagnostics in the event log. Filter `cy.getChaosLog()` for `type === 'debug'` events with `detail.reason` covering double-patched globals, stale wrapper handles, orphaned observers, or active-instance conflicts. See [`@chaos-maker/core`](../core/README.md#leak-diagnostics) for the full reason list.

```ts
cy.injectChaos({ debug: true, network: { /* ... */ } });
cy.visit('/');
cy.getChaosLog().then((log) => {
  const issues = log.filter(
    (e) => e.type === 'debug' && /already-patched|stale|orphaned|active-instance-conflict/.test(String(e.detail.reason ?? '')),
  );
  expect(issues).to.have.length(0);
});
```

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
    groups: [{ name: 'payments', enabled: false }],
    network: {
      failures: [{ urlPattern: '/api/data', statusCode: 503, probability: 1, group: 'payments' }],
    },
    seed: 1,
  });
  cy.enableSWGroup('payments');
  cy.get('#trigger').click();
  cy.getSWChaosLog().should((log) => {
    expect(log.some((e) => e.type === 'network:failure' && e.applied)).to.be.true;
  });
  cy.disableSWGroup('payments');
  cy.removeSWChaos();
});
```

Use `cy.getSWChaosLog()` for the page-buffered event log. This is the default assertion surface because it reflects events broadcast from the Service Worker to the page. Use `cy.getSWChaosLogFromSW()` when you need a direct pull from the Service Worker's in-memory log, such as debugging a missed page-side broadcast.

`cy.removeSWChaos()` stops the worker engine and clears both the page-buffered and worker-side logs. Unregister the app's Service Worker when a spec needs a completely fresh registration.

Serve `node_modules/@chaos-maker/core/dist/sw.js` at a URL your SW can reach.

## License

[MIT](../../LICENSE)
