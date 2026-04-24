import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import type { Browser, Page } from 'puppeteer';
import { injectSWChaos, removeSWChaos, getSWChaosLog } from '@chaos-maker/puppeteer';
import { launchBrowser, BASE_URL } from './helpers';

const SW_URL = `${BASE_URL}/sw-app/`;

let browser: Browser;
let page: Page;

beforeAll(async () => { browser = await launchBrowser(); });
afterAll(async () => { await browser.close(); });

beforeEach(async () => { page = await browser.newPage(); });
afterEach(async () => {
  await removeSWChaos(page).catch(() => undefined);
  await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) await r.unregister();
  }).catch(() => undefined);
  await page.close();
});

async function registerClassicSW(): Promise<void> {
  await page.goto(SW_URL);
  await page.evaluate(async () => {
    const fn = (globalThis as unknown as { __registerClassicSW?: () => Promise<unknown> })
      .__registerClassicSW;
    if (!fn) throw new Error('__registerClassicSW missing');
    await fn();
  });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 10_000 });
}

describe('Puppeteer SW chaos', () => {
  it('injects 503 for SW-fetched /sw-api/* requests', async () => {
    await registerClassicSW();
    const { seed } = await injectSWChaos(page, {
      network: { failures: [{ urlPattern: '/api/data.json', statusCode: 503, probability: 1 }] },
      seed: 1,
    });
    expect(seed).toBe(1);

    await page.click('#sw-fetch');
    await page.waitForFunction(
      () => document.getElementById('sw-fetch-status')?.textContent === '503',
      { timeout: 5_000 },
    );

    const log = await getSWChaosLog(page);
    expect(log.some((e) => e.type === 'network:failure' && e.applied)).toBe(true);
  });

  it('removeSWChaos restores normal responses', async () => {
    await registerClassicSW();
    await injectSWChaos(page, {
      network: { failures: [{ urlPattern: '/api/data.json', statusCode: 503, probability: 1 }] },
      seed: 2,
    });
    await page.click('#sw-fetch');
    await page.waitForFunction(
      () => document.getElementById('sw-fetch-status')?.textContent === '503',
      { timeout: 5_000 },
    );

    await removeSWChaos(page);
    await page.evaluate(() => {
      document.getElementById('sw-fetch-status')!.textContent = '';
    });
    await page.click('#sw-fetch');
    await page.waitForFunction(
      () => document.getElementById('sw-fetch-status')?.textContent === '200',
      { timeout: 5_000 },
    );
    const status = await page.$eval('#sw-fetch-status', (el) => el.textContent);
    expect(status).toBe('200');
  });
});
