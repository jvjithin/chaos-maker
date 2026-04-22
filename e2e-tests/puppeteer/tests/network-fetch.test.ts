import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Browser, Page } from 'puppeteer';
import { injectChaos, getChaosLog } from '@chaos-maker/puppeteer';
import type { ChaosEvent } from '@chaos-maker/core';
import { launchBrowser, BASE_URL, API_PATTERN, makeRequest, getText } from './helpers';

let browser: Browser;
let page: Page;

beforeAll(async () => { browser = await launchBrowser(); });
afterAll(async () => { await browser.close(); });

beforeEach(async () => { page = await browser.newPage(); });
afterEach(async () => { await page.close(); });

describe('Network failures (fetch)', () => {
  it('injects 503 failure', async () => {
    await injectChaos(page, {
      network: { failures: [{ urlPattern: API_PATTERN, statusCode: 503, probability: 1.0 }] },
    });
    await page.goto(BASE_URL);
    expect(await makeRequest(page)).toBe('Error!');
    const result = await getText(page, '#result');
    expect(result).toContain('503');

    const log = await getChaosLog(page) as ChaosEvent[];
    expect(log.some((e) => e.type === 'network:failure' && e.applied)).toBe(true);
  });

  it('passes through when probability is 0', async () => {
    await injectChaos(page, {
      network: { failures: [{ urlPattern: API_PATTERN, statusCode: 500, probability: 0 }] },
    });
    await page.goto(BASE_URL);
    expect(await makeRequest(page)).toBe('Success!');
  });

  it('does not affect non-matching URLs', async () => {
    await injectChaos(page, {
      network: { failures: [{ urlPattern: '/no-match', statusCode: 500, probability: 1.0 }] },
    });
    await page.goto(BASE_URL);
    expect(await makeRequest(page)).toBe('Success!');
  });

  it('applies failure only to POST, not GET', async () => {
    await injectChaos(page, {
      network: {
        failures: [{ urlPattern: API_PATTERN, statusCode: 500, probability: 1.0, methods: ['POST'] }],
      },
    });
    await page.goto(BASE_URL);
    expect(await makeRequest(page, '#fetch-data', '#status')).toBe('Success!');
    expect(await makeRequest(page, '#fetch-post', '#status')).toBe('Error!');
  });
});

describe('Network latency (fetch)', () => {
  it('adds delay and logs latency event', async () => {
    const delayMs = 500;
    await injectChaos(page, {
      network: { latencies: [{ urlPattern: API_PATTERN, delayMs, probability: 1.0 }] },
    });
    await page.goto(BASE_URL);

    const t0 = Date.now();
    await makeRequest(page);
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeGreaterThanOrEqual(delayMs - 100);

    const log = await getChaosLog(page) as ChaosEvent[];
    const evt = log.find((e) => e.type === 'network:latency' && e.applied);
    expect(evt).toBeDefined();
    expect(evt!.detail.delayMs).toBe(delayMs);
  });
});

describe('Network abort (fetch)', () => {
  it('aborts request and logs abort event', async () => {
    await injectChaos(page, {
      network: { aborts: [{ urlPattern: API_PATTERN, probability: 1.0 }] },
    });
    await page.goto(BASE_URL);
    expect(await makeRequest(page)).toBe('Error!');
    const result = await getText(page, '#result');
    expect(result.toLowerCase()).toMatch(/abort|failed/);

    const log = await getChaosLog(page) as ChaosEvent[];
    expect(log.some((e) => e.type === 'network:abort' && e.applied)).toBe(true);
  });
});

describe('Response corruption (fetch)', () => {
  it('truncates response body', async () => {
    await injectChaos(page, {
      network: {
        corruptions: [{ urlPattern: API_PATTERN, strategy: 'truncate', probability: 1.0 }],
      },
    });
    await page.goto(BASE_URL);
    expect(await makeRequest(page)).toBe('Parse Error!');

    const log = await getChaosLog(page) as ChaosEvent[];
    expect(log.some((e) => e.type === 'network:corruption' && e.applied)).toBe(true);
  });

  it('injects malformed JSON', async () => {
    await injectChaos(page, {
      network: {
        corruptions: [{ urlPattern: API_PATTERN, strategy: 'malformed-json', probability: 1.0 }],
      },
    });
    await page.goto(BASE_URL);
    expect(await makeRequest(page)).toBe('Parse Error!');
  });
});
