import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  formatZodIssue,
  renderValidationIssues,
  sortIssues,
} from '../src/validation-format';
import type { ValidationIssue } from '../src/validation-types';

const probabilitySchema = z.number().min(0).max(1);
const enumSchema = z.enum(['a', 'b', 'c']);
const objSchema = z.object({ a: z.number(), b: z.string() }).strict();

function issuesOf(schema: z.ZodTypeAny, value: unknown): z.ZodIssue[] {
  const r = schema.safeParse(value);
  if (r.success) throw new Error('expected schema parse to fail');
  return r.error.issues;
}

describe('formatZodIssue', () => {
  it('maps too_big to value_too_large with expected/received', () => {
    const issue = issuesOf(probabilitySchema, 1.5)[0];
    const formatted = formatZodIssue(issue);
    expect(formatted.code).toBe('value_too_large');
    expect(formatted.expected).toBe('<= 1');
  });

  it('maps too_small to value_too_small', () => {
    const issue = issuesOf(probabilitySchema, -0.5)[0];
    expect(formatZodIssue(issue).code).toBe('value_too_small');
  });

  it('maps invalid_enum_value to invalid_enum with options listed', () => {
    const issue = issuesOf(enumSchema, 'x')[0];
    const formatted = formatZodIssue(issue);
    expect(formatted.code).toBe('invalid_enum');
    expect(formatted.expected).toContain('"a"');
    expect(formatted.expected).toContain('"c"');
  });

  it('maps invalid_type for primitives', () => {
    const issue = issuesOf(z.number(), 'x')[0];
    const f = formatZodIssue(issue);
    expect(f.code).toBe('invalid_type');
    expect(f.expected).toBe('number');
    expect(f.received).toBe('string');
  });

  it('maps invalid_type with received undefined to missing_field', () => {
    const issue = issuesOf(objSchema, { b: 'x' })[0];
    expect(formatZodIssue(issue).code).toBe('missing_field');
  });

  it('maps unrecognized_keys to unknown_field', () => {
    const issue = issuesOf(objSchema, { a: 1, b: 'x', extra: true })[0];
    const f = formatZodIssue(issue);
    expect(f.code).toBe('unknown_field');
    expect(f.received).toContain('"extra"');
  });

  it('normalizes path to dot notation including array indices', () => {
    const schema = z.object({
      network: z.object({
        failures: z.array(z.object({ statusCode: z.number().int().min(100).max(599) })),
      }),
    });
    const issue = issuesOf(schema, { network: { failures: [{ statusCode: 700 }] } })[0];
    expect(formatZodIssue(issue).path).toBe('network.failures[0].statusCode');
  });

  it('derives ruleType for known network failure path', () => {
    const issue: z.ZodIssue = {
      code: z.ZodIssueCode.too_big,
      maximum: 1,
      type: 'number',
      inclusive: true,
      message: 'too big',
      path: ['network', 'failures', 0, 'probability'],
    };
    expect(formatZodIssue(issue).ruleType).toBe('network.failure');
  });

  it('derives ruleType for ws.close path', () => {
    const issue: z.ZodIssue = {
      code: z.ZodIssueCode.custom,
      message: 'bad',
      path: ['websocket', 'closes', 0, 'code'],
    };
    expect(formatZodIssue(issue).ruleType).toBe('websocket.close');
  });

  it('falls back to top-level for unknown prefix', () => {
    const issue: z.ZodIssue = {
      code: z.ZodIssueCode.custom,
      message: 'bad',
      path: [],
    };
    expect(formatZodIssue(issue).ruleType).toBe('top-level');
  });

  it('derives ruleType=group for groups path', () => {
    const issue: z.ZodIssue = {
      code: z.ZodIssueCode.custom,
      message: 'duplicate',
      path: ['groups', 1, 'name'],
    };
    expect(formatZodIssue(issue).ruleType).toBe('group');
  });

  it('maps custom mutually exclusive message to mutually_exclusive', () => {
    const issue: z.ZodIssue = {
      code: z.ZodIssueCode.custom,
      message: 'Only one of onNth, everyNth, or afterN may be set on a single rule',
      path: ['network', 'failures', 0],
    };
    expect(formatZodIssue(issue).code).toBe('mutually_exclusive');
  });

  it('maps custom duplicate message to duplicate', () => {
    const issue: z.ZodIssue = {
      code: z.ZodIssueCode.custom,
      message: 'duplicate group name after normalization',
      path: ['groups', 1, 'name'],
    };
    expect(formatZodIssue(issue).code).toBe('duplicate');
  });
});

describe('sortIssues', () => {
  it('sorts by path then by code', () => {
    const input: ValidationIssue[] = [
      { path: 'b', code: 'invalid_type', ruleType: 'top-level', message: 'b' },
      { path: 'a', code: 'invalid_type', ruleType: 'top-level', message: 'a' },
      { path: 'a', code: 'custom', ruleType: 'top-level', message: 'a-custom' },
    ];
    const sorted = sortIssues(input);
    expect(sorted.map((i) => `${i.path}:${i.code}`)).toEqual([
      'a:custom',
      'a:invalid_type',
      'b:invalid_type',
    ]);
  });

  it('preserves input order on equal (path, code) ties', () => {
    const input: ValidationIssue[] = [
      { path: 'x', code: 'custom', ruleType: 'top-level', message: 'first' },
      { path: 'x', code: 'custom', ruleType: 'top-level', message: 'second' },
    ];
    const sorted = sortIssues(input);
    expect(sorted[0].message).toBe('first');
    expect(sorted[1].message).toBe('second');
  });

  it('returns a new array (purity)', () => {
    const input: ValidationIssue[] = [
      { path: 'a', code: 'custom', ruleType: 'top-level', message: 'a' },
    ];
    const out = sortIssues(input);
    expect(out).not.toBe(input);
  });
});

describe('renderValidationIssues', () => {
  it('renders empty body when no issues', () => {
    const out = renderValidationIssues([]);
    expect(out).toBe('Invalid ChaosConfig:\n');
  });

  it('renders 49 issues without overflow line', () => {
    const issues = Array.from({ length: 49 }, (_, i): ValidationIssue => ({
      path: `p${i}`,
      code: 'custom',
      ruleType: 'top-level',
      message: 'm',
    }));
    const out = renderValidationIssues(issues);
    expect(out.match(/^  - /gm)?.length).toBe(49);
    expect(out).not.toContain('and ');
  });

  it('renders 50 issues without overflow line', () => {
    const issues = Array.from({ length: 50 }, (_, i): ValidationIssue => ({
      path: `p${i}`,
      code: 'custom',
      ruleType: 'top-level',
      message: 'm',
    }));
    const out = renderValidationIssues(issues);
    expect(out.match(/^  - /gm)?.length).toBe(50);
    expect(out).not.toContain('and ');
  });

  it('caps at 50 with summary line for 51 issues', () => {
    const issues = Array.from({ length: 51 }, (_, i): ValidationIssue => ({
      path: `p${i}`,
      code: 'custom',
      ruleType: 'top-level',
      message: 'm',
    }));
    const out = renderValidationIssues(issues);
    expect(out.match(/^  - /gm)?.length).toBe(51);
    expect(out).toContain('... and 1 more');
  });

  it('honors maxIssues override', () => {
    const issues = Array.from({ length: 10 }, (_, i): ValidationIssue => ({
      path: `p${i}`,
      code: 'custom',
      ruleType: 'top-level',
      message: 'm',
    }));
    const out = renderValidationIssues(issues, { maxIssues: 3 });
    expect(out).toContain('... and 7 more');
  });

  it('includes expected and received when present', () => {
    const out = renderValidationIssues([
      {
        path: 'network.failures[0].probability',
        code: 'value_too_large',
        ruleType: 'network.failure',
        message: 'too big',
        expected: '<= 1',
        received: '1.5',
      },
    ]);
    expect(out).toContain('expected <= 1');
    expect(out).toContain('received 1.5');
  });

  it('renders <root> for empty path', () => {
    const out = renderValidationIssues([
      {
        path: '',
        code: 'custom',
        ruleType: 'top-level',
        message: 'top failure',
      },
    ]);
    expect(out).toContain('<root>');
  });
});
