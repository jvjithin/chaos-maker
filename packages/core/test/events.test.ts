import { describe, it, expect, vi } from 'vitest';
import { ChaosEventEmitter, ChaosEvent } from '../src/events';

describe('ChaosEventEmitter', () => {
  it('should emit events to type-specific listeners', () => {
    const emitter = new ChaosEventEmitter();
    const listener = vi.fn();
    emitter.on('network:failure', listener);

    const event: ChaosEvent = {
      type: 'network:failure',
      timestamp: Date.now(),
      applied: true,
      detail: { url: '/api', method: 'GET', statusCode: 503 },
    };
    emitter.emit(event);

    expect(listener).toHaveBeenCalledWith(event);
  });

  it('should emit events to wildcard listeners', () => {
    const emitter = new ChaosEventEmitter();
    const listener = vi.fn();
    emitter.on('*', listener);

    const event: ChaosEvent = {
      type: 'network:latency',
      timestamp: Date.now(),
      applied: true,
      detail: { url: '/api', delayMs: 500 },
    };
    emitter.emit(event);

    expect(listener).toHaveBeenCalledWith(event);
  });

  it('should not call listeners for other event types', () => {
    const emitter = new ChaosEventEmitter();
    const listener = vi.fn();
    emitter.on('ui:assault', listener);

    emitter.emit({
      type: 'network:failure',
      timestamp: Date.now(),
      applied: true,
      detail: { url: '/api', statusCode: 500 },
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it('should accumulate events in the log', () => {
    const emitter = new ChaosEventEmitter();

    emitter.emit({
      type: 'network:failure',
      timestamp: 1000,
      applied: true,
      detail: { url: '/api/1' },
    });
    emitter.emit({
      type: 'network:latency',
      timestamp: 2000,
      applied: false,
      detail: { url: '/api/2', delayMs: 100 },
    });

    const log = emitter.getLog();
    expect(log).toHaveLength(2);
    expect(log[0].type).toBe('network:failure');
    expect(log[1].type).toBe('network:latency');
    expect(log[1].applied).toBe(false);
  });

  it('should return a copy from getLog', () => {
    const emitter = new ChaosEventEmitter();
    emitter.emit({
      type: 'network:failure',
      timestamp: Date.now(),
      applied: true,
      detail: {},
    });

    const log1 = emitter.getLog();
    const log2 = emitter.getLog();
    expect(log1).toEqual(log2);
    expect(log1).not.toBe(log2);
  });

  it('should clear the log', () => {
    const emitter = new ChaosEventEmitter();
    emitter.emit({
      type: 'network:failure',
      timestamp: Date.now(),
      applied: true,
      detail: {},
    });
    expect(emitter.getLog()).toHaveLength(1);

    emitter.clearLog();
    expect(emitter.getLog()).toHaveLength(0);
  });

  it('should remove listeners with off', () => {
    const emitter = new ChaosEventEmitter();
    const listener = vi.fn();
    emitter.on('network:failure', listener);
    emitter.off('network:failure', listener);

    emitter.emit({
      type: 'network:failure',
      timestamp: Date.now(),
      applied: true,
      detail: {},
    });

    expect(listener).not.toHaveBeenCalled();
  });
});
