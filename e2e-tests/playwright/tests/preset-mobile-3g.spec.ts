import { test, expect } from '@playwright/test';
import { injectChaos, getChaosLog } from '@chaos-maker/playwright';

const BASE_URL = 'http://127.0.0.1:8080';

test.describe('Preset: mobile-3g', () => {
  test('declarative preset name resolves and applies network latency', async ({ page }) => {
    await injectChaos(page, { presets: ['mobile-3g'], seed: 1234 });
    await page.goto(BASE_URL);
    await page.click('#fetch-data');

    await expect(page.locator('#status')).toHaveText('Success!', { timeout: 10000 });
    const elapsed = parseInt((await page.locator('#timing').textContent()) ?? '0', 10);
    expect(elapsed).toBeGreaterThan(1000);

    const log = await getChaosLog(page);
    expect(log.some((e) => e.type === 'network:latency' && e.applied)).toBe(true);
  });

  test('camelCase mobileThreeG resolves to the same preset', async ({ page }) => {
    await injectChaos(page, { presets: ['mobileThreeG'], seed: 1234 });
    await page.goto(BASE_URL);
    await page.click('#fetch-data');

    await expect(page.locator('#status')).toHaveText('Success!', { timeout: 10000 });
    const log = await getChaosLog(page);
    expect(log.some((e) => e.type === 'network:latency')).toBe(true);
  });
});
