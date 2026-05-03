import { afterEach, describe, expect, it } from 'vitest';
import { ChaosConfigBuilder, ChaosMaker } from '@chaos-maker/core';
import type { ChaosConfig, ChaosEvent } from '@chaos-maker/core';
import type { Page } from '@playwright/test';
import {
  enableGroup,
  disableGroup,
  enableSWGroup,
  disableSWGroup,
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
    getGroupState: (name) => instance.getGroupState(name),
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

function makePage(): Page {
  return {
    addInitScript: async () => undefined,
    evaluate: async (fn: unknown, arg?: unknown) => {
      if (typeof fn === 'function') {
        return (fn as (arg?: unknown) => unknown)(arg) as never;
      }
      return undefined as never;
    },
  } as unknown as Page;
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

async function readPageGroupState(page: Page, name: string): Promise<{ hasGroup: boolean; enabled: boolean | null }> {
  return page.evaluate(({ n }: { n: string }) => {
    const utils = (globalThis as unknown as { chaosUtils?: ChaosUtilsHarness }).chaosUtils;
    return {
      hasGroup: utils?.instance.hasGroup(n) ?? false,
      enabled: utils?.getGroupState(n) ?? null,
    };
  }, { n: name });
}

describe('@chaos-maker/playwright rule groups', () => {
  it('enable group executes grouped rule', async () => {
    const page = makePage();
    const runtime = track(startRuntime(configWithPaymentGroupInitiallyDisabled()));

    await enableGroup(page, 'payments');
    const response = await runtime.request('/api/pay');

    expect(response.status).toBe(503);
    expect(hasAppliedFailure(runtime.log(), 503)).toBe(true);
  });

  it('disable group skips grouped rule', async () => {
    const page = makePage();
    const runtime = track(startRuntime(configWithPaymentGroup()));

    await disableGroup(page, 'payments');
    const response = await runtime.request('/api/pay');

    expect(response.status).toBe(200);
    expect(hasAppliedFailure(runtime.log(), 503)).toBe(false);
    expect(runtime.log().some((event) => event.type === 'rule-group:gated')).toBe(true);
  });

  it('enable then disable group changes real fetch behavior', async () => {
    const page = makePage();
    const runtime = track(startRuntime(configWithPaymentGroupInitiallyDisabled()));

    await enableGroup(page, 'payments');
    const enabled = await runtime.request('/api/pay');
    await disableGroup(page, 'payments');
    const disabled = await runtime.request('/api/pay');

    expect(enabled.status).toBe(503);
    expect(disabled.status).toBe(200);
    expect(countAppliedFailures(runtime.log(), 503)).toBe(1);
  });

  it('rules without inGroup still execute through the default group', async () => {
    const runtime = track(startRuntime(configWithoutGroup()));

    const response = await runtime.request('/api/pay');

    expect(response.status).toBe(503);
    expect(hasAppliedFailure(runtime.log(), 503)).toBe(true);
  });

  it('multiple groups only apply enabled groups', async () => {
    const page = makePage();
    const runtime = track(startRuntime(configWithMultipleGroups()));

    await disableGroup(page, 'payments');
    const payments = await runtime.request('/api/pay');
    const auth = await runtime.request('/api/auth');

    expect(payments.status).toBe(200);
    expect(auth.status).toBe(401);
    expect(hasAppliedFailure(runtime.log(), 503)).toBe(false);
    expect(hasAppliedFailure(runtime.log(), 401)).toBe(true);
  });

  it('enableGroup auto-registers a non-existent group as enabled', async () => {
    const page = makePage();
    track(startRuntime(configWithoutGroup()));

    await enableGroup(page, 'non-existent-group');

    expect(await readPageGroupState(page, 'non-existent-group')).toEqual({
      hasGroup: true,
      enabled: true,
    });
  });

  it('disableGroup auto-registers a non-existent group as disabled', async () => {
    const page = makePage();
    track(startRuntime(configWithoutGroup()));

    await disableGroup(page, 'ghost-group');

    expect(await readPageGroupState(page, 'ghost-group')).toEqual({
      hasGroup: true,
      enabled: false,
    });
  });

  it('reflects group state through the page realm chaosUtils contract', async () => {
    const page = makePage();
    track(startRuntime(configWithPaymentGroupInitiallyDisabled()));

    await enableGroup(page, 'payments');
    expect((await readPageGroupState(page, 'payments')).enabled).toBe(true);

    await disableGroup(page, 'payments');
    expect((await readPageGroupState(page, 'payments')).enabled).toBe(false);
  });

  it('enableSWGroup enables grouped Service Worker chaos', async () => {
    const page = makePage();
    const runtime = track(startSWRuntime(configWithPaymentGroupInitiallyDisabled()));

    const before = await runtime.request('/api/pay');
    await enableSWGroup(page, 'payments');
    const afterEnable = await runtime.request('/api/pay');
    await disableSWGroup(page, 'payments');
    const afterDisable = await runtime.request('/api/pay');

    expect(before.status).toBe(200);
    expect(afterEnable.status).toBe(503);
    expect(afterDisable.status).toBe(200);
    expect(countAppliedFailures(runtime.log(), 503)).toBe(1);
  });

  it('invalid group names throw errors before page evaluation', async () => {
    const page = makePage();

    await expect(enableGroup(page, '')).rejects.toThrow('[chaos-maker] group name cannot be empty');
    await expect(enableGroup(page, null as unknown as string)).rejects.toThrow(
      '[chaos-maker] group name must be a string',
    );
  });
});
