# @chaos-maker/core

Core chaos engine for web applications. Intercepts `fetch`, `XMLHttpRequest`, and DOM mutations to inject controlled failures, latency, aborts, corruption, and UI disruptions.

Framework-agnostic. Works with Playwright, Cypress, Selenium, or any browser environment.

## Install

```bash
npm install @chaos-maker/core
```

## Usage

### Programmatic (ESM/CJS)

```ts
import { ChaosMaker } from '@chaos-maker/core';

const chaos = new ChaosMaker({
  network: {
    failures: [{ urlPattern: '/api', statusCode: 503, probability: 0.5 }],
    latencies: [{ urlPattern: '/api', delayMs: 2000, probability: 0.3 }]
  }
});

chaos.start();
// All matching fetch/XHR calls are now intercepted

chaos.on('network:failure', (event) => {
  console.log(`${event.detail.url} → ${event.applied ? 'failed' : 'passed'}`);
});

chaos.stop(); // restores original fetch/XHR
```

### Browser (UMD)

```html
<script src="chaos-maker.umd.js"></script>
<script>
  window.chaosUtils.start({
    network: {
      failures: [{ urlPattern: '/api', statusCode: 500, probability: 1.0 }]
    }
  });
</script>
```

### Presets

```ts
import { ChaosMaker, presets } from '@chaos-maker/core';

// Available: unstableApi, slowNetwork, offlineMode, flakyConnection, degradedUi
const chaos = new ChaosMaker(presets.slowNetwork);
chaos.start();
```

### Config Builder

```ts
import { ChaosConfigBuilder } from '@chaos-maker/core';

const config = new ChaosConfigBuilder()
  .failRequests('/api/checkout', 500, 0.5)
  .addLatency('/api/', 2000, 0.3)
  .abortRequests('/api/upload', 1.0, 5000)
  .corruptResponses('/api/data', 'malformed-json', 0.2)
  .simulateCors('/external-api/', 1.0)
  .assaultUi('button.submit', 'disable', 0.1)
  .build();
```

## Chaos Types

| Type | Config Key | Description |
|------|-----------|-------------|
| Failure | `network.failures` | Force HTTP error responses |
| Latency | `network.latencies` | Add delays to requests |
| Abort | `network.aborts` | Cancel requests (immediate or timed) |
| Corruption | `network.corruptions` | Corrupt response bodies |
| CORS | `network.cors` | Simulate CORS errors |
| UI Assault | `ui.assaults` | Disable, hide, or remove DOM elements |

## Configuration Reference

### NetworkFailureConfig

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `urlPattern` | `string` | Yes | Substring match against request URL |
| `statusCode` | `number` | Yes | HTTP status code (100-599) |
| `probability` | `number` | Yes | 0.0-1.0 chance of applying |
| `methods` | `string[]` | No | HTTP methods to match (default: all) |
| `body` | `string` | No | Custom response body |
| `statusText` | `string` | No | Custom status text |
| `headers` | `Record<string, string>` | No | Custom response headers |

### NetworkLatencyConfig

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `urlPattern` | `string` | Yes | Substring match against request URL |
| `delayMs` | `number` | Yes | Delay in milliseconds |
| `probability` | `number` | Yes | 0.0-1.0 chance of applying |
| `methods` | `string[]` | No | HTTP methods to match |

### NetworkAbortConfig

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `urlPattern` | `string` | Yes | Substring match against request URL |
| `probability` | `number` | Yes | 0.0-1.0 chance of applying |
| `timeout` | `number` | No | ms before abort (0 or omitted = immediate) |
| `methods` | `string[]` | No | HTTP methods to match |

### NetworkCorruptionConfig

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `urlPattern` | `string` | Yes | Substring match against request URL |
| `strategy` | `CorruptionStrategy` | Yes | `'truncate'` \| `'malformed-json'` \| `'empty'` \| `'wrong-type'` |
| `probability` | `number` | Yes | 0.0-1.0 chance of applying |
| `methods` | `string[]` | No | HTTP methods to match |

### NetworkCorsConfig

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `urlPattern` | `string` | Yes | Substring match against request URL |
| `probability` | `number` | Yes | 0.0-1.0 chance of applying |
| `methods` | `string[]` | No | HTTP methods to match |

### UiAssaultConfig

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `selector` | `string` | Yes | CSS selector |
| `action` | `string` | Yes | `'disable'` \| `'hide'` \| `'remove'` |
| `probability` | `number` | Yes | 0.0-1.0 chance of applying |

## Event System

```ts
chaos.on('network:failure', (event) => { /* ... */ });
chaos.on('*', (event) => { /* all events */ });
chaos.off('network:failure', listener);

const log = chaos.getLog();   // all events since start
chaos.clearLog();
```

Event types: `network:failure`, `network:latency`, `network:abort`, `network:corruption`, `network:cors`, `ui:assault`

## Config Validation

All configs are validated with Zod in strict mode. Unknown keys are rejected. Invalid values throw `ChaosConfigError` with descriptive messages.

```ts
import { validateConfig, ChaosConfigError } from '@chaos-maker/core';

try {
  validateConfig({ network: { failures: [{ urlPattern: '', statusCode: 999 }] } });
} catch (e) {
  if (e instanceof ChaosConfigError) {
    console.log(e.issues);
    // ['network.failures.0.urlPattern: urlPattern must not be empty',
    //  'network.failures.0.statusCode: Number must be less than or equal to 599']
  }
}
```

## Service Worker chaos

Chaos applies to SW-originated fetches via the `@chaos-maker/core/sw` subpath. Zod + UI + builder are excluded from this bundle so it stays small enough for production SW deploys.

Classic SW (one line):

```js
// user's sw.js
importScripts('/path/to/chaos-maker-sw.js'); // auto-installs
```

Module SW:

```js
import { installChaosSW } from '@chaos-maker/core/sw';
installChaosSW({ source: 'message' });
```

Page-side config is delivered via `postMessage` + `MessageChannel` ack. Use the adapter helpers (`injectSWChaos` / `removeSWChaos` / `getSWChaosLog`) in `@chaos-maker/{playwright,cypress,webdriverio,puppeteer}`.

Limitations: `caches.match` hits bypass chaos (v0.5.0); push/sync events not covered; cross-origin SWs not supported.

## License

[MIT](../../LICENSE)
