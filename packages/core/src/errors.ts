import { renderValidationIssues, sortIssues } from './validation-format';
import type { ValidationIssue } from './validation-types';

/** Aggregate validation failure thrown by `validateChaosConfig` /
 *  `prepareChaosConfig` / `validateConfig`.
 *
 *  Issues are deterministically sorted (by `path` then `code`) before render
 *  so CI logs and snapshot tests stay stable across runs. The render is
 *  capped at 50 entries with a `... and N more` summary; the full list is
 *  always retained on `.issues` for programmatic inspection. */
export class ChaosConfigError extends Error {
  public readonly issues: ValidationIssue[];

  constructor(input: ValidationIssue[] | string[]) {
    const raw: ValidationIssue[] = isStringArray(input)
      ? input.map((m) => ({
          path: '',
          code: 'legacy' as const,
          ruleType: 'top-level' as const,
          message: m,
        }))
      : input;
    const issues = sortIssues(raw);
    super(renderValidationIssues(issues, { maxIssues: 50 }));
    this.name = 'ChaosConfigError';
    this.issues = issues;
  }

  /** v0.4.x-shaped string array. Concatenates `path` + `message` per issue
   *  in the same sorted order as `.issues`. Use for log greps that already
   *  consume the legacy shape; new code should read `.issues` directly. */
  public get messages(): string[] {
    return this.issues.map((i) => `${i.path || '<root>'}: ${i.message}`);
  }
}

function isStringArray(input: ValidationIssue[] | string[]): input is string[] {
  return input.length > 0 && typeof input[0] === 'string';
}
