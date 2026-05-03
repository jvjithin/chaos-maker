import { afterEach, describe, expect, it } from 'vitest';
import { ChaosConfigBuilder, ChaosMaker } from '@chaos-maker/core';
import type { ChaosConfig, ChaosEvent } from '@chaos-maker/core';
import { registerChaosCommands } from '../src/commands';
import { registerSWChaosCommands } from '../src/sw';

type ChaosUtilsHarness = {
  instance: ChaosMaker;
  getLog: () => ChaosEvent[];
  enableGroup: (name: string) => { success: boolean; message: string };
  disableGroup: (name: string) => { success: boolean; message: string };
};

type Runtime = {
  request: (url: string) => Promise<Response>;
  log: () => ChaosEvent[];
  cleanup: () => void;
};

type CommandMap = Record<string, (...args: unknown[]) => unknown>;

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) {
    cleanups.pop()?.();
  }
});

function configWithPaymentGroupInitiallyDisabled(): ChaosConfig {
  return new ChaosConfigBuilder()
    .defineGroup('payments', { enabled: false })
    .inGroup('payments')
    .failRequests('/api/pay', 503, 1)
    .withSeed(1)
    .build();
}

function configWithPaymentGroup(): ChaosConfig {
  return new ChaosConfigBuilder()
    .inGroup('payments')
    .failRequests('/api/pay', 503, 1)
    .withSeed(1)
    .build();
}

function configWithoutGroup(): ChaosConfig {
  return new ChaosConfigBuilder()
    .failRequests('/api/pay', 503, 1)
    .withSeed(1)
    .build();
}

function configWithMultipleGroups(): ChaosConfig {
  return new ChaosConfigBuilder()
    .inGroup('payments')
    .failRequests('/api/pay', 503, 1)
    .inGroup('auth')
    .failRequests('/api/auth', 401, 1)
    .withSeed(1)
    .build();
}

function makeUtils(instance: ChaosMaker): ChaosUtilsHarness {
  return {
    instance,
    getLog: () => instance.getLog(),
    enableGroup(name) {
      try {
        instance.enableGroup(name);
        return { success: true, message: 'enabled' };
      } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : String(error) };
      }
    },
    disableGroup(name) {
      try {
        instance.disableGroup(name);
        return { success: true, message: 'disabled' };
      } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

function startRuntime(config: ChaosConfig): Runtime {
  const previousChaosUtils = (globalThis as { chaosUtils?: ChaosUtilsHarness }).chaosUtils;
  const target = {
    fetch: async () => new Response('ok', { status: 200 }),
  } as unknown as typeof globalThis;
  const instance = new ChaosMaker(config, { target });
  instance.start();
  (globalThis as { chaosUtils?: ChaosUtilsHarness }).chaosUtils = makeUtils(instance);

  return {
    request: (url) => target.fetch(url),
    log: () => instance.getLog(),
    cleanup: () => {
      instance.stop();
      if (previousChaosUtils) {
        (globalThis as { chaosUtils?: ChaosUtilsHarness }).chaosUtils = previousChaosUtils;
      } else {
        delete (globalThis as { chaosUtils?: ChaosUtilsHarness }).chaosUtils;
      }
    },
  };
}

function startSWRuntime(config: ChaosConfig): Runtime {
  const runtime = startRuntime(config);
  const previousBridge = (globalThis as { __chaosMakerSWBridge?: unknown }).__chaosMakerSWBridge;
  const utils = (globalThis as { chaosUtils: ChaosUtilsHarness }).chaosUtils;
  (globalThis as {
    __chaosMakerSWBridge?: { toggleGroup: (name: string, enabled: boolean, timeoutMs: number) => Promise<void> };
  }).__chaosMakerSWBridge = {
    async toggleGroup(name, enabled) {
      if (enabled) {
        utils.instance.enableGroup(name);
      } else {
        utils.instance.disableGroup(name);
      }
    },
  };
  cleanups.push(() => {
    if (previousBridge) {
      (globalThis as { __chaosMakerSWBridge?: unknown }).__chaosMakerSWBridge = previousBridge;
    } else {
      delete (globalThis as { __chaosMakerSWBridge?: unknown }).__chaosMakerSWBridge;
    }
  });
  return runtime;
}

function track(runtime: Runtime): Runtime {
  cleanups.push(runtime.cleanup);
  return runtime;
}

function installCypressHarness(): CommandMap {
  const commands: CommandMap = {};
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
    task: () => ({ then: () => undefined }),
    window: () => ({
      then: (fn: (win: typeof globalThis) => unknown) => Promise.resolve(fn(globalThis)),
    }),
  };
  cleanups.push(() => {
    if (previousCypress) {
      (globalThis as { Cypress?: unknown }).Cypress = previousCypress;
    } else {
      delete (globalThis as { Cypress?: unknown }).Cypress;
    }
    if (previousCy) {
      (globalThis as { cy?: unknown }).cy = previousCy;
    } else {
      delete (globalThis as { cy?: unknown }).cy;
    }
  });
  registerChaosCommands();
  registerSWChaosCommands();
  return commands;
}

function hasAppliedFailure(log: ChaosEvent[], statusCode: number): boolean {
  return log.some(
    (event) => event.type === 'network:failure' && event.applied && event.detail.statusCode === statusCode,
  );
}

describe('@chaos-maker/cypress rule groups', () => {
  it('enable group executes grouped rule', async () => {
    const commands = installCypressHarness();
    const runtime = track(startRuntime(configWithPaymentGroupInitiallyDisabled()));

    commands.enableGroup('payments');
    const response = await runtime.request('/api/pay');

    expect(response.status).toBe(503);
    expect(hasAppliedFailure(runtime.log(), 503)).toBe(true);
  });

  it('disable group skips grouped rule', async () => {
    const commands = installCypressHarness();
    const runtime = track(startRuntime(configWithPaymentGroup()));

    commands.disableGroup('payments');
    const response = await runtime.request('/api/pay');

    expect(response.status).toBe(200);
    expect(hasAppliedFailure(runtime.log(), 503)).toBe(false);
  });

  it('rules without inGroup still execute through the default group', async () => {
    installCypressHarness();
    const runtime = track(startRuntime(configWithoutGroup()));

    const response = await runtime.request('/api/pay');

    expect(response.status).toBe(503);
    expect(hasAppliedFailure(runtime.log(), 503)).toBe(true);
  });

  it('multiple groups only apply enabled groups', async () => {
    const commands = installCypressHarness();
    const runtime = track(startRuntime(configWithMultipleGroups()));

    commands.disableGroup('payments');
    const payments = await runtime.request('/api/pay');
    const auth = await runtime.request('/api/auth');

    expect(payments.status).toBe(200);
    expect(auth.status).toBe(401);
    expect(hasAppliedFailure(runtime.log(), 503)).toBe(false);
    expect(hasAppliedFailure(runtime.log(), 401)).toBe(true);
  });

  it('enableSWGroup enables grouped Service Worker chaos', async () => {
    const commands = installCypressHarness();
    const runtime = track(startSWRuntime(configWithPaymentGroupInitiallyDisabled()));

    const before = await runtime.request('/api/pay');
    await commands.enableSWGroup('payments');
    const after = await runtime.request('/api/pay');

    expect(before.status).toBe(200);
    expect(after.status).toBe(503);
    expect(hasAppliedFailure(runtime.log(), 503)).toBe(true);
  });

  it('invalid group names throw errors before window access', async () => {
    const commands = installCypressHarness();

    expect(() => commands.enableGroup('')).toThrow('[chaos-maker] group name cannot be empty');
    expect(() => commands.enableGroup(null as unknown as string)).toThrow(
      '[chaos-maker] group name must be a string',
    );
  });
});
