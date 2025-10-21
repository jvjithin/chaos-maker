import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { patchXHR, patchXHROpen } from '../src/interceptors/networkXHR';
import { NetworkConfig } from '../src/config';
// Import the mocks from setup.ts
import { mockXhrOpen, mockXhrSend } from './setup';

// Get the original implementations
const originalXhrOpen = global.XMLHttpRequest.prototype.open;
const originalXhrSend = global.XMLHttpRequest.prototype.send;

beforeEach(() => {
  // Reset all mock call history
  // Now these are the correct vi.fn() objects
  mockXhrOpen.mockClear();
  mockXhrSend.mockClear();
  
  // Restore originals before each test
  global.XMLHttpRequest.prototype.open = originalXhrOpen;
  global.XMLHttpRequest.prototype.send = originalXhrSend;
});

afterEach(() => {
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
    const patchedSend = patchXHR(originalXhrSend, {});
    global.XMLHttpRequest.prototype.send = patchedSend;
    
    const xhr = new global.XMLHttpRequest();
    (xhr as any)._chaos_url = '/api/test'; // Assume patchXHROpen ran
    (xhr as any)._chaos_method = 'GET';
    
    xhr.send();

    expect(mockXhrSend).toHaveBeenCalled();
  });

  it('should force a 503 failure for a matching URL', () => {
    const patchedSend = patchXHR(originalXhrSend, config);
    global.XMLHttpRequest.prototype.send = patchedSend;

    const xhr = new global.XMLHttpRequest();
    const errorSpy = vi.spyOn(xhr, 'dispatchEvent');

    (xhr as any)._chaos_url = '/api/fail';
    (xhr as any)._chaos_method = 'POST';

    xhr.send();

    // Should not call original send
    expect(mockXhrSend).not.toHaveBeenCalled();
    
    // Should set status and dispatch events to simulate failure
    expect(xhr.status).toBe(503);
    expect(xhr.statusText).toBe('Service Unavailable (Chaos)');
    expect(errorSpy).toHaveBeenCalledWith(new Event('error'));
    expect(errorSpy).toHaveBeenCalledWith(new Event('load'));
  });

  it('should not intercept a non-matching URL', () => {
    const patchedSend = patchXHR(originalXhrSend, config);
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
    const patchedSend = patchXHR(originalXhrSend, latencyConfig);
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

    vi.useRealTimers(); // Restore real timers
  });
});