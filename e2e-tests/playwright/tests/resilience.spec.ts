import { test, expect } from '@playwright/test';
import type { ChaosConfig } from '../../../packages/core/src/config';
import { injectChaos } from '@chaos-maker/playwright';

const BASE_URL = 'http://127.0.0.1:8080';

test('should fetch and display data successfully', async ({ page }) => {
  await page.goto(BASE_URL);
  await page.click('#fetch-data');
  await expect(page.locator('#status')).toHaveText('Success!');
  await expect(page.locator('#result')).toContainText('"userId": 1');
});

test('should display an error message when the API fails', async ({ page }) => {
  
  const apiFailureConfig: ChaosConfig = {
    network: {
      failures: [{
        urlPattern: 'jsonplaceholder.typicode.com/todos/1',
        statusCode: 503,
        probability: 1.0,
      }],
    },
  };

  // 1. Inject chaos using the simple, plug-and-play function!
  await injectChaos(page, apiFailureConfig);
  
  // 2. Run the test
  await page.goto(BASE_URL);
  await page.click('#fetch-data');

  // 3. Assert the resilient behavior
  await expect(page.locator('#status')).toHaveText('Error!');
  await expect(page.locator('#result')).toContainText('Failed to fetch data: API Error: 503');
});