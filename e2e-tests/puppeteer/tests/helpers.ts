import puppeteer, { type Browser, type Page } from 'puppeteer';

export const BASE_URL = 'http://127.0.0.1:8080';
export const API_PATTERN = '/api/data.json';
export const WS_URL_PATTERN = '127.0.0.1:8081';

export async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
}

export async function getText(page: Page, selector: string): Promise<string> {
  return page.$eval(selector, (el) => el.textContent ?? '');
}

export async function waitForText(
  page: Page,
  selector: string,
  text: string,
  timeout = 10_000,
): Promise<void> {
  await page.waitForFunction(
    (sel: string, t: string) => {
      const el = document.querySelector(sel);
      return el?.textContent === t;
    },
    { timeout },
    selector,
    text,
  );
}

export async function waitForNotText(
  page: Page,
  selector: string,
  text: string,
  timeout = 10_000,
): Promise<void> {
  await page.waitForFunction(
    (sel: string, t: string) => {
      const el = document.querySelector(sel);
      return el !== null && el.textContent !== t;
    },
    { timeout },
    selector,
    text,
  );
}

/** Click a fetch/XHR button and wait for the status to leave Loading state. */
export async function makeRequest(
  page: Page,
  buttonSelector = '#fetch-data',
  statusSelector = '#status',
): Promise<string> {
  await page.click(buttonSelector);
  await waitForNotText(page, statusSelector, 'Loading...');
  return getText(page, statusSelector);
}
