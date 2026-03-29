import { ChaosConfig } from './config';
import { validateConfig } from './validation';
import { ChaosEventEmitter, ChaosEvent, ChaosEventType, ChaosEventListener } from './events';
import { patchFetch } from './interceptors/networkFetch';
import { patchXHR, patchXHROpen } from './interceptors/networkXHR';
import { attachDomAssailant } from './interceptors/domAssailant';

export class ChaosMaker {
  private config: ChaosConfig;
  private emitter: ChaosEventEmitter;
  private originalFetch?: typeof window.fetch;
  private originalXhrSend?: (body?: Document | XMLHttpRequestBodyInit) => void;
  private originalXhrOpen?: (method: string, url: string | URL) => void;
  private domObserver?: MutationObserver;

  constructor(config: ChaosConfig) {
    this.config = validateConfig(config);
    this.emitter = new ChaosEventEmitter();
    console.log('Chaos Maker initialized with config:', config);
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
    console.log('🛠️ Chaos Maker ENGAGED 🛠️');

    if (this.config.network) {
      this.originalFetch = window.fetch;
      window.fetch = patchFetch(this.originalFetch.bind(window), this.config.network, this.emitter);

      this.originalXhrOpen = window.XMLHttpRequest.prototype.open;
      window.XMLHttpRequest.prototype.open = patchXHROpen(this.originalXhrOpen);

      this.originalXhrSend = window.XMLHttpRequest.prototype.send;
      window.XMLHttpRequest.prototype.send = patchXHR(this.originalXhrSend, this.config.network, this.emitter);
    }

    if (this.config.ui) {
      this.domObserver = attachDomAssailant(this.config.ui, this.emitter);
      this.domObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
      console.log('UI Assailant is now observing the DOM.');
    }
  }

  public stop(): void {
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
