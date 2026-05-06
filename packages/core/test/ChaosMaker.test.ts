import { describe, it, expect, afterEach, vi } from 'vitest';
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

  it('resets counting state on restart so onNth:1 fires again after stop/start', async () => {
    const config: ChaosConfig = {
      network: {
        failures: [{ urlPattern: '/api/test', statusCode: 500, probability: 1.0, onNth: 1 }],
      },
    };
    chaosMaker = new ChaosMaker(config);

    // First run: 1st request should fail (counter=1 matches onNth:1).
    chaosMaker.start();
    const r1 = await global.fetch('/api/test');
    expect(r1.status).toBe(500);
    chaosMaker.stop();

    // If counters weren't reset on restart, counter would already be past 1
    // and this request would NOT fail. We expect it to fail — counter is fresh.
    chaosMaker.start();
    const r2 = await global.fetch('/api/test');
    expect(r2.status).toBe(500);
    chaosMaker.stop();
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

  describe('debug mode (RFC-002)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('emits lifecycle debug events on start/stop when debug:true', () => {
      vi.spyOn(console, 'debug').mockImplementation(() => {});
      chaosMaker = new ChaosMaker({ debug: true });
      chaosMaker.start();
      chaosMaker.stop();

      const debugEvents = chaosMaker.getLog().filter((e) => e.type === 'debug');
      expect(debugEvents.length).toBeGreaterThanOrEqual(2);
      const phases = debugEvents.map((e) => e.detail.phase);
      expect(phases).toContain('engine:start');
      expect(phases).toContain('engine:stop');
      for (const e of debugEvents) {
        expect(e.detail.stage).toBe('lifecycle');
      }
    });

    it('emits lifecycle debug events on enableGroup/disableGroup', () => {
      vi.spyOn(console, 'debug').mockImplementation(() => {});
      chaosMaker = new ChaosMaker({ debug: true });
      chaosMaker.enableGroup('payments');
      chaosMaker.disableGroup('payments');

      const debugEvents = chaosMaker.getLog().filter((e) => e.type === 'debug');
      const groupToggles = debugEvents.filter((e) => e.detail.phase === 'engine:group-toggled');
      expect(groupToggles).toHaveLength(2);
      for (const e of groupToggles) {
        expect(e.detail.groupName).toBe('payments');
        expect(e.detail.stage).toBe('lifecycle');
      }
    });

    it('emits no debug events when debug:false', () => {
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      chaosMaker = new ChaosMaker({});
      chaosMaker.start();
      chaosMaker.enableGroup('p');
      chaosMaker.disableGroup('p');
      chaosMaker.stop();
      const debugEvents = chaosMaker.getLog().filter((e) => e.type === 'debug');
      expect(debugEvents).toHaveLength(0);
      // Ensure no [Chaos] line was mirrored (other console.debug calls from
      // existing CORS path are unrelated; we don't trigger CORS here).
      const chaosLines = debugSpy.mock.calls.filter((args) =>
        typeof args[0] === 'string' && args[0].startsWith('[Chaos] '),
      );
      expect(chaosLines).toHaveLength(0);
    });
  });
});
