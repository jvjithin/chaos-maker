import { browser, $ } from '@wdio/globals';
import { presets } from '@chaos-maker/core';
import type { ChaosEvent } from '@chaos-maker/core';

const API_PATTERN = '/api/data.json';

describe('Chaos Lifecycle', () => {
  it('removeChaos restores normal fetch behavior', async () => {
    await browser.url('/');
    await browser.injectChaos({
      network: { failures: [{ urlPattern: API_PATTERN, statusCode: 500, probability: 1.0 }] },
    });
    await $('#fetch-data').click();
    await expect($('#status')).toHaveText('Error!');

    await browser.removeChaos();

    await $('#fetch-data').click();
    await expect($('#status')).toHaveText('Success!');
  });

  it('chaos log captures events with correct structure', async () => {
    await browser.url('/');
    await browser.injectChaos({
      network: { failures: [{ urlPattern: API_PATTERN, statusCode: 503, probability: 1.0 }] },
    });
    await $('#fetch-data').click();
    await expect($('#status')).toHaveText('Error!');

    const log = (await browser.getChaosLog()) as ChaosEvent[];
    expect(log.length).toBeGreaterThan(0);
    for (const event of log) {
      expect(event).toHaveProperty('type');
      expect(event).toHaveProperty('timestamp');
      expect(event).toHaveProperty('applied');
      expect(event).toHaveProperty('detail');
      expect(typeof event.timestamp).toBe('number');
      expect(typeof event.applied).toBe('boolean');
    }
  });

  it('chaos log records URL and method in event detail', async () => {
    await browser.url('/');
    await browser.injectChaos({
      network: { failures: [{ urlPattern: API_PATTERN, statusCode: 500, probability: 1.0 }] },
    });
    await $('#fetch-data').click();
    await expect($('#status')).toHaveText('Error!');

    const log = (await browser.getChaosLog()) as ChaosEvent[];
    const evt = log.find((e) => e.type === 'network:failure' && e.applied);
    expect(evt).toBeDefined();
    expect(evt!.detail.url).toContain(API_PATTERN);
    expect(evt!.detail.method).toBe('GET');
    expect(evt!.detail.statusCode).toBe(500);
  });

  it('combined network and UI chaos work simultaneously', async () => {
    await browser.url('/');
    await browser.injectChaos({
      network: { failures: [{ urlPattern: API_PATTERN, statusCode: 503, probability: 1.0 }] },
      ui: { assaults: [{ selector: '#submit-btn', action: 'disable', probability: 1.0 }] },
    });

    await $('#fetch-data').click();
    await expect($('#status')).toHaveText('Error!');
    await expect($('#submit-btn')).toBeDisabled();

    const log = (await browser.getChaosLog()) as ChaosEvent[];
    expect(log.some((e) => e.type === 'network:failure')).toBe(true);
    expect(log.some((e) => e.type === 'ui:assault')).toBe(true);
  });

  it('getChaosSeed returns a finite number once chaos is injected', async () => {
    await browser.url('/');
    await browser.injectChaos({
      network: { failures: [{ urlPattern: API_PATTERN, statusCode: 500, probability: 1.0 }] },
    });
    const seed = (await browser.getChaosSeed()) as number | null;
    expect(seed).not.toBeNull();
    expect(Number.isFinite(seed)).toBe(true);
  });
});

describe('Presets', () => {
  it('unstableApi preset emits network events', async () => {
    await browser.url('/');
    await browser.injectChaos(presets.unstableApi);
    await $('#fetch-data').click();
    await expect($('#status')).not.toHaveText('');
    const log = (await browser.getChaosLog()) as ChaosEvent[];
    expect(log.some((e) => e.type === 'network:failure' || e.type === 'network:latency')).toBe(true);
  });

  it('slowNetwork preset adds latency', async () => {
    await browser.url('/');
    await browser.injectChaos(presets.slowNetwork);
    await $('#fetch-data').click();
    await $('#status').waitForDisplayed({ timeout: 10_000 });
    await expect($('#status')).toHaveText('Success!');
    const timingText = await $('#timing').getText();
    expect(parseInt(timingText, 10)).toBeGreaterThanOrEqual(1800);
  });

  it('offlineMode preset blocks all requests', async () => {
    await browser.url('/');
    await browser.injectChaos(presets.offlineMode);
    await $('#fetch-data').click();
    await expect($('#status')).toHaveText('Error!');
    await expect($('#result')).toHaveTextContaining('Failed to fetch');
  });

  it('flakyConnection preset injects chaos events', async () => {
    await browser.url('/');
    await browser.injectChaos(presets.flakyConnection);
    await $('#fetch-data').click();
    await expect($('#status')).not.toHaveText('');
    const log = (await browser.getChaosLog()) as ChaosEvent[];
    expect(log.some((e) => e.type === 'network:abort' || e.type === 'network:latency')).toBe(true);
  });

  it('degradedUi preset assaults buttons and links', async () => {
    await browser.url('/');
    await browser.injectChaos(presets.degradedUi);
    await browser.pause(200);
    const log = (await browser.getChaosLog()) as ChaosEvent[];
    const uiEvents = log.filter((e) => e.type === 'ui:assault');
    expect(uiEvents.length).toBeGreaterThan(0);
  });
});
