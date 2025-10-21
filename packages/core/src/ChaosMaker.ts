import { ChaosConfig } from './config';
import { patchFetch } from './interceptors/networkFetch';
import { patchXHR, patchXHROpen } from './interceptors/networkXHR';
// Import the new domAssailant
import { attachDomAssailant } from './interceptors/domAssailant';

export class ChaosMaker {
  private config: ChaosConfig;
  private originalFetch?: typeof window.fetch;
  private originalXhrSend?: (body?: Document | XMLHttpRequestBodyInit) => void;
  private originalXhrOpen?: (method: string, url: string | URL) => void;
  // Add a property to hold our observer
  private domObserver?: MutationObserver;

  constructor(config: ChaosConfig) {
    this.config = config;
    console.log('Chaos Maker initialized with config:', config);
  }

  public start(): void {
    console.log('🛠️ Chaos Maker ENGAGED 🛠️');

    if (this.config.network) {
      // Patch Fetch
      this.originalFetch = window.fetch;
      window.fetch = patchFetch(this.originalFetch.bind(window), this.config.network);

      // Patch XHR
      this.originalXhrOpen = window.XMLHttpRequest.prototype.open;
      window.XMLHttpRequest.prototype.open = patchXHROpen(this.originalXhrOpen);
      
      this.originalXhrSend = window.XMLHttpRequest.prototype.send;
      window.XMLHttpRequest.prototype.send = patchXHR(this.originalXhrSend, this.config.network);
    }
    // --- UI Chaos (new) ---
    if (this.config.ui) {
      this.domObserver = attachDomAssailant(this.config.ui);
      // Start observing the entire document body for new elements
      this.domObserver.observe(document.body, {
        childList: true, // Watch for added/removed nodes
        subtree: true,   // Watch all descendants
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
    // --- Stop UI Chaos (new) ---
    if (this.domObserver) {
      this.domObserver.disconnect(); // Stop observing
      console.log('UI Assailant has stopped observing.');
    }
  }
}
