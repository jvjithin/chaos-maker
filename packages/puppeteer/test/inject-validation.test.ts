import { describe, it, expect, vi } from 'vitest';
import type { ChaosConfig } from '@chaos-maker/core';
import {
  injectChaos,
  injectSWChaos,
  ChaosConfigError,
  type ChaosPage,
} from '../src/index';

function makeFakePage(): {
  page: ChaosPage;
  newDocumentCalls: Array<unknown>;
  evaluateCalls: Array<unknown>;
} {
  const newDocumentCalls: unknown[] = [];
  const evaluateCalls: unknown[] = [];
  const page: ChaosPage = {
    async evaluateOnNewDocument(fn, ...args) {
      newDocumentCalls.push({ fn, args });
      return undefined;
    },
    async evaluate(fn, ...args) {
      evaluateCalls.push({ fn, args });
      return undefined as never;
    },
    async goto() {
      return undefined;
    },
  };
  return { page, newDocumentCalls, evaluateCalls };
}

describe('@chaos-maker/puppeteer injectChaos validation gate', () => {
  it('throws ChaosConfigError synchronously BEFORE evaluateOnNewDocument', async () => {
    const fake = makeFakePage();
    const malformed = {
      network: { failures: [{ urlPattern: '/a', statusCode: 999, probability: 2 }] },
    } as unknown as ChaosConfig;
    await expect(injectChaos(fake.page, malformed)).rejects.toBeInstanceOf(ChaosConfigError);
    expect(fake.newDocumentCalls).toHaveLength(0);
  });

  it('valid config proceeds to evaluateOnNewDocument', async () => {
    const fake = makeFakePage();
    await injectChaos(fake.page, {
      network: { failures: [{ urlPattern: '/a', statusCode: 503, probability: 1 }] },
    });
    expect(fake.newDocumentCalls.length).toBeGreaterThan(0);
  });
});

describe('@chaos-maker/puppeteer injectSWChaos validation gate', () => {
  it('throws ChaosConfigError BEFORE evaluating bridge install', async () => {
    const fake = makeFakePage();
    fake.page.evaluate = vi.fn();
    fake.page.evaluateOnNewDocument = vi.fn();
    await expect(injectSWChaos(fake.page, {
      network: { failures: [{ urlPattern: '', statusCode: 999, probability: -1 }] },
    } as unknown as ChaosConfig)).rejects.toBeInstanceOf(ChaosConfigError);
    expect(fake.page.evaluate).not.toHaveBeenCalled();
    expect(fake.page.evaluateOnNewDocument).not.toHaveBeenCalled();
  });
});
