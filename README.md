# Chaos Maker

[![Build Status](https://github.com/jvjithin/chaos-maker/actions/workflows/ci.yml/badge.svg)](https://github.com/jvjithin/chaos-maker/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Inject controlled chaos into web applications. Test your frontend's resilience to network failures, latency spikes, connection drops, corrupted responses, and UI disruptions.

## Why

Most frontend tests only cover the happy path. Chaos Maker lets you test what happens when:

- An API returns a 503 instead of 200
- A request takes 5 seconds instead of 50ms
- A connection is aborted mid-flight
- A JSON response arrives truncated or malformed
- A submit button is randomly disabled

All without touching your backend.

## Quick Start

### Playwright (recommended)

```bash
npm install @chaos-maker/core @chaos-maker/playwright
```

```ts
import { test, expect } from '@playwright/test';
import { injectChaos, getChaosLog } from '@chaos-maker/playwright';

test('shows error state when API fails', async ({ page }) => {
  await injectChaos(page, {
    network: {
      failures: [{ urlPattern: '/api/data', statusCode: 503, probability: 1.0 }]
    }
  });

  await page.goto('/dashboard');
  await expect(page.getByText('Something went wrong')).toBeVisible();

  // Verify chaos was applied
  const log = await getChaosLog(page);
  expect(log.some(e => e.type === 'network:failure' && e.applied)).toBe(true);
});
```

### Using Presets

```ts
import { presets } from '@chaos-maker/core';
import { injectChaos } from '@chaos-maker/playwright';

test('app handles slow network gracefully', async ({ page }) => {
  await injectChaos(page, presets.slowNetwork);
  await page.goto('/');
  await expect(page.getByText('Loading')).toBeVisible();
});
```

Available presets: `unstableApi`, `slowNetwork`, `offlineMode`, `flakyConnection`, `degradedUi`

### Using the Config Builder

```ts
import { ChaosConfigBuilder } from '@chaos-maker/core';
import { injectChaos } from '@chaos-maker/playwright';

const config = new ChaosConfigBuilder()
  .failRequests('/api/checkout', 500, 0.5)
  .addLatency('/api/', 2000, 0.3)
  .abortRequests('/api/upload', 1.0, 5000)
  .corruptResponses('/api/data', 'malformed-json', 0.2)
  .simulateCors('/external-api/', 1.0)
  .assaultUi('button.submit', 'disable', 0.1)
  .build();

test('checkout survives combined chaos', async ({ page }) => {
  await injectChaos(page, config);
  await page.goto('/checkout');
  // ...assertions
});
```

### Playwright Fixture

For cleaner test setup, use the built-in fixture:

```ts
import { test, expect } from '@chaos-maker/playwright/fixture';

test('handles failure', async ({ page, chaos }) => {
  await chaos.inject({
    network: {
      failures: [{ urlPattern: '/api', statusCode: 500, probability: 1.0 }]
    }
  });
  await page.goto('/');

  const log = await chaos.getLog();
  expect(log.filter(e => e.applied)).toHaveLength(1);
});
// chaos.remove() is called automatically after each test
```

## Chaos Types

### Network Failures

Force specific HTTP error responses on matching requests.

```ts
{
  network: {
    failures: [{
      urlPattern: '/api/users',    // substring match
      methods: ['POST'],           // optional — default: all methods
      statusCode: 503,
      probability: 0.5,            // 0.0–1.0
      body: '{"error": "down"}',   // optional custom body
      statusText: 'Unavailable',   // optional
      headers: { 'Retry-After': '30' }  // optional
    }]
  }
}
```

### Network Latency

Add delays before requests complete.

```ts
{
  network: {
    latencies: [{
      urlPattern: '/api/',
      delayMs: 3000,
      probability: 1.0,
      methods: ['GET']
    }]
  }
}
```

### Connection Abort

Abort requests immediately or after a timeout using real `AbortController` (fetch) and `xhr.abort()` (XHR).

```ts
{
  network: {
    aborts: [{
      urlPattern: '/api/upload',
      probability: 1.0,
      timeout: 2000    // ms before abort; omit for immediate
    }]
  }
}
```

### Response Corruption

Let the request succeed, then corrupt the response body. Four strategies:

| Strategy | Effect |
|----------|--------|
| `truncate` | Cuts the response in half |
| `malformed-json` | Appends `"}` to break JSON parsing |
| `empty` | Replaces body with empty string |
| `wrong-type` | Replaces body with unexpected HTML |

```ts
{
  network: {
    corruptions: [{
      urlPattern: '/api/data',
      strategy: 'malformed-json',
      probability: 0.3
    }]
  }
}
```

### CORS Simulation

Simulates CORS failures. Fetch throws `TypeError('Failed to fetch')`, XHR fires an error event with `status: 0` — matching real browser behavior.

```ts
{
  network: {
    cors: [{
      urlPattern: '/external-api/',
      probability: 1.0
    }]
  }
}
```

### UI Assaults

Manipulate DOM elements by CSS selector. Works on elements present at page load and dynamically added elements (via `MutationObserver`).

| Action | Effect |
|--------|--------|
| `disable` | Sets `disabled` attribute |
| `hide` | Sets `display: none` |
| `remove` | Removes element from DOM |

```ts
{
  ui: {
    assaults: [
      { selector: 'button[type="submit"]', action: 'disable', probability: 0.5 },
      { selector: '.sidebar', action: 'hide', probability: 0.2 }
    ]
  }
}
```

## Event Observability

Every chaos check emits an event — whether applied or skipped. Use this to assert chaos behavior in tests.

```ts
import { getChaosLog } from '@chaos-maker/playwright';

const log = await getChaosLog(page);

// Each event has:
// {
//   type: 'network:failure' | 'network:latency' | 'network:abort' |
//         'network:corruption' | 'network:cors' | 'ui:assault',
//   timestamp: number,
//   applied: boolean,       // true = chaos was applied, false = probability skipped it
//   detail: { url?, method?, statusCode?, delayMs?, strategy?, ... }
// }
```

## Integration with Other Frameworks

### Cypress

Load the UMD bundle and start chaos before your test:

```js
// cypress/support/commands.js
Cypress.Commands.add('injectChaos', (config) => {
  cy.readFile('node_modules/@chaos-maker/core/dist/chaos-maker.umd.js').then((script) => {
    cy.window().then((win) => {
      win.__CHAOS_CONFIG__ = config;
      win.eval(script);
    });
  });
});

// In your test:
it('handles API failure', () => {
  cy.injectChaos({
    network: { failures: [{ urlPattern: '/api', statusCode: 500, probability: 1.0 }] }
  });
  cy.visit('/');
  cy.contains('Something went wrong').should('be.visible');
});
```

### Selenium / WebDriver

Inject the UMD bundle via `executeScript`:

```js
const fs = require('fs');
const script = fs.readFileSync(
  'node_modules/@chaos-maker/core/dist/chaos-maker.umd.js', 'utf-8'
);
const config = { network: { failures: [{ urlPattern: '/api', statusCode: 500, probability: 1.0 }] } };

await driver.executeScript(`
  window.__CHAOS_CONFIG__ = ${JSON.stringify(config)};
  ${script}
`);
await driver.get('http://localhost:3000');
```

## Packages

| Package | Description |
|---------|-------------|
| [`@chaos-maker/core`](./packages/core/) | Core chaos engine. Framework-agnostic. ESM + CJS + UMD. |
| [`@chaos-maker/playwright`](./packages/playwright/) | Playwright adapter with `injectChaos`, `removeChaos`, `getChaosLog`, and test fixture. |

## Development

```bash
pnpm install              # install dependencies
pnpm build                # build core + playwright
pnpm test                 # unit tests (72 tests)
pnpm lint                 # eslint
pnpm --filter e2e-tests exec playwright test  # e2e tests
```

## Contributing

Pull requests are welcome. For major changes, please open an issue first.

Please make sure all tests pass before submitting:

```bash
pnpm lint && pnpm test && pnpm build && pnpm --filter e2e-tests exec playwright test --project=chromium
```

## License

[MIT](LICENSE)
