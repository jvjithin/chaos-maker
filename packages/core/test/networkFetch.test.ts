import { describe, it, expect, beforeEach, vi } from 'vitest';
import { patchFetch } from '../src/interceptors/networkFetch';
import { NetworkConfig } from '../src/config';
import { ChaosEventEmitter } from '../src/events';
// Import the mock from setup.ts
import { mockFetch } from './setup';

// Get the mock fetch from our setup file
const originalFetch = mockFetch;

function createAbortAwareFetch() {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    if (!signal) {
      reject(new Error('Missing signal'));
      return;
    }

    const rejectWithAbort = () => {
      reject(signal.reason ?? new DOMException('The user aborted a request.', 'AbortError'));
    };

    if (signal.aborted) {
      rejectWithAbort();
      return;
    }

    signal.addEventListener('abort', rejectWithAbort, { once: true });
  }));
}

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

    expect(endTime - startTime).toBeGreaterThanOrEqual(95);
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

  it('should force a CORS error for a matching URL', async () => {
    const config: NetworkConfig = {
      cors: [{ urlPattern: '/api/cors', probability: 1.0 }]
    };
    const patchedFetch = patchFetch(originalFetch, config);

    await expect(patchedFetch('/api/cors')).rejects.toThrow('Failed to fetch');
    expect(originalFetch).not.toHaveBeenCalled();
  });

  it('should throw an AbortError for a matching URL immediately without timeout', async () => {
    const config: NetworkConfig = {
      aborts: [{ urlPattern: '/api/abort', probability: 1.0 }]
    };
    const abortAwareFetch = createAbortAwareFetch();
    const patchedFetch = patchFetch(abortAwareFetch as typeof global.fetch, config);

    await expect(patchedFetch('/api/abort')).rejects.toThrow('The user aborted a request.');
    expect(abortAwareFetch).toHaveBeenCalledTimes(1);
    const [, requestInit] = abortAwareFetch.mock.calls[0];
    expect(requestInit?.signal).toBeDefined();
    expect(requestInit?.signal?.aborted).toBe(true);
  });

  it('should throw an AbortError for a matching URL after a delay if timeout is set', async () => {
    vi.useFakeTimers();
    const config: NetworkConfig = {
      aborts: [{ urlPattern: '/api/abort-delay', timeout: 100, probability: 1.0 }]
    };
    const abortAwareFetch = createAbortAwareFetch();
    const patchedFetch = patchFetch(abortAwareFetch as typeof global.fetch, config);

    const requestPromise = patchedFetch('/api/abort-delay');
    expect(abortAwareFetch).toHaveBeenCalledTimes(1);

    const [, requestInit] = abortAwareFetch.mock.calls[0];
    expect(requestInit?.signal?.aborted).toBe(false);

    const rejectionAssertion = requestPromise.then(
      () => {
        throw new Error('Expected request to abort');
      },
      (error) => {
        expect(error).toMatchObject({
          name: 'AbortError',
          message: 'The user aborted a request.',
        });
      }
    );
    await vi.advanceTimersByTimeAsync(100);

    await rejectionAssertion;
    expect(requestInit?.signal?.aborted).toBe(true);
    vi.useRealTimers();
  });

  it('should corrupt response text according to truncate strategy', async () => {
    const config: NetworkConfig = {
      corruptions: [{ urlPattern: '/api/corrupt', strategy: 'truncate', probability: 1.0 }]
    };
    const patchedFetch = patchFetch(originalFetch, config);
    originalFetch.mockResolvedValueOnce(new global.Response('HelloWorld', { status: 200 }));

    const response = await patchedFetch('/api/corrupt');
    const text = await response.text();
    expect(text).toBe('Hello');
  });

  it('should corrupt response text according to malformed-json strategy', async () => {
    const config: NetworkConfig = {
      corruptions: [{ urlPattern: '/api/corrupt', strategy: 'malformed-json', probability: 1.0 }]
    };
    const patchedFetch = patchFetch(originalFetch, config);
    originalFetch.mockResolvedValueOnce(new global.Response('{"key":"value"}', { status: 200 }));

    const response = await patchedFetch('/api/corrupt');
    const text = await response.text();
    expect(text).toBe('{"key":"value"}"}');
  });

  it('should corrupt response text according to empty strategy', async () => {
    const config: NetworkConfig = {
      corruptions: [{ urlPattern: '/api/corrupt', strategy: 'empty', probability: 1.0 }]
    };
    const patchedFetch = patchFetch(originalFetch, config);
    originalFetch.mockResolvedValueOnce(new global.Response('HelloWorld', { status: 200 }));

    const response = await patchedFetch('/api/corrupt');
    const text = await response.text();
    expect(text).toBe('');
  });

  it('should corrupt response text according to wrong-type strategy', async () => {
    const config: NetworkConfig = {
      corruptions: [{ urlPattern: '/api/corrupt', strategy: 'wrong-type', probability: 1.0 }]
    };
    const patchedFetch = patchFetch(originalFetch, config);
    originalFetch.mockResolvedValueOnce(new global.Response('HelloWorld', { status: 200 }));

    const response = await patchedFetch('/api/corrupt');
    const text = await response.text();
    expect(text).toBe('<html><body>Unexpected HTML</body></html>');
  });

  it('should log corruption as not applied when fetch fails before a response is available', async () => {
    const emitter = new ChaosEventEmitter();
    const failingFetch = vi.fn().mockRejectedValue(new Error('boom'));
    const config: NetworkConfig = {
      corruptions: [{ urlPattern: '/api/corrupt', strategy: 'truncate', probability: 1.0 }]
    };
    const patchedFetch = patchFetch(failingFetch as typeof global.fetch, config, emitter);

    await expect(patchedFetch('/api/corrupt')).rejects.toThrow('boom');
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

  it('should log abort as not applied when the request completes before the timeout fires', async () => {
    const emitter = new ChaosEventEmitter();
    const fastFetch = vi.fn().mockResolvedValue(new global.Response('{}', { status: 200 }));
    const config: NetworkConfig = {
      aborts: [{ urlPattern: '/api/fast', timeout: 100, probability: 1.0 }]
    };
    const patchedFetch = patchFetch(fastFetch as typeof global.fetch, config, emitter);

    const response = await patchedFetch('/api/fast');

    expect(response.status).toBe(200);
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
