import type { ChaosConfig, ChaosEvent } from '@chaos-maker/core';
import type { SWChaosOptions, InjectSWChaosResult } from './sw';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace WebdriverIO {
    interface Browser {
      injectChaos(config: ChaosConfig): Promise<void>;
      removeChaos(): Promise<void>;
      getChaosLog(): Promise<ChaosEvent[]>;
      getChaosSeed(): Promise<number | null>;
      injectSWChaos(config: ChaosConfig, options?: SWChaosOptions): Promise<InjectSWChaosResult>;
      removeSWChaos(options?: SWChaosOptions): Promise<void>;
      getSWChaosLog(): Promise<ChaosEvent[]>;
      getSWChaosLogFromSW(options?: SWChaosOptions): Promise<ChaosEvent[]>;
      enableGroup(name: string): Promise<void>;
      disableGroup(name: string): Promise<void>;
      enableSWGroup(name: string, options?: SWChaosOptions): Promise<void>;
      disableSWGroup(name: string, options?: SWChaosOptions): Promise<void>;
    }
  }
}

export {};
