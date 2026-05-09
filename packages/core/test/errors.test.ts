import { describe, it, expect } from 'vitest';
import { ChaosConfigError } from '../src/errors';
import type { ValidationIssue } from '../src/validation-types';

describe('ChaosConfigError', () => {
  it('accepts string[] (legacy) and converts to code: legacy issues', () => {
    const err = new ChaosConfigError(['top: bad', 'foo: weird']);
    expect(err.issues).toHaveLength(2);
    for (const i of err.issues) {
      expect(i.code).toBe('legacy');
      expect(i.ruleType).toBe('top-level');
    }
  });

  it('accepts ValidationIssue[]', () => {
    const issues: ValidationIssue[] = [
      { path: 'a', code: 'invalid_type', ruleType: 'top-level', message: 'bad', expected: 'number', received: 'string' },
    ];
    const err = new ChaosConfigError(issues);
    expect(err.issues[0].code).toBe('invalid_type');
  });

  it('messages getter returns v0.4.x-shaped string array', () => {
    const err = new ChaosConfigError([
      { path: 'network.failures[0].probability', code: 'value_too_large', ruleType: 'network.failure', message: 'too big' },
    ]);
    expect(err.messages).toEqual(['network.failures[0].probability: too big']);
  });

  it('messages getter for empty path renders <root>', () => {
    const err = new ChaosConfigError([
      { path: '', code: 'custom', ruleType: 'top-level', message: 'top failure' },
    ]);
    expect(err.messages[0]).toBe('<root>: top failure');
  });

  it('toString() includes expected/received when present', () => {
    const err = new ChaosConfigError([
      { path: 'p', code: 'value_too_large', ruleType: 'network.failure', message: 'too big', expected: '<= 1', received: '1.5' },
    ]);
    expect(err.toString()).toContain('expected <= 1');
    expect(err.toString()).toContain('received 1.5');
  });

  it('issues are deterministically sorted by path then code', () => {
    const err = new ChaosConfigError([
      { path: 'b', code: 'custom', ruleType: 'top-level', message: 'b' },
      { path: 'a', code: 'invalid_type', ruleType: 'top-level', message: 'a' },
      { path: 'a', code: 'custom', ruleType: 'top-level', message: 'a-c' },
    ]);
    expect(err.issues.map((i) => `${i.path}:${i.code}`)).toEqual([
      'a:custom',
      'a:invalid_type',
      'b:custom',
    ]);
  });
});
