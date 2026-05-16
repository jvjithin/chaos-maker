import { test as baseTest, expect } from '@playwright/test';
import { test, expect as fixtureExpect } from '@chaos-maker/playwright/fixture';
import { injectChaos, removeChaos } from '@chaos-maker/playwright';

const BASE_URL = 'http://127.0.0.1:8080';
const API_PATTERN = '/api/data.json';

// ---------------------------------------------------------------------------
// Direct API: try / finally cleans up even when the test body throws.
// Playwright `addInitScript` registrations persist on a reused `Page`, so the
// assertion checks the in-page engine and a fresh page in the same context
// rather than reloading the original page.
// ---------------------------------------------------------------------------
baseTest('try/finally completes removeChaos when the body throws after injectChaos', async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    let caught: Error | undefined;
    try {
      try {
        await injectChaos(page, {
          network: { failures: [{ urlPattern: API_PATTERN, statusCode: 503, probability: 1.0 }] },
        });
        await page.goto(BASE_URL);
        await page.click('#fetch-data');
        await expect(page.locator('#status')).toHaveText('Error!');
        throw new Error('simulated body failure');
      } finally {
        await removeChaos(page);
      }
    } catch (e) {
      caught = e as Error;
    }
    expect(caught?.message).toBe('simulated body failure');

    // removeChaos ran end-to-end even though the body threw.
    const stillActive = await page.evaluate(() => {
      const w = window as unknown as { chaosUtils?: { instance: unknown } };
      return Boolean(w.chaosUtils && w.chaosUtils.instance);
    });
    expect(stillActive).toBe(false);
  } finally {
    await context.close();
  }
});

// ---------------------------------------------------------------------------
// Fixture: auto-cleanup tolerates a thrown test body and leaves the next
// test with a pristine page. `test.fail` marks the throwing case as expected.
// ---------------------------------------------------------------------------
test.describe.serial('fixture auto-cleanup is resilient to thrown bodies', () => {
  test.fail('chaos.inject + thrown body does not break the fixture', async ({ page, chaos }) => {
    await chaos.inject({
      network: { failures: [{ urlPattern: API_PATTERN, statusCode: 503, probability: 1.0 }] },
    });
    await page.goto(BASE_URL);
    await page.click('#fetch-data');
    await fixtureExpect(page.locator('#status')).toHaveText('Error!');
    throw new Error('intentional failure to exercise fixture cleanup');
  });

  test('the next test on a fresh page sees no chaos leakage', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.click('#fetch-data');
    await fixtureExpect(page.locator('#status')).toHaveText('Success!');
  });
});
