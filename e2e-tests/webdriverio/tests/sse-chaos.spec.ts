import { browser, $ } from '@wdio/globals';
import type { ChaosEvent } from '@chaos-maker/core';

const SSE_PATTERN = '127.0.0.1:8082';

async function visitAndInject(config: Parameters<WebdriverIO.Browser['injectChaos']>[0]): Promise<void> {
  await browser.url('/');
  await browser.injectChaos(config);
}

async function connectDefault(): Promise<void> {
  await $('#sse-connect').click();
  await expect($('#sse-status')).toHaveText('open');
}

async function connectNamed(): Promise<void> {
  await $('#sse-connect-named').click();
  await expect($('#sse-status')).toHaveText('open');
}

async function messageCount(): Promise<number> {
  return Number(await $('#sse-message-count').getText());
}

async function tickCount(): Promise<number> {
  return Number(await $('#sse-tick-count').getText());
}

async function waitForTotalSSEEvents(target: number): Promise<void> {
  await browser.waitUntil(async () => {
    const log = (await browser.getChaosLog()) as ChaosEvent[];
    const drops = log.filter((e) => e.type === 'sse:drop' && e.applied).length;
    return drops + (await messageCount()) >= target;
  }, {
    timeout: 10_000,
    timeoutMsg: `SSE stream did not reach ${target} total events`,
  });
}

describe('WDIO SSE drop', () => {
  it('drops every 2nd inbound event', async () => {
    await visitAndInject({
      sse: { drops: [{ urlPattern: SSE_PATTERN, probability: 1, everyNth: 2 }] },
    });
    await connectDefault();
    await waitForTotalSSEEvents(4);

    expect(await messageCount()).toBeGreaterThan(0);

    const log = (await browser.getChaosLog()) as ChaosEvent[];
    const drops = log.filter((e) => e.type === 'sse:drop' && e.applied);
    expect(drops.length).toBeGreaterThan(0);
  });
});

describe('WDIO SSE delay', () => {
  it('delays inbound messages by at least delayMs and logs the delay', async () => {
    await visitAndInject({
      sse: { delays: [{ urlPattern: SSE_PATTERN, delayMs: 800, probability: 1 }] },
    });

    const startedAt = Date.now();
    await connectDefault();
    await browser.waitUntil(async () => await messageCount() >= 1, {
      timeout: 10_000,
      timeoutMsg: 'SSE delayed message never arrived',
    });
    const elapsed = Date.now() - startedAt;

    expect(elapsed).toBeGreaterThanOrEqual(700);
    const log = (await browser.getChaosLog()) as ChaosEvent[];
    const delay = log.find((e) => e.type === 'sse:delay' && e.applied);
    expect(delay).toBeDefined();
    expect(delay?.detail.delayMs).toBe(800);
  });
});

describe('WDIO SSE corrupt', () => {
  it('truncates inbound text payload', async () => {
    await visitAndInject({
      sse: { corruptions: [{ urlPattern: SSE_PATTERN, strategy: 'truncate', probability: 1 }] },
    });
    await connectDefault();
    await browser.waitUntil(async () => await messageCount() >= 1, {
      timeout: 5_000,
      timeoutMsg: 'SSE corrupted message never arrived',
    });

    const logText = await $('#sse-log').getText();
    expect(logText).toMatch(/msg \d+ tic/);
    const log = (await browser.getChaosLog()) as ChaosEvent[];
    const corrupted = log.find((e) => e.type === 'sse:corrupt' && e.applied);
    expect(corrupted?.detail.strategy).toBe('truncate');
  });
});

describe('WDIO SSE close', () => {
  it('force-closes the source after afterMs', async () => {
    await visitAndInject({
      sse: { closes: [{ urlPattern: SSE_PATTERN, probability: 1, afterMs: 600 }] },
    });
    await connectDefault();

    await browser.waitUntil(async () => (await $('#sse-status').getText()).includes('error'), {
      timeout: 5_000,
      timeoutMsg: 'SSE source did not close with an error',
    });

    const log = (await browser.getChaosLog()) as ChaosEvent[];
    const closes = log.filter((e) => e.type === 'sse:close' && e.applied);
    expect(closes).toHaveLength(1);
  });
});

describe('WDIO SSE named eventType', () => {
  it('drops only named tick events and lets default messages through', async () => {
    await visitAndInject({
      sse: { drops: [{ urlPattern: '/sse-named', eventType: 'tick', probability: 1 }] },
    });
    await connectNamed();
    await browser.waitUntil(async () => await messageCount() >= 1, {
      timeout: 10_000,
      timeoutMsg: 'SSE named stream did not deliver default messages',
    });

    expect(await tickCount()).toBe(0);
    expect(await messageCount()).toBeGreaterThan(0);

    const log = (await browser.getChaosLog()) as ChaosEvent[];
    const drops = log.filter((e) => e.type === 'sse:drop' && e.applied);
    expect(drops.length).toBeGreaterThan(0);
    expect(drops.every((e) => e.detail.eventType === 'tick')).toBe(true);
  });
});
