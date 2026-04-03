import { describe, it, expect, afterEach } from 'vitest';
import { ChaosMaker } from '../src/ChaosMaker';
import { ChaosConfig } from '../src/config';
import { ChaosConfigError } from '../src/errors';

const originalFetch = global.fetch;
const originalXhrOpen = global.XMLHttpRequest.prototype.open;
const originalXhrSend = global.XMLHttpRequest.prototype.send;

function restore() {
  global.fetch = originalFetch;
  global.XMLHttpRequest.prototype.open = originalXhrOpen;
  global.XMLHttpRequest.prototype.send = originalXhrSend;
}

describe('ChaosMaker edge cases', () => {
  afterEach(restore);

  // --- Double start ---

  it('should handle double start as a no-op', () => {
    const config: ChaosConfig = { network: {} };
    const cm = new ChaosMaker(config);

    cm.start();
    const fetchAfterFirst = global.fetch;

    // Second start is a no-op — does not re-patch
    cm.start();
    expect(global.fetch).toBe(fetchAfterFirst);

    cm.stop();
  });

  it('should restore to original fetch after double start then stop', () => {
    const config: ChaosConfig = { network: {} };
    const cm = new ChaosMaker(config);

    cm.start();
    cm.start(); // no-op due to running guard
    cm.stop();

    // Original is correctly preserved since second start was a no-op
    expect(global.fetch).toBe(originalFetch);
  });

  // --- Stop without start ---

  it('should handle stop without start gracefully', () => {
    const config: ChaosConfig = { network: {} };
    const cm = new ChaosMaker(config);

    // Should not throw
    expect(() => cm.stop()).not.toThrow();

    // Globals should remain untouched
    expect(global.fetch).toBe(originalFetch);
  });

  it('should handle double stop gracefully', () => {
    const config: ChaosConfig = { network: {} };
    const cm = new ChaosMaker(config);

    cm.start();
    cm.stop();

    // Second stop should not throw
    expect(() => cm.stop()).not.toThrow();
    expect(global.fetch).toBe(originalFetch);
  });

  // --- Multiple instances ---

  it('should support two concurrent instances patching different configs', async () => {
    const config1: ChaosConfig = {
      network: {
        failures: [{ urlPattern: '/api/one', statusCode: 500, probability: 1.0 }],
      },
    };
    const config2: ChaosConfig = {
      network: {
        failures: [{ urlPattern: '/api/two', statusCode: 503, probability: 1.0 }],
      },
    };

    const cm1 = new ChaosMaker(config1);
    const cm2 = new ChaosMaker(config2);

    cm1.start();
    cm2.start(); // overwrites fetch with cm2's patch

    // The active patch is cm2's — it intercepts /api/two
    const res = await global.fetch('/api/two');
    expect(res.status).toBe(503);

    cm2.stop();
    cm1.stop();
  });

  // --- Event log ---

  it('should return empty log before start', () => {
    const config: ChaosConfig = { network: {} };
    const cm = new ChaosMaker(config);
    expect(cm.getLog()).toEqual([]);
  });

  it('should accumulate events across multiple requests', async () => {
    const config: ChaosConfig = {
      network: {
        failures: [{ urlPattern: '/api/', statusCode: 500, probability: 1.0 }],
      },
    };
    const cm = new ChaosMaker(config);
    cm.start();

    await global.fetch('/api/a');
    await global.fetch('/api/b');
    await global.fetch('/api/c');

    expect(cm.getLog().length).toBe(3);
    expect(cm.getLog().every((e) => e.type === 'network:failure' && e.applied)).toBe(true);

    cm.stop();
  });

  it('should clear log independently of chaos state', async () => {
    const config: ChaosConfig = {
      network: {
        failures: [{ urlPattern: '/api/', statusCode: 500, probability: 1.0 }],
      },
    };
    const cm = new ChaosMaker(config);
    cm.start();

    await global.fetch('/api/test');
    expect(cm.getLog().length).toBe(1);

    cm.clearLog();
    expect(cm.getLog().length).toBe(0);

    // Chaos still works after clearing log
    await global.fetch('/api/test');
    expect(cm.getLog().length).toBe(1);

    cm.stop();
  });

  // --- Config validation ---

  it('should reject invalid config at construction time', () => {
    expect(() => {
      new ChaosMaker({
        network: {
          failures: [{ urlPattern: '', statusCode: 999, probability: 2.0 }],
        },
      });
    }).toThrow(ChaosConfigError);
  });

  // --- Empty config ---

  it('should handle empty config without patching anything', () => {
    const cm = new ChaosMaker({});
    cm.start();

    // No network config means fetch/XHR not patched
    expect(global.fetch).toBe(originalFetch);
    expect(global.XMLHttpRequest.prototype.send).toBe(originalXhrSend);

    cm.stop();
  });

  it('should handle ui-only config without patching network', () => {
    const cm = new ChaosMaker({
      ui: {
        assaults: [{ selector: 'button', action: 'disable', probability: 1.0 }],
      },
    });
    cm.start();

    // fetch/XHR should NOT be patched
    expect(global.fetch).toBe(originalFetch);
    expect(global.XMLHttpRequest.prototype.send).toBe(originalXhrSend);

    cm.stop();
  });
});
