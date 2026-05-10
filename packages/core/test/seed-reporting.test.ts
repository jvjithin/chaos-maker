import { describe, expect, it } from 'vitest';
import { formatSeedReproduction } from '../src/seed-reporting';

describe('formatSeedReproduction', () => {
  it.each([
    [null, 'chaos seed: <not injected>'],
    [0, 'chaos seed: 0'],
    [1234, 'chaos seed: 1234'],
    [4294967295, 'chaos seed: 4294967295'],
  ] as const)('formats %s', (seed, expected) => {
    expect(formatSeedReproduction(seed)).toBe(expected);
  });
});
