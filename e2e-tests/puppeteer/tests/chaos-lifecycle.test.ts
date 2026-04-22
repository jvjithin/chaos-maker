import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import type { Browser, Page } from 'puppeteer';
import { injectChaos, removeChaos, getChaosLog, getChaosSeed } from '@chaos-maker/puppeteer';
import { presets } from '@chaos-maker/core';
import type { ChaosEvent } from '@chaos-maker/core';
import { launchBrowser, BASE_URL, API_PATTERN, makeRequest } from './helpers';

let browser: Browser;
let page: Page;

beforeAll(async () => { browser = await launchBrowser(); });
afterAll(async () => { await browser.close(); });

beforeEach(async () => { page = await browser.newPage(); });
afterEach(async () => { await page.close(); });

describe('Chaos lifecycle', () => {
  it('removeChaos restores normal fetch behavior', async () => {
    await injectChaos(page, {
      network: { failures: [{ urlPattern: API_PATTERN, statusCode: 500, probability: 1.0 }] },
    });
    await page.goto(BASE_URL);
    expect(await makeRequest(page)).toBe('Error!');

    await removeChaos(page);

    await page.click('#fetch-data');
    await page.waitForFunction(
      () => document.getElementById('status')?.textContent !== 'Loading...' &&
            document.getElementById('status')?.textContent !== '',
      { timeout: 10_000 },
    );
    expect(await page.$eval('#status', (el) => el.textContent)).toBe('Success!');
  });

  it('chaos log captures events with correct structure', async () => {
    await injectChaos(page, {
      network: { failures: [{ urlPattern: API_PATTERN, statusCode: 503, probability: 1.0 }] },
    });
    await page.goto(BASE_URL);
    await makeRequest(page);

    const log = await getChaosLog(page) as ChaosEvent[];
    expect(log.length).toBeGreaterThan(0);
    for (const event of log) {
      expect(event).toHaveProperty('type');
      expect(event).toHaveProperty('timestamp');
      expect(event).toHaveProperty('applied');
      expect(event).toHaveProperty('detail');
      expect(typeof event.timestamp).toBe('number');
      expect(typeof event.applied).toBe('boolean');
    }
  });

  it('chaos log records URL and method in event detail', async () => {
    await injectChaos(page, {
      network: { failures: [{ urlPattern: API_PATTERN, statusCode: 500, probability: 1.0 }] },
    });
    await page.goto(BASE_URL);
    await makeRequest(page);

    const log = await getChaosLog(page) as ChaosEvent[];
    const evt = log.find((e) => e.type === 'network:failure' && e.applied);
    expect(evt).toBeDefined();
    expect(evt!.detail.url).toContain(API_PATTERN);
    expect(evt!.detail.method).toBe('GET');
    expect(evt!.detail.statusCode).toBe(500);
  });

  it('multiple network chaos rules work simultaneously', async () => {
    await injectChaos(page, {
      network: {
        failures: [{ urlPattern: API_PATTERN, statusCode: 503, probability: 1.0 }],
        latencies: [{ urlPattern: '/no-match', delayMs: 100, probability: 1.0 }],
      },
    });
    await page.goto(BASE_URL);
    await makeRequest(page);

    const log = await getChaosLog(page) as ChaosEvent[];
    expect(log.some((e) => e.type === 'network:failure')).toBe(true);
  });

  it('getChaosSeed returns a finite number once chaos is injected', async () => {
    await injectChaos(page, {
      network: { failures: [{ urlPattern: API_PATTERN, statusCode: 500, probability: 1.0 }] },
    });
    await page.goto(BASE_URL);

    const seed = await getChaosSeed(page);
    expect(seed).not.toBeNull();
    expect(Number.isFinite(seed)).toBe(true);
  });

  it('unstableApi preset emits network events', async () => {
    await injectChaos(page, presets.unstableApi);
    await page.goto(BASE_URL);
    await makeRequest(page);

    const log = await getChaosLog(page) as ChaosEvent[];
    expect(log.some((e) => e.type === 'network:failure' || e.type === 'network:latency')).toBe(true);
  });
});
