import { afterEach, describe, expect, it } from 'vitest';
import { ChaosConfigBuilder, ChaosMaker } from '@chaos-maker/core';
import type { ChaosConfig, ChaosEvent } from '@chaos-maker/core';
import {
  enableGroup,
  disableGroup,
  registerSWChaosCommands,
  type ChaosBrowser,
} from '../src/index';

type ChaosUtilsHarness = {
  instance: ChaosMaker;
  getLog: () => ChaosEvent[];
  enableGroup: (name: string) => { success: boolean; message: string };
  disableGroup: (name: string) => { success: boolean; message: string };
  getGroupState: (name: string) => boolean | null;
};

type Runtime = {
  request: (url: string) => Promise<Response>;
  log: () => ChaosEvent[];
  cleanup: () => void;
};

type FakeBrowser = ChaosBrowser & {
  commandCalls: Record<string, (...args: unknown[]) => unknown>;
};

const cleanups: Array<() => void> = [];

afterEach(() => {
  const errors: unknown[] = [];

  while (cleanups.length > 0) {
    const cleanup = cleanups.pop();
    try {
      cleanup?.();
    } catch (error) {
      errors.push(error);
    }
  }

  if (errors.length === 1) {
    throw errors[0];
  }

  if (errors.length > 1) {
    throw new AggregateError(errors, 'Cleanup failures');
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
    getGroupState: (name) => instance.getGroupState(name),
  };
}

function installBrowserGlobals(): void {
  const previousWindow = (globalThis as { window?: unknown }).window;
  const previousDocument = (globalThis as { document?: unknown }).document;
  (globalThis as { window?: typeof globalThis }).window = globalThis;
  (globalThis as { document?: unknown }).document = {
    createElement: () => ({ textContent: '', remove: () => undefined }),
    head: { appendChild: () => undefined },
    documentElement: { appendChild: () => undefined },
  };
  cleanups.push(() => {
    if (previousWindow) {
      (globalThis as { window?: unknown }).window = previousWindow;
    } else {
      delete (globalThis as { window?: unknown }).window;
    }
    if (previousDocument) {
      (globalThis as { document?: unknown }).document = previousDocument;
    } else {
      delete (globalThis as { document?: unknown }).document;
    }
  });
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
      await new Promise((resolve) => setTimeout(resolve, 0));
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

function makeBrowser(): FakeBrowser {
  const commandCalls: Record<string, (...args: unknown[]) => unknown> = {};
  return {
    commandCalls,
    execute: async (fn: unknown, ...args: unknown[]) => {
      if (typeof fn === 'function') {
        return (fn as (...args: unknown[]) => unknown)(...args) as never;
      }
      return undefined as never;
    },
    addCommand(name, fn) {
      commandCalls[name] = (...args: unknown[]) => fn.apply(this, args);
    },
  } as FakeBrowser;
}

function hasAppliedFailure(log: ChaosEvent[], statusCode: number): boolean {
  return log.some(
    (event) => event.type === 'network:failure' && event.applied && event.detail.statusCode === statusCode,
  );
}

function countAppliedFailures(log: ChaosEvent[], statusCode: number): number {
  return log.filter(
    (event) => event.type === 'network:failure' && event.applied && event.detail.statusCode === statusCode,
  ).length;
}

async function readBrowserGroupState(
  browser: ChaosBrowser,
  name: string,
): Promise<{ hasGroup: boolean; enabled: boolean | null }> {
  return browser.execute((n: string) => {
    const utils = (window as unknown as { chaosUtils?: ChaosUtilsHarness }).chaosUtils;
    return {
      hasGroup: utils?.instance.hasGroup(n) ?? false,
      enabled: utils?.getGroupState(n) ?? null,
    };
  }, name);
}

describe('@chaos-maker/webdriverio rule groups', () => {
  it('enable group executes grouped rule', async () => {
    installBrowserGlobals();
    const browser = makeBrowser();
    const runtime = track(startRuntime(configWithPaymentGroupInitiallyDisabled()));

    await enableGroup(browser, 'payments');
    const response = await runtime.request('/api/pay');

    expect(response.status).toBe(503);
    expect(hasAppliedFailure(runtime.log(), 503)).toBe(true);
  });

  it('disable group skips grouped rule', async () => {
    installBrowserGlobals();
    const browser = makeBrowser();
    const runtime = track(startRuntime(configWithPaymentGroup()));

    await disableGroup(browser, 'payments');
    const response = await runtime.request('/api/pay');

    expect(response.status).toBe(200);
    expect(hasAppliedFailure(runtime.log(), 503)).toBe(false);
    expect(runtime.log().some((event) => event.type === 'rule-group:gated')).toBe(true);
  });

  it('enable then disable group changes real fetch behavior', async () => {
    installBrowserGlobals();
    const browser = makeBrowser();
    const runtime = track(startRuntime(configWithPaymentGroupInitiallyDisabled()));

    await enableGroup(browser, 'payments');
    const enabled = await runtime.request('/api/pay');
    await disableGroup(browser, 'payments');
    const disabled = await runtime.request('/api/pay');

    expect(enabled.status).toBe(503);
    expect(disabled.status).toBe(200);
    expect(countAppliedFailures(runtime.log(), 503)).toBe(1);
  });

  it('rules without inGroup still execute through the default group', async () => {
    installBrowserGlobals();
    const runtime = track(startRuntime(configWithoutGroup()));

    const response = await runtime.request('/api/pay');

    expect(response.status).toBe(503);
    expect(hasAppliedFailure(runtime.log(), 503)).toBe(true);
  });

  it('multiple groups only apply enabled groups', async () => {
    installBrowserGlobals();
    const browser = makeBrowser();
    const runtime = track(startRuntime(configWithMultipleGroups()));

    await disableGroup(browser, 'payments');
    const payments = await runtime.request('/api/pay');
    const auth = await runtime.request('/api/auth');

    expect(payments.status).toBe(200);
    expect(auth.status).toBe(401);
    expect(hasAppliedFailure(runtime.log(), 503)).toBe(false);
    expect(hasAppliedFailure(runtime.log(), 401)).toBe(true);
  });

  it('enableGroup auto-registers a non-existent group as enabled', async () => {
    installBrowserGlobals();
    const browser = makeBrowser();
    track(startRuntime(configWithoutGroup()));

    await enableGroup(browser, 'non-existent-group');

    expect(await readBrowserGroupState(browser, 'non-existent-group')).toEqual({
      hasGroup: true,
      enabled: true,
    });
  });

  it('disableGroup auto-registers a non-existent group as disabled', async () => {
    installBrowserGlobals();
    const browser = makeBrowser();
    track(startRuntime(configWithoutGroup()));

    await disableGroup(browser, 'ghost-group');

    expect(await readBrowserGroupState(browser, 'ghost-group')).toEqual({
      hasGroup: true,
      enabled: false,
    });
  });

  it('enableSWGroup enables grouped Service Worker chaos', async () => {
    installBrowserGlobals();
    const browser = makeBrowser();
    registerSWChaosCommands(browser);
    const runtime = track(startSWRuntime(configWithPaymentGroupInitiallyDisabled()));

    const before = await runtime.request('/api/pay');
    await browser.commandCalls.enableSWGroup('payments');
    const afterEnable = await runtime.request('/api/pay');
    await browser.commandCalls.disableSWGroup('payments');
    const afterDisable = await runtime.request('/api/pay');

    expect(before.status).toBe(200);
    expect(afterEnable.status).toBe(503);
    expect(afterDisable.status).toBe(200);
    expect(countAppliedFailures(runtime.log(), 503)).toBe(1);
  });

  it('invalid group names throw errors before browser execution', async () => {
    installBrowserGlobals();
    const browser = makeBrowser();

    await expect(enableGroup(browser, '')).rejects.toThrow('[chaos-maker] group name cannot be empty');
    await expect(enableGroup(browser, null as unknown as string)).rejects.toThrow(
      '[chaos-maker] group name must be a string',
    );
  });
});
