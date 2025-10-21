import { ChaosMaker } from './ChaosMaker';
import { ChaosConfig } from './config';

// --- FIX 1: Use 'export type' for ChaosConfig ---
export { ChaosMaker };
export type { ChaosConfig };

// --- Global API & Auto-Start Logic ---
if (typeof window !== 'undefined') {
  // 1. Expose the class for advanced usage
  (window as any).ChaosMaker = ChaosMaker;
  
  // 2. Create the singleton API object
  const chaosUtilsApi = {
    // --- FIX 2: Explicitly type 'instance' ---
    instance: null as ChaosMaker | null,
    
    start: (config: ChaosConfig) => {
      try {
        if (chaosUtilsApi.instance) {
          // No casting needed now
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
        // No casting needed now
        chaosUtilsApi.instance.stop();
        chaosUtilsApi.instance = null;
        return { success: true, message: "Chaos stopped" };
      }
      return { success: false, message: "No chaos instance to stop" };
    }
  };
  
  // 3. Attach the API to the window
  (window as any).chaosUtils = chaosUtilsApi;
  
  // 4. NOW, run the auto-start logic
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