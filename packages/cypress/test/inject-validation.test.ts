import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChaosConfigError } from '@chaos-maker/core';
import { registerChaosCommands } from '../src/commands';
import { registerSWChaosCommands } from '../src/sw';

type CommandMap = Record<string, (...args: unknown[]) => unknown>;

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) {
    const fn = cleanups.pop();
    try { fn?.(); } catch { /* swallow */ }
  }
});

function installHarness(): { commands: CommandMap; taskSpy: ReturnType<typeof vi.fn>; windowSpy: ReturnType<typeof vi.fn> } {
  const commands: CommandMap = {};
  const taskSpy = vi.fn(() => ({ then: () => undefined }));
  const windowSpy = vi.fn(() => ({ then: () => undefined }));
  const previousCypress = (globalThis as { Cypress?: unknown }).Cypress;
  const previousCy = (globalThis as { cy?: unknown }).cy;
  (globalThis as { Cypress?: unknown }).Cypress = {
    Commands: {
      add(name: string, fn: (...args: unknown[]) => unknown) {
        commands[name] = fn;
      },
    },
    Promise,
    on: () => undefined,
    off: () => undefined,
  };
  (globalThis as { cy?: unknown }).cy = {
    task: taskSpy,
    window: windowSpy,
  };
  cleanups.push(() => {
    if (previousCypress) (globalThis as { Cypress?: unknown }).Cypress = previousCypress;
    else delete (globalThis as { Cypress?: unknown }).Cypress;
    if (previousCy) (globalThis as { cy?: unknown }).cy = previousCy;
    else delete (globalThis as { cy?: unknown }).cy;
  });
  registerChaosCommands();
  registerSWChaosCommands();
  return { commands, taskSpy, windowSpy };
}

describe('@chaos-maker/cypress injectChaos validation gate', () => {
  it('throws ChaosConfigError synchronously before any cy.task / cy.window call', () => {
    const { commands, taskSpy, windowSpy } = installHarness();
    expect(() =>
      commands.injectChaos({
        network: { failures: [{ urlPattern: '/a', statusCode: 999, probability: 2 }] },
      } as unknown as Parameters<typeof commands.injectChaos>[0]),
    ).toThrow(ChaosConfigError);
    expect(taskSpy).not.toHaveBeenCalled();
    expect(windowSpy).not.toHaveBeenCalled();
  });
});

describe('@chaos-maker/cypress injectSWChaos validation gate', () => {
  it('throws ChaosConfigError synchronously before any cy.window call', () => {
    const { commands, windowSpy } = installHarness();
    expect(() =>
      commands.injectSWChaos({
        network: { failures: [{ urlPattern: '', statusCode: 999, probability: -1 }] },
      } as unknown as Parameters<typeof commands.injectSWChaos>[0]),
    ).toThrow(ChaosConfigError);
    expect(windowSpy).not.toHaveBeenCalled();
  });
});
