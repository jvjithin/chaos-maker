import { ChaosMaker } from './ChaosMaker';
import { ChaosConfig } from './config';

export { ChaosMaker };
export type { ChaosConfig };

// --- NEW INTERFACE ---
interface ChaosUtilsApi {
  instance: ChaosMaker | null;
  start: (config: ChaosConfig) => { success: boolean; message: string };
  stop: () => { success: boolean; message: string };
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
