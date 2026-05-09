import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('RULE_TYPE_TO_SCHEMA bidirectional drift guard', () => {
  it('declares bidirectional Exclude<...> guard inline', () => {
    const source = readFileSync(resolve(__dirname, '../src/validation.ts'), 'utf8');
    expect(source).toMatch(/_MissingFromMap.*Exclude<RuleType, keyof typeof RULE_TYPE_TO_SCHEMA>/s);
    expect(source).toMatch(/_ExtraInMap.*Exclude<keyof typeof RULE_TYPE_TO_SCHEMA, RuleType>/s);
    expect(source).toMatch(/\[_MissingFromMap, _ExtraInMap\] extends \[never, never\]/);
  });

  it('mirrors the existing _sliceSchemaCovers pattern', () => {
    const source = readFileSync(resolve(__dirname, '../src/validation.ts'), 'utf8');
    expect(source).toMatch(/_sliceSchemaCovers/);
    expect(source).toMatch(/_ruleTypeMapCovers/);
  });
});
