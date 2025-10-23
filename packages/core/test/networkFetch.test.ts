import { describe, it, expect, beforeEach } from 'vitest';
import { patchFetch } from '../src/interceptors/networkFetch';
import { NetworkConfig } from '../src/config';
// Import the mock from setup.ts
import { mockFetch } from './setup';

// Get the mock fetch from our setup file
const originalFetch = mockFetch;

beforeEach(() => {
  // Reset mock call history before each test
  originalFetch.mockClear();
  originalFetch.mockResolvedValue(new global.Response('{}', { status: 200 }));
  // Restore the original implementation in case a test patches it
  global.fetch = originalFetch; 
});

describe('patchFetch', () => {
  it('should not intercept requests if config is empty', async () => {
    const config: NetworkConfig = {};
    const patchedFetch = patchFetch(originalFetch, config);

    await patchedFetch('/api/test');
    expect(originalFetch).toHaveBeenCalledWith('/api/test', undefined);
  });

  it('should force a 503 failure for a matching URL', async () => {
    const config: NetworkConfig = {
      failures: [{ urlPattern: '/api/fail', statusCode: 503, probability: 1.0 }]
    };
    const patchedFetch = patchFetch(originalFetch, config);

    const response = await patchedFetch('/api/fail');
    
    expect(response.status).toBe(503);
    expect(originalFetch).not.toHaveBeenCalled();
  });

  it('should not intercept a non-matching URL', async () => {
    const config: NetworkConfig = {
      failures: [{ urlPattern: '/api/fail', statusCode: 503, probability: 1.0 }]
    };
    const patchedFetch = patchFetch(originalFetch, config);

    await patchedFetch('/api/success');
    
    expect(originalFetch).toHaveBeenCalledWith('/api/success', undefined);
    expect(originalFetch).toHaveBeenCalledTimes(1);
  });

  it('should only intercept matching methods', async () => {
    const config: NetworkConfig = {
      failures: [{ urlPattern: '/api/data', methods: ['POST'], statusCode: 500, probability: 1.0 }]
    };
    const patchedFetch = patchFetch(originalFetch, config);

    // This one should pass through
    await patchedFetch('/api/data', { method: 'GET' });
    expect(originalFetch).toHaveBeenCalled();
    
    originalFetch.mockClear();

    // This one should fail
    const response = await patchedFetch('/api/data', { method: 'POST' });
    expect(response.status).toBe(500);
    expect(originalFetch).not.toHaveBeenCalled();
  });

  it('should add latency to a matching request', async () => {
    const config: NetworkConfig = {
      latencies: [{ urlPattern: '/api/slow', delayMs: 100, probability: 1.0 }]
    };
    const patchedFetch = patchFetch(originalFetch, config);

    const startTime = Date.now();
    await patchedFetch('/api/slow');
    const endTime = Date.now();

    expect(endTime - startTime).toBeGreaterThanOrEqual(100);
    expect(originalFetch).toHaveBeenCalledWith('/api/slow', undefined);
  });

  it('should respect probability for failures', async () => {
    const config: NetworkConfig = {
      failures: [{ urlPattern: '/api/flaky', statusCode: 500, probability: 0.0 }]
    };
    const patchedFetch = patchFetch(originalFetch, config);

    // With 0 probability, should always call original
    await patchedFetch('/api/flaky');
    expect(originalFetch).toHaveBeenCalled();
  });
});
