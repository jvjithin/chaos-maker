import { describe, it, expect } from 'vitest';
import { validateChaosConfig } from '../src/validation';
import { ChaosConfigError } from '../src/errors';
import type { CustomValidatorMap } from '../src/validation-types';

function captureThrow(fn: () => unknown): ChaosConfigError {
  try {
    fn();
  } catch (e) {
    if (e instanceof ChaosConfigError) return e;
    throw e;
  }
  throw new Error('expected validateChaosConfig to throw ChaosConfigError');
}

describe('customValidators', () => {
  it('runs against every network.failure rule and appends issues', () => {
    const validators: CustomValidatorMap = {
      'network.failure': (rule, ctx) => {
        const r = rule as { probability: number };
        if (r.probability > 0.5) {
          return [{
            path: ctx.path,
            code: 'custom',
            ruleType: ctx.ruleType,
            message: 'probability exceeds 0.5',
          }];
        }
        return [];
      },
    };

    const err = captureThrow(() =>
      validateChaosConfig({
        network: {
          failures: [
            { urlPattern: '/a', statusCode: 500, probability: 0.9 },
            { urlPattern: '/b', statusCode: 500, probability: 0.4 },
          ],
        },
      }, { customValidators: validators }),
    );
    const customs = err.issues.filter((i) => i.code === 'custom');
    expect(customs).toHaveLength(1);
    expect(customs[0].path).toBe('network.failures[0]');
  });

  it('void return is no-op', () => {
    const validators: CustomValidatorMap = {
      'network.latency': () => undefined,
    };
    expect(() =>
      validateChaosConfig({
        network: { latencies: [{ urlPattern: '/a', delayMs: 1, probability: 1 }] },
      }, { customValidators: validators }),
    ).not.toThrow();
  });

  it('thrown error inside validator is wrapped into code:custom issue', () => {
    const validators: CustomValidatorMap = {
      'network.failure': () => { throw new Error('boom'); },
    };
    const err = captureThrow(() =>
      validateChaosConfig({
        network: { failures: [{ urlPattern: '/a', statusCode: 500, probability: 1 }] },
      }, { customValidators: validators }),
    );
    const issue = err.issues[0];
    expect(issue.code).toBe('custom');
    expect(issue.message).toContain('boom');
  });

  it("'top-level' validator sees the merged config", () => {
    let seen: unknown = undefined;
    const validators: CustomValidatorMap = {
      'top-level': (cfg) => {
        seen = cfg;
        return [];
      },
    };
    validateChaosConfig({ presets: ['slowNetwork'] }, { customValidators: validators });
    expect((seen as { network?: unknown }).network).toBeDefined();
  });
});
