import { describe, expect, it } from 'vitest';
import { ChaosConfigBuilder } from '../src/builder';

describe('ChaosConfigBuilder rule groups', () => {
  it('.inGroup tags exactly the next rule pushed (single-shot)', () => {
    const cfg = new ChaosConfigBuilder()
      .inGroup('A')
      .failRequests('/x', 500, 1)
      .addLatency('/y', 100, 1)
      .build();

    const failures = cfg.network!.failures!;
    const latencies = cfg.network!.latencies!;
    expect(failures[0].group).toBe('A');
    expect(latencies[0].group).toBeUndefined();
  });

  it('.inGroup rejects empty or whitespace-only names', () => {
    expect(() => new ChaosConfigBuilder().inGroup('')).toThrow('[chaos-maker] Group name cannot be empty');
    expect(() => new ChaosConfigBuilder().inGroup('   ')).toThrow('[chaos-maker] Group name cannot be empty');
  });

  it('.inGroup applies regardless of which builder method consumes it next', () => {
    const cfg = new ChaosConfigBuilder()
      .failRequests('/preceding', 500, 1)
      .inGroup('payments')
      .assaultUi('.checkout', 'disable', 1)
      .build();

    expect(cfg.network!.failures![0].group).toBeUndefined();
    expect(cfg.ui!.assaults![0].group).toBe('payments');
  });

  it('chained .inGroup calls re-tag the next rule each time', () => {
    const cfg = new ChaosConfigBuilder()
      .inGroup('A').failRequests('/a', 500, 1)
      .inGroup('B').failRequests('/b', 500, 1)
      .failRequests('/c', 500, 1)
      .build();
    const f = cfg.network!.failures!;
    expect([f[0].group, f[1].group, f[2].group]).toEqual(['A', 'B', undefined]);
  });

  it('.defineGroup writes a groups entry on the config', () => {
    const cfg = new ChaosConfigBuilder()
      .defineGroup(' analytics ', { enabled: false })
      .defineGroup('payments')
      .build();
    expect(cfg.groups).toEqual([
      { name: 'analytics', enabled: false },
      { name: 'payments' },
    ]);
  });

  it('.defineGroup rejects empty or whitespace-only names', () => {
    expect(() => new ChaosConfigBuilder().defineGroup('')).toThrow('[chaos-maker] Group name cannot be empty');
    expect(() => new ChaosConfigBuilder().defineGroup('   ')).toThrow('[chaos-maker] Group name cannot be empty');
  });

  it('build() round-trip preserves group on rules', () => {
    const cfg = new ChaosConfigBuilder()
      .inGroup('payments')
      .delayMessages('ws://x', 'inbound', 100, 1)
      .build();
    expect(cfg.websocket!.delays![0].group).toBe('payments');
  });

  it('.inGroup applies to UI assault rules', () => {
    const cfg = new ChaosConfigBuilder()
      .inGroup('checkout')
      .assaultUi('button.pay', 'disable', 1)
      .build();
    expect(cfg.ui!.assaults![0].group).toBe('checkout');
  });

  it('.inGroup applies to SSE rules', () => {
    const cfg = new ChaosConfigBuilder()
      .inGroup('analytics')
      .dropSSE('/events', 1, 'metric')
      .build();
    expect(cfg.sse!.drops![0].group).toBe('analytics');
  });
});
