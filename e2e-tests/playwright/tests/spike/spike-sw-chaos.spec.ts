// SPIKE — Service Worker chaos feasibility.
//
// Pivoted approach (after PW context.route fails to intercept SW script
// registration on chromium): bake the chaos shim into a dedicated SW script
// (`/sw-app/sw-chaos.js`) and pass chaos config via URL search param at
// register time. This proves the in-SW interception mechanism works; the
// production injection mechanism (importScripts vs build-time plugin vs
// runtime route) is captured in SPIKE_NOTES_sw_chaos.md.
//
// Goal: a fetch issued from inside a Service Worker is intercepted by chaos
// and returned as a synthetic 503; the chaos event is bridged back to the
// page via postMessage.

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:8080';
const SW_APP_URL = `${BASE_URL}/sw-app/`;

const CHAOS_CONFIG = {
  network: {
    failures: [
      { urlPattern: '/api/data.json', statusCode: 503, probability: 1.0, body: '{"chaos":true}' },
    ],
  },
};

async function ensureCleanSW(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return;
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(r => r.unregister()));
    if ('caches' in self) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  }).catch(() => { /* page may not have SW API */ });
}

test.describe('SPIKE: Service Worker chaos via baked-in shim', () => {
  test.afterEach(async ({ page }) => {
    await ensureCleanSW(page);
  });

  test('SW-originated fetch is intercepted with synthetic 503', async ({ page, browserName }) => {
    await page.goto(SW_APP_URL);
    await ensureCleanSW(page);
    await page.reload();

    await page.evaluate(async (cfg) => {
      await (window as any).__registerChaosSW(cfg);
    }, CHAOS_CONFIG);
    await expect(page.locator('#sw-state')).toHaveText('ready', { timeout: 10_000 });

    await page.click('#sw-fetch');

    await expect(page.locator('#sw-fetch-status')).toHaveText('503', { timeout: 5_000 });
    await expect(page.locator('#sw-fetch-result')).toContainText('chaos');

    const events = await page.evaluate(() => (window as any).__SW_CHAOS_EVENTS__ || []);
    const failureEvents = events.filter((e: any) => e.type === 'network:failure' && e.applied);
    expect(failureEvents.length, `browser=${browserName}, events=${JSON.stringify(events)}`).toBeGreaterThanOrEqual(1);
    expect(failureEvents[0].context).toBe('service-worker');
  });

  test('SW-originated fetch latency is delayed', async ({ page }) => {
    await page.goto(SW_APP_URL);
    await ensureCleanSW(page);
    await page.reload();

    const latencyConfig = {
      network: {
        latencies: [{ urlPattern: '/api/data.json', delayMs: 1000, probability: 1.0 }],
      },
    };

    await page.evaluate(async (cfg) => {
      await (window as any).__registerChaosSW(cfg);
    }, latencyConfig);
    await expect(page.locator('#sw-state')).toHaveText('ready', { timeout: 10_000 });

    const start = Date.now();
    await page.click('#sw-fetch');
    await expect(page.locator('#sw-fetch-status')).toHaveText('200', { timeout: 5_000 });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(900);

    const events = await page.evaluate(() => (window as any).__SW_CHAOS_EVENTS__ || []);
    expect(events.some((e: any) => e.type === 'network:latency' && e.applied)).toBe(true);
  });
});
