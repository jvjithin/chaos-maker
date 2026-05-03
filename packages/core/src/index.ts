import { ChaosMaker } from './ChaosMaker';
import { ChaosConfig, CorruptionStrategy, GraphQLOperationMatcher, NetworkFailureConfig, NetworkLatencyConfig, NetworkAbortConfig, NetworkCorruptionConfig, NetworkCorsConfig, NetworkConfig, NetworkRuleMatchers, RuleGroupAssignment, UiAssaultConfig, UiConfig, WebSocketConfig, WebSocketDropConfig, WebSocketDelayConfig, WebSocketCorruptConfig, WebSocketCloseConfig, WebSocketDirection, WebSocketCorruptionStrategy, SSEConfig, SSEDropConfig, SSEDelayConfig, SSECorruptConfig, SSECloseConfig, SSECorruptionStrategy, SSEEventTypeMatcher } from './config';
import { ChaosConfigError } from './errors';
import { validateConfig } from './validation';
import { ChaosEvent, ChaosEventType, ChaosEventListener, ChaosEventEmitter } from './events';
import { ChaosConfigBuilder } from './builder';
import { presets } from './presets';
import { createPrng, generateSeed } from './prng';
import { deserializeForTransport } from './transport';

export { ChaosMaker, ChaosConfigError, validateConfig, ChaosEventEmitter, ChaosConfigBuilder, presets, createPrng, generateSeed };
export { SW_BRIDGE_SOURCE } from './sw-bridge-source';
export { extractGraphQLOperation, parseOperationFromQueryString, operationNameMatches } from './graphql';
export { serializeForTransport, deserializeForTransport } from './transport';
export { DEFAULT_GROUP_NAME, RuleGroupRegistry } from './groups';
export type { RuleGroup, RuleGroupConfig } from './groups';
export type { GraphQLExtractResult, GraphQLRuleOutcome } from './graphql';
export type { ChaosConfig, CorruptionStrategy, GraphQLOperationMatcher, NetworkFailureConfig, NetworkLatencyConfig, NetworkAbortConfig, NetworkCorruptionConfig, NetworkCorsConfig, NetworkConfig, NetworkRuleMatchers, RuleGroupAssignment, UiAssaultConfig, UiConfig, WebSocketConfig, WebSocketDropConfig, WebSocketDelayConfig, WebSocketCorruptConfig, WebSocketCloseConfig, WebSocketDirection, WebSocketCorruptionStrategy, SSEConfig, SSEDropConfig, SSEDelayConfig, SSECorruptConfig, SSECloseConfig, SSECorruptionStrategy, SSEEventTypeMatcher, ChaosEvent, ChaosEventType, ChaosEventListener };

// --- NEW INTERFACE ---
interface ChaosUtilsApi {
  instance: ChaosMaker | null;
  start: (config: ChaosConfig) => { success: boolean; message: string };
  stop: () => { success: boolean; message: string };
  getLog: () => ChaosEvent[];
  getSeed: () => number | null;
  enableGroup: (name: string) => { success: boolean; message: string };
  disableGroup: (name: string) => { success: boolean; message: string };
  createGroup: (name: string, opts?: { enabled?: boolean }) => { success: boolean; message: string };
  getGroupState: (name: string) => boolean | null;
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
        // Reconstruct any RegExp matchers shipped via JSON-encoding adapters.
        // Idempotent for already-deserialized configs.
        const cfg = deserializeForTransport(config);
        chaosUtilsApi.instance = new ChaosMaker(cfg);
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
    },

    getSeed: () => {
      if (chaosUtilsApi.instance) {
        return chaosUtilsApi.instance.getSeed();
      }
      return null;
    },

    enableGroup: (name: string) => {
      if (!chaosUtilsApi.instance) return { success: false, message: 'No chaos instance' };
      try {
        chaosUtilsApi.instance.enableGroup(name);
        return { success: true, message: `Group '${name}' enabled` };
      } catch (e: any) {
        return { success: false, message: e?.message ?? String(e) };
      }
    },

    disableGroup: (name: string) => {
      if (!chaosUtilsApi.instance) return { success: false, message: 'No chaos instance' };
      try {
        chaosUtilsApi.instance.disableGroup(name);
        return { success: true, message: `Group '${name}' disabled` };
      } catch (e: any) {
        return { success: false, message: e?.message ?? String(e) };
      }
    },

    createGroup: (name: string, opts?: { enabled?: boolean }) => {
      if (!chaosUtilsApi.instance) return { success: false, message: 'No chaos instance' };
      try {
        chaosUtilsApi.instance.createGroup(name, opts);
        return { success: true, message: `Group '${name}' created` };
      } catch (e: any) {
        return { success: false, message: e?.message ?? String(e) };
      }
    },

    getGroupState: (name: string) => {
      if (!chaosUtilsApi.instance) return null;
      return chaosUtilsApi.instance.getGroupState(name);
    },
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
