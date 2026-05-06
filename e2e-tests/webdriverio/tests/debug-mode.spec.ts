import { browser, $ } from '@wdio/globals';
import type { ChaosEvent } from '@chaos-maker/core';

const API_PATTERN = '/api/data.json';

async function visitAndInject(config: Parameters<WebdriverIO.Browser['injectChaos']>[0]): Promise<void> {
  await browser.url('/');
  await browser.injectChaos(config);
}

/** Read every `[Chaos] ` line emitted to console.debug since the page loaded.
 *  WDIO has no first-class console-message stream, so we install a tap inside
 *  the page that records calls and read them via `browser.execute`. */
async function readChaosDebugLines(): Promise<string[]> {
  return browser.execute(() => {
    const win = globalThis as unknown as { __chaosDebugLines?: string[] };
    return win.__chaosDebugLines ?? [];
  });
}

async function installDebugTap(): Promise<void> {
  await browser.execute(() => {
    const win = globalThis as unknown as { __chaosDebugLines?: string[]; console: Console };
    if (win.__chaosDebugLines) return;
    win.__chaosDebugLines = [];
    const original = win.console.debug.bind(win.console);
    win.console.debug = (...args: unknown[]) => {
      if (typeof args[0] === 'string' && (args[0] as string).startsWith('[Chaos] ')) {
        win.__chaosDebugLines!.push(args[0] as string);
      }
      original(...args);
    };
  });
}

describe('Debug Mode (RFC-002)', () => {
  it('mirrors a [Chaos] line to console.debug when debug:true', async () => {
    await browser.url('/');
    await installDebugTap();
    await browser.injectChaos({
      debug: true,
      network: { failures: [{ urlPattern: API_PATTERN, statusCode: 503, probability: 1.0 }] },
    });
    await $('#fetch-data').click();
    await expect($('#result')).toHaveTextContaining('503');

    const lines = await readChaosDebugLines();
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((l) => l.startsWith('[Chaos] rule-applied'))).toBe(true);
  });

  it('emits structured rule-applied debug event with ruleType + ruleId', async () => {
    await visitAndInject({
      debug: true,
      network: { failures: [{ urlPattern: API_PATTERN, statusCode: 503, probability: 1.0 }] },
    });
    await $('#fetch-data').click();
    await expect($('#result')).toHaveTextContaining('503');

    const log = (await browser.getChaosLog()) as ChaosEvent[];
    const applied = log.find((e) => e.type === 'debug' && e.detail.stage === 'rule-applied');
    expect(applied).toBeDefined();
    expect(applied!.detail.ruleType).toBe('failure');
    expect(applied!.detail.ruleId).toBe('failure#0');
  });

  it('emits no debug events when debug is omitted', async () => {
    await browser.url('/');
    await installDebugTap();
    await browser.injectChaos({
      network: { failures: [{ urlPattern: API_PATTERN, statusCode: 503, probability: 1.0 }] },
    });
    await $('#fetch-data').click();
    await expect($('#result')).toHaveTextContaining('503');

    const log = (await browser.getChaosLog()) as ChaosEvent[];
    expect(log.some((e) => e.type === 'debug')).toBe(false);
    const lines = await readChaosDebugLines();
    expect(lines).toHaveLength(0);
  });
});
