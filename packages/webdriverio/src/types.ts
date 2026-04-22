import type { ChaosConfig, ChaosEvent } from '@chaos-maker/core';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace WebdriverIO {
    interface Browser {
      injectChaos(config: ChaosConfig): Promise<void>;
      removeChaos(): Promise<void>;
      getChaosLog(): Promise<ChaosEvent[]>;
      getChaosSeed(): Promise<number | null>;
    }
  }
}

export {};
