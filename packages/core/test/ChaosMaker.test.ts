import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChaosMaker } from '../src/ChaosMaker';
import { ChaosConfig } from '../src/config';

// Store original implementations
const originalFetch = global.fetch;
const originalXhrOpen = global.XMLHttpRequest.prototype.open;
const originalXhrSend = global.XMLHttpRequest.prototype.send;

describe('ChaosMaker', () => {
  let chaosMaker: ChaosMaker;

  afterEach(() => {
    // Stop the chaos maker and restore all original functions
    if (chaosMaker) {
      chaosMaker.stop();
    }
    global.fetch = originalFetch;
    global.XMLHttpRequest.prototype.open = originalXhrOpen;
    global.XMLHttpRequest.prototype.send = originalXhrSend;
  });

  it('should patch global fetch when started', () => {
    const config: ChaosConfig = { network: {} };
    chaosMaker = new ChaosMaker(config);

    expect(global.fetch).toBe(originalFetch);
    chaosMaker.start();
    expect(global.fetch).not.toBe(originalFetch);
  });

  it('should restore global fetch when stopped', () => {
    const config: ChaosConfig = { network: {} };
    chaosMaker = new ChaosMaker(config);

    chaosMaker.start();
    expect(global.fetch).not.toBe(originalFetch);
    chaosMaker.stop();
    expect(global.fetch).toBe(originalFetch);
  });

  it('should patch global XHR functions when started', () => {
    const config: ChaosConfig = { network: {} };
    chaosMaker = new ChaosMaker(config);

    expect(global.XMLHttpRequest.prototype.open).toBe(originalXhrOpen);
    expect(global.XMLHttpRequest.prototype.send).toBe(originalXhrSend);
    
    chaosMaker.start();

    expect(global.XMLHttpRequest.prototype.open).not.toBe(originalXhrOpen);
    expect(global.XMLHttpRequest.prototype.send).not.toBe(originalXhrSend);
  });

  it('should restore global XHR functions when stopped', () => {
    const config: ChaosConfig = { network: {} };
    chaosMaker = new ChaosMaker(config);

    chaosMaker.start();
    chaosMaker.stop();

    expect(global.XMLHttpRequest.prototype.open).toBe(originalXhrOpen);
    expect(global.XMLHttpRequest.prototype.send).toBe(originalXhrSend);
  });

  it('should correctly use the config to fail a fetch call', async () => {
    const config: ChaosConfig = {
      network: {
        failures: [{ urlPattern: '/api/test', statusCode: 500, probability: 1.0 }]
      }
    };
    chaosMaker = new ChaosMaker(config);
    chaosMaker.start();

    const response = await global.fetch('/api/test');
    expect(response.status).toBe(500);
  });
});
