import { describe, it, expect } from 'vitest';
import { isSessionTeardownError, SESSION_TEARDOWN_PATTERNS } from '../src/session-errors';

describe('isSessionTeardownError', () => {
  it.each([
    'invalid session id: session deleted because of page crash',
    'NoSuchWindowError: no such window: target window already closed',
    'session closed: Browser has disconnected!',
    'session not created: ChromeDriver only supports Chrome version',
    'browser has disconnected from the WebSocket',
    'browser is closed',
    'Protocol error (Page.navigate): Target closed.',
    'WebSocket connection closed',
    'Browsing context has been discarded',
  ])('matches teardown shape %p', (message) => {
    expect(isSessionTeardownError(new Error(message))).toBe(true);
  });

  it('does not match unrelated errors', () => {
    expect(isSessionTeardownError(new Error('TypeError: foo is undefined'))).toBe(false);
    expect(isSessionTeardownError(new Error('Network request failed'))).toBe(false);
    expect(isSessionTeardownError(undefined)).toBe(false);
  });

  it('matches errors that surface as plain strings', () => {
    expect(isSessionTeardownError('invalid session id')).toBe(true);
  });

  it('exports the underlying pattern list for advanced extension', () => {
    expect(SESSION_TEARDOWN_PATTERNS.length).toBeGreaterThan(0);
    for (const pattern of SESSION_TEARDOWN_PATTERNS) {
      expect(pattern).toBeInstanceOf(RegExp);
    }
  });
});
