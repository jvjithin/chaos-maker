export type RuntimePatchKind =
  | 'fetch'
  | 'xhr-open'
  | 'xhr-send'
  | 'websocket'
  | 'eventsource';

const RUNTIME_PATCH_KIND = Symbol.for('chaos-maker.runtime.patch-kind');
const ACTIVE_INSTANCE = Symbol.for('chaos-maker.runtime.active-instance');

type RuntimePatchValue = object & {
  [RUNTIME_PATCH_KIND]?: RuntimePatchKind;
};

type RuntimeTarget = object & {
  [ACTIVE_INSTANCE]?: unknown;
};

function isObjectLike(value: unknown): value is RuntimePatchValue {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

export function markRuntimePatch<T extends object>(value: T, kind: RuntimePatchKind): T {
  try {
    Object.defineProperty(value, RUNTIME_PATCH_KIND, {
      value: kind,
      configurable: true,
    });
  } catch {
    // Some host callables may reject property definitions. Diagnostics are
    // best-effort and must never change patching semantics.
  }
  return value;
}

export function getRuntimePatchKind(value: unknown): RuntimePatchKind | undefined {
  if (!isObjectLike(value)) return undefined;
  return value[RUNTIME_PATCH_KIND];
}

export function getActiveRuntimeInstance(target: object): unknown {
  return (target as RuntimeTarget)[ACTIVE_INSTANCE];
}

export function setActiveRuntimeInstance(target: object, instance: unknown): void {
  try {
    Object.defineProperty(target, ACTIVE_INSTANCE, {
      value: instance,
      configurable: true,
    });
  } catch {
    // Non-extensible globals are unusual, but diagnostics are optional.
  }
}

export function clearActiveRuntimeInstance(target: object, instance: unknown): void {
  const state = target as RuntimeTarget;
  if (state[ACTIVE_INSTANCE] !== instance) return;
  try {
    delete state[ACTIVE_INSTANCE];
  } catch {
    try {
      state[ACTIVE_INSTANCE] = undefined;
    } catch {
      // Best-effort diagnostics only; never throw from cleanup paths.
    }
  }
}
