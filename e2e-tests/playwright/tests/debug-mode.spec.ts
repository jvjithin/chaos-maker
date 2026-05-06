import { test, expect } from '@playwright/test';
import { injectChaos, getChaosLog } from '@chaos-maker/playwright';

const BASE_URL = 'http://127.0.0.1:8080';
const API_PATTERN = '/api/data.json';

test.describe('Debug Mode (RFC-002)', () => {
  test('mirrors a [Chaos] line to console.debug when debug:true', async ({ page }) => {
    const debugLines: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'debug' && msg.text().startsWith('[Chaos] ')) {
        debugLines.push(msg.text());
      }
    });

    await injectChaos(page, {
      debug: true,
      network: {
        failures: [{ urlPattern: API_PATTERN, statusCode: 503, probability: 1 }],
      },
    });
    await page.goto(BASE_URL);
    await page.click('#fetch-data');
    await expect(page.locator('#result')).toContainText('503');

    expect(debugLines.length).toBeGreaterThan(0);
    expect(debugLines.some((l) => l.startsWith('[Chaos] rule-applied'))).toBe(true);
  });

  test('emits structured rule-applied debug event with ruleType + ruleId', async ({ page }) => {
    await injectChaos(page, {
      debug: true,
      network: {
        failures: [{ urlPattern: API_PATTERN, statusCode: 503, probability: 1 }],
      },
    });
    await page.goto(BASE_URL);
    await page.click('#fetch-data');
    await expect(page.locator('#result')).toContainText('503');

    const log = await getChaosLog(page);
    const applied = log.find(
      (e) => e.type === 'debug' && e.detail.stage === 'rule-applied',
    );
    expect(applied).toBeDefined();
    expect(applied?.detail.ruleType).toBe('failure');
    expect(applied?.detail.ruleId).toBe('failure#0');
  });

  test('emits no debug events when debug is omitted', async ({ page }) => {
    const debugLines: string[] = [];
    page.on('console', (msg) => {
      if (msg.text().startsWith('[Chaos] ')) debugLines.push(msg.text());
    });

    await injectChaos(page, {
      network: {
        failures: [{ urlPattern: API_PATTERN, statusCode: 503, probability: 1 }],
      },
    });
    await page.goto(BASE_URL);
    await page.click('#fetch-data');
    await expect(page.locator('#result')).toContainText('503');

    const log = await getChaosLog(page);
    expect(log.some((e) => e.type === 'debug')).toBe(false);
    expect(debugLines).toHaveLength(0);
  });
});
