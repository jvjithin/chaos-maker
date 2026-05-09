import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
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

describe('Debug Mode', () => {
  it('mirrors a [Chaos] line to console.debug when debug:true', async () => {
    const debugLines: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'debug' && msg.text().startsWith('[Chaos] ')) {
        debugLines.push(msg.text());
      }
    });

    await injectChaos(page, {
      debug: true,
      network: { failures: [{ urlPattern: API_PATTERN, statusCode: 503, probability: 1.0 }] },
    });
    await page.goto(BASE_URL);
    expect(await makeRequest(page)).toBe('Error!');
    const result = await getText(page, '#result');
    expect(result).toContain('503');

    expect(debugLines.length).toBeGreaterThan(0);
    expect(debugLines.some((l) => l.startsWith('[Chaos] rule-applied'))).toBe(true);
  });

  it('emits structured rule-applied debug event with ruleType + ruleId', async () => {
    await injectChaos(page, {
      debug: true,
      network: { failures: [{ urlPattern: API_PATTERN, statusCode: 503, probability: 1.0 }] },
    });
    await page.goto(BASE_URL);
    expect(await makeRequest(page)).toBe('Error!');

    const log = await getChaosLog(page) as ChaosEvent[];
    const applied = log.find((e) => e.type === 'debug' && e.detail.stage === 'rule-applied');
    expect(applied).toBeDefined();
    expect(applied?.detail.ruleType).toBe('failure');
    expect(applied?.detail.ruleId).toBe('failure#0');
  });

  it('emits no debug events when debug is omitted', async () => {
    const debugLines: string[] = [];
    page.on('console', (msg) => {
      if (msg.text().startsWith('[Chaos] ')) debugLines.push(msg.text());
    });

    await injectChaos(page, {
      network: { failures: [{ urlPattern: API_PATTERN, statusCode: 503, probability: 1.0 }] },
    });
    await page.goto(BASE_URL);
    expect(await makeRequest(page)).toBe('Error!');

    const log = await getChaosLog(page) as ChaosEvent[];
    expect(log.some((e) => e.type === 'debug')).toBe(false);
    expect(debugLines).toHaveLength(0);
  });
});
