import { describe, it, expect } from 'vitest';
import type { ChaosEvent } from '@chaos-maker/core';
import { formatStepTitle, shouldEmitStep } from '../src/trace';

function mkEvent(overrides: Partial<ChaosEvent> = {}): ChaosEvent {
  return {
    type: 'network:failure',
    timestamp: 0,
    applied: true,
    detail: {},
    ...overrides,
  } as ChaosEvent;
}

describe('formatStepTitle', () => {
  it('formats network:failure with url + status', () => {
    const e = mkEvent({
      type: 'network:failure',
      detail: { url: '/api/users', statusCode: 503 },
    });
    expect(formatStepTitle(e)).toBe('chaos:network:failure /api/users → 503');
  });

  it('formats network:latency with +ms suffix', () => {
    const e = mkEvent({
      type: 'network:latency',
      detail: { url: '/api/slow', delayMs: 1500 },
    });
    expect(formatStepTitle(e)).toBe('chaos:network:latency /api/slow → +1500ms');
  });

  it('formats network:abort', () => {
    const e = mkEvent({
      type: 'network:abort',
      detail: { url: '/api/kill' },
    });
    expect(formatStepTitle(e)).toBe('chaos:network:abort /api/kill → abort');
  });

  it('formats network:corruption with strategy', () => {
    const e = mkEvent({
      type: 'network:corruption',
      detail: { url: '/api/json', strategy: 'truncate' },
    });
    expect(formatStepTitle(e)).toBe('chaos:network:corruption /api/json → truncate');
  });

  it('formats websocket:drop with direction', () => {
    const e = mkEvent({
      type: 'websocket:drop',
      detail: { url: 'ws://localhost:8081', direction: 'inbound' },
    });
    expect(formatStepTitle(e)).toBe('chaos:websocket:drop ws://localhost:8081 → drop inbound');
  });

  it('formats websocket:close with code', () => {
    const e = mkEvent({
      type: 'websocket:close',
      detail: { url: 'ws://x', closeCode: 1011 },
    });
    expect(formatStepTitle(e)).toBe('chaos:websocket:close ws://x → close 1011');
  });

  it('formats ui:assault with action + selector', () => {
    const e = mkEvent({
      type: 'ui:assault',
      detail: { selector: 'button.submit', action: 'remove' },
    });
    expect(formatStepTitle(e)).toBe('chaos:ui:assault button.submit → remove');
  });

  it('left-truncates long urls to preserve the tail', () => {
    const longUrl = '/api/v2/accounts/' + 'x'.repeat(200) + '/profile';
    const e = mkEvent({
      type: 'network:failure',
      detail: { url: longUrl, statusCode: 500 },
    });
    const title = formatStepTitle(e);
    expect(title).toContain('…');
    expect(title.endsWith('/profile → 500')).toBe(true);
    // Subject chunk itself (between prefix and arrow) stays ≤ 48 chars
    const subjectChunk = title.replace(/^chaos:[a-z:]+ /, '').split(' → ')[0];
    expect(subjectChunk.length).toBeLessThanOrEqual(48);
  });

  it('marks skipped (applied:false) events', () => {
    const e = mkEvent({
      applied: false,
      detail: { url: '/api/skip', statusCode: 503, reason: 'probability-miss' },
    });
    const title = formatStepTitle(e);
    expect(title).toContain('(skipped)');
  });

  it('falls back to bare prefix when no subject/outcome', () => {
    const e = mkEvent({ type: 'network:cors', detail: {} });
    // cors always has an outcome suffix of 'cors-block'
    expect(formatStepTitle(e)).toBe('chaos:network:cors → cors-block');
  });
});

describe('shouldEmitStep', () => {
  it('always emits for applied events regardless of verbose', () => {
    const e = mkEvent({ applied: true });
    expect(shouldEmitStep(e, false)).toBe(true);
    expect(shouldEmitStep(e, true)).toBe(true);
  });

  it('skips applied:false events in non-verbose mode', () => {
    const e = mkEvent({ applied: false });
    expect(shouldEmitStep(e, false)).toBe(false);
  });

  it('emits applied:false events in verbose mode', () => {
    const e = mkEvent({ applied: false });
    expect(shouldEmitStep(e, true)).toBe(true);
  });

  it('never emits debug events, even when verbose', () => {
    const e = mkEvent({
      type: 'debug',
      applied: false,
      detail: { stage: 'rule-applied', url: '/api', method: 'GET' },
    });
    expect(shouldEmitStep(e, false)).toBe(false);
    expect(shouldEmitStep(e, true)).toBe(false);
  });
});
