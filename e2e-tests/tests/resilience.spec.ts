import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:8080';

test('fetches and displays data without chaos', async ({ page }) => {
  await page.goto(BASE_URL);
  await page.click('#fetch-data');
  await expect(page.locator('#status')).toHaveText('Success!');
  await expect(page.locator('#result')).toContainText('"userId": 1');
});

test('XHR fetches data without chaos', async ({ page }) => {
  await page.goto(BASE_URL);
  await page.click('#xhr-get');
  await expect(page.locator('#xhr-status')).toHaveText('Success!');
  await expect(page.locator('#xhr-result')).toContainText('"userId": 1');
});
