import { browser, $ } from '@wdio/globals';
import type { ChaosEvent } from '@chaos-maker/core';

const API_PATTERN = '/api/data.json';

async function visitAndInject(config: Parameters<WebdriverIO.Browser['injectChaos']>[0]): Promise<void> {
  await browser.url('/');
  await browser.injectChaos(config);
}

describe('Network Failures', () => {
  it('injects failure with 503 status', async () => {
    await visitAndInject({
      network: { failures: [{ urlPattern: API_PATTERN, statusCode: 503, probability: 1.0 }] },
    });
    await $('#fetch-data').click();
    await expect($('#status')).toHaveText('Error!');
    await expect($('#result')).toHaveTextContaining('503');
    const log = (await browser.getChaosLog()) as ChaosEvent[];
    expect(log.some((e) => e.type === 'network:failure' && e.applied)).toBe(true);
  });

  it('injects failure with custom body and status text', async () => {
    await visitAndInject({
      network: {
        failures: [{
          urlPattern: API_PATTERN,
          statusCode: 429,
          probability: 1.0,
          body: '{"error":"rate limited"}',
          statusText: 'Too Many Requests',
        }],
      },
    });
    await $('#fetch-data').click();
    await expect($('#status')).toHaveText('Error!');
    await expect($('#result')).toHaveTextContaining('429');
  });

  it('passes through when probability is 0', async () => {
    await visitAndInject({
      network: { failures: [{ urlPattern: API_PATTERN, statusCode: 500, probability: 0 }] },
    });
    await $('#fetch-data').click();
    await expect($('#status')).toHaveText('Success!');
  });

  it('applies failure only to matching HTTP methods', async () => {
    await visitAndInject({
      network: {
        failures: [{ urlPattern: API_PATTERN, statusCode: 500, probability: 1.0, methods: ['POST'] }],
      },
    });
    await $('#fetch-data').click();
    await expect($('#status')).toHaveText('Success!');
    await $('#fetch-post').click();
    await expect($('#status')).toHaveText('Error!');
    await expect($('#result')).toHaveTextContaining('500');
  });

  it('does not affect non-matching URLs', async () => {
    await visitAndInject({
      network: { failures: [{ urlPattern: '/no-match', statusCode: 500, probability: 1.0 }] },
    });
    await $('#fetch-data').click();
    await expect($('#status')).toHaveText('Success!');
  });

  it('injects failure on XHR requests', async () => {
    await visitAndInject({
      network: { failures: [{ urlPattern: API_PATTERN, statusCode: 500, probability: 1.0 }] },
    });
    await $('#xhr-get').click();
    await expect($('#xhr-status')).toHaveText('Error!');
    await expect($('#xhr-result')).toHaveTextContaining('500');
  });
});

describe('Network Latency', () => {
  it('adds delay to fetch requests', async () => {
    const delayMs = 500;
    await visitAndInject({
      network: { latencies: [{ urlPattern: API_PATTERN, delayMs, probability: 1.0 }] },
    });
    await $('#fetch-data').click();
    await expect($('#status')).toHaveText('Success!');
    const timingText = await $('#timing').getText();
    expect(parseInt(timingText, 10)).toBeGreaterThanOrEqual(delayMs - 100);
  });

  it('logs latency event', async () => {
    await visitAndInject({
      network: { latencies: [{ urlPattern: API_PATTERN, delayMs: 100, probability: 1.0 }] },
    });
    await $('#fetch-data').click();
    await expect($('#status')).toHaveText('Success!');
    const log = (await browser.getChaosLog()) as ChaosEvent[];
    const evt = log.find((e) => e.type === 'network:latency' && e.applied);
    expect(evt).toBeDefined();
    expect(evt!.detail).toMatchObject({ delayMs: 100 });
  });

  it('skips latency when probability is 0', async () => {
    await visitAndInject({
      network: { latencies: [{ urlPattern: API_PATTERN, delayMs: 2000, probability: 0 }] },
    });
    await $('#fetch-data').click();
    await expect($('#status')).toHaveText('Success!');
    const log = (await browser.getChaosLog()) as ChaosEvent[];
    expect(log.some((e) => e.type === 'network:latency' && e.applied)).toBe(false);
  });
});

describe('Connection Abort', () => {
  it('aborts fetch requests immediately', async () => {
    await visitAndInject({
      network: { aborts: [{ urlPattern: API_PATTERN, probability: 1.0 }] },
    });
    await $('#fetch-data').click();
    await expect($('#status')).toHaveText('Error!');
    await expect($('#result')).toHaveTextContaining('aborted');
    const log = (await browser.getChaosLog()) as ChaosEvent[];
    expect(log.some((e) => e.type === 'network:abort' && e.applied)).toBe(true);
  });

  it('aborts XHR requests', async () => {
    await visitAndInject({
      network: { aborts: [{ urlPattern: API_PATTERN, probability: 1.0 }] },
    });
    await $('#xhr-get').click();
    await expect($('#xhr-status')).toHaveText('Aborted!');
  });

  it('records timeout in abort event detail', async () => {
    await visitAndInject({
      network: { aborts: [{ urlPattern: API_PATTERN, probability: 1.0, timeout: 200 }] },
    });
    await $('#fetch-data').click();
    await expect($('#timing')).not.toHaveText('');
    const log = (await browser.getChaosLog()) as ChaosEvent[];
    const evt = log.find((e) => e.type === 'network:abort');
    expect(evt).toBeDefined();
    expect(evt!.detail).toMatchObject({ timeoutMs: 200 });
  });
});

describe('Response Corruption', () => {
  it('truncates response body', async () => {
    await visitAndInject({
      network: {
        corruptions: [{ urlPattern: API_PATTERN, strategy: 'truncate', probability: 1.0 }],
      },
    });
    await $('#fetch-data').click();
    await expect($('#status')).toHaveText('Parse Error!');
    const txt = await $('#result').getText();
    expect(txt.length).toBeGreaterThan(0);
    expect(txt.length).toBeLessThan(50);
    const log = (await browser.getChaosLog()) as ChaosEvent[];
    expect(log.some((e) => e.type === 'network:corruption' && e.applied)).toBe(true);
  });

  it('injects malformed JSON', async () => {
    await visitAndInject({
      network: {
        corruptions: [{ urlPattern: API_PATTERN, strategy: 'malformed-json', probability: 1.0 }],
      },
    });
    await $('#fetch-data').click();
    await expect($('#status')).toHaveText('Parse Error!');
    await expect($('#result')).toHaveTextContaining('"}');
  });

  it('replaces response with empty body', async () => {
    await visitAndInject({
      network: {
        corruptions: [{ urlPattern: API_PATTERN, strategy: 'empty', probability: 1.0 }],
      },
    });
    await $('#fetch-data').click();
    await expect($('#status')).toHaveText('Parse Error!');
    await expect($('#result')).toHaveText('');
  });

  it('replaces response with unexpected HTML', async () => {
    await visitAndInject({
      network: {
        corruptions: [{ urlPattern: API_PATTERN, strategy: 'wrong-type', probability: 1.0 }],
      },
    });
    await $('#fetch-data').click();
    await expect($('#status')).toHaveText('Parse Error!');
    await expect($('#result')).toHaveTextContaining('Unexpected HTML');
  });
});

describe('CORS Simulation', () => {
  it('simulates CORS failure on fetch', async () => {
    await visitAndInject({
      network: { cors: [{ urlPattern: API_PATTERN, probability: 1.0 }] },
    });
    await $('#fetch-data').click();
    await expect($('#status')).toHaveText('Error!');
    await expect($('#result')).toHaveTextContaining('Failed to fetch');
    const log = (await browser.getChaosLog()) as ChaosEvent[];
    expect(log.some((e) => e.type === 'network:cors' && e.applied)).toBe(true);
  });

  it('simulates CORS failure on XHR', async () => {
    await visitAndInject({
      network: { cors: [{ urlPattern: API_PATTERN, probability: 1.0 }] },
    });
    await $('#xhr-get').click();
    await expect($('#xhr-status')).toHaveText('Error!');
    await expect($('#xhr-result')).toHaveTextContaining('Network Error');
  });

  it('applies CORS only to matching methods', async () => {
    await visitAndInject({
      network: { cors: [{ urlPattern: API_PATTERN, probability: 1.0, methods: ['POST'] }] },
    });
    await $('#fetch-data').click();
    await expect($('#status')).toHaveText('Success!');
    await $('#fetch-post').click();
    await expect($('#status')).toHaveText('Error!');
    await expect($('#result')).toHaveTextContaining('Failed to fetch');
  });
});
