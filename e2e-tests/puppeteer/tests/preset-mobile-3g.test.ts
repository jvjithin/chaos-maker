import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import type { Browser, Page } from 'puppeteer';
import { injectChaos, getChaosLog } from '@chaos-maker/puppeteer';
import type { ChaosEvent } from '@chaos-maker/core';
import { launchBrowser, BASE_URL, makeRequest } from './helpers';

let browser: Browser;
let page: Page;

beforeAll(async () => { browser = await launchBrowser(); });
afterAll(async () => { await browser.close(); });

beforeEach(async () => { page = await browser.newPage(); });
afterEach(async () => { await page.close(); });

describe('RFC-005 Preset: mobile-3g', () => {
  it('declarative preset name resolves and applies network latency', async () => {
    await injectChaos(page, { presets: ['mobile-3g'], seed: 1234 });
    await page.goto(BASE_URL);
    expect(await makeRequest(page)).toBe('Success!');

    const timing = await page.$eval('#timing', (el) => el.textContent ?? '0');
    expect(parseInt(timing, 10)).toBeGreaterThan(1000);

    const log = await getChaosLog(page) as ChaosEvent[];
    expect(log.some((e) => e.type === 'network:latency' && e.applied)).toBe(true);
  });

  it('camelCase mobileThreeG resolves to the same preset', async () => {
    await injectChaos(page, { presets: ['mobileThreeG'], seed: 1234 });
    await page.goto(BASE_URL);
    expect(await makeRequest(page)).toBe('Success!');

    const log = await getChaosLog(page) as ChaosEvent[];
    expect(log.some((e) => e.type === 'network:latency')).toBe(true);
  });
});
