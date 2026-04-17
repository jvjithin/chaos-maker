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
import { test, expect } from '@playwright/test';
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
import { test } from '@playwright/test';
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

### `injectChaos(page, config, opts?)`

Inject chaos into a Playwright page. **Call before `page.goto()`** to ensure all network requests are intercepted from the start.

- `page` — Playwright `Page` instance
- `config` — `ChaosConfig` object (see [@chaos-maker/core](../core/) for full config reference)
- `opts` — optional. `InjectChaosOptions`:
  - `tracing?: boolean | 'auto'` — emit chaos events into the Playwright trace (see [Debugging with trace](#debugging-with-trace)). Requires `testInfo` when `true`.
  - `testInfo?: TestInfo` — active Playwright `TestInfo` (supplied automatically by the fixture).
  - `traceOptions?: { verbose?: boolean; attachmentName?: string }` — tune trace output.

### `removeChaos(page)`

Stop chaos and restore original `fetch`/`XHR`/DOM behavior.

### `getChaosLog(page)`

Retrieve the chaos event log from the page. Returns `ChaosEvent[]` — every chaos check emitted since injection, with `applied: true/false`.

### Fixture: `chaos`

Available when importing `test` from `@chaos-maker/playwright/fixture`:

- `chaos.inject(config)` — same as `injectChaos(page, config)`
- `chaos.remove()` — same as `removeChaos(page)` (also called automatically after each test)
- `chaos.getLog()` — same as `getChaosLog(page)`

## Debugging with trace

When a chaos test fails, the Playwright trace viewer is the first place to look. Enable tracing in your Playwright config and use the fixture — every applied chaos decision appears inline in the trace action timeline as a `chaos:<type>` step, and the full event log is attached as `chaos-log.json`.

```ts
// playwright.config.ts
export default defineConfig({
  use: {
    trace: 'on-first-retry', // or 'on' / 'retain-on-failure'
  },
});
```

```ts
import { test, expect } from '@chaos-maker/playwright/fixture';

test('flaky checkout', async ({ page, chaos }) => {
  await chaos.inject({
    network: {
      failures: [{ urlPattern: '/api/pay', statusCode: 503, probability: 1.0 }],
    },
  });
  await page.goto('/checkout');
  await page.click('#pay');
  await expect(page.getByText('Order placed')).toBeVisible(); // fails
});
```

On failure, open the trace (`pnpm exec playwright show-trace ...`). You'll see a step like:

> `chaos:network:failure /api/pay → 503`

…alongside the `page.click` and the failing assertion. The `chaos-log.json` attachment contains the full event stream plus the PRNG seed for exact replay.

**Tracing is auto-enabled** by the fixture whenever your project's `use.trace` is anything other than `'off'`. Opt out per-call with `chaos.inject(config, { tracing: false })`.

**Direct API users** must supply `testInfo` explicitly:

```ts
import { injectChaos } from '@chaos-maker/playwright';
import { test } from '@playwright/test';

test('with direct API', async ({ page }, testInfo) => {
  await injectChaos(page, config, { tracing: true, testInfo });
  // ...
});
```

## License

[MIT](../../LICENSE)
