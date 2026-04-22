import { test, expect, type Browser, type Page } from '@playwright/test';
import { injectChaos, getChaosLog, type ChaosConfig, type ChaosEvent } from '@chaos-maker/playwright';

const BASE_URL = 'http://127.0.0.1:8080';
const API_PATTERN = '/api/data.json';
const WS_PATTERN = '127.0.0.1:8081';

type NormalizedEvent = Omit<ChaosEvent, 'timestamp' | 'detail'> & {
  detail: Record<string, unknown>;
};

const richConfig = (seed: number): ChaosConfig => ({
  seed,
  network: {
    cors: [{ urlPattern: API_PATTERN, probability: 0 }],
    failures: [{ urlPattern: API_PATTERN, statusCode: 503, probability: 0.35 }],
    latencies: [{ urlPattern: API_PATTERN, delayMs: 5, probability: 0.5 }],
    corruptions: [{ urlPattern: API_PATTERN, strategy: 'truncate', probability: 0.25 }],
  },
  ui: {
    assaults: [{ selector: '.dynamic-btn', action: 'disable', probability: 0.5 }],
  },
  websocket: {
    drops: [{ urlPattern: WS_PATTERN, direction: 'outbound', probability: 0.5 }],
    corruptions: [{ urlPattern: WS_PATTERN, direction: 'inbound', strategy: 'truncate', probability: 0.5 }],
  },
});

function normalizeUrl(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value
    .replace(/^https?:\/\/127\.0\.0\.1:\d+/, 'http://<host>')
    .replace(/^ws:\/\/127\.0\.0\.1:\d+/, 'ws://<host>');
}

function normalizeLog(log: ChaosEvent[]): NormalizedEvent[] {
  return log.map(({ timestamp: _timestamp, detail, ...event }) => ({
    ...event,
    detail: Object.fromEntries(
      Object.entries(detail).map(([key, value]) => [key, key === 'url' ? normalizeUrl(value) : value]),
    ),
  }));
}

async function startUiAwareChaos(page: Page, config: ChaosConfig): Promise<void> {
  await page.evaluate((cfg) => {
    const utils = (window as any).chaosUtils;
    utils.start(cfg);
  }, config);
}

async function waitForTextToSettle(page: Page, selector: string): Promise<void> {
  await page.waitForFunction((target) => {
    const text = document.querySelector(target)?.textContent ?? '';
    return text !== '' && text !== 'Loading...';
  }, selector);
}

async function driveFixedInteraction(page: Page): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await page.click('#fetch-data');
    await waitForTextToSettle(page, '#status');
  }

  for (let i = 0; i < 5; i++) {
    await page.click('#xhr-get');
    await waitForTextToSettle(page, '#xhr-status');
  }

  await page.click('#ws-connect');
  await expect(page.locator('#ws-status')).toHaveText('open');
  for (let i = 0; i < 3; i++) {
    await page.click('#ws-send');
    await page.waitForTimeout(30);
  }

  for (let i = 0; i < 3; i++) {
    await page.click('#add-dynamic');
    await expect(page.locator('.dynamic-btn')).toHaveCount(i + 1);
  }

  await page.waitForTimeout(150);
}

async function runReplay(browser: Browser, seed: number): Promise<NormalizedEvent[]> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const config = richConfig(seed);
    await injectChaos(page, { network: config.network, websocket: config.websocket, seed });
    await page.goto(BASE_URL);
    await startUiAwareChaos(page, config);
    await driveFixedInteraction(page);
    return normalizeLog(await getChaosLog(page));
  } finally {
    await context.close();
  }
}

test('same seed and interaction sequence reproduce the same chaos event log', async ({ browser }) => {
  const first = await runReplay(browser, 12345);
  const second = await runReplay(browser, 12345);
  const differentSeed = await runReplay(browser, 54321);

  expect(first).toEqual(second);
  expect(first).not.toEqual(differentSeed);
  expect(first.length).toBeGreaterThanOrEqual(20);
});
