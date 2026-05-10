import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChaosEvent } from '@chaos-maker/core';
import type { Page, TestInfo } from '@playwright/test';

const mocks = vi.hoisted(() => ({
  step: vi.fn<() => Promise<void>>(() => Promise.resolve()),
}));

vi.mock('@playwright/test', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@playwright/test')>();
  return {
    ...actual,
    test: {
      step: mocks.step,
    },
  };
});

import { CHAOS_BINDING, createTraceReporter } from '../src/trace';

type BindingHandler = (_source: unknown, event: ChaosEvent) => void;

class FakePage {
  readonly bindings = new Map<string, BindingHandler>();
  readonly exposeBinding = vi.fn(async (name: string, handler: BindingHandler) => {
    if (this.bindings.has(name)) {
      throw new Error(`binding already exists: ${name}`);
    }
    this.bindings.set(name, handler);
  });
  readonly addInitScript = vi.fn(async (..._args: unknown[]) => undefined);

  emit(event: ChaosEvent): void {
    const handler = this.bindings.get(CHAOS_BINDING);
    if (!handler) throw new Error('missing trace binding');
    handler({}, event);
  }

  asPage(): Page {
    return this as unknown as Page;
  }
}

function mkEvent(overrides: Partial<ChaosEvent> = {}): ChaosEvent {
  return {
    type: 'network:failure',
    timestamp: 0,
    applied: true,
    detail: { url: '/api/users', statusCode: 503 },
    ...overrides,
  } as ChaosEvent;
}

function createTestInfo(): {
  testInfo: TestInfo;
  attachments: Array<{ name: string; body: Buffer; contentType: string }>;
  attach: ReturnType<typeof vi.fn>;
} {
  const attachments: Array<{ name: string; body: Buffer; contentType: string }> = [];
  const attach = vi.fn(async (name: string, options: { body: Buffer; contentType: string }) => {
    attachments.push({ name, ...options });
  });
  return {
    testInfo: { attach } as unknown as TestInfo,
    attachments,
    attach,
  };
}

function parseAttachment(attachment: { body: Buffer }): unknown {
  return JSON.parse(attachment.body.toString('utf8'));
}

beforeEach(() => {
  mocks.step.mockReset();
  mocks.step.mockImplementation(() => Promise.resolve());
});

describe('createTraceReporter', () => {
  it('reuses an existing handle on the same page', async () => {
    const page = new FakePage();
    const { testInfo } = createTestInfo();

    const first = await createTraceReporter(page.asPage(), testInfo);
    const second = await createTraceReporter(page.asPage(), testInfo);

    expect(second).toBe(first);
    expect(page.exposeBinding).toHaveBeenCalledTimes(1);
    expect(page.addInitScript).toHaveBeenCalledTimes(1);
  });

  it('attaches an empty log payload on dispose', async () => {
    const page = new FakePage();
    const { testInfo, attachments } = createTestInfo();
    const handle = await createTraceReporter(page.asPage(), testInfo);

    await handle.dispose();

    expect(attachments).toHaveLength(1);
    expect(attachments[0].name).toBe('chaos-log.json');
    expect(parseAttachment(attachments[0])).toEqual({
      seed: null,
      eventCount: 0,
      events: [],
    });
  });

  it('does not throw when a late event arrives after dispose', async () => {
    const page = new FakePage();
    const { testInfo } = createTestInfo();
    let disposed = false;
    const handle = await createTraceReporter(page.asPage(), testInfo);
    mocks.step.mockImplementation(() => {
      if (disposed) return Promise.reject(new Error('test already finished'));
      return Promise.resolve();
    });

    await handle.dispose();
    disposed = true;

    expect(() => page.emit(mkEvent())).not.toThrow();
    expect(handle.events).toHaveLength(1);
  });

  it('reuses the page binding across inject → remove → re-inject', async () => {
    const page = new FakePage();
    const first = createTestInfo();
    const second = createTestInfo();

    const firstHandle = await createTraceReporter(page.asPage(), first.testInfo);
    page.emit(mkEvent({ detail: { url: '/api/first', statusCode: 503 } }));
    await firstHandle.dispose(1);

    // Simulate removeChaos clearing the cached handle on the page.
    delete (page as unknown as Record<symbol, unknown>)[
      Symbol.for('chaos-maker.playwright.traceHandle')
    ];

    const secondHandle = await createTraceReporter(page.asPage(), second.testInfo);
    expect(secondHandle).not.toBe(firstHandle);
    // Critical: the page binding is registered exactly once across both
    // cycles. A second exposeBinding call would have thrown.
    expect(page.exposeBinding).toHaveBeenCalledTimes(1);
    expect(page.addInitScript).toHaveBeenCalledTimes(1);

    page.emit(mkEvent({ detail: { url: '/api/second', statusCode: 503 } }));
    await secondHandle.dispose(2);

    expect(secondHandle.events).toHaveLength(1);
    expect((secondHandle.events[0].detail as { url: string }).url).toBe('/api/second');
    expect(parseAttachment(second.attachments[0])).toMatchObject({
      seed: 2,
      eventCount: 1,
      events: [{ detail: { url: '/api/second', statusCode: 503 } }],
    });
    // The first reporter's events array is untouched by the second cycle.
    expect(firstHandle.events).toHaveLength(1);
    expect((firstHandle.events[0].detail as { url: string }).url).toBe('/api/first');
  });

  it('keeps unapplied events in JSON and emits steps only when verbose', async () => {
    const skipped = mkEvent({
      applied: false,
      detail: { url: '/api/skipped', statusCode: 503, reason: 'rule-skip-probability' },
    });
    const quietPage = new FakePage();
    const quietInfo = createTestInfo();
    const quietHandle = await createTraceReporter(quietPage.asPage(), quietInfo.testInfo);

    quietPage.emit(skipped);
    await quietHandle.dispose(1234);

    expect(mocks.step).not.toHaveBeenCalled();
    expect(parseAttachment(quietInfo.attachments[0])).toMatchObject({
      seed: 1234,
      eventCount: 1,
      events: [skipped],
    });

    const verbosePage = new FakePage();
    const verboseInfo = createTestInfo();
    const verboseHandle = await createTraceReporter(verbosePage.asPage(), verboseInfo.testInfo, { verbose: true });

    verbosePage.emit(skipped);
    await verboseHandle.dispose(1234);

    expect(mocks.step).toHaveBeenCalledWith(
      'chaos:network:failure /api/skipped → 503 (skipped)',
      expect.any(Function),
    );
  });

  it('keeps debug events JSON-only even when verbose', async () => {
    const debug = mkEvent({
      type: 'debug',
      applied: false,
      detail: { stage: 'rule-applied', url: '/api/users', method: 'GET' },
    });
    const page = new FakePage();
    const { testInfo, attachments } = createTestInfo();
    const handle = await createTraceReporter(page.asPage(), testInfo, { verbose: true });

    page.emit(debug);
    await handle.dispose();

    expect(mocks.step).not.toHaveBeenCalled();
    expect(parseAttachment(attachments[0])).toMatchObject({
      eventCount: 1,
      events: [debug],
    });
  });
});
