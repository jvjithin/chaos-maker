import { describe, it, expect } from 'vitest';
import { validateChaosConfig } from '../src/validation';

const isCi = typeof process !== 'undefined' && !!process.env.CI;

describe.skipIf(!isCi)('validation perf gates', () => {
  it('1000-rule config validates under a generous ceiling', () => {
    const failures = Array.from({ length: 1000 }, (_, i) => ({
      urlPattern: `/api/${i}`,
      statusCode: 500,
      probability: 0.5,
    }));
    const cfg = { network: { failures } };
    const start = performance.now();
    validateChaosConfig(cfg);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(2000);
    console.log(`[validation-perf] 1000-rule first validation: ${elapsed.toFixed(2)}ms`);
  });

  it('re-validation of branded result short-circuits in well under 5ms', () => {
    const cfg = { network: { failures: [{ urlPattern: '/a', statusCode: 500, probability: 1 }] } };
    const validated = validateChaosConfig(cfg);
    const start = performance.now();
    for (let i = 0; i < 1000; i++) validateChaosConfig(validated);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
    console.log(`[validation-perf] 1000 short-circuit revalidations: ${elapsed.toFixed(2)}ms`);
  });
});
