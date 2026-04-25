import { ChaosConfig } from './config';
import { validateConfig } from './validation';
import { createPrng } from './prng';
import { ChaosEventEmitter, ChaosEvent, ChaosEventType, ChaosEventListener } from './events';
import { patchFetch } from './interceptors/networkFetch';
import { patchXHR, patchXHROpen } from './interceptors/networkXHR';
import { attachDomAssailant } from './interceptors/domAssailant';
import { patchWebSocket, WebSocketPatchHandle } from './interceptors/websocket';
import { patchEventSource, EventSourceLikeStatic, EventSourcePatchHandle } from './interceptors/eventSource';

/**
 * Global context ChaosMaker patches against. Must expose at minimum `fetch`
 * (network chaos), and optionally `XMLHttpRequest` / `WebSocket`. In a
 * browser page this is `window`; in a service worker / dedicated worker
 * this is `self`. `globalThis` resolves to the correct value in both.
 */
export type ChaosTarget = typeof globalThis;

export interface ChaosMakerOptions {
  /**
   * Explicit global to install chaos on. Defaults to `globalThis`, which
   * resolves correctly in both window and service-worker contexts. Pass
   * `window` or `self` explicitly only for cross-context testing.
   */
  target?: ChaosTarget;
}

export class ChaosMaker {
  private config: ChaosConfig;
  private emitter: ChaosEventEmitter;
  private random: () => number;
  private seed: number;
  private running = false;
  private target: ChaosTarget;
  private originalFetch?: typeof globalThis.fetch;
  private originalXhrSend?: (body?: Document | XMLHttpRequestBodyInit) => void;
  private originalXhrOpen?: (method: string, url: string | URL) => void;
  private domObserver?: MutationObserver;
  private originalWebSocket?: typeof WebSocket;
  private webSocketHandle?: WebSocketPatchHandle;
  private originalEventSource?: typeof EventSource;
  private eventSourceHandle?: EventSourcePatchHandle;
  /** Shared counters keyed by config rule object reference. Shared across fetch + XHR + WS. */
  private requestCounters: Map<object, number> = new Map();

  constructor(config: ChaosConfig, options: ChaosMakerOptions = {}) {
    this.config = validateConfig(config);
    this.emitter = new ChaosEventEmitter();
    const prng = createPrng(config.seed);
    this.random = prng.random;
    this.seed = prng.seed;
    this.target = options.target ?? globalThis;
    console.log(`Chaos Maker initialized (seed: ${this.seed})`);
  }

  /** Get the seed used by this instance. Log this on failure to reproduce exact chaos decisions. */
  public getSeed(): number {
    return this.seed;
  }

  public on(type: ChaosEventType | '*', listener: ChaosEventListener): void {
    this.emitter.on(type, listener);
  }

  public off(type: ChaosEventType | '*', listener: ChaosEventListener): void {
    this.emitter.off(type, listener);
  }

  public getLog(): ChaosEvent[] {
    return this.emitter.getLog();
  }

  public clearLog(): void {
    this.emitter.clearLog();
  }

  public start(): void {
    if (this.running) {
      console.warn('Chaos Maker is already running. Call stop() first.');
      return;
    }
    // Reset per-run state so counting rules (onNth / everyNth / afterN)
    // restart from request 1 on every start() — not just on first construction.
    this.requestCounters.clear();
    this.running = true;
    console.log('🛠️ Chaos Maker ENGAGED 🛠️');

    const target = this.target;

    if (this.config.network) {
      if (typeof target.fetch === 'function') {
        this.originalFetch = target.fetch;
        target.fetch = patchFetch(this.originalFetch.bind(target), this.config.network, this.random, this.emitter, this.requestCounters);
      }

      if (typeof target.XMLHttpRequest === 'function') {
        this.originalXhrOpen = target.XMLHttpRequest.prototype.open;
        target.XMLHttpRequest.prototype.open = patchXHROpen(this.originalXhrOpen);

        this.originalXhrSend = target.XMLHttpRequest.prototype.send;
        target.XMLHttpRequest.prototype.send = patchXHR(this.originalXhrSend, this.config.network, this.random, this.emitter, this.requestCounters);
      }
    }

    if (this.config.ui) {
      if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
        console.warn('Chaos Maker: UI config ignored — no DOM available in current context.');
      } else {
        this.domObserver = attachDomAssailant(this.config.ui, this.random, this.emitter);
        this.domObserver.observe(document.body, {
          childList: true,
          subtree: true,
        });
        console.log('UI Assailant is now observing the DOM.');
      }
    }

    if (this.config.websocket && typeof target.WebSocket !== 'undefined') {
      this.originalWebSocket = target.WebSocket;
      this.webSocketHandle = patchWebSocket(
        this.originalWebSocket,
        this.config.websocket,
        this.emitter,
        this.random,
        this.requestCounters,
      );
      target.WebSocket = this.webSocketHandle.Wrapped;
    }

    if (this.config.sse && typeof target.EventSource !== 'undefined') {
      this.originalEventSource = target.EventSource;
      this.eventSourceHandle = patchEventSource(
        this.originalEventSource as unknown as EventSourceLikeStatic,
        this.config.sse,
        this.emitter,
        this.random,
        this.requestCounters,
      );
      target.EventSource = this.eventSourceHandle.Wrapped;
    }
  }

  public stop(): void {
    this.running = false;
    console.log('🛑 Chaos Maker DISENGAGED 🛑');

    const target = this.target;

    if (this.originalFetch) {
      target.fetch = this.originalFetch;
    }
    if (this.originalXhrSend && typeof target.XMLHttpRequest === 'function') {
      target.XMLHttpRequest.prototype.send = this.originalXhrSend;
    }
    if (this.originalXhrOpen && typeof target.XMLHttpRequest === 'function') {
      target.XMLHttpRequest.prototype.open = this.originalXhrOpen;
    }
    if (this.domObserver) {
      this.domObserver.disconnect();
      console.log('UI Assailant has stopped observing.');
    }
    if (this.originalWebSocket) {
      target.WebSocket = this.originalWebSocket;
      this.originalWebSocket = undefined;
    }
    if (this.webSocketHandle) {
      this.webSocketHandle.uninstall();
      this.webSocketHandle = undefined;
    }
    if (this.originalEventSource) {
      target.EventSource = this.originalEventSource;
      this.originalEventSource = undefined;
    }
    if (this.eventSourceHandle) {
      this.eventSourceHandle.uninstall();
      this.eventSourceHandle = undefined;
    }
  }
}
