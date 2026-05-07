import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { patchXHR, patchXHROpen } from '../src/interceptors/networkXHR';
import { NetworkConfig } from '../src/config';
import { ChaosEventEmitter } from '../src/events';
import { RuleGroupRegistry } from '../src/groups';
// Import the mocks from setup.ts
import { mockXhrAbort, mockXhrOpen, mockXhrSend } from './setup';

// Get the original implementations
const originalXhrOpen = global.XMLHttpRequest.prototype.open;
const originalXhrSend = global.XMLHttpRequest.prototype.send;
const deterministicRandom = () => 0;

beforeEach(() => {
  // Reset all mock call history
  // Now these are the correct vi.fn() objects
  mockXhrOpen.mockClear();
  mockXhrSend.mockClear();
  mockXhrAbort.mockClear();
  
  // Restore originals before each test
  global.XMLHttpRequest.prototype.open = originalXhrOpen;
  global.XMLHttpRequest.prototype.send = originalXhrSend;
});

afterEach(() => {
  vi.useRealTimers();
  // Ensure originals are restored after each test
  global.XMLHttpRequest.prototype.open = originalXhrOpen;
  global.XMLHttpRequest.prototype.send = originalXhrSend;
});

describe('patchXHROpen', () => {
  it('should patch open to store URL and method', () => {
    const patchedOpen = patchXHROpen(originalXhrOpen);
    global.XMLHttpRequest.prototype.open = patchedOpen;

    // Use the *real* (mocked) constructor from setup.ts
    const xhr = new global.XMLHttpRequest(); 
    xhr.open('GET', '/api/test');

    // Check that our mock 'open' was called
    expect(mockXhrOpen).toHaveBeenCalledWith('GET', '/api/test');
    
    // Check that our patch added the custom properties
    expect((xhr as any)._chaos_url).toBe('/api/test');
    expect((xhr as any)._chaos_method).toBe('GET');
  });
});

describe('patchXHR (send)', () => {
  const config: NetworkConfig = {
    failures: [{ urlPattern: '/api/fail', statusCode: 503, probability: 1.0 }]
  };

  it('should not intercept requests if config is empty', () => {
    const patchedSend = patchXHR(originalXhrSend, {}, deterministicRandom);
    global.XMLHttpRequest.prototype.send = patchedSend;
    
    const xhr = new global.XMLHttpRequest();
    (xhr as any)._chaos_url = '/api/test'; // Assume patchXHROpen ran
    (xhr as any)._chaos_method = 'GET';
    
    xhr.send();

    expect(mockXhrSend).toHaveBeenCalled();
  });

  it('should force a 503 failure for a matching URL', () => {
    const patchedSend = patchXHR(originalXhrSend, config, deterministicRandom);
    global.XMLHttpRequest.prototype.send = patchedSend;

    const xhr = new global.XMLHttpRequest();
    const errorSpy = vi.spyOn(xhr, 'dispatchEvent');

    (xhr as any)._chaos_url = '/api/fail';
    (xhr as any)._chaos_method = 'POST';

    xhr.send();

    // Should not call original send
    expect(mockXhrSend).not.toHaveBeenCalled();
    
    // Should set status and dispatch events to simulate failure. Per the
    // XHR spec, an HTTP-level failure (server returns 5xx) fires `load`
    // then `loadend`, NOT `error` — `error` is reserved for network-level
    // failures (DNS / connection refused / CORS), which the dedicated CORS
    // branch covers separately. Inspect via `Event.type` because vitest's
    // deep-equal cannot distinguish Event instances by constructor argument.
    expect(xhr.status).toBe(503);
    expect(xhr.statusText).toBe('Service Unavailable (Chaos)');
    const dispatchedTypes = errorSpy.mock.calls.map(
      (call) => (call[0] as Event).type,
    );
    expect(dispatchedTypes).toContain('load');
    expect(dispatchedTypes).toContain('loadend');
    expect(dispatchedTypes).not.toContain('error');
  });

  it('should not intercept a non-matching URL', () => {
    const patchedSend = patchXHR(originalXhrSend, config, deterministicRandom);
    global.XMLHttpRequest.prototype.send = patchedSend;

    const xhr = new global.XMLHttpRequest();
    (xhr as any)._chaos_url = '/api/success';
    (xhr as any)._chaos_method = 'GET';

    xhr.send();

    // Should call original send
    expect(mockXhrSend).toHaveBeenCalled();
  });

  it('should add latency to a matching request', async () => {
    vi.useFakeTimers(); // Tell Vitest to mock setTimeout
    
    const latencyConfig: NetworkConfig = {
      latencies: [{ urlPattern: '/api/slow', delayMs: 100, probability: 1.0 }]
    };
    const patchedSend = patchXHR(originalXhrSend, latencyConfig, deterministicRandom);
    global.XMLHttpRequest.prototype.send = patchedSend;
    
    const xhr = new global.XMLHttpRequest();
    (xhr as any)._chaos_url = '/api/slow';
    (xhr as any)._chaos_method = 'GET';
    
    xhr.send();

    // At this point, original send should not be called yet
    expect(mockXhrSend).not.toHaveBeenCalled();

    // Advance timers by 100ms
    vi.advanceTimersByTime(100);

    // Now it should have been called
    expect(mockXhrSend).toHaveBeenCalled();

  });

  it('should not add latency when the matching rule group is disabled', () => {
    vi.useFakeTimers();

    const latencyConfig: NetworkConfig = {
      latencies: [{ urlPattern: '/api/slow', delayMs: 100, probability: 1.0, group: 'payments' }]
    };
    const groups = new RuleGroupRegistry();
    groups.ensure('payments', { enabled: false, explicit: true });
    const emitter = new ChaosEventEmitter();
    const patchedSend = patchXHR(originalXhrSend, latencyConfig, deterministicRandom, emitter, new Map(), groups);
    global.XMLHttpRequest.prototype.send = patchedSend;

    const xhr = new global.XMLHttpRequest();
    (xhr as any)._chaos_url = '/api/slow';
    (xhr as any)._chaos_method = 'GET';

    xhr.send();

    expect(mockXhrSend).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    expect(mockXhrSend).toHaveBeenCalledTimes(1);
    expect(emitter.getLog()).toEqual([
      expect.objectContaining({
        type: 'rule-group:gated',
        applied: false,
        detail: expect.objectContaining({
          url: '/api/slow',
          method: 'GET',
          groupName: 'payments',
        }),
      }),
    ]);
  });

  it('should force a CORS error for a matching URL', () => {
    const config: NetworkConfig = {
      cors: [{ urlPattern: '/api/cors', probability: 1.0 }]
    };
    const patchedSend = patchXHR(originalXhrSend, config, deterministicRandom);
    global.XMLHttpRequest.prototype.send = patchedSend;

    const xhr = new global.XMLHttpRequest();
    const errorSpy = vi.spyOn(xhr, 'dispatchEvent');
    (xhr as any)._chaos_url = '/api/cors';
    (xhr as any)._chaos_method = 'GET';

    xhr.send();

    expect(mockXhrSend).not.toHaveBeenCalled();
    expect(xhr.status).toBe(0);
    expect(errorSpy).toHaveBeenCalledWith(new Event('error'));
  });

  it('should force an abort for a matching URL immediately', () => {
    const config: NetworkConfig = {
      aborts: [{ urlPattern: '/api/abort', probability: 1.0 }]
    };
    const patchedSend = patchXHR(originalXhrSend, config, deterministicRandom);
    global.XMLHttpRequest.prototype.send = patchedSend;

    const xhr = new global.XMLHttpRequest();
    const abortSpy = vi.spyOn(xhr, 'dispatchEvent');
    (xhr as any)._chaos_url = '/api/abort';
    (xhr as any)._chaos_method = 'GET';

    xhr.send();

    expect(mockXhrSend).toHaveBeenCalled();
    expect(mockXhrAbort).toHaveBeenCalledTimes(1);
    expect(xhr.status).toBe(0);
    expect(abortSpy).toHaveBeenCalledWith(new Event('abort'));
  });

  it('should force an abort for a matching URL after timeout', () => {
    vi.useFakeTimers();
    const config: NetworkConfig = {
      aborts: [{ urlPattern: '/api/abort', probability: 1.0, timeout: 100 }]
    };
    const patchedSend = patchXHR(originalXhrSend, config, deterministicRandom);
    global.XMLHttpRequest.prototype.send = patchedSend;

    const xhr = new global.XMLHttpRequest();
    const abortSpy = vi.spyOn(xhr, 'dispatchEvent');
    (xhr as any)._chaos_url = '/api/abort';
    (xhr as any)._chaos_method = 'GET';

    xhr.send();

    expect(mockXhrSend).toHaveBeenCalled();
    expect(mockXhrAbort).not.toHaveBeenCalled();
    expect(abortSpy).not.toHaveBeenCalledWith(new Event('abort'));

    vi.advanceTimersByTime(100);

    expect(mockXhrAbort).toHaveBeenCalledTimes(1);
    expect(xhr.status).toBe(0);
    expect(abortSpy).toHaveBeenCalledWith(new Event('abort'));
  });

  it('should corrupt response text according to truncate strategy', () => {
    const config: NetworkConfig = {
      corruptions: [{ urlPattern: '/api/corrupt', strategy: 'truncate', probability: 1.0 }]
    };
    const patchedSend = patchXHR(originalXhrSend, config, deterministicRandom);
    global.XMLHttpRequest.prototype.send = patchedSend;

    const xhr = new global.XMLHttpRequest();
    (xhr as any)._chaos_url = '/api/corrupt';
    (xhr as any)._chaos_method = 'GET';

    // Original property (simulate it loading)
    (xhr as any)._responseText = 'HelloWorld';

    xhr.send();

    expect(xhr.responseText).toBe('Hello');
  });

  it('should corrupt response text according to malformed-json strategy', () => {
    const config: NetworkConfig = {
      corruptions: [{ urlPattern: '/api/corrupt', strategy: 'malformed-json', probability: 1.0 }]
    };
    const patchedSend = patchXHR(originalXhrSend, config, deterministicRandom);
    global.XMLHttpRequest.prototype.send = patchedSend;

    const xhr = new global.XMLHttpRequest();
    (xhr as any)._chaos_url = '/api/corrupt';
    (xhr as any)._chaos_method = 'GET';

    (xhr as any)._responseText = '{"key":"value"}';

    xhr.send();

    expect(xhr.responseText).toBe('{"key":"value"}"}');
  });

  it('should corrupt response text according to empty strategy', () => {
    const config: NetworkConfig = {
      corruptions: [{ urlPattern: '/api/corrupt', strategy: 'empty', probability: 1.0 }]
    };
    const patchedSend = patchXHR(originalXhrSend, config, deterministicRandom);
    global.XMLHttpRequest.prototype.send = patchedSend;

    const xhr = new global.XMLHttpRequest();
    (xhr as any)._chaos_url = '/api/corrupt';
    (xhr as any)._chaos_method = 'GET';

    (xhr as any)._responseText = 'HelloWorld';

    xhr.send();

    expect(xhr.responseText).toBe('');
  });

  it('should corrupt response text according to wrong-type strategy', () => {
    const config: NetworkConfig = {
      corruptions: [{ urlPattern: '/api/corrupt', strategy: 'wrong-type', probability: 1.0 }]
    };
    const patchedSend = patchXHR(originalXhrSend, config, deterministicRandom);
    global.XMLHttpRequest.prototype.send = patchedSend;

    const xhr = new global.XMLHttpRequest();
    (xhr as any)._chaos_url = '/api/corrupt';
    (xhr as any)._chaos_method = 'GET';

    (xhr as any)._responseText = '{"key":"value"}';

    xhr.send();

    expect(xhr.responseText).toBe('<html><body>Unexpected HTML</body></html>');
  });

  it('should log corruption as not applied when XHR errors before response text is available', () => {
    const emitter = new ChaosEventEmitter();
    const config: NetworkConfig = {
      corruptions: [{ urlPattern: '/api/corrupt', strategy: 'truncate', probability: 1.0 }]
    };
    const failingSend = function (this: XMLHttpRequest) {
      this.dispatchEvent(new Event('error'));
      this.dispatchEvent(new Event('loadend'));
    };
    const patchedSend = patchXHR(failingSend, config, deterministicRandom, emitter);
    global.XMLHttpRequest.prototype.send = patchedSend;

    const xhr = new global.XMLHttpRequest();
    (xhr as any)._chaos_url = '/api/corrupt';
    (xhr as any)._chaos_method = 'GET';

    xhr.send();

    expect(emitter.getLog()).toEqual([
      expect.objectContaining({
        type: 'network:corruption',
        applied: false,
        detail: expect.objectContaining({
          url: '/api/corrupt',
          method: 'GET',
          strategy: 'truncate',
        }),
      }),
    ]);
  });

  it('should log abort as not applied when XHR completes before the timeout fires', () => {
    vi.useFakeTimers();
    const emitter = new ChaosEventEmitter();
    const config: NetworkConfig = {
      aborts: [{ urlPattern: '/api/fast', timeout: 100, probability: 1.0 }]
    };
    const successfulSend = function (this: XMLHttpRequest) {
      this.dispatchEvent(new Event('load'));
      this.dispatchEvent(new Event('loadend'));
    };
    const patchedSend = patchXHR(successfulSend, config, deterministicRandom, emitter);
    global.XMLHttpRequest.prototype.send = patchedSend;

    const xhr = new global.XMLHttpRequest();
    (xhr as any)._chaos_url = '/api/fast';
    (xhr as any)._chaos_method = 'GET';

    xhr.send();

    // Advance past the timeout to prove the timer was cancelled
    vi.advanceTimersByTime(200);

    expect(mockXhrAbort).not.toHaveBeenCalled();
    expect(emitter.getLog()).toHaveLength(1);
    expect(emitter.getLog()).toEqual([
      expect.objectContaining({
        type: 'network:abort',
        applied: false,
        detail: expect.objectContaining({
          url: '/api/fast',
          method: 'GET',
          timeoutMs: 100,
        }),
      }),
    ]);
  });
});
