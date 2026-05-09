import { describe, it, expect, vi } from 'vitest';
import type { Page } from '@playwright/test';
import { injectChaos, injectSWChaos, ChaosConfigError } from '../src/index';

function makeFakePage(): Page {
  const page: unknown = {
    addInitScript: vi.fn(async () => undefined),
    evaluate: vi.fn(async () => undefined),
    addLocatorHandler: vi.fn(),
  };
  return page as Page;
}

describe('injectChaos validation gate', () => {
  it('throws ChaosConfigError synchronously BEFORE addInitScript', async () => {
    const page = makeFakePage();
    const malformed = {
      network: { failures: [{ urlPattern: '/a', statusCode: 999, probability: 1.5 }] },
    } as unknown as Parameters<typeof injectChaos>[1];
    await expect(injectChaos(page, malformed)).rejects.toBeInstanceOf(ChaosConfigError);
    expect((page.addInitScript as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('first issue carries structured ValidationIssue fields', async () => {
    const page = makeFakePage();
    let captured: ChaosConfigError | undefined;
    try {
      await injectChaos(page, {
        network: { failures: [{ urlPattern: '/a', statusCode: 999, probability: 2 }] },
      } as unknown as Parameters<typeof injectChaos>[1]);
    } catch (e) {
      if (e instanceof ChaosConfigError) captured = e;
    }
    expect(captured).toBeInstanceOf(ChaosConfigError);
    expect(captured!.issues[0].path).toMatch(/^network\.failures\[0\]/);
  });

  it('valid config still calls addInitScript', async () => {
    const page = makeFakePage();
    await injectChaos(page, {
      network: { failures: [{ urlPattern: '/a', statusCode: 503, probability: 1 }] },
    });
    expect((page.addInitScript as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
  });
});

describe('injectSWChaos validation gate', () => {
  it('throws ChaosConfigError BEFORE evaluating bridge install', async () => {
    const page = makeFakePage();
    await expect(injectSWChaos(page, {
      network: { failures: [{ urlPattern: '', statusCode: 999, probability: -1 }] },
    } as unknown as Parameters<typeof injectSWChaos>[1])).rejects.toBeInstanceOf(ChaosConfigError);
    expect((page.evaluate as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect((page.addInitScript as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});
