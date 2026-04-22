import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Browser, Page } from 'puppeteer';
import { injectChaos } from '@chaos-maker/puppeteer';
import { launchBrowser, BASE_URL, API_PATTERN, makeRequest } from './helpers';

let browser: Browser;
let page: Page;

beforeAll(async () => { browser = await launchBrowser(); });
afterAll(async () => { await browser.close(); });

beforeEach(async () => { page = await browser.newPage(); });
afterEach(async () => { await page.close(); });

describe('onNth counting', () => {
  it('fetch: fails only on the 3rd request', async () => {
    await injectChaos(page, {
      network: {
        failures: [{ urlPattern: API_PATTERN, statusCode: 503, probability: 1.0, onNth: 3 }],
      },
    });
    await page.goto(BASE_URL);

    const r1 = await makeRequest(page);
    const r2 = await makeRequest(page);
    const r3 = await makeRequest(page);
    const r4 = await makeRequest(page);

    expect(r1).toBe('Success!');
    expect(r2).toBe('Success!');
    expect(r3).toBe('Error!');
    expect(r4).toBe('Success!');
  });

  it('XHR: fails only on the 2nd request', async () => {
    await injectChaos(page, {
      network: {
        failures: [{ urlPattern: API_PATTERN, statusCode: 503, probability: 1.0, onNth: 2 }],
      },
    });
    await page.goto(BASE_URL);

    const r1 = await makeRequest(page, '#xhr-get', '#xhr-status');
    const r2 = await makeRequest(page, '#xhr-get', '#xhr-status');
    const r3 = await makeRequest(page, '#xhr-get', '#xhr-status');

    expect(r1).toBe('Success!');
    expect(r2).toBe('Error!');
    expect(r3).toBe('Success!');
  });
});

describe('everyNth counting', () => {
  it('fetch: fails on every 2nd request', async () => {
    await injectChaos(page, {
      network: {
        failures: [{ urlPattern: API_PATTERN, statusCode: 503, probability: 1.0, everyNth: 2 }],
      },
    });
    await page.goto(BASE_URL);

    const results: string[] = [];
    for (let i = 0; i < 6; i++) {
      results.push(await makeRequest(page) as string);
    }

    expect(results[0]).toBe('Success!');
    expect(results[1]).toBe('Error!');
    expect(results[2]).toBe('Success!');
    expect(results[3]).toBe('Error!');
    expect(results[4]).toBe('Success!');
    expect(results[5]).toBe('Error!');
  });
});

describe('afterN counting', () => {
  it('fetch: first 2 succeed, all subsequent fail', async () => {
    await injectChaos(page, {
      network: {
        failures: [{ urlPattern: API_PATTERN, statusCode: 503, probability: 1.0, afterN: 2 }],
      },
    });
    await page.goto(BASE_URL);

    const results: string[] = [];
    for (let i = 0; i < 5; i++) {
      results.push(await makeRequest(page) as string);
    }

    expect(results[0]).toBe('Success!');
    expect(results[1]).toBe('Success!');
    expect(results[2]).toBe('Error!');
    expect(results[3]).toBe('Error!');
    expect(results[4]).toBe('Error!');
  });
});
