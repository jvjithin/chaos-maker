import { describe, it, expect, vi } from 'vitest';
import type { ChaosConfig } from '@chaos-maker/core';
import {
  injectChaos,
  injectSWChaos,
  ChaosConfigError,
  type ChaosBrowser,
} from '../src/index';

function makeFakeBrowser(): ChaosBrowser {
  return {
    execute: vi.fn(async () => true as unknown) as unknown as ChaosBrowser['execute'],
    addCommand: vi.fn(),
  };
}

describe('@chaos-maker/webdriverio injectChaos validation gate', () => {
  it('throws ChaosConfigError synchronously BEFORE browser.execute', async () => {
    const browser = makeFakeBrowser();
    const malformed = {
      network: { failures: [{ urlPattern: '/a', statusCode: 999, probability: 2 }] },
    } as unknown as ChaosConfig;
    await expect(injectChaos(browser, malformed)).rejects.toBeInstanceOf(ChaosConfigError);
    expect(browser.execute).not.toHaveBeenCalled();
  });

  it('valid config proceeds to browser.execute', async () => {
    const browser = makeFakeBrowser();
    await injectChaos(browser, {
      network: { failures: [{ urlPattern: '/a', statusCode: 503, probability: 1 }] },
    });
    expect(browser.execute).toHaveBeenCalled();
  });
});

describe('@chaos-maker/webdriverio injectSWChaos validation gate', () => {
  it('throws ChaosConfigError BEFORE installing the SW bridge script', async () => {
    const browser = makeFakeBrowser();
    await expect(injectSWChaos(browser, {
      network: { failures: [{ urlPattern: '', statusCode: 999, probability: -1 }] },
    } as unknown as ChaosConfig)).rejects.toBeInstanceOf(ChaosConfigError);
    expect(browser.execute).not.toHaveBeenCalled();
  });
});
