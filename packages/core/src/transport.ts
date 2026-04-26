/**
 * Transport-safe (de)serialization for `ChaosConfig` values that may carry
 * `RegExp` instances.
 *
 * Why: every adapter passes config across the Node ↔ browser boundary via a
 * channel that JSON-encodes its argument (Playwright `addInitScript`,
 * Puppeteer `evaluateOnNewDocument`, WDIO `JSON.stringify(...)` into a script
 * tag). `JSON.stringify` collapses `RegExp` to `{}`, which silently breaks
 * matchers like `graphqlOperation: /^Get/`.
 *
 * `serializeForTransport` walks the config and replaces every `RegExp` with a
 * plain marker object that survives JSON. `deserializeForTransport` reverses
 * the substitution. Both are pure and structurally recursive — they don't
 * touch other values.
 */

const REGEX_MARKER = '__chaosMakerRegExp';

interface RegExpMarker {
  [REGEX_MARKER]: { source: string; flags: string };
}

function isRegExpMarker(value: unknown): value is RegExpMarker {
  if (value === null || typeof value !== 'object') return false;
  const marker = (value as Record<string, unknown>)[REGEX_MARKER];
  if (!marker || typeof marker !== 'object') return false;
  const m = marker as Record<string, unknown>;
  return typeof m.source === 'string' && typeof m.flags === 'string';
}

/** Replace every `RegExp` instance in `value` with a JSON-safe marker object.
 *  Pass through everything else (primitives, arrays, plain objects). */
export function serializeForTransport<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof RegExp) {
    return { [REGEX_MARKER]: { source: value.source, flags: value.flags } } as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeForTransport(item)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = serializeForTransport(val);
  }
  return out as T;
}

/** Reconstruct any `RegExp` markers in `value` produced by `serializeForTransport`.
 *  Idempotent: passing a fully-deserialized value through a second time is a no-op. */
export function deserializeForTransport<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof RegExp) return value;
  if (isRegExpMarker(value)) {
    const { source, flags } = (value as unknown as RegExpMarker)[REGEX_MARKER];
    return new RegExp(source, flags) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => deserializeForTransport(item)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = deserializeForTransport(val);
  }
  return out as T;
}
