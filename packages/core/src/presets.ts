import { ChaosConfig } from './config';

const MATCH_ALL_URLS = '/';

export const presets: Record<string, ChaosConfig> = {
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
};
