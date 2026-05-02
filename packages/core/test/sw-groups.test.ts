import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ChaosConfig, ChaosEvent } from '../src';

/**
 * Phase A SW group tests.
 *
 * Phase A only adds the registry data layer: SW configs may carry `group: …`
 * on rules, the SW state owns a `RuleGroupRegistry`, and a disabled group on
 * an incoming config blocks chaos. Phase B will introduce a dedicated
 * `__chaosMakerToggleGroup` message and an ack pattern; the toggle-message
 * tests live in `sw-groups.test.ts` then.
 */

type MessageListener = (event: { data: unknown; ports?: unknown[] }) => void;

interface FakeClient {
  id: string;
  messages: unknown[];
  postMessage(m: unknown): void;
}

function makeFakeClient(id: string): FakeClient {
  return {
    id,
    messages: [],
    postMessage(m) { this.messages.push(m); },
  };
}

interface SWLikeTarget {
  fetch: typeof globalThis.fetch;
  WebSocket?: typeof WebSocket;
  clients: { matchAll: () => Promise<readonly FakeClient[]> };
  __messageListeners: Set<MessageListener>;
  addEventListener: (type: string, fn: MessageListener) => void;
  removeEventListener: (type: string, fn: MessageListener) => void;
  dispatchMessage: (data: unknown, ports?: unknown[]) => void;
}

function makeSWTarget(clients: FakeClient[]): SWLikeTarget {
  const listeners = new Set<MessageListener>();
  return {
    fetch: vi.fn().mockResolvedValue(new Response('real', { status: 200 })),
    clients: {
      matchAll: vi.fn().mockResolvedValue(clients),
    },
    __messageListeners: listeners,
    addEventListener(type, fn) {
      if (type === 'message') listeners.add(fn);
    },
    removeEventListener(type, fn) {
      if (type === 'message') listeners.delete(fn);
    },
    dispatchMessage(data, ports) {
      for (const fn of listeners) fn({ data, ports });
    },
  };
}

async function importSwWithTarget(target: SWLikeTarget): Promise<typeof import('../src/sw')> {
  const INSTALL_MARK = Symbol.for('chaos-maker.sw.installed');
  delete (target as unknown as Record<symbol, unknown>)[INSTALL_MARK];
  vi.stubGlobal('self', target);
  return import('../src/sw');
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('SW chaos — rule groups (Phase A)', () => {
  let origSelf: unknown;
  beforeEach(() => {
    vi.resetModules();
    origSelf = (globalThis as Record<string, unknown>).self;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    (globalThis as Record<string, unknown>).self = origSelf;
  });

  it('a config with `groups: [{name, enabled:false}]` blocks the matching rule and emits a single rule-group:gated event', async () => {
    const client = makeFakeClient('a');
    const target = makeSWTarget([client]);
    const { installChaosSW } = await importSwWithTarget(target);
    const handle = installChaosSW();

    const cfg: ChaosConfig = {
      groups: [{ name: 'payments', enabled: false }],
      network: {
        failures: [
          { urlPattern: '/api/pay', statusCode: 503, probability: 1, group: 'payments' },
        ],
      },
      seed: 42,
    };
    target.dispatchMessage({ __chaosMakerConfig: cfg });
    await flushMicrotasks();

    const r1 = await target.fetch('/api/pay');
    const r2 = await target.fetch('/api/pay');
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    const log = handle.getLog();
    const gated = log.filter((e) => e.type === 'rule-group:gated');
    expect(gated.length).toBe(1);
    expect(gated[0].detail.groupName).toBe('payments');
    expect(gated[0].applied).toBe(false);

    handle.uninstall();
  });

  it('rules with no group continue firing while another group is disabled', async () => {
    const target = makeSWTarget([]);
    const { installChaosSW } = await importSwWithTarget(target);
    const handle = installChaosSW();

    const cfg: ChaosConfig = {
      groups: [{ name: 'analytics', enabled: false }],
      network: {
        failures: [
          { urlPattern: '/api/data', statusCode: 500, probability: 1 }, // ungrouped
          { urlPattern: '/api/track', statusCode: 503, probability: 1, group: 'analytics' },
        ],
      },
      seed: 1,
    };
    target.dispatchMessage({ __chaosMakerConfig: cfg });
    await flushMicrotasks();

    const ungrouped = await target.fetch('/api/data');
    const gatedRes = await target.fetch('/api/track');
    expect(ungrouped.status).toBe(500);
    expect(gatedRes.status).toBe(200);

    handle.uninstall();
  });

  it('startEngine seeds groups from rule references — referenced groups become observable post-config', async () => {
    const client = makeFakeClient('a');
    const target = makeSWTarget([client]);
    const { installChaosSW } = await importSwWithTarget(target);
    const handle = installChaosSW();

    const cfg: ChaosConfig = {
      network: {
        failures: [
          { urlPattern: '/api/pay', statusCode: 500, probability: 1, group: 'payments' },
        ],
      },
      seed: 9,
    };
    target.dispatchMessage({ __chaosMakerConfig: cfg });
    await flushMicrotasks();

    // The first request to /api/pay still applies chaos because `payments`
    // was auto-registered as default-on.
    const r = await target.fetch('/api/pay');
    expect(r.status).toBe(500);

    handle.uninstall();
  });

  it('broadcasts rule-group:gated events to controlled clients', async () => {
    const client = makeFakeClient('a');
    const target = makeSWTarget([client]);
    const { installChaosSW } = await importSwWithTarget(target);
    const handle = installChaosSW();

    const cfg: ChaosConfig = {
      groups: [{ name: 'payments', enabled: false }],
      network: {
        failures: [{ urlPattern: '/api/pay', statusCode: 500, probability: 1, group: 'payments' }],
      },
      seed: 11,
    };
    target.dispatchMessage({ __chaosMakerConfig: cfg });
    await flushMicrotasks();
    await target.fetch('/api/pay');
    await flushMicrotasks();

    const events = client.messages.filter(
      (m): m is { __chaosMakerSWEvent: true; event: ChaosEvent } =>
        typeof m === 'object' && m !== null && '__chaosMakerSWEvent' in m,
    );
    const gatedEvents = events.filter((m) => m.event.type === 'rule-group:gated');
    expect(gatedEvents.length).toBe(1);

    handle.uninstall();
  });
});
