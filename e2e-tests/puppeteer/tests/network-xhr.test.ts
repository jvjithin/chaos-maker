import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Browser, Page } from 'puppeteer';
import { injectChaos, getChaosLog } from '@chaos-maker/puppeteer';
import type { ChaosEvent } from '@chaos-maker/core';
import { launchBrowser, BASE_URL, API_PATTERN, makeRequest } from './helpers';

let browser: Browser;
let page: Page;

beforeAll(async () => { browser = await launchBrowser(); });
afterAll(async () => { await browser.close(); });

beforeEach(async () => { page = await browser.newPage(); });
afterEach(async () => { await page.close(); });

describe('Network failures (XHR)', () => {
  it('injects 500 failure on XHR GET', async () => {
    await injectChaos(page, {
      network: { failures: [{ urlPattern: API_PATTERN, statusCode: 500, probability: 1.0 }] },
    });
    await page.goto(BASE_URL);
    expect(await makeRequest(page, '#xhr-get', '#xhr-status')).toBe('Error!');

    const log = await getChaosLog(page) as ChaosEvent[];
    expect(log.some((e) => e.type === 'network:failure' && e.applied)).toBe(true);
  });

  it('aborts XHR request', async () => {
    await injectChaos(page, {
      network: { aborts: [{ urlPattern: API_PATTERN, probability: 1.0 }] },
    });
    await page.goto(BASE_URL);
    const status = await makeRequest(page, '#xhr-get', '#xhr-status');
    expect(['Error!', 'Aborted!']).toContain(status);
  });

  it('CORS failure on XHR', async () => {
    await injectChaos(page, {
      network: { cors: [{ urlPattern: API_PATTERN, probability: 1.0 }] },
    });
    await page.goto(BASE_URL);
    const status = await makeRequest(page, '#xhr-get', '#xhr-status');
    expect(status).toBe('Error!');

    const log = await getChaosLog(page) as ChaosEvent[];
    expect(log.some((e) => e.type === 'network:cors' && e.applied)).toBe(true);
  });

  it('passes through when probability is 0', async () => {
    await injectChaos(page, {
      network: { failures: [{ urlPattern: API_PATTERN, statusCode: 500, probability: 0 }] },
    });
    await page.goto(BASE_URL);
    expect(await makeRequest(page, '#xhr-get', '#xhr-status')).toBe('Success!');
  });

  it('XHR and fetch share the chaos config', async () => {
    await injectChaos(page, {
      network: { failures: [{ urlPattern: API_PATTERN, statusCode: 503, probability: 1.0 }] },
    });
    await page.goto(BASE_URL);
    expect(await makeRequest(page, '#fetch-data', '#status')).toBe('Error!');
    expect(await makeRequest(page, '#xhr-get', '#xhr-status')).toBe('Error!');
  });
});
