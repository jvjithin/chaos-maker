import { describe, expect, it, vi, afterEach } from 'vitest';
import type { Page } from '@playwright/test';
import { removeChaos, removeSWChaos } from '../src/index';

afterEach(() => {
  delete (globalThis as unknown as Record<string, unknown>).__chaosMakerSWBridge;
});

describe('@chaos-maker/playwright cleanup', () => {
  it('removeChaos swallows closed-page evaluation errors', async () => {
    const page = {
      evaluate: vi.fn(async () => {
        throw new Error('Target closed');
      }),
    } as unknown as Page;

    await expect(removeChaos(page)).resolves.toBeUndefined();
  });

  it('removeSWChaos clears page and worker logs after stop', async () => {
    const stop = vi.fn(async () => undefined);
    const clearLocalLog = vi.fn();
    const clearRemoteLog = vi.fn(async () => undefined);
    (globalThis as unknown as Record<string, unknown>).__chaosMakerSWBridge = {
      stop,
      clearLocalLog,
      clearRemoteLog,
    };
    const page = {
      evaluate: vi.fn(async (fn: (arg: { timeoutMs: number }) => Promise<void>, arg: { timeoutMs: number }) => fn(arg)),
    } as unknown as Page;

    await removeSWChaos(page, { timeoutMs: 123 });

    expect(stop).toHaveBeenCalledWith(123);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(clearLocalLog).toHaveBeenCalledTimes(1);
    expect(clearRemoteLog).toHaveBeenCalledWith(123);
    expect(stop.mock.invocationCallOrder[0]).toBeLessThan(clearLocalLog.mock.invocationCallOrder[0]);
    expect(stop.mock.invocationCallOrder[0]).toBeLessThan(clearRemoteLog.mock.invocationCallOrder[0]);
  });

  it('removeSWChaos clears page and worker logs when stop rejects', async () => {
    const stop = vi.fn(async () => {
      throw new Error('stop failed');
    });
    const clearLocalLog = vi.fn();
    const clearRemoteLog = vi.fn(async () => undefined);
    (globalThis as unknown as Record<string, unknown>).__chaosMakerSWBridge = {
      stop,
      clearLocalLog,
      clearRemoteLog,
    };
    const page = {
      evaluate: vi.fn(async (fn: (arg: { timeoutMs: number }) => Promise<void>, arg: { timeoutMs: number }) => fn(arg)),
    } as unknown as Page;

    await expect(removeSWChaos(page, { timeoutMs: 123 })).resolves.toBeUndefined();

    expect(stop).toHaveBeenCalledWith(123);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(clearLocalLog).toHaveBeenCalledTimes(1);
    expect(clearRemoteLog).toHaveBeenCalledWith(123);
    expect(stop.mock.invocationCallOrder[0]).toBeLessThan(clearLocalLog.mock.invocationCallOrder[0]);
    expect(stop.mock.invocationCallOrder[0]).toBeLessThan(clearRemoteLog.mock.invocationCallOrder[0]);
  });
});
