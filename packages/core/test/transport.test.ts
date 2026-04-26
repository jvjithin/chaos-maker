import { describe, it, expect } from 'vitest';
import { serializeForTransport, deserializeForTransport } from '../src/transport';

describe('serializeForTransport', () => {
  it('passes through primitives unchanged', () => {
    expect(serializeForTransport(42)).toBe(42);
    expect(serializeForTransport('hi')).toBe('hi');
    expect(serializeForTransport(null)).toBe(null);
    expect(serializeForTransport(true)).toBe(true);
  });

  it('replaces a top-level RegExp with a JSON-safe marker', () => {
    const out = serializeForTransport(/^Get/i) as Record<string, unknown>;
    expect(out).toEqual({ __chaosMakerRegExp: { source: '^Get', flags: 'i' } });
    // Must round-trip through JSON without loss.
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });

  it('walks nested arrays and objects', () => {
    const input = {
      network: {
        failures: [
          { urlPattern: '/graphql', graphqlOperation: /^Get/, statusCode: 500 },
          { urlPattern: '/graphql', graphqlOperation: 'CreatePost', statusCode: 401 },
        ],
      },
    };
    const out = serializeForTransport(input);
    const json = JSON.parse(JSON.stringify(out));
    expect(json.network.failures[0].graphqlOperation).toEqual({ __chaosMakerRegExp: { source: '^Get', flags: '' } });
    expect(json.network.failures[1].graphqlOperation).toBe('CreatePost');
  });
});

describe('deserializeForTransport', () => {
  it('reconstructs RegExp from a marker', () => {
    const out = deserializeForTransport({ __chaosMakerRegExp: { source: '^Get', flags: 'i' } });
    expect(out).toBeInstanceOf(RegExp);
    expect((out as RegExp).source).toBe('^Get');
    expect((out as RegExp).flags).toBe('i');
  });

  it('is idempotent on already-real RegExp instances', () => {
    const re = /^Get/;
    expect(deserializeForTransport(re)).toBe(re);
  });

  it('passes through primitives + non-marker objects unchanged', () => {
    expect(deserializeForTransport({ a: 1, b: 'two' })).toEqual({ a: 1, b: 'two' });
    expect(deserializeForTransport([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('round-trips a full ChaosConfig with mixed matchers', () => {
    const input = {
      network: {
        failures: [{ urlPattern: '/graphql', graphqlOperation: /^Get/i, statusCode: 503, probability: 1 }],
        latencies: [{ urlPattern: '/graphql', graphqlOperation: 'SearchProducts', delayMs: 100, probability: 1 }],
      },
    };
    const restored = deserializeForTransport(JSON.parse(JSON.stringify(serializeForTransport(input)))) as typeof input;
    expect(restored.network.failures[0].graphqlOperation).toBeInstanceOf(RegExp);
    expect((restored.network.failures[0].graphqlOperation as RegExp).source).toBe('^Get');
    expect((restored.network.failures[0].graphqlOperation as RegExp).flags).toBe('i');
    expect(restored.network.latencies[0].graphqlOperation).toBe('SearchProducts');
  });
});
