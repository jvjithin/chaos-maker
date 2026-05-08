import { describe, it, expect } from 'vitest';
import { validateChaosConfig, VALIDATOR_BRAND_VERSION } from '../src/validation';

const BRAND = Symbol.for('chaos-maker.validated');

describe('validated-config brand', () => {
  it('first call brands the result with VALIDATOR_BRAND_VERSION', () => {
    const out = validateChaosConfig({ network: {} });
    const brandValue = (out as unknown as Record<symbol, unknown>)[BRAND];
    expect(brandValue).toBe(VALIDATOR_BRAND_VERSION);
  });

  it('second call with same input + no opts returns the input unchanged (referential equality)', () => {
    const first = validateChaosConfig({ network: {} });
    const second = validateChaosConfig(first);
    expect(second).toBe(first);
  });

  it('second call with any opt re-validates (no short-circuit)', () => {
    const first = validateChaosConfig({ network: {} });
    const second = validateChaosConfig(first, { unknownFields: 'ignore' });
    expect(second).not.toBe(first);
  });

  it('forged boolean brand does not short-circuit', () => {
    const forged = { network: {} } as unknown as Record<symbol, unknown>;
    Object.defineProperty(forged, BRAND, {
      value: true,
      enumerable: false,
      writable: false,
      configurable: false,
    });
    const validated = validateChaosConfig(forged);
    expect(validated).not.toBe(forged);
    expect((validated as unknown as Record<symbol, unknown>)[BRAND]).toBe(VALIDATOR_BRAND_VERSION);
  });

  it('brand is non-enumerable: JSON-clone strips it', () => {
    const out = validateChaosConfig({ network: {} });
    const cloned = JSON.parse(JSON.stringify(out));
    expect((cloned as Record<symbol, unknown>)[BRAND]).toBeUndefined();
    const revalidated = validateChaosConfig(cloned);
    expect(revalidated).not.toBe(cloned);
  });

  it('brand is non-writable / non-configurable', () => {
    const out = validateChaosConfig({ network: {} });
    expect(() => {
      Object.defineProperty(out, BRAND, { value: 999 });
    }).toThrow();
  });

  it('brand is stamped only after all validation layers (failed custom validator => no brand)', () => {
    const input = { network: { failures: [{ urlPattern: '/a', statusCode: 500, probability: 1 }] } };
    expect(() =>
      validateChaosConfig(input, {
        customValidators: {
          'network.failure': () => [{
            path: 'network.failures[0]', code: 'custom', ruleType: 'network.failure', message: 'reject',
          }],
        },
      }),
    ).toThrow();
    expect((input as unknown as Record<symbol, unknown>)[BRAND]).toBeUndefined();
  });

  it('VALIDATOR_BRAND_VERSION exported as a number', () => {
    expect(typeof VALIDATOR_BRAND_VERSION).toBe('number');
  });
});
