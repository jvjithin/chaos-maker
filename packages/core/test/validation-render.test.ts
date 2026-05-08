import { describe, it, expect } from 'vitest';
import { renderValidationIssues, sortIssues } from '../src/validation-format';
import type { ValidationIssue } from '../src/validation-types';

const make = (n: number): ValidationIssue[] =>
  Array.from({ length: n }, (_, i) => ({
    path: `p${i.toString().padStart(4, '0')}`,
    code: 'custom',
    ruleType: 'top-level',
    message: `msg ${i}`,
  }));

describe('renderValidationIssues cap behaviour', () => {
  it('empty list renders the body only', () => {
    expect(renderValidationIssues([])).toBe('Invalid ChaosConfig:\n');
  });

  it('49 issues render all, no overflow', () => {
    const out = renderValidationIssues(make(49));
    expect((out.match(/^  - /gm) ?? []).length).toBe(49);
    expect(out).not.toContain('and ');
  });

  it('50 issues render all, no overflow', () => {
    const out = renderValidationIssues(make(50));
    expect((out.match(/^  - /gm) ?? []).length).toBe(50);
    expect(out).not.toContain('and ');
  });

  it('51 issues render 50 + summary line', () => {
    const out = renderValidationIssues(make(51));
    expect(out).toContain('... and 1 more');
  });
});

describe('deterministic ordering across runs', () => {
  it('same input produces byte-identical output', () => {
    const issues = make(20);
    const a = renderValidationIssues(sortIssues(issues));
    const b = renderValidationIssues(sortIssues(issues));
    expect(a).toBe(b);
  });

  it('items with identical (path, code) preserve input order', () => {
    const issues: ValidationIssue[] = [
      { path: 'x', code: 'custom', ruleType: 'top-level', message: 'first' },
      { path: 'x', code: 'custom', ruleType: 'top-level', message: 'second' },
      { path: 'x', code: 'custom', ruleType: 'top-level', message: 'third' },
    ];
    const sorted = sortIssues(issues);
    expect(sorted.map((i) => i.message)).toEqual(['first', 'second', 'third']);
  });
});
