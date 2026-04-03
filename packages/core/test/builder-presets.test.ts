import { describe, it, expect } from 'vitest';
import { ChaosConfigBuilder } from '../src/builder';
import { presets } from '../src/presets';
import { validateConfig } from '../src/validation';

describe('ChaosConfigBuilder', () => {
  it('should build an empty config by default', () => {
    const builder = new ChaosConfigBuilder();
    const config = builder.build();
    expect(config.network).toEqual({});
    expect(config.ui).toEqual({});
  });

  it('should add failure requests', () => {
    const builder = new ChaosConfigBuilder();
    builder.failRequests('/api/', 500, 0.5, ['GET']);
    const config = builder.build();
    expect(config.network?.failures).toHaveLength(1);
    expect(config.network?.failures?.[0]).toEqual({
      urlPattern: '/api/',
      statusCode: 500,
      probability: 0.5,
      methods: ['GET'],
      body: undefined,
      headers: undefined
    });
  });

  it('should add latency', () => {
    const builder = new ChaosConfigBuilder();
    builder.addLatency('/api/', 1000, 1.0);
    const config = builder.build();
    expect(config.network?.latencies).toHaveLength(1);
    expect(config.network?.latencies?.[0].delayMs).toBe(1000);
  });

  it('should add abort requests', () => {
    const builder = new ChaosConfigBuilder();
    builder.abortRequests('/api/', 1.0, 100);
    const config = builder.build();
    expect(config.network?.aborts).toHaveLength(1);
    expect(config.network?.aborts?.[0].timeout).toBe(100);
  });

  it('should add corruptions', () => {
    const builder = new ChaosConfigBuilder();
    builder.corruptResponses('/api/', 'truncate', 1.0);
    const config = builder.build();
    expect(config.network?.corruptions).toHaveLength(1);
    expect(config.network?.corruptions?.[0].strategy).toBe('truncate');
  });

  it('should add cors simulation', () => {
    const builder = new ChaosConfigBuilder();
    builder.simulateCors('/api/', 1.0);
    const config = builder.build();
    expect(config.network?.cors).toHaveLength(1);
    expect(config.network?.cors?.[0].probability).toBe(1.0);
  });

  it('should add UI assaults', () => {
    const builder = new ChaosConfigBuilder();
    builder.assaultUi('button', 'disable', 1.0);
    const config = builder.build();
    expect(config.ui?.assaults).toHaveLength(1);
    expect(config.ui?.assaults?.[0].action).toBe('disable');
  });

  it('should chain methods', () => {
    const config = new ChaosConfigBuilder()
      .failRequests('/api/1', 500, 1.0)
      .addLatency('/api/2', 500, 1.0)
      .build();
    
    expect(config.network?.failures).toHaveLength(1);
    expect(config.network?.latencies).toHaveLength(1);
  });

  it('should return a snapshot from build()', () => {
    const builder = new ChaosConfigBuilder();
    const firstConfig = builder.build();

    builder.addLatency('/api/', 1000, 1.0);

    expect(firstConfig).toEqual({ network: {}, ui: {} });
  });
});

describe('Presets', () => {
  it('should have predefined presets', () => {
    expect(presets.unstableApi).toBeDefined();
    expect(presets.slowNetwork).toBeDefined();
    expect(presets.offlineMode).toBeDefined();
    expect(presets.flakyConnection).toBeDefined();
    expect(presets.degradedUi).toBeDefined();
  });

  it('unstableApi should have failures and latencies', () => {
    const config = presets.unstableApi;
    expect(config.network?.failures).toBeDefined();
    expect(config.network?.latencies).toBeDefined();
  });

  it('all presets should pass config validation', () => {
    for (const config of Object.values(presets)) {
      expect(() => validateConfig(config)).not.toThrow();
    }
  });
});
