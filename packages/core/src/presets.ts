import { ChaosConfig } from './config';

const MATCH_ALL_URLS = '*';

function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const val of Object.values(obj as Record<string, unknown>)) {
      deepFreeze(val);
    }
  }
  return obj;
}

export const presets: Readonly<Record<string, ChaosConfig>> = deepFreeze({
  unstableApi: {
    network: {
      failures: [{ urlPattern: '/api/', statusCode: 500, probability: 0.1 }],
      latencies: [{ urlPattern: '/api/', delayMs: 1000, probability: 0.2 }],
    },
  },
  slowNetwork: {
    network: {
      latencies: [{ urlPattern: MATCH_ALL_URLS, delayMs: 2000, probability: 1.0 }],
    },
  },
  offlineMode: {
    network: {
      cors: [{ urlPattern: MATCH_ALL_URLS, probability: 1.0 }],
    },
  },
  flakyConnection: {
    network: {
      aborts: [{ urlPattern: MATCH_ALL_URLS, probability: 0.05 }],
      latencies: [{ urlPattern: MATCH_ALL_URLS, delayMs: 3000, probability: 0.1 }],
    },
  },
  degradedUi: {
    ui: {
      assaults: [
        { selector: 'button', action: 'disable', probability: 0.2 },
        { selector: 'a', action: 'hide', probability: 0.1 },
      ],
    },
  },
  unreliableWebSocket: {
    websocket: {
      drops: [{ urlPattern: MATCH_ALL_URLS, direction: 'both', probability: 0.1 }],
      delays: [{ urlPattern: MATCH_ALL_URLS, direction: 'inbound', delayMs: 500, probability: 1.0 }],
      corruptions: [{ urlPattern: MATCH_ALL_URLS, direction: 'inbound', strategy: 'truncate', probability: 0.05 }],
    },
  },
  unreliableEventStream: {
    sse: {
      drops: [{ urlPattern: MATCH_ALL_URLS, probability: 0.05 }],
      delays: [{ urlPattern: MATCH_ALL_URLS, delayMs: 200, probability: 1.0 }],
      closes: [{ urlPattern: MATCH_ALL_URLS, probability: 0.02, afterMs: 2000 }],
    },
  },
});
