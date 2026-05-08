import { describe, it, expect, vi } from 'vitest';
import { validateChaosConfig, chaosConfigSchemaStrict, chaosConfigSchemaPassthrough } from '../src/validation';
import { ChaosConfigError } from '../src/errors';

describe('unknownFields option', () => {
  it("'reject' (default) throws on unknown top-level keys", () => {
    expect(() =>
      validateChaosConfig({ network: {}, foo: 'x' }),
    ).toThrow(ChaosConfigError);
  });

  it("'reject' issue carries unknown_field code", () => {
    try {
      validateChaosConfig({ network: {}, foo: 'x' });
    } catch (e) {
      expect(e).toBeInstanceOf(ChaosConfigError);
      expect((e as ChaosConfigError).issues.some((i) => i.code === 'unknown_field')).toBe(true);
      return;
    }
    throw new Error('should have thrown');
  });

  it("'warn' returns parsed config with unknowns stripped + emits ONE aggregated console.warn", () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const result = validateChaosConfig(
        {
          network: {},
          mystery: 'x',
          another: 'y',
        },
        { unknownFields: 'warn' },
      );
      expect(result).not.toHaveProperty('mystery');
      expect(result).not.toHaveProperty('another');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const call = String(warnSpy.mock.calls[0][0]);
      expect(call).toContain('mystery');
      expect(call).toContain('another');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("'warn' aggregates all unknown paths in deterministic sort order", () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      validateChaosConfig(
        { z: 1, a: 1, m: 1, network: {} },
        { unknownFields: 'warn' },
      );
      const call = String(warnSpy.mock.calls[0][0]);
      const aIdx = call.indexOf('a');
      const mIdx = call.indexOf('m');
      const zIdx = call.indexOf('z');
      expect(aIdx).toBeLessThan(mIdx);
      expect(mIdx).toBeLessThan(zIdx);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("'ignore' returns parsed config with unknowns stripped + zero console output", () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const result = validateChaosConfig(
        { network: {}, mystery: 'x' },
        { unknownFields: 'ignore' },
      );
      expect(result).not.toHaveProperty('mystery');
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('warn round-trips through preset expansion', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const result = validateChaosConfig(
        {
          presets: ['slowNetwork'],
          weirdTop: 'x',
        },
        { unknownFields: 'warn' },
      );
      expect(result.network?.latencies?.length).toBeGreaterThan(0);
      expect(result).not.toHaveProperty('weirdTop');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('prebuilt schemas are referentially stable across many validation calls', () => {
    const before = chaosConfigSchemaStrict;
    const beforePass = chaosConfigSchemaPassthrough;
    for (let i = 0; i < 1000; i++) {
      validateChaosConfig({ network: {} });
    }
    expect(chaosConfigSchemaStrict).toBe(before);
    expect(chaosConfigSchemaPassthrough).toBe(beforePass);
  });
});
