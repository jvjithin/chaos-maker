import { describe, it, expect } from 'vitest';
import { validateChaosConfig } from '../src/validation';
import { ChaosConfigError } from '../src/errors';

function captureThrow(fn: () => unknown): ChaosConfigError {
  try {
    fn();
  } catch (e) {
    if (e instanceof ChaosConfigError) return e;
    throw e;
  }
  throw new Error('expected validateChaosConfig to throw ChaosConfigError');
}

describe('schemaVersion gate', () => {
  it('accepts schemaVersion: 1', () => {
    expect(() => validateChaosConfig({ schemaVersion: 1 })).not.toThrow();
  });

  it('accepts omitted schemaVersion', () => {
    expect(() => validateChaosConfig({})).not.toThrow();
  });

  it('rejects schemaVersion: 2 with code unknown_schema_version and expected: 1', () => {
    const err = captureThrow(() => validateChaosConfig({ schemaVersion: 2 } as unknown as object));
    const issue = err.issues[0];
    expect(issue.code).toBe('unknown_schema_version');
    expect(issue.path).toBe('schemaVersion');
    expect(issue.expected).toBe('1');
  });

  it("rejects schemaVersion: 'foo' with received: '\"foo\"'", () => {
    const err = captureThrow(() => validateChaosConfig({ schemaVersion: 'foo' } as unknown as object));
    expect(err.issues[0].received).toBe('"foo"');
  });

  it('schemaVersion failure surfaces BEFORE other issues (single issue list)', () => {
    const err = captureThrow(() =>
      validateChaosConfig({
        schemaVersion: 2,
        network: { failures: [{ urlPattern: '/a', statusCode: 500, probability: 1.5 }] },
      } as unknown as object),
    );
    expect(err.issues).toHaveLength(1);
    expect(err.issues[0].code).toBe('unknown_schema_version');
  });

  it("presets cannot carry 'schemaVersion' (slice rejects)", () => {
    expect(() => validateChaosConfig({
      customPresets: {
        bad: { schemaVersion: 1 } as unknown as object,
      },
    } as unknown as object)).toThrow();
  });
});
