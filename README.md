# Chaos Maker

[![Build Status](https://github.com/chaos-maker-dev/chaos-maker/actions/workflows/ci.yml/badge.svg)](https://github.com/chaos-maker-dev/chaos-maker/actions)
[![npm](https://img.shields.io/npm/v/@chaos-maker/core)](https://www.npmjs.com/package/@chaos-maker/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Inject controlled chaos into web applications to test frontend resilience. Works with Playwright, Cypress, WebdriverIO, and Puppeteer with no backend changes.

## Install

```bash
npm install @chaos-maker/core @chaos-maker/playwright
npm install @chaos-maker/core @chaos-maker/cypress
npm install @chaos-maker/core @chaos-maker/webdriverio
npm install @chaos-maker/core @chaos-maker/puppeteer
```

## 30-second Playwright quickstart

```bash
npm install @chaos-maker/core @chaos-maker/playwright
```

```typescript
import { test, expect } from '@playwright/test';
import { injectChaos, getChaosLog } from '@chaos-maker/playwright';

test('shows error state when payment API fails', async ({ page }) => {
  await injectChaos(page, {
    seed: 42,
    network: {
      failures: [{ urlPattern: '/api/payments', statusCode: 503, probability: 1.0 }],
    },
  });

  await page.goto('/checkout');
  await page.click('#pay-now');
  await expect(page.locator('[data-testid="error-banner"]')).toBeVisible();

  const log = await getChaosLog(page);
  expect(log.some(e => e.type === 'network:failure' && e.applied)).toBe(true);
});
```

## Adapter coverage

| Surface | Playwright | Cypress | WebdriverIO | Puppeteer |
| --- | --- | --- | --- | --- |
| Network fetch/XHR | Yes | Yes | Yes | Yes |
| UI assaults | Yes | Yes | Yes | Yes |
| WebSocket | Yes | Yes | Yes | Yes |
| Service Worker fetch | Yes | Yes | Yes | Yes |
| Server-Sent Events | Yes | Yes | Yes | Yes |
| GraphQL operation matcher | Yes | Yes | Yes | Yes |

## Service Worker chaos

PWAs and offline-first apps serve fetches from a Service Worker. Those bypass page-side chaos, so add one line to your SW and chaos applies there too:

```js
// classic sw.js
importScripts('/chaos-maker-sw.js');
```

Page-side: `injectSWChaos` / `removeSWChaos` / `getSWChaosLog` in each adapter. See adapter READMEs.

## SSE and GraphQL

```typescript
await injectChaos(page, {
  sse: {
    drops: [{ urlPattern: '/events', eventType: 'token', probability: 0.1 }],
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
```

## Full docs

[Getting started](https://chaos-maker-dev.github.io/chaos-maker/getting-started/install) | [Concepts](https://chaos-maker-dev.github.io/chaos-maker/concepts/chaos-types) | [Recipes](https://chaos-maker-dev.github.io/chaos-maker/recipes/slow-checkout) | [API](https://chaos-maker-dev.github.io/chaos-maker/api/core)

## Development

```bash
pnpm install        # install all workspace dependencies
pnpm build          # build all packages
pnpm test           # unit tests
pnpm lint           # eslint
pnpm dev:docs                 # local docs dev server
pnpm build:docs               # build docs for production
```

## Contributing

Pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Run the full check before submitting:

```bash
pnpm lint && pnpm test && pnpm build
pnpm --filter e2e-tests-playwright exec playwright test --reporter=line --project=chromium
```

## License

[MIT](LICENSE)
