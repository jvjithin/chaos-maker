# @chaos-maker/playwright

Playwright adapter for [`@chaos-maker/core`](../core/). One-line chaos injection in E2E tests.

## Install

```bash
npm install @chaos-maker/core @chaos-maker/playwright
```

Both packages are required — `@chaos-maker/playwright` loads the core UMD bundle into the browser page.

## Usage

### Direct API

```ts
import { test, expect } from '@playwright/test';
import { injectChaos, removeChaos, getChaosLog } from '@chaos-maker/playwright';

test('shows error when API fails', async ({ page }) => {
  await injectChaos(page, {
    network: {
      failures: [{ urlPattern: '/api/data', statusCode: 503, probability: 1.0 }]
    }
  });

  await page.goto('/dashboard');
  await expect(page.getByText('Something went wrong')).toBeVisible();

  // Check what chaos was applied
  const log = await getChaosLog(page);
  expect(log.some(e => e.type === 'network:failure' && e.applied)).toBe(true);
});
```

### Test Fixture

For automatic cleanup, use the built-in fixture:

```ts
import { test, expect } from '@chaos-maker/playwright/fixture';

test('handles slow network', async ({ page, chaos }) => {
  await chaos.inject({
    network: {
      latencies: [{ urlPattern: '/api/', delayMs: 3000, probability: 1.0 }]
    }
  });

  await page.goto('/');
  await expect(page.getByText('Loading')).toBeVisible();

  const log = await chaos.getLog();
  expect(log.some(e => e.type === 'network:latency' && e.applied)).toBe(true);
});
// chaos.remove() is called automatically after each test
```

### With Presets

```ts
import { presets } from '@chaos-maker/core';
import { injectChaos } from '@chaos-maker/playwright';

test('app works offline', async ({ page }) => {
  await injectChaos(page, presets.offlineMode);
  await page.goto('/');
  await expect(page.getByText('No connection')).toBeVisible();
});
```

### With Config Builder

```ts
import { ChaosConfigBuilder } from '@chaos-maker/core';
import { injectChaos } from '@chaos-maker/playwright';

const config = new ChaosConfigBuilder()
  .failRequests('/api/checkout', 500, 0.5)
  .addLatency('/api/', 2000, 1.0)
  .build();

test('checkout handles combined chaos', async ({ page }) => {
  await injectChaos(page, config);
  await page.goto('/checkout');
  // ...
});
```

## API

### `injectChaos(page, config)`

Inject chaos into a Playwright page. **Call before `page.goto()`** to ensure all network requests are intercepted from the start.

- `page` — Playwright `Page` instance
- `config` — `ChaosConfig` object (see [@chaos-maker/core](../core/) for full config reference)

### `removeChaos(page)`

Stop chaos and restore original `fetch`/`XHR`/DOM behavior.

### `getChaosLog(page)`

Retrieve the chaos event log from the page. Returns `ChaosEvent[]` — every chaos check emitted since injection, with `applied: true/false`.

### Fixture: `chaos`

Available when importing `test` from `@chaos-maker/playwright/fixture`:

- `chaos.inject(config)` — same as `injectChaos(page, config)`
- `chaos.remove()` — same as `removeChaos(page)` (also called automatically after each test)
- `chaos.getLog()` — same as `getChaosLog(page)`

## License

[MIT](../../LICENSE)
