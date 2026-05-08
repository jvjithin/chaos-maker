import { describe, it, expect, vi, afterEach } from 'vitest';
import { validateChaosConfig } from '../src/validation';
import { DEPRECATED_FIELDS, checkDeprecations } from '../src/validation-deprecation';

describe('deprecation rails', () => {
  afterEach(() => {
    DEPRECATED_FIELDS.clear();
  });

  it('empty registry: no callback fired, no console.warn', () => {
    const onDeprecation = vi.fn();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      validateChaosConfig({ network: {} }, { onDeprecation });
      expect(onDeprecation).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('synthetic registry entry fires onDeprecation once and console.warn mirrors', () => {
    DEPRECATED_FIELDS.set('seed', {
      since: 'v0.5.0-test',
      message: 'seed deprecated for test',
    });
    const onDeprecation = vi.fn();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      validateChaosConfig({ seed: 1 }, { onDeprecation });
      expect(onDeprecation).toHaveBeenCalledTimes(1);
      const issue = onDeprecation.mock.calls[0][0];
      expect(issue.code).toBe('deprecated');
      expect(issue.path).toBe('seed');
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('checkDeprecations is a pure pass-through when registry is empty', () => {
    const onDeprecation = vi.fn();
    checkDeprecations({}, onDeprecation);
    expect(onDeprecation).not.toHaveBeenCalled();
  });
});
