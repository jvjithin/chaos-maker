import { describe, it, expect } from 'vitest';
import { validateChaosConfig } from '../src/validation';
import { ChaosConfigError } from '../src/errors';

describe('schemaVersion gate', () => {
  it('accepts schemaVersion: 1', () => {
    expect(() => validateChaosConfig({ schemaVersion: 1 })).not.toThrow();
  });

  it('accepts omitted schemaVersion', () => {
    expect(() => validateChaosConfig({})).not.toThrow();
  });

  it('rejects schemaVersion: 2 with code unknown_schema_version and expected: 1', () => {
    try {
      validateChaosConfig({ schemaVersion: 2 } as unknown as object);
    } catch (e) {
      expect(e).toBeInstanceOf(ChaosConfigError);
      const issue = (e as ChaosConfigError).issues[0];
      expect(issue.code).toBe('unknown_schema_version');
      expect(issue.path).toBe('schemaVersion');
      expect(issue.expected).toBe('1');
      return;
    }
    throw new Error('should have thrown');
  });

  it("rejects schemaVersion: 'foo' with received: '\"foo\"'", () => {
    try {
      validateChaosConfig({ schemaVersion: 'foo' } as unknown as object);
    } catch (e) {
      expect(e).toBeInstanceOf(ChaosConfigError);
      const issue = (e as ChaosConfigError).issues[0];
      expect(issue.received).toBe('"foo"');
      return;
    }
    throw new Error('should have thrown');
  });

  it('schemaVersion failure surfaces BEFORE other issues (single issue list)', () => {
    try {
      validateChaosConfig({
        schemaVersion: 2,
        network: { failures: [{ urlPattern: '/a', statusCode: 500, probability: 1.5 }] },
      } as unknown as object);
    } catch (e) {
      expect(e).toBeInstanceOf(ChaosConfigError);
      const issues = (e as ChaosConfigError).issues;
      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('unknown_schema_version');
      return;
    }
    throw new Error('should have thrown');
  });

  it("presets cannot carry 'schemaVersion' (slice rejects)", () => {
    expect(() => validateChaosConfig({
      customPresets: {
        bad: { schemaVersion: 1 } as unknown as object,
      },
    } as unknown as object)).toThrow();
  });
});
