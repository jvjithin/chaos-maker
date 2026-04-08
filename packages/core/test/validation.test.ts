import { describe, it, expect } from 'vitest';
import { validateConfig } from '../src/validation';
import { ChaosConfigError } from '../src/errors';

describe('validateConfig', () => {
  it('should accept a valid full config', () => {
    const config = {
      network: {
        failures: [
          { urlPattern: '/api', statusCode: 503, probability: 1.0 },
        ],
        latencies: [
          { urlPattern: '/api', delayMs: 1000, probability: 0.5 },
        ],
      },
      ui: {
        assaults: [
          { selector: '#btn', action: 'disable' as const, probability: 0.8 },
        ],
      },
    };
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('should accept an empty config', () => {
    expect(() => validateConfig({})).not.toThrow();
  });

  it('should accept config with empty arrays', () => {
    const config = {
      network: { failures: [], latencies: [] },
      ui: { assaults: [] },
    };
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('should accept probability of exactly 0', () => {
    const config = {
      network: {
        failures: [{ urlPattern: '/api', statusCode: 500, probability: 0 }],
      },
    };
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('should accept probability of exactly 1', () => {
    const config = {
      network: {
        failures: [{ urlPattern: '/api', statusCode: 500, probability: 1 }],
      },
    };
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('should accept custom body, statusText, and headers', () => {
    const config = {
      network: {
        failures: [{
          urlPattern: '/api',
          statusCode: 500,
          probability: 1.0,
          body: '{"error": "custom"}',
          statusText: 'Internal Server Error',
          headers: { 'Content-Type': 'application/json' },
        }],
      },
    };
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('should reject probability > 1', () => {
    const config = {
      network: {
        failures: [{ urlPattern: '/api', statusCode: 500, probability: 1.5 }],
      },
    };
    expect(() => validateConfig(config)).toThrow(ChaosConfigError);
  });

  it('should reject probability < 0', () => {
    const config = {
      network: {
        failures: [{ urlPattern: '/api', statusCode: 500, probability: -0.1 }],
      },
    };
    expect(() => validateConfig(config)).toThrow(ChaosConfigError);
  });

  it('should reject empty urlPattern', () => {
    const config = {
      network: {
        failures: [{ urlPattern: '', statusCode: 500, probability: 1.0 }],
      },
    };
    expect(() => validateConfig(config)).toThrow(ChaosConfigError);
  });

  it('should reject invalid statusCode', () => {
    const config = {
      network: {
        failures: [{ urlPattern: '/api', statusCode: 999, probability: 1.0 }],
      },
    };
    expect(() => validateConfig(config)).toThrow(ChaosConfigError);
  });

  it('should reject negative delayMs', () => {
    const config = {
      network: {
        latencies: [{ urlPattern: '/api', delayMs: -100, probability: 1.0 }],
      },
    };
    expect(() => validateConfig(config)).toThrow(ChaosConfigError);
  });

  it('should reject empty selector', () => {
    const config = {
      ui: {
        assaults: [{ selector: '', action: 'disable', probability: 1.0 }],
      },
    };
    expect(() => validateConfig(config)).toThrow(ChaosConfigError);
  });

  it('should reject invalid action', () => {
    const config = {
      ui: {
        assaults: [{ selector: '#btn', action: 'destroy', probability: 1.0 }],
      },
    };
    expect(() => validateConfig(config)).toThrow(ChaosConfigError);
  });

  it('should include readable issue messages', () => {
    const config = {
      network: {
        failures: [{ urlPattern: '', statusCode: 999, probability: 2.0 }],
      },
    };
    try {
      validateConfig(config);
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ChaosConfigError);
      const err = e as ChaosConfigError;
      expect(err.issues.length).toBeGreaterThan(0);
      expect(err.message).toContain('Invalid ChaosConfig');
    }
  });

  it('should reject missing required fields', () => {
    const config = {
      network: {
        failures: [{ urlPattern: '/api' }],
      },
    };
    expect(() => validateConfig(config)).toThrow(ChaosConfigError);
  });

  it('should reject unknown keys (typos)', () => {
    const config = {
      network: {
        failures: [{ urlPattern: '/api', statusCode: 500, probability: 1.0, delaayMs: 100 }],
      },
    };
    expect(() => validateConfig(config)).toThrow(ChaosConfigError);
  });

  it('should reject unknown top-level keys', () => {
    const config = { networking: { failures: [] } };
    expect(() => validateConfig(config)).toThrow(ChaosConfigError);
  });

  it('should accept a valid integer seed', () => {
    const config = { seed: 42 };
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('should accept seed of 0', () => {
    const config = { seed: 0 };
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('should reject a non-integer seed', () => {
    const config = { seed: 3.14 };
    expect(() => validateConfig(config)).toThrow(ChaosConfigError);
  });

  it('should accept config with seed and network rules', () => {
    const config = {
      seed: 12345,
      network: {
        failures: [{ urlPattern: '/api', statusCode: 500, probability: 1.0 }],
      },
    };
    expect(() => validateConfig(config)).not.toThrow();
  });
});
