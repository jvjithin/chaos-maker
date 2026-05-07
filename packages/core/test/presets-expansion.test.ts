import { describe, it, expect } from 'vitest';
import type { ChaosConfig } from '../src/config';
import { BUILT_IN_PRESETS, PresetRegistry, expandPresets } from '../src/presets';
import { prepareChaosConfig, validateConfig } from '../src/validation';
import { ChaosConfigError } from '../src/errors';

describe('expandPresets', () => {
  it('returns a fresh ChaosConfig — caller owns the result', () => {
    const input: ChaosConfig = { presets: ['slow-api'] };
    const out = expandPresets(input, new PresetRegistry());
    expect(out).not.toBe(input);
    expect(out.presets).toBeUndefined();
    expect(out.customPresets).toBeUndefined();
  });

  it('mutating the result does not affect the input', () => {
    const input: ChaosConfig = {
      network: { failures: [{ urlPattern: '/api', statusCode: 500, probability: 1 }] },
    };
    const out = expandPresets(input, new PresetRegistry());
    out.network!.failures!.push({ urlPattern: '/x', statusCode: 503, probability: 1 });
    expect(input.network!.failures).toHaveLength(1);
  });

  it('strips presets and customPresets even when presets[] is empty', () => {
    const input: ChaosConfig = {
      customPresets: { 'team-flow': {} },
      network: { latencies: [{ urlPattern: '/api', delayMs: 100, probability: 1 }] },
    };
    const out = expandPresets(input, new PresetRegistry());
    expect(out.presets).toBeUndefined();
    expect(out.customPresets).toBeUndefined();
    expect(out.network!.latencies).toHaveLength(1);
  });

  it('expands a single built-in preset, appending preset rules first then user rules', () => {
    const input: ChaosConfig = {
      presets: ['slow-api'],
      network: {
        latencies: [{ urlPattern: '/user', delayMs: 50, probability: 1 }],
      },
    };
    const out = expandPresets(input, new PresetRegistry());
    expect(out.network!.latencies).toHaveLength(2);
    expect(out.network!.latencies![0].urlPattern).toBe('*');
    expect(out.network!.latencies![0].delayMs).toBe(2000);
    expect(out.network!.latencies![1].urlPattern).toBe('/user');
  });

  it('appends multiple presets in the order listed', () => {
    const input: ChaosConfig = { presets: ['slowNetwork', 'unstableApi'] };
    const out = expandPresets(input, new PresetRegistry());
    expect(out.network!.latencies![0].urlPattern).toBe('*');
    expect(out.network!.latencies![1].urlPattern).toBe('/api/');
  });

  it('camelCase + kebab name resolve to identical rules', () => {
    const a = expandPresets({ presets: ['slow-api'] }, new PresetRegistry());
    const b = expandPresets({ presets: ['slowNetwork'] }, new PresetRegistry());
    expect(a.network!.latencies).toEqual(b.network!.latencies);
  });

  it('dedupes preset names preserving first occurrence', () => {
    const out = expandPresets({ presets: ['slow-api', 'slow-api', 'slow-api'] }, new PresetRegistry());
    expect(out.network!.latencies).toHaveLength(1);
  });

  it('does not mutate BUILT_IN_PRESETS', () => {
    const before = BUILT_IN_PRESETS.length;
    expandPresets({ presets: ['slow-api'] }, new PresetRegistry());
    expect(BUILT_IN_PRESETS.length).toBe(before);
    expect(Object.isFrozen(BUILT_IN_PRESETS)).toBe(true);
  });

  it('throws on unknown preset name', () => {
    expect(() => expandPresets({ presets: ['nope'] }, new PresetRegistry())).toThrow(/'nope' is not registered/);
  });

  it('preserves RegExp matchers from custom presets via cloneValue', () => {
    const registry = new PresetRegistry();
    registry.registerAll({
      'gql-team': {
        network: {
          failures: [
            { urlPattern: '/graphql', statusCode: 500, probability: 1, graphqlOperation: /^Get/ },
          ],
        },
      },
    });
    const out = expandPresets({ presets: ['gql-team'] }, registry);
    const matcher = out.network!.failures![0].graphqlOperation;
    expect(matcher).toBeInstanceOf(RegExp);
    expect((matcher as RegExp).source).toBe('^Get');
  });

  it('appendSlice fail-fast on non-array sub-key inside a registered preset', () => {
    const registry = new PresetRegistry([]);
    registry.register({
      name: 'broken',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config: { network: { failures: 'oops' as any } },
    });
    expect(() => expandPresets({ presets: ['broken'] }, registry)).toThrow(/must be an array/);
  });

  it('concatenates groups across preset and user', () => {
    const registry = new PresetRegistry();
    registry.registerAll({
      'team-flow': {
        groups: [{ name: 'preset-side' }],
        network: {
          failures: [{ urlPattern: '/x', statusCode: 503, probability: 1, group: 'preset-side' }],
        },
      },
    });
    const out = expandPresets(
      {
        presets: ['team-flow'],
        groups: [{ name: 'user-side' }],
      },
      registry,
    );
    expect(out.groups?.map((g) => g.name)).toEqual(['preset-side', 'user-side']);
  });
});

describe('prepareChaosConfig', () => {
  it('runs the full pipeline (validate → register → expand → revalidate)', () => {
    const out = prepareChaosConfig({ presets: ['slow-api'] });
    expect(out.network!.latencies).toHaveLength(1);
    expect(out.presets).toBeUndefined();
    expect(out.customPresets).toBeUndefined();
  });

  it('throws ChaosConfigError on unknown preset name', () => {
    expect(() => prepareChaosConfig({ presets: ['nope'] })).toThrow(ChaosConfigError);
  });

  it('throws ChaosConfigError when customPresets carries a chain (presets field)', () => {
    expect(() =>
      prepareChaosConfig({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        customPresets: { x: { presets: ['y'] } as any },
      }),
    ).toThrow(ChaosConfigError);
  });

  it('throws ChaosConfigError when customPresets carries seed (forbidden subfield)', () => {
    expect(() =>
      prepareChaosConfig({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        customPresets: { x: { seed: 1 } as any },
      }),
    ).toThrow(ChaosConfigError);
  });

  it('throws ChaosConfigError on customPresets vs built-in collision', () => {
    expect(() =>
      prepareChaosConfig({ customPresets: { slowNetwork: {} } }),
    ).toThrow(/already registered/);
  });

  it('runs the post-merge Zod pass — group-name collision across preset+user fails', () => {
    let caught: unknown;
    try {
      prepareChaosConfig({
        customPresets: {
          'team-flow': {
            groups: [{ name: 'payments' }],
          },
        },
        presets: ['team-flow'],
        groups: [{ name: 'payments' }],
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ChaosConfigError);
    expect((caught as ChaosConfigError).message).toMatch(/duplicate group name/);
  });

  it('canonical-entry-point asymmetry: validateConfig keeps preset fields, prepareChaosConfig strips them', () => {
    const input = { presets: ['slow-api'] };
    const validated = validateConfig(input);
    expect(validated.presets).toEqual(['slow-api']);
    const prepared = prepareChaosConfig(input);
    expect(prepared.presets).toBeUndefined();
    expect(prepared.customPresets).toBeUndefined();
  });
});
