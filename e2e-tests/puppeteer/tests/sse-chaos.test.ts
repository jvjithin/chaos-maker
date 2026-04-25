import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import type { Browser, Page } from 'puppeteer';
import { injectChaos, getChaosLog } from '@chaos-maker/puppeteer';
import type { ChaosEvent } from '@chaos-maker/core';
import { launchBrowser, BASE_URL, waitForText } from './helpers';

const SSE_URL_PATTERN = '127.0.0.1:8082';

let browser: Browser;
let page: Page;

beforeAll(async () => { browser = await launchBrowser(); });
afterAll(async () => { await browser.close(); });

beforeEach(async () => { page = await browser.newPage(); });
afterEach(async () => { await page.close(); });

async function connectDefault(p: Page): Promise<void> {
  await p.click('#sse-connect');
  await waitForText(p, '#sse-status', 'open');
}

async function connectNamed(p: Page): Promise<void> {
  await p.click('#sse-connect-named');
  await waitForText(p, '#sse-status', 'open');
}

async function messageCount(p: Page): Promise<number> {
  return p.$eval('#sse-message-count', (el) => Number(el.textContent));
}

async function tickCount(p: Page): Promise<number> {
  return p.$eval('#sse-tick-count', (el) => Number(el.textContent));
}

describe('SSE drop', () => {
  it('drops every 2nd inbound event', async () => {
    await injectChaos(page, {
      sse: { drops: [{ urlPattern: SSE_URL_PATTERN, probability: 1, everyNth: 2 }] },
    });
    await page.goto(BASE_URL);
    await connectDefault(page);

    await new Promise((r) => setTimeout(r, 1500));
    expect(await messageCount(page)).toBeGreaterThan(0);

    const log = (await getChaosLog(page)) as ChaosEvent[];
    const drops = log.filter((e) => e.type === 'sse:drop' && e.applied);
    expect(drops.length).toBeGreaterThan(0);
  });
});

describe('SSE delay', () => {
  it('delays inbound messages by >= 600ms relative to baseline', async () => {
    await injectChaos(page, { sse: {} });
    await page.goto(BASE_URL);
    await connectDefault(page);
    const t0 = Date.now();
    await page.waitForFunction(
      () => Number(document.getElementById('sse-message-count')?.textContent) >= 1,
    );
    const baseline = Date.now() - t0;

    const page2 = await browser.newPage();
    await injectChaos(page2, {
      sse: { delays: [{ urlPattern: SSE_URL_PATTERN, delayMs: 800, probability: 1 }] },
    });
    await page2.goto(BASE_URL);
    await page2.click('#sse-connect');
    await waitForText(page2, '#sse-status', 'open');
    const t1 = Date.now();
    await page2.waitForFunction(
      () => Number(document.getElementById('sse-message-count')?.textContent) >= 1,
      { timeout: 10_000 },
    );
    const withChaos = Date.now() - t1;
    await page2.close();

    expect(withChaos - baseline).toBeGreaterThanOrEqual(600);
  });
});

describe('SSE corrupt', () => {
  it('truncates inbound text payload', async () => {
    await injectChaos(page, {
      sse: { corruptions: [{ urlPattern: SSE_URL_PATTERN, strategy: 'truncate', probability: 1 }] },
    });
    await page.goto(BASE_URL);
    await connectDefault(page);
    await page.waitForFunction(
      () => Number(document.getElementById('sse-message-count')?.textContent) >= 1,
      { timeout: 5_000 },
    );
    const logText = await page.$eval('#sse-log', (el) => el.textContent ?? '');
    expect(logText).toMatch(/tic/);

    const log = (await getChaosLog(page)) as ChaosEvent[];
    const corrupted = log.find((e) => e.type === 'sse:corrupt' && e.applied);
    expect(corrupted?.detail.strategy).toBe('truncate');
  });
});

describe('SSE close', () => {
  it('force-closes the source after afterMs', async () => {
    await injectChaos(page, {
      sse: { closes: [{ urlPattern: SSE_URL_PATTERN, probability: 1, afterMs: 600 }] },
    });
    await page.goto(BASE_URL);
    await connectDefault(page);

    await page.waitForFunction(
      () => document.getElementById('sse-status')?.textContent?.includes('error'),
      { timeout: 5_000 },
    );

    const log = (await getChaosLog(page)) as ChaosEvent[];
    const closes = log.filter((e) => e.type === 'sse:close' && e.applied);
    expect(closes.length).toBe(1);
  });
});

describe('SSE named eventType', () => {
  it('drops only named "tick" events; default messages survive', async () => {
    await injectChaos(page, {
      sse: { drops: [{ urlPattern: '/sse-named', eventType: 'tick', probability: 1 }] },
    });
    await page.goto(BASE_URL);
    await connectNamed(page);

    await new Promise((r) => setTimeout(r, 1500));
    expect(await tickCount(page)).toBe(0);
    expect(await messageCount(page)).toBeGreaterThan(0);

    const log = (await getChaosLog(page)) as ChaosEvent[];
    const drops = log.filter((e) => e.type === 'sse:drop' && e.applied);
    expect(drops.length).toBeGreaterThan(0);
    expect(drops.every((e) => e.detail.eventType === 'tick')).toBe(true);
  });
});
