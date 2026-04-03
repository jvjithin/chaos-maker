import { ChaosMaker } from './ChaosMaker';
import { ChaosConfig, NetworkFailureConfig, NetworkLatencyConfig, NetworkAbortConfig, NetworkCorruptionConfig, NetworkCorsConfig, NetworkConfig, UiAssaultConfig, UiConfig } from './config';
import { ChaosConfigError } from './errors';
import { validateConfig } from './validation';
import { ChaosEvent, ChaosEventType, ChaosEventListener, ChaosEventEmitter } from './events';
import { ChaosConfigBuilder } from './builder';
import { presets } from './presets';

export { ChaosMaker, ChaosConfigError, validateConfig, ChaosEventEmitter, ChaosConfigBuilder, presets };
export type { ChaosConfig, NetworkFailureConfig, NetworkLatencyConfig, NetworkAbortConfig, NetworkCorruptionConfig, NetworkCorsConfig, NetworkConfig, UiAssaultConfig, UiConfig, ChaosEvent, ChaosEventType, ChaosEventListener };

// --- NEW INTERFACE ---
interface ChaosUtilsApi {
  instance: ChaosMaker | null;
  start: (config: ChaosConfig) => { success: boolean; message: string };
  stop: () => { success: boolean; message: string };
  getLog: () => ChaosEvent[];
}

// --- Global API & Auto-Start Logic ---
if (typeof window !== 'undefined') {
  (window as any).ChaosMaker = ChaosMaker;
  
  // Apply the interface
  const chaosUtilsApi: ChaosUtilsApi = {
    instance: null,
    
    start: (config: ChaosConfig) => {
      try {
        if (chaosUtilsApi.instance) {
          chaosUtilsApi.instance.stop();
        }
        chaosUtilsApi.instance = new ChaosMaker(config);
        chaosUtilsApi.instance.start();
        return { success: true, message: "Chaos started" };
      } catch (e: any) {
        console.error("Chaos Utils Error:", e);
        return { success: false, message: e.message };
      }
    },
    
    stop: () => {
      if (chaosUtilsApi.instance) {
        chaosUtilsApi.instance.stop();
        chaosUtilsApi.instance = null;
        return { success: true, message: "Chaos stopped" };
      }
      return { success: false, message: "No chaos instance to stop" };
    },

    getLog: () => {
      if (chaosUtilsApi.instance) {
        return chaosUtilsApi.instance.getLog();
      }
      return [];
    }
  };
  
  (window as any).chaosUtils = chaosUtilsApi;
  
  if ((window as any).__CHAOS_CONFIG__) {
    try {
      const config = (window as any).__CHAOS_CONFIG__;
      chaosUtilsApi.start(config);
      delete (window as any).__CHAOS_CONFIG__;
    } catch (e) {
      console.error('ChaosMaker auto-start failed:', e);
    }
  }
}
