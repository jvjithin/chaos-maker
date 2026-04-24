/**
 * Service Worker chaos entry point.
 *
 * Loaded into the user's service-worker script (classic `importScripts(…)` or
 * module-worker `import { installChaosSW }`), this module patches
 * `self.fetch` + `self.WebSocket` using the same interceptor engine that
 * powers page-context chaos. Config is delivered from the page via
 * `postMessage` and acked through a `MessageChannel` transferred by the
 * adapter helper. Every chaos event is broadcast to controlled clients so
 * tests can read a unified log on the page side.
 *
 * Deliberately excluded from this bundle: Zod validation, UI DOM assailant,
 * the public `ChaosMaker` class, and the builder — all page-side concerns.
 * The page-side adapter helpers validate config before postMessage, so the
 * SW bundle stays small enough to ship to production service workers.
 */

import type { ChaosConfig } from './config';
import type { ChaosEvent } from './events';
import { ChaosEventEmitter } from './events';
import { createPrng } from './prng';
import { patchFetch } from './interceptors/networkFetch';
import { patchWebSocket, WebSocketPatchHandle } from './interceptors/websocket';

/**
 * Service-Worker global scope. Typed manually so this file compiles under the
 * main `lib: ["ESNext", "DOM"]` config — adding the `"WebWorker"` lib at the
 * tsconfig level collides with `lib.dom`. These are the only SW globals we
 * touch.
 */
interface SWClient {
  readonly id: string;
  postMessage(message: unknown): void;
}

interface SWClients {
  matchAll(options?: { includeUncontrolled?: boolean; type?: string }): Promise<readonly SWClient[]>;
  claim?: () => Promise<void>;
  get?: (id: string) => Promise<SWClient | undefined>;
}

interface SWGlobal {
  fetch: typeof globalThis.fetch;
  WebSocket?: typeof WebSocket;
  clients?: SWClients;
  addEventListener(type: string, listener: (event: unknown) => void, options?: unknown): void;
  removeEventListener(type: string, listener: (event: unknown) => void, options?: unknown): void;
}

const INSTALL_MARK = Symbol.for('chaos-maker.sw.installed');

/** Message sent by page → SW to configure chaos. */
export interface ChaosSWConfigMessage {
  __chaosMakerConfig: ChaosConfig;
}

/** Message sent by page → SW to stop chaos and restore fetch/WebSocket. */
export interface ChaosSWStopMessage {
  __chaosMakerStop: true;
}

/** Message sent by page → SW to read the accumulated event log. */
export interface ChaosSWGetLogMessage {
  __chaosMakerGetLog: true;
}

/** Message sent by page → SW to clear the accumulated event log. */
export interface ChaosSWClearLogMessage {
  __chaosMakerClearLog: true;
}

/** Ack sent SW → port (or broadcast) after a config / stop message lands. */
export interface ChaosSWAck {
  __chaosMakerAck: true;
  seed?: number;
  running: boolean;
}

/** Log payload sent SW → port (or broadcast) in response to getLog. */
export interface ChaosSWLogReply {
  __chaosMakerLog: true;
  log: ChaosEvent[];
}

/** Event broadcast SW → all controlled clients for every chaos decision. */
export interface ChaosSWEventMessage {
  __chaosMakerSWEvent: true;
  event: ChaosEvent;
}

export interface InstallChaosSWOptions {
  /**
   * How the SW receives its chaos config.
   *
   * - `'message'` (default) — wait for a `postMessage({ __chaosMakerConfig: … })`
   *   from the page. Typically paired with a `MessageChannel` for ack.
   * - `'self-global'` — read `self.__CHAOS_CONFIG__` synchronously. Useful when
   *   the SW script is served with the config baked in (e.g. query-string).
   */
  source?: 'message' | 'self-global';
  /** Max entries buffered in the SW-side log. Defaults to 2000. */
  maxLogEntries?: number;
}

export interface SWChaosHandle {
  /** True while a config is installed and `self.fetch` is patched. */
  isRunning(): boolean;
  /** Seed used by the active PRNG, or null if no config is installed. */
  getSeed(): number | null;
  /** Snapshot of chaos events emitted inside the SW since install. */
  getLog(): ChaosEvent[];
  /** Clear the in-SW log buffer. Does not clear already-delivered page-side events. */
  clearLog(): void;
  /** Stop chaos + remove the message listener. Restores `self.fetch`. */
  uninstall(): void;
}

function getSelf(): SWGlobal | null {
  // Fallback to globalThis for test envs that stub `self` via globalThis.
  if (typeof self !== 'undefined') return self as unknown as SWGlobal;
  if (typeof globalThis !== 'undefined') return globalThis as unknown as SWGlobal;
  return null;
}

function broadcastToClients(target: SWGlobal, message: unknown): void {
  const clients = target.clients;
  if (!clients || typeof clients.matchAll !== 'function') return;
  clients
    .matchAll({ includeUncontrolled: true })
    .then((all) => {
      for (const client of all) {
        try {
          client.postMessage(message);
        } catch {
          // client gone — ignore
        }
      }
    })
    .catch(() => {
      /* matchAll rejected during teardown — silent */
    });
}

interface SWEngineState {
  target: SWGlobal;
  emitter: ChaosEventEmitter;
  running: boolean;
  seed: number | null;
  random: () => number;
  originalFetch?: typeof globalThis.fetch;
  originalWebSocket?: typeof WebSocket;
  webSocketHandle?: WebSocketPatchHandle;
  requestCounters: Map<object, number>;
}

function startEngine(state: SWEngineState, config: ChaosConfig): number {
  if (state.running) stopEngine(state);

  const prng = createPrng(config.seed);
  state.seed = prng.seed;
  state.random = prng.random;
  state.requestCounters = new Map();

  if (config.network) {
    const target = state.target;
    if (typeof target.fetch === 'function') {
      state.originalFetch = target.fetch;
      target.fetch = patchFetch(
        state.originalFetch.bind(target as unknown as typeof globalThis),
        config.network,
        state.random,
        state.emitter,
        state.requestCounters,
      ) as typeof globalThis.fetch;
    }
  }

  if (config.websocket && typeof state.target.WebSocket !== 'undefined') {
    state.originalWebSocket = state.target.WebSocket;
    state.webSocketHandle = patchWebSocket(
      state.originalWebSocket,
      config.websocket,
      state.emitter,
      state.random,
      state.requestCounters,
    );
    state.target.WebSocket = state.webSocketHandle.Wrapped;
  }

  state.running = true;
  return state.seed;
}

function stopEngine(state: SWEngineState): void {
  if (!state.running && !state.originalFetch && !state.originalWebSocket) return;

  if (state.originalFetch) {
    state.target.fetch = state.originalFetch;
    state.originalFetch = undefined;
  }
  if (state.originalWebSocket) {
    state.target.WebSocket = state.originalWebSocket;
    state.originalWebSocket = undefined;
  }
  if (state.webSocketHandle) {
    state.webSocketHandle.uninstall();
    state.webSocketHandle = undefined;
  }
  state.running = false;
}

function replyViaPortOrBroadcast(target: SWGlobal, evt: { ports?: readonly unknown[] }, message: unknown): void {
  const port = evt.ports?.[0] as { postMessage?: (m: unknown) => void } | undefined;
  if (port && typeof port.postMessage === 'function') {
    try {
      port.postMessage(message);
      return;
    } catch {
      // Port may already be detached; fall through to broadcast.
    }
  }
  broadcastToClients(target, message);
}

/**
 * Install Service-Worker chaos. Listens for config via `postMessage`,
 * patches `self.fetch` (and `self.WebSocket` when configured), and
 * broadcasts every chaos event to all controlled clients so the test
 * runner's page-side helper can build a unified event log.
 *
 * Idempotent: calling more than once returns the existing handle.
 *
 * @example Classic SW (typical user integration — one line)
 * ```js
 * // user's sw.js
 * importScripts('/vendor/chaos-maker-sw.js');
 * ```
 *
 * @example Module SW (`type: 'module'`)
 * ```js
 * import { installChaosSW } from '@chaos-maker/core/sw';
 * installChaosSW();
 * ```
 */
export function installChaosSW(opts: InstallChaosSWOptions = {}): SWChaosHandle {
  const target = getSelf();
  const noop: SWChaosHandle = {
    isRunning: () => false,
    getSeed: () => null,
    getLog: () => [],
    clearLog: () => { /* noop */ },
    uninstall: () => { /* noop */ },
  };
  if (!target || typeof target.fetch !== 'function' || typeof target.addEventListener !== 'function') {
    return noop;
  }

  // Idempotent: second install returns the first handle rather than double-
  // patching fetch (which would break restore on uninstall).
  const existing = (target as unknown as Record<symbol, SWChaosHandle | undefined>)[INSTALL_MARK];
  if (existing) return existing;

  const emitter = new ChaosEventEmitter(opts.maxLogEntries ?? 2000);
  // Placeholder PRNG replaced by `createPrng` when a config arrives — never
  // consulted by an interceptor before `startEngine` swaps it.
  const placeholder = createPrng(0);
  const state: SWEngineState = {
    target,
    emitter,
    running: false,
    seed: null,
    random: placeholder.random,
    requestCounters: new Map(),
  };

  emitter.on('*', (event) => {
    broadcastToClients(target, { __chaosMakerSWEvent: true, event } satisfies ChaosSWEventMessage);
  });

  const messageHandler = (raw: unknown): void => {
    const evt = raw as { data?: unknown; ports?: readonly unknown[] };
    const data = evt.data;
    if (!data || typeof data !== 'object') return;
    const asCfg = data as Partial<ChaosSWConfigMessage & ChaosSWStopMessage & ChaosSWGetLogMessage & ChaosSWClearLogMessage>;

    if (asCfg.__chaosMakerConfig) {
      const seed = startEngine(state, asCfg.__chaosMakerConfig);
      replyViaPortOrBroadcast(target, evt, {
        __chaosMakerAck: true,
        seed,
        running: state.running,
      } satisfies ChaosSWAck);
      return;
    }

    if (asCfg.__chaosMakerStop) {
      stopEngine(state);
      replyViaPortOrBroadcast(target, evt, {
        __chaosMakerAck: true,
        running: false,
      } satisfies ChaosSWAck);
      return;
    }

    if (asCfg.__chaosMakerGetLog) {
      replyViaPortOrBroadcast(target, evt, {
        __chaosMakerLog: true,
        log: emitter.getLog(),
      } satisfies ChaosSWLogReply);
      return;
    }

    if (asCfg.__chaosMakerClearLog) {
      emitter.clearLog();
      replyViaPortOrBroadcast(target, evt, {
        __chaosMakerAck: true,
        running: state.running,
      } satisfies ChaosSWAck);
      return;
    }
  };

  target.addEventListener('message', messageHandler);

  // `source: 'self-global'` kicks the engine immediately from a pre-baked
  // config (set before importScripts / module load). Used by fixture bakeries
  // that want chaos active during the install event.
  if ((opts.source ?? 'message') === 'self-global') {
    const pre = (target as unknown as { __CHAOS_CONFIG__?: ChaosConfig }).__CHAOS_CONFIG__;
    if (pre && typeof pre === 'object') {
      startEngine(state, pre);
    }
  }

  const handle: SWChaosHandle = {
    isRunning: () => state.running,
    getSeed: () => state.seed,
    getLog: () => emitter.getLog(),
    clearLog: () => emitter.clearLog(),
    uninstall: () => {
      target.removeEventListener('message', messageHandler);
      stopEngine(state);
      delete (target as unknown as Record<symbol, unknown>)[INSTALL_MARK];
    },
  };

  (target as unknown as Record<symbol, unknown>)[INSTALL_MARK] = handle;
  return handle;
}

// Auto-install when loaded via classic `importScripts(…)`. `importScripts` is
// only defined in classic Worker / ServiceWorker scopes; module workers don't
// have it, so ESM consumers get a silent no-op here and can still call
// `installChaosSW()` explicitly. Gate is doubly-safe: the INSTALL_MARK check
// inside `installChaosSW` also prevents double-install.
declare const importScripts: ((...urls: string[]) => void) | undefined;
if (
  typeof self !== 'undefined' &&
  typeof importScripts === 'function'
) {
  installChaosSW({ source: 'message' });
}

export type { ChaosConfig, ChaosEvent };
