import { test, expect } from '@playwright/test';
import { injectChaos, getChaosLog } from '@chaos-maker/playwright';
import type { ChaosConfig } from '@chaos-maker/playwright';

const BASE_URL = 'http://127.0.0.1:8080';

test('should fetch and display data successfully', async ({ page }) => {
  await page.goto(BASE_URL);
  await page.click('#fetch-data');
  await expect(page.locator('#status')).toHaveText('Success!');
  await expect(page.locator('#result')).toContainText('"userId": 1');
});

test('should display an error message when the API fails', async ({ page }) => {
  const config: ChaosConfig = {
    network: {
      failures: [{
        urlPattern: 'jsonplaceholder.typicode.com/todos/1',
        statusCode: 503,
        probability: 1.0,
      }],
    },
  };

  await injectChaos(page, config);

  await page.goto(BASE_URL);
  await page.click('#fetch-data');

  await expect(page.locator('#status')).toHaveText('Error!');
  await expect(page.locator('#result')).toContainText('Failed to fetch data: API Error: 503');

  const log = await getChaosLog(page);
  expect(log.length).toBeGreaterThan(0);
  expect(log.some(e => e.type === 'network:failure' && e.applied)).toBe(true);
});
