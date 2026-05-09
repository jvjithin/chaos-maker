import { browser, $ } from '@wdio/globals';
import type { ChaosEvent } from '@chaos-maker/core';

describe('Preset: mobile-3g', () => {
  it('declarative preset name resolves and applies network latency', async () => {
    await browser.url('/');
    await browser.injectChaos({ presets: ['mobile-3g'], seed: 1234 });
    await $('#fetch-data').click();
    await expect($('#status')).toHaveText('Success!');

    const timing = await $('#timing').getText();
    expect(parseInt(timing, 10)).toBeGreaterThan(1000);

    const log = (await browser.getChaosLog()) as ChaosEvent[];
    expect(log.some((e) => e.type === 'network:latency' && e.applied)).toBe(true);
  });

  it('camelCase mobileThreeG resolves to the same preset', async () => {
    await browser.url('/');
    await browser.injectChaos({ presets: ['mobileThreeG'], seed: 1234 });
    await $('#fetch-data').click();
    await expect($('#status')).toHaveText('Success!');

    const log = (await browser.getChaosLog()) as ChaosEvent[];
    expect(log.some((e) => e.type === 'network:latency')).toBe(true);
  });
});
