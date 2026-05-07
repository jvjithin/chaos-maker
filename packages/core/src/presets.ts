import type { ChaosConfig } from './config';
import { cloneValue } from './utils';

/** ChaosConfig slice a preset is allowed to carry. Auto-includes any new
 *  rule category added to ChaosConfig — the `Omit` is bounded to fields that
 *  are explicitly forbidden inside a preset (`presets`, `customPresets`,
 *  `seed`, `debug`). */
export type PresetConfigSlice = Omit<ChaosConfig, 'presets' | 'customPresets' | 'seed' | 'debug'>;

/** RFC-003. A named preset packaged for registry registration. */
export interface Preset {
  readonly name: string;
  readonly config: PresetConfigSlice;
}

const MATCH_ALL_URLS = '*';

// Hard-coded shared configs so reading the file shows what every preset does
// and which kebab name resolves to which config. Aliases below register the
// SAME object identity, so `registry.get('slow-api') === presets.slowNetwork`.
const SLOW_NETWORK: PresetConfigSlice = {
  network: {
    latencies: [{ urlPattern: MATCH_ALL_URLS, delayMs: 2000, probability: 1.0 }],
  },
};

const FLAKY_CONNECTION: PresetConfigSlice = {
  network: {
    aborts: [{ urlPattern: MATCH_ALL_URLS, probability: 0.05 }],
    latencies: [{ urlPattern: MATCH_ALL_URLS, delayMs: 3000, probability: 0.1 }],
  },
};

const OFFLINE_MODE: PresetConfigSlice = {
  network: {
    cors: [{ urlPattern: MATCH_ALL_URLS, probability: 1.0 }],
  },
};

const UNSTABLE_API: PresetConfigSlice = {
  network: {
    failures: [{ urlPattern: '/api/', statusCode: 500, probability: 0.1 }],
    latencies: [{ urlPattern: '/api/', delayMs: 1000, probability: 0.2 }],
  },
};

const DEGRADED_UI: PresetConfigSlice = {
  ui: {
    assaults: [
      { selector: 'button', action: 'disable', probability: 0.2 },
      { selector: 'a', action: 'hide', probability: 0.1 },
    ],
  },
};

const UNRELIABLE_WEBSOCKET: PresetConfigSlice = {
  websocket: {
    drops: [{ urlPattern: MATCH_ALL_URLS, direction: 'both', probability: 0.1 }],
    delays: [{ urlPattern: MATCH_ALL_URLS, direction: 'inbound', delayMs: 500, probability: 1.0 }],
    corruptions: [{ urlPattern: MATCH_ALL_URLS, direction: 'inbound', strategy: 'truncate', probability: 0.05 }],
  },
};

const UNRELIABLE_EVENT_STREAM: PresetConfigSlice = {
  sse: {
    drops: [{ urlPattern: MATCH_ALL_URLS, probability: 0.05 }],
    delays: [{ urlPattern: MATCH_ALL_URLS, delayMs: 200, probability: 1.0 }],
    closes: [{ urlPattern: MATCH_ALL_URLS, probability: 0.02, afterMs: 2000 }],
  },
};

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

// Built-in slices are immutable. Mutating `registry.get('slow-api').network!
// .latencies![0].delayMs = 1` is a no-op in sloppy mode and throws in strict
// mode. Custom presets passed via `customPresets` are NOT frozen — users keep
// ownership of their literals; the engine deep-clones them at expansion time.
[SLOW_NETWORK, FLAKY_CONNECTION, OFFLINE_MODE, UNSTABLE_API, DEGRADED_UI, UNRELIABLE_WEBSOCKET, UNRELIABLE_EVENT_STREAM].forEach(deepFreeze);

/** All built-in presets including RFC-003 kebab aliases.
 *  Aliases are EXTRA registry entries pointing at the SAME config object
 *  identity as the camelCase entry — so
 *  `registry.get('slow-api') === presets.slowNetwork`. */
export const BUILT_IN_PRESETS: ReadonlyArray<Preset> = Object.freeze([
  { name: 'unstableApi',           config: UNSTABLE_API },
  { name: 'slowNetwork',           config: SLOW_NETWORK },
  { name: 'offlineMode',           config: OFFLINE_MODE },
  { name: 'flakyConnection',       config: FLAKY_CONNECTION },
  { name: 'degradedUi',            config: DEGRADED_UI },
  { name: 'unreliableWebSocket',   config: UNRELIABLE_WEBSOCKET },
  { name: 'unreliableEventStream', config: UNRELIABLE_EVENT_STREAM },
  { name: 'slow-api',      config: SLOW_NETWORK },
  { name: 'flaky-api',     config: FLAKY_CONNECTION },
  { name: 'offline-mode',  config: OFFLINE_MODE },
  { name: 'high-latency',  config: UNSTABLE_API },
]);

function normalizePresetName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('[chaos-maker] preset name cannot be empty');
  return trimmed;
}

/** RFC-003. Per-instance registry of presets. Constructor seeds the built-ins
 *  by default; pass an empty iterable to start from scratch. The slice shape
 *  is type-enforced for built-ins and Zod-validated for `customPresets`, so
 *  `register` does not re-check structure. */
export class PresetRegistry {
  private map = new Map<string, PresetConfigSlice>();

  constructor(initial: Iterable<Preset> = BUILT_IN_PRESETS) {
    for (const p of initial) this.register(p);
  }

  register(preset: Preset): void {
    const name = normalizePresetName(preset.name);
    if (this.map.has(name)) {
      throw new Error(`[chaos-maker] preset '${name}' already registered`);
    }
    this.map.set(name, preset.config);
  }

  registerAll(entries: Record<string, PresetConfigSlice> | undefined): void {
    if (!entries) return;
    for (const [name, config] of Object.entries(entries)) {
      this.register({ name, config });
    }
  }

  has(name: string): boolean {
    return this.map.has(normalizePresetName(name));
  }

  get(name: string): PresetConfigSlice {
    const norm = normalizePresetName(name);
    const cfg = this.map.get(norm);
    if (!cfg) {
      throw new Error(`[chaos-maker] preset '${norm}' is not registered. Known: ${this.list().join(', ')}`);
    }
    return cfg;
  }

  list(): string[] {
    return [...this.map.keys()];
  }
}

/** Append rule arrays from `slice` onto `target`. Walks the four rule-bearing
 *  categories reflectively so any new sub-key under one of them flows through
 *  without per-array code. Top-level `groups` is concatenated separately;
 *  duplicate names across preset+user are caught by `prepareChaosConfig`'s
 *  Zod pass 2 (`groupConfigListSchema.superRefine`).
 *
 *  Fail-fast: if any sub-key under a known category is not an array, this
 *  throws immediately rather than silently dropping rules. Catches
 *  contributor errors the moment a preset exercising the bad shape runs.
 *
 *  IF a future ChaosConfig category is NOT a `Record<string, ruleArray[]>`
 *  (e.g. a top-level config object instead of a rule bucket), the `cat`
 *  tuple below MUST be updated AND the new category needs explicit handling. */
function appendSlice(target: ChaosConfig, slice: PresetConfigSlice): void {
  for (const cat of ['network', 'ui', 'websocket', 'sse'] as const) {
    const src = slice[cat] as Record<string, unknown> | undefined;
    if (!src) continue;
    const dst = (target[cat] ??= {}) as Record<string, unknown[]>;
    for (const [k, arr] of Object.entries(src)) {
      if (!Array.isArray(arr)) {
        let received: string;
        try {
          const ctorName = arr === null ? 'null' : (arr as object)?.constructor?.name ?? typeof arr;
          const snippet = JSON.stringify(arr)?.slice(0, 80) ?? '<unserializable>';
          received = `${ctorName} ${snippet}`;
        } catch {
          received = `${typeof arr} <unserializable>`;
        }
        throw new Error(
          `[chaos-maker] internal: preset slice category '${cat}.${k}' must be an array (got ${received}). Update appendSlice when adding non-array category fields.`,
        );
      }
      (dst[k] ??= []).push(...arr);
    }
  }
  if (slice.groups?.length) {
    (target.groups ??= []).push(...slice.groups);
  }
}

/** Expand `config.presets` against `registry`. Identity contract:
 *
 *   - ALWAYS returns a fresh `ChaosConfig` (deep clone of the input). Callers
 *     own the returned object and may mutate it without affecting the input.
 *   - The output ALWAYS has `presets` and `customPresets` stripped, even if
 *     `presets[]` was empty. Prevents stale `customPresets` from leaking into
 *     the post-expansion config.
 *   - Throws when a name in `presets[]` is not registered. Plain `Error` —
 *     `prepareChaosConfig` wraps to `ChaosConfigError`.
 *
 *  Defensive deduplication on `presets[]` runs here as well as in the Zod
 *  transform, because `expandPresets` is exported and a contributor could
 *  call it directly on an un-validated config. */
export function expandPresets(config: ChaosConfig, registry: PresetRegistry): ChaosConfig {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const raw of config.presets ?? []) {
    const norm = raw.trim();
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    ordered.push(norm);
  }
  const out: ChaosConfig = cloneValue(config);
  delete out.presets;
  delete out.customPresets;
  for (const name of ordered) appendSlice(out, registry.get(name));
  return out;
}

/** Backward-compat: the v0.4.0 frozen-record export. **CamelCase keys ONLY.**
 *  RFC-003 kebab aliases (`slow-api`, `flaky-api`, `offline-mode`,
 *  `high-latency`) live exclusively on `PresetRegistry` — they are NOT keys
 *  on this record. By design:
 *
 *    presets['slow-api']  === undefined
 *    presets.slowNetwork  === new PresetRegistry().get('slow-api')   // same identity
 *    presets.slowNetwork  === new PresetRegistry().get('slowNetwork')
 *
 *  Use the camelCase key when reading from this record; use the registry (or
 *  the declarative `presets: ['slow-api']` config field) for kebab lookups. */
export const presets: Readonly<Record<string, PresetConfigSlice>> = Object.freeze({
  unstableApi:           UNSTABLE_API,
  slowNetwork:           SLOW_NETWORK,
  offlineMode:           OFFLINE_MODE,
  flakyConnection:       FLAKY_CONNECTION,
  degradedUi:            DEGRADED_UI,
  unreliableWebSocket:   UNRELIABLE_WEBSOCKET,
  unreliableEventStream: UNRELIABLE_EVENT_STREAM,
});
