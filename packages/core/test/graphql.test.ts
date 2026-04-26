import { describe, it, expect } from 'vitest';
import {
  extractGraphQLOperation,
  parseOperationFromQueryString,
  operationNameMatches,
  evaluateGraphQLRule,
} from '../src/graphql';

describe('parseOperationFromQueryString', () => {
  it('extracts a named query', () => {
    expect(parseOperationFromQueryString('query GetUser { user { id } }')).toBe('GetUser');
  });

  it('extracts a named mutation', () => {
    expect(parseOperationFromQueryString('mutation CreatePost($t: String) { createPost(title: $t) { id } }')).toBe('CreatePost');
  });

  it('extracts a named subscription', () => {
    expect(parseOperationFromQueryString('subscription OnTick { tick { n } }')).toBe('OnTick');
  });

  it('returns null for an anonymous query', () => {
    expect(parseOperationFromQueryString('{ user { id } }')).toBeNull();
  });

  it('returns null for an anonymous query with the keyword but no name', () => {
    expect(parseOperationFromQueryString('query { user { id } }')).toBeNull();
  });

  it('handles multi-line whitespace between keyword and name', () => {
    expect(parseOperationFromQueryString('query\n  GetUser\n{ user }')).toBe('GetUser');
  });
});

describe('extractGraphQLOperation', () => {
  it('detects POST + JSON body with operationName', () => {
    const r = extractGraphQLOperation('POST', '/graphql', JSON.stringify({ operationName: 'GetUser', query: 'query GetUser { user { id } }' }), false);
    expect(r).toEqual({ kind: 'extracted', operationName: 'GetUser' });
  });

  it('falls back to parsing the operation name from the query field', () => {
    const r = extractGraphQLOperation('POST', '/graphql', JSON.stringify({ query: 'mutation Foo { bar }' }), false);
    expect(r).toEqual({ kind: 'extracted', operationName: 'Foo' });
  });

  it('treats explicit operationName preferentially over query parsing', () => {
    const r = extractGraphQLOperation('POST', '/graphql', JSON.stringify({ operationName: 'A', query: 'query B { x }' }), false);
    expect(r).toEqual({ kind: 'extracted', operationName: 'A' });
  });

  it('returns extracted with null operationName for anonymous operations', () => {
    const r = extractGraphQLOperation('POST', '/graphql', JSON.stringify({ query: '{ user { id } }' }), false);
    expect(r).toEqual({ kind: 'extracted', operationName: null });
  });

  it('marks POST without body as not-graphql', () => {
    expect(extractGraphQLOperation('POST', '/graphql', null, false)).toEqual({ kind: 'not-graphql' });
  });

  it('marks POST with unparseable body as unparseable', () => {
    expect(extractGraphQLOperation('POST', '/graphql', null, true)).toEqual({ kind: 'unparseable' });
  });

  it('marks POST with non-JSON body as not-graphql', () => {
    expect(extractGraphQLOperation('POST', '/graphql', 'plain string', false)).toEqual({ kind: 'not-graphql' });
  });

  it('marks POST with JSON body lacking GraphQL fields as not-graphql', () => {
    expect(extractGraphQLOperation('POST', '/graphql', JSON.stringify({ foo: 'bar' }), false)).toEqual({ kind: 'not-graphql' });
  });

  it('handles batched array bodies by reading the first entry', () => {
    const r = extractGraphQLOperation('POST', '/graphql', JSON.stringify([{ operationName: 'First' }, { operationName: 'Second' }]), false);
    expect(r).toEqual({ kind: 'extracted', operationName: 'First' });
  });

  it('parses persisted-query GET requests via ?operationName=', () => {
    const r = extractGraphQLOperation('GET', 'http://example.com/graphql?operationName=GetUser&id=1', null, false);
    expect(r).toEqual({ kind: 'extracted', operationName: 'GetUser' });
  });

  it('parses persisted-query GET requests via ?query=', () => {
    const r = extractGraphQLOperation('GET', `http://example.com/graphql?query=${encodeURIComponent('query GetUser { user { id } }')}`, null, false);
    expect(r).toEqual({ kind: 'extracted', operationName: 'GetUser' });
  });

  it('returns not-graphql for GET requests without operation hints', () => {
    expect(extractGraphQLOperation('GET', 'http://example.com/api/data', null, false)).toEqual({ kind: 'not-graphql' });
  });

  it('returns not-graphql for verbs other than GET/POST', () => {
    expect(extractGraphQLOperation('DELETE', '/graphql', '{}', false)).toEqual({ kind: 'not-graphql' });
  });

  it('is method-case-insensitive', () => {
    const r = extractGraphQLOperation('post', '/graphql', JSON.stringify({ operationName: 'X' }), false);
    expect(r).toEqual({ kind: 'extracted', operationName: 'X' });
  });
});

describe('operationNameMatches', () => {
  it('matches strings exactly', () => {
    expect(operationNameMatches('GetUser', 'GetUser')).toBe(true);
    expect(operationNameMatches('GetUser', 'GetUserById')).toBe(false);
  });

  it('matches regexes via .test()', () => {
    expect(operationNameMatches(/^Get/, 'GetUser')).toBe(true);
    expect(operationNameMatches(/^Get/, 'CreateUser')).toBe(false);
  });

  it('returns false for null operation names', () => {
    expect(operationNameMatches('GetUser', null)).toBe(false);
    expect(operationNameMatches(/.*/, null)).toBe(false);
  });

  it('matches deterministically when regex has /g flag (lastIndex reset guard)', () => {
    const re = /^Get/g;
    expect(operationNameMatches(re, 'GetUser')).toBe(true);
    expect(operationNameMatches(re, 'GetUser')).toBe(true);
    expect(operationNameMatches(re, 'GetUser')).toBe(true);
  });

  it('matches deterministically when regex has /y flag (lastIndex reset guard)', () => {
    const re = /^Get/y;
    expect(operationNameMatches(re, 'GetUser')).toBe(true);
    expect(operationNameMatches(re, 'GetUser')).toBe(true);
  });
});

describe('evaluateGraphQLRule', () => {
  it('returns skip-no-constraint with op name when matcher is undefined and request is GraphQL', () => {
    const r = evaluateGraphQLRule(undefined, { kind: 'extracted', operationName: 'GetUser' });
    expect(r).toEqual({ kind: 'skip-no-constraint', operationName: 'GetUser' });
  });

  it('returns skip-no-constraint with null op name for non-graphql requests when matcher is undefined', () => {
    const r = evaluateGraphQLRule(undefined, { kind: 'not-graphql' });
    expect(r).toEqual({ kind: 'skip-no-constraint', operationName: null });
  });

  it('returns match when matcher is set and op name matches', () => {
    const r = evaluateGraphQLRule('GetUser', { kind: 'extracted', operationName: 'GetUser' });
    expect(r).toEqual({ kind: 'match', operationName: 'GetUser' });
  });

  it('returns no-match when matcher is set and op name differs', () => {
    expect(evaluateGraphQLRule('GetUser', { kind: 'extracted', operationName: 'CreatePost' })).toEqual({ kind: 'no-match' });
  });

  it('returns no-match when matcher is set but request is not GraphQL', () => {
    expect(evaluateGraphQLRule('GetUser', { kind: 'not-graphql' })).toEqual({ kind: 'no-match' });
  });

  it('returns unparseable when matcher is set and body cannot be read', () => {
    expect(evaluateGraphQLRule('GetUser', { kind: 'unparseable' })).toEqual({ kind: 'unparseable' });
  });

  it('returns no-match when matcher is set and op name is null (anonymous)', () => {
    expect(evaluateGraphQLRule('GetUser', { kind: 'extracted', operationName: null })).toEqual({ kind: 'no-match' });
  });
});
