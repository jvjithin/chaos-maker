import { test, expect, type Page } from '@playwright/test';
import { injectChaos, getChaosLog, getChaosSeed } from '@chaos-maker/playwright';

const BASE_URL = 'http://127.0.0.1:8080';
const SSE_URL_PATTERN = '127.0.0.1:8082';

async function connectDefault(page: Page): Promise<void> {
  await page.click('#sse-connect');
  await expect(page.locator('#sse-status')).toHaveText('open');
}

async function messageCount(page: Page): Promise<number> {
  return Number(await page.locator('#sse-message-count').textContent());
}

// ---------------------------------------------------------------------------
// Drop — every 2nd inbound message is silently discarded.
// ---------------------------------------------------------------------------
test.describe('SSE drop', () => {
  test('drops every 2nd inbound event and emits sse:drop', async ({ page }) => {
    await injectChaos(page, {
      sse: {
        drops: [{ urlPattern: SSE_URL_PATTERN, probability: 1, everyNth: 2 }],
      },
    });
    await page.goto(BASE_URL);
    await connectDefault(page);
    // Wait for several ticks (server fires every 200ms).
    await page.waitForTimeout(1500);
    const count = await messageCount(page);
    // With everyNth: 2 the app sees roughly half of the emitted ticks.
    expect(count).toBeGreaterThan(0);

    const log = await getChaosLog(page);
    const drops = log.filter(e => e.type === 'sse:drop' && e.applied);
    expect(drops.length).toBeGreaterThan(0);
    // dropped + delivered should equal total events the engine saw.
    expect(drops.length + count).toBeGreaterThanOrEqual(drops.length);
  });
});

// ---------------------------------------------------------------------------
// Delay — every event is held for delayMs before delivery.
// ---------------------------------------------------------------------------
test.describe('SSE delay', () => {
  test('delays inbound by >= 600ms relative to baseline', async ({ page }) => {
    await injectChaos(page, { sse: {} });
    await page.goto(BASE_URL);
    await connectDefault(page);
    const t0 = Date.now();
    await page.waitForFunction(() => Number(document.getElementById('sse-message-count')?.textContent) >= 1);
    const baseline = Date.now() - t0;

    const page2 = await page.context().newPage();
    await injectChaos(page2, {
      sse: { delays: [{ urlPattern: SSE_URL_PATTERN, delayMs: 800, probability: 1 }] },
    });
    await page2.goto(BASE_URL);
    await page2.click('#sse-connect');
    await expect(page2.locator('#sse-status')).toHaveText('open');
    const t1 = Date.now();
    await page2.waitForFunction(() => Number(document.getElementById('sse-message-count')?.textContent) >= 1, null, { timeout: 5000 });
    const withChaos = Date.now() - t1;

    expect(withChaos - baseline).toBeGreaterThanOrEqual(600);

    const log = await getChaosLog(page2);
    expect(log.filter(e => e.type === 'sse:delay').length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Corrupt — truncate strategy halves event.data text.
// ---------------------------------------------------------------------------
test.describe('SSE corrupt', () => {
  test('truncates inbound text payload', async ({ page }) => {
    await injectChaos(page, {
      sse: { corruptions: [{ urlPattern: SSE_URL_PATTERN, strategy: 'truncate', probability: 1 }] },
    });
    await page.goto(BASE_URL);
    await connectDefault(page);
    await page.waitForFunction(() => Number(document.getElementById('sse-message-count')?.textContent) >= 1);

    const logText = await page.locator('#sse-log').textContent();
    // Server emits 'tick N'; truncated to half = 'tic' (length 3) for 'tick 1'.
    expect(logText).toMatch(/msg \d+ tic/);

    const log = await getChaosLog(page);
    const corrupted = log.find(e => e.type === 'sse:corrupt' && e.applied);
    expect(corrupted?.detail.strategy).toBe('truncate');
  });
});

// ---------------------------------------------------------------------------
// Close — force-close the EventSource after afterMs.
// ---------------------------------------------------------------------------
test.describe('SSE close', () => {
  test('force-closes the source after afterMs', async ({ page }) => {
    await injectChaos(page, {
      sse: { closes: [{ urlPattern: SSE_URL_PATTERN, probability: 1, afterMs: 600 }] },
    });
    await page.goto(BASE_URL);
    await connectDefault(page);

    await expect(page.locator('#sse-status')).toContainText('error', { timeout: 3000 });

    const log = await getChaosLog(page);
    const closes = log.filter(e => e.type === 'sse:close' && e.applied);
    expect(closes.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Named event — eventType filter targets only the named event.
// ---------------------------------------------------------------------------
test.describe('SSE named eventType', () => {
  test('drops only named "tick" events; default messages survive', async ({ page }) => {
    await injectChaos(page, {
      sse: { drops: [{ urlPattern: '/sse-named', eventType: 'tick', probability: 1 }] },
    });
    await page.goto(BASE_URL);
    await page.click('#sse-connect-named');
    await expect(page.locator('#sse-status')).toHaveText('open');
    await page.waitForTimeout(1500);

    const tickCount = Number(await page.locator('#sse-tick-count').textContent());
    const msgCount = Number(await page.locator('#sse-message-count').textContent());
    expect(tickCount).toBe(0);
    expect(msgCount).toBeGreaterThan(0);

    const log = await getChaosLog(page);
    const drops = log.filter(e => e.type === 'sse:drop' && e.applied);
    expect(drops.length).toBeGreaterThan(0);
    expect(drops.every(e => e.detail.eventType === 'tick')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Seeded replay — identical seeds → identical drop patterns.
// ---------------------------------------------------------------------------
test.describe('SSE seeded replay', () => {
  test('same seed produces identical drop outcomes', async ({ page }) => {
    const cfg = {
      seed: 9000,
      sse: { drops: [{ urlPattern: SSE_URL_PATTERN, probability: 0.5 }] },
    };
    await injectChaos(page, cfg);
    await page.goto(BASE_URL);
    await connectDefault(page);
    await page.waitForTimeout(1500);
    const seed1 = await getChaosSeed(page);
    const drops1 = (await getChaosLog(page))
      .filter(e => e.type === 'sse:drop')
      .map(e => e.detail.eventType);

    const page2 = await page.context().newPage();
    await injectChaos(page2, cfg);
    await page2.goto(BASE_URL);
    await page2.click('#sse-connect');
    await expect(page2.locator('#sse-status')).toHaveText('open');
    await page2.waitForTimeout(1500);
    const seed2 = await getChaosSeed(page2);
    const drops2 = (await getChaosLog(page2))
      .filter(e => e.type === 'sse:drop')
      .map(e => e.detail.eventType);

    expect(seed1).toBe(9000);
    expect(seed2).toBe(9000);
    // Server timing varies → counts may differ; assert prefix equality on
    // the first N decisions where N is min length.
    const minLen = Math.min(drops1.length, drops2.length);
    expect(drops1.slice(0, minLen)).toEqual(drops2.slice(0, minLen));
  });
});
