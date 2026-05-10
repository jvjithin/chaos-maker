import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChaosEvent } from '@chaos-maker/core';
import { bindCypressCommandLog } from '../src/cypress-log';

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) {
    const fn = cleanups.pop();
    try { fn?.(); } catch { /* swallow */ }
  }
});

function mkEvent(overrides: Partial<ChaosEvent> = {}): ChaosEvent {
  return {
    type: 'network:failure',
    timestamp: 0,
    applied: true,
    detail: { url: '/api/users', statusCode: 503 },
    ...overrides,
  } as ChaosEvent;
}

function installHarness(): {
  log: ReturnType<typeof vi.fn>;
  emit: (event: ChaosEvent) => void;
  instanceOn: ReturnType<typeof vi.fn>;
  win: Cypress.AUTWindow;
} {
  const previousCypress = (globalThis as { Cypress?: unknown }).Cypress;
  const listeners: Array<(event: ChaosEvent) => void> = [];
  const log = vi.fn();
  const instanceOn = vi.fn((type: '*', listener: (event: ChaosEvent) => void) => {
    if (type === '*') listeners.push(listener);
  });
  const win = {
    chaosUtils: {
      instance: { on: instanceOn },
    },
    setInterval: vi.fn(),
    clearInterval: vi.fn(),
    setTimeout: vi.fn(),
  } as unknown as Cypress.AUTWindow;

  (globalThis as { Cypress?: unknown }).Cypress = { log };
  cleanups.push(() => {
    if (previousCypress) (globalThis as { Cypress?: unknown }).Cypress = previousCypress;
    else delete (globalThis as { Cypress?: unknown }).Cypress;
  });

  return {
    log,
    emit: (event: ChaosEvent) => {
      for (const listener of listeners) listener(event);
    },
    instanceOn,
    win,
  };
}

describe('bindCypressCommandLog', () => {
  it('writes one Cypress log entry for an applied chaos event', () => {
    const { log, emit, win } = installHarness();
    const event = mkEvent();

    bindCypressCommandLog(win);
    emit(event);

    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith({
      name: 'chaos',
      message: 'chaos:network:failure /api/users → 503',
      consoleProps: expect.any(Function),
    });
    expect(log.mock.calls[0][0].consoleProps()).toBe(event);
  });

  it('does not log debug or unapplied events', () => {
    const { log, emit, win } = installHarness();

    bindCypressCommandLog(win);
    emit(mkEvent({
      applied: false,
      detail: { url: '/api/users', statusCode: 503, reason: 'rule-skip-probability' },
    }));
    emit(mkEvent({
      type: 'debug',
      applied: false,
      detail: { stage: 'rule-applied', url: '/api/users', method: 'GET' },
    }));

    expect(log).not.toHaveBeenCalled();
  });

  it('does not bind twice to the same chaos instance', () => {
    const { instanceOn, win } = installHarness();

    bindCypressCommandLog(win);
    bindCypressCommandLog(win);

    expect(instanceOn).toHaveBeenCalledTimes(1);
  });

  it('binds via the retry interval when chaosUtils.instance is initially missing', () => {
    const { log, emit, instanceOn, win } = installHarness();
    (win as unknown as { chaosUtils: Record<string, unknown> }).chaosUtils = {};

    bindCypressCommandLog(win);

    const setInterval = win.setInterval as unknown as ReturnType<typeof vi.fn>;
    expect(setInterval).toHaveBeenCalledTimes(1);
    const intervalCallback = setInterval.mock.calls[0][0] as () => void;

    (win as unknown as { chaosUtils: { instance: unknown } }).chaosUtils.instance = {
      on: instanceOn,
    };
    intervalCallback();

    expect(instanceOn).toHaveBeenCalledTimes(1);

    emit(mkEvent());
    expect(log).toHaveBeenCalledTimes(1);
  });
});
