import { describe, it, expect } from 'vitest';
import { createPrng, generateSeed } from '../src/prng';
import { shouldApplyChaos } from '../src/utils';

describe('createPrng', () => {
  it('should produce deterministic output with the same seed', () => {
    const a = createPrng(42);
    const b = createPrng(42);

    const valuesA = Array.from({ length: 100 }, () => a.random());
    const valuesB = Array.from({ length: 100 }, () => b.random());

    expect(valuesA).toEqual(valuesB);
  });

  it('should produce different output with different seeds', () => {
    const a = createPrng(42);
    const b = createPrng(99);

    const valuesA = Array.from({ length: 10 }, () => a.random());
    const valuesB = Array.from({ length: 10 }, () => b.random());

    expect(valuesA).not.toEqual(valuesB);
  });

  it('should produce values in [0, 1)', () => {
    const { random } = createPrng(12345);
    const values = Array.from({ length: 10000 }, () => random());

    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('should auto-generate a seed when none is provided', () => {
    const { seed } = createPrng();
    expect(typeof seed).toBe('number');
    expect(Number.isInteger(seed)).toBe(true);
  });

  it('should return different auto-generated seeds across calls', () => {
    const seeds = new Set(Array.from({ length: 10 }, () => createPrng().seed));
    // Extremely unlikely to get all duplicates
    expect(seeds.size).toBeGreaterThan(1);
  });

  it('should return the provided seed back', () => {
    const { seed } = createPrng(42);
    expect(seed).toBe(42);
  });
});

describe('generateSeed', () => {
  it('should return a 32-bit unsigned integer', () => {
    for (let i = 0; i < 100; i++) {
      const seed = generateSeed();
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(4294967295);
    }
  });
});

describe('shouldApplyChaos with seeded random', () => {
  it('should produce deterministic results with the same seed', () => {
    const a = createPrng(42);
    const b = createPrng(42);

    const resultsA = Array.from({ length: 50 }, () => shouldApplyChaos(0.5, a.random));
    const resultsB = Array.from({ length: 50 }, () => shouldApplyChaos(0.5, b.random));

    expect(resultsA).toEqual(resultsB);
  });

  it('should always apply when probability is 1.0', () => {
    const { random } = createPrng(42);
    const results = Array.from({ length: 100 }, () => shouldApplyChaos(1.0, random));
    expect(results.every(r => r === true)).toBe(true);
  });

  it('should never apply when probability is 0', () => {
    const { random } = createPrng(42);
    const results = Array.from({ length: 100 }, () => shouldApplyChaos(0, random));
    expect(results.every(r => r === false)).toBe(true);
  });

  it('should roughly match the expected probability distribution', () => {
    const { random } = createPrng(42);
    const trials = 10000;
    const probability = 0.3;
    const applied = Array.from({ length: trials }, () => shouldApplyChaos(probability, random)).filter(Boolean).length;
    const ratio = applied / trials;

    // Allow 5% deviation
    expect(ratio).toBeGreaterThan(probability - 0.05);
    expect(ratio).toBeLessThan(probability + 0.05);
  });

  it('should still work without a random function (falls back to Math.random)', () => {
    // Just verifying it doesn't throw
    const result = shouldApplyChaos(0.5);
    expect(typeof result).toBe('boolean');
  });
});
