import { test, expect } from '@playwright/test';
import type { ChaosConfig } from '../../packages/core/src/config';
import * as fs from 'fs';
import * as path from 'path';

// Define the base URL from our playwright.config.ts
const BASE_URL = 'http://127.0.0.1:8080';

// Test 1: The "Happy Path" - (This test remains unchanged)
test('should fetch and display data successfully', async ({ page }) => {
  await page.goto(BASE_URL);
  await page.click('#fetch-data');
  await expect(page.locator('#status')).toHaveText('Success!');
  await expect(page.locator('#result')).toContainText('"userId": 1');
});

// Test 2: The "Chaos Path" - (This is the updated test)
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

  // 1. Read the content of the built library file into a string.
  //    The path is relative to the test file's location.
  const scriptPath = path.resolve(__dirname, '../../packages/extension/dist/chaos-maker.umd.js');
  const scriptContent = fs.readFileSync(scriptPath, 'utf-8');

  // 2. Use a SINGLE addInitScript call to perform all setup atomically.
  await page.addInitScript((args) => {
    // This code runs in the browser before any other scripts on the page.
    
    // a. Set the config object on the window
    (window as any).__CHAOS_CONFIG__ = args.config;
    
    // b. Use eval() to execute the script content synchronously.
    // This guarantees it runs and patches 'fetch' before the app's code.
    eval(args.scriptContent);

  }, { config: apiFailureConfig, scriptContent: scriptContent });


  // 3. Run the test
  await page.goto(BASE_URL);
  await page.click('#fetch-data');

  // 4. Assert the resilient behavior
  await expect(page.locator('#status')).toHaveText('Error!');
  await expect(page.locator('#result')).toContainText('Failed to fetch data: API Error: 503');
});