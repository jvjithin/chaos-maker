declare module 'cypress' {
  interface Chainable {
    injectChaos(config: import('@chaos-maker/core').ChaosConfig): void;
  }
}

export {};


