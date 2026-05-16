import { browser, $ } from '@wdio/globals';
import type { ChaosEvent } from '@chaos-maker/core';

async function registerClassicSW(): Promise<void> {
  await browser.url('/sw-app/');
  await browser.execute(async () => {
    const fn = (globalThis as unknown as { __registerClassicSW?: () => Promise<unknown> })
      .__registerClassicSW;
    if (!fn) throw new Error('__registerClassicSW missing');
    await fn();
  });
  await browser.waitUntil(
    async () =>
      browser.execute(() => !!navigator.serviceWorker.controller),
    { timeout: 10_000, timeoutMsg: 'SW controller never claimed page' },
  );
}

async function unregisterSW(): Promise<void> {
  try {
    await browser.execute(async () => {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) await r.unregister();
    });
  } catch {
    /* browser may be mid-navigation */
  }
}

describe('WDIO SW chaos', () => {
  afterEach(async () => {
    try { await browser.removeSWChaos(); } catch { /* no-op */ }
    await unregisterSW();
  });

  it('injects 503 for SW-fetched /sw-api/* requests', async () => {
    await registerClassicSW();
    const result = await browser.injectSWChaos({
      network: { failures: [{ urlPattern: '/api/data.json', statusCode: 503, probability: 1 }] },
      seed: 1,
    });
    expect(result.seed).toBe(1);

    await $('#sw-fetch').click();
    await expect($('#sw-fetch-status')).toHaveText('503');

    const log = (await browser.getSWChaosLog()) as ChaosEvent[];
    expect(log.some((e) => e.type === 'network:failure' && e.applied)).toBe(true);
  });

  it('removeSWChaos restores normal responses', async () => {
    await registerClassicSW();
    await browser.injectSWChaos({
      network: { failures: [{ urlPattern: '/api/data.json', statusCode: 503, probability: 1 }] },
      seed: 2,
    });
    await $('#sw-fetch').click();
    await expect($('#sw-fetch-status')).toHaveText('503');

    await browser.removeSWChaos();
    await browser.execute(() => {
      document.getElementById('sw-fetch-status')!.textContent = '';
    });
    await $('#sw-fetch').click();
    await expect($('#sw-fetch-status')).toHaveText('200');
  });

  it('stop then reinject works on a reused SW registration', async () => {
    await registerClassicSW();
    await browser.injectSWChaos({
      network: { failures: [{ urlPattern: '/api/data.json', statusCode: 503, probability: 1 }] },
      seed: 3,
    });
    await $('#sw-fetch').click();
    await expect($('#sw-fetch-status')).toHaveText('503');

    await browser.removeSWChaos();
    await browser.execute(() => {
      document.getElementById('sw-fetch-status')!.textContent = '';
    });
    await $('#sw-fetch').click();
    await expect($('#sw-fetch-status')).toHaveText('200');

    expect((await browser.getSWChaosLog()) as ChaosEvent[]).toEqual([]);
    expect((await browser.getSWChaosLogFromSW()) as ChaosEvent[]).toEqual([]);

    await browser.injectSWChaos({
      network: { failures: [{ urlPattern: '/api/data.json', statusCode: 418, probability: 1 }] },
      seed: 4,
    });
    await browser.execute(() => {
      document.getElementById('sw-fetch-status')!.textContent = '';
    });
    await $('#sw-fetch').click();
    await expect($('#sw-fetch-status')).toHaveText('418');
  });
});
