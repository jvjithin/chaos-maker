import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Browser, Page } from 'puppeteer';
import { launchBrowser, BASE_URL, makeRequest, waitForText } from './helpers';

let browser: Browser;
let page: Page;

beforeAll(async () => { browser = await launchBrowser(); });
afterAll(async () => { await browser.close(); });

beforeEach(async () => { page = await browser.newPage(); });
afterEach(async () => { await page.close(); });

describe('Resilience baseline', () => {
  it('fixture loads and fetch returns Success without chaos', async () => {
    await page.goto(BASE_URL);
    const status = await makeRequest(page);
    expect(status).toBe('Success!');
  });

  it('WebSocket echo server responds without chaos', async () => {
    await page.goto(BASE_URL);
    await page.click('#ws-connect');
    await waitForText(page, '#ws-status', 'open');
    await page.click('#ws-send');
    await page.waitForFunction(
      () => Number(document.getElementById('ws-inbound-count')?.textContent) === 1,
      { timeout: 5_000 },
    );
    const count = await page.$eval('#ws-inbound-count', (el) => el.textContent);
    expect(count).toBe('1');
  });
});
