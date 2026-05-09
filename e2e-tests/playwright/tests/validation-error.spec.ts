import { test, expect } from '@playwright/test';
import { injectChaos, ChaosConfigError } from '@chaos-maker/playwright';

test.describe('RFC-004 validation surface', () => {
  test('malformed config throws ChaosConfigError synchronously from Node', async ({ page }) => {
    let caught: unknown;
    try {
      await injectChaos(page, {
        network: {
          failures: [
            { urlPattern: '/api', statusCode: 999, probability: 2 },
          ],
        },
      } as Parameters<typeof injectChaos>[1]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ChaosConfigError);
    const issues = (caught as ChaosConfigError).issues;
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => i.ruleType === 'network.failure' && i.code === 'value_too_large')).toBe(true);
  });

  test('valid config passes validation and applies in-page', async ({ page }) => {
    await injectChaos(page, {
      network: {
        failures: [
          { urlPattern: '/api/data.json', statusCode: 503, probability: 1.0 },
        ],
      },
    });
    await page.goto('http://127.0.0.1:8080');
    await page.click('#fetch-data');
    await expect(page.locator('#status')).toHaveText('Error!');
  });
});
