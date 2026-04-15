import { ChaosConfig } from './config';
import { validateConfig } from './validation';
import { createPrng } from './prng';
import { ChaosEventEmitter, ChaosEvent, ChaosEventType, ChaosEventListener } from './events';
import { patchFetch } from './interceptors/networkFetch';
import { patchXHR, patchXHROpen } from './interceptors/networkXHR';
import { attachDomAssailant } from './interceptors/domAssailant';

export class ChaosMaker {
  private config: ChaosConfig;
  private emitter: ChaosEventEmitter;
  private random: () => number;
  private seed: number;
  private running = false;
  private originalFetch?: typeof window.fetch;
  private originalXhrSend?: (body?: Document | XMLHttpRequestBodyInit) => void;
  private originalXhrOpen?: (method: string, url: string | URL) => void;
  private domObserver?: MutationObserver;
  /** Shared request counters keyed by config rule object reference. Shared across fetch + XHR. */
  private requestCounters: Map<object, number> = new Map();

  constructor(config: ChaosConfig) {
    this.config = validateConfig(config);
    this.emitter = new ChaosEventEmitter();
    const prng = createPrng(config.seed);
    this.random = prng.random;
    this.seed = prng.seed;
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

    if (this.config.network) {
      this.originalFetch = window.fetch;
      window.fetch = patchFetch(this.originalFetch.bind(window), this.config.network, this.emitter, this.random, this.requestCounters);

      this.originalXhrOpen = window.XMLHttpRequest.prototype.open;
      window.XMLHttpRequest.prototype.open = patchXHROpen(this.originalXhrOpen);

      this.originalXhrSend = window.XMLHttpRequest.prototype.send;
      window.XMLHttpRequest.prototype.send = patchXHR(this.originalXhrSend, this.config.network, this.emitter, this.random, this.requestCounters);
    }

    if (this.config.ui) {
      this.domObserver = attachDomAssailant(this.config.ui, this.emitter, this.random);
      this.domObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
      console.log('UI Assailant is now observing the DOM.');
    }
  }

  public stop(): void {
    this.running = false;
    console.log('🛑 Chaos Maker DISENGAGED 🛑');

    if (this.originalFetch) {
      window.fetch = this.originalFetch;
    }
    if (this.originalXhrSend) {
      window.XMLHttpRequest.prototype.send = this.originalXhrSend;
    }
    if (this.originalXhrOpen) {
      window.XMLHttpRequest.prototype.open = this.originalXhrOpen;
    }
    if (this.domObserver) {
      this.domObserver.disconnect();
      console.log('UI Assailant has stopped observing.');
    }
  }
}
