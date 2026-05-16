import type { ChaosConfig } from './config';

/** ChaosConfig slice a scenario profile is allowed to carry. Auto-includes any
 *  new top-level field added to ChaosConfig EXCEPT the keys explicitly forbidden
 *  inside a profile: `customPresets`, `customProfiles`, `profile`,
 *  `profileOverrides`, `schemaVersion`.
 *
 *  A profile MAY carry `presets: string[]`, `seed`, `debug`, `groups`, and the
 *  four rule categories. Profiles compose with presets via their own
 *  `presets[]` field; recursive profile inheritance is intentionally
 *  out-of-scope. */
export type ProfileConfigSlice = Omit<
  ChaosConfig,
  'customPresets' | 'customProfiles' | 'profile' | 'profileOverrides' | 'schemaVersion'
>;

/** Runtime override slice applied at inject-time. Identical shape to a profile
 *  slice — same fields allowed, same fields forbidden. The override block is
 *  the LAST writer in the resolution pipeline: its scalars (`seed`, `debug`)
 *  win over both the profile and the top-level config, and its rule arrays
 *  append after every other layer. */
export type ProfileOverrideSlice = ProfileConfigSlice;

/** A named profile packaged for registry registration. Wraps the config slice
 *  with its registration name. */
export interface Profile {
  readonly name: string;
  readonly config: ProfileConfigSlice;
}

// Hard-coded shared config so reading the file shows exactly what the demo
// profile does and which kebab name resolves to which config. The alias below
// registers the SAME object identity, so
// `registry.get('mobile-checkout') === registry.get('mobileCheckout')`.
const MOBILE_CHECKOUT: ProfileConfigSlice = {
  presets: ['mobile-3g', 'checkout-degraded'],
};

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

// Built-in slice is immutable. Mutating
// `registry.get('mobile-checkout').presets!.push('x')` is a no-op in sloppy
// mode and throws in strict mode. Custom profiles passed via `customProfiles`
// are NOT frozen — users keep ownership of their literals.
[MOBILE_CHECKOUT].forEach(deepFreeze);

/** Built-in scenario profile registrations.
 *
 *  v0.7.0 ships **exactly one** built-in profile, `mobileCheckout`, plus its
 *  kebab alias `mobile-checkout`. Both entries point at the SAME frozen config
 *  object identity, mirroring the `PresetRegistry` alias contract.
 *
 *  This list is intentionally NOT an open catalog. Profiles are deliberately
 *  user-owned; `mobileCheckout` exists as a wiring demo so the registry,
 *  resolution pipeline, and adapter surfaces have one concrete name to
 *  exercise end-to-end. Define your own scenarios via `customProfiles` or
 *  inline `defineProfile()` on the builder. */
export const BUILT_IN_PROFILES: ReadonlyArray<Profile> = Object.freeze(
  ([
    { name: 'mobileCheckout',  config: MOBILE_CHECKOUT },
    { name: 'mobile-checkout', config: MOBILE_CHECKOUT },
  ] as Profile[]).map((p) => Object.freeze(p)),
);

function normalizeProfileName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('[chaos-maker] profile name cannot be empty');
  return trimmed;
}

/** Per-instance registry of scenario profiles. Constructor seeds the built-in
 *  demo entries by default; pass an empty iterable to start from scratch. The
 *  slice shape is type-enforced for built-ins and Zod-validated for
 *  `customProfiles`, so `register` does not re-check structure. */
export class ProfileRegistry {
  private map = new Map<string, ProfileConfigSlice>();

  constructor(initial: Iterable<Profile> = BUILT_IN_PROFILES) {
    for (const p of initial) this.register(p);
  }

  register(profile: Profile): void {
    const name = normalizeProfileName(profile.name);
    if (this.map.has(name)) {
      throw new Error(`[chaos-maker] profile '${name}' already registered`);
    }
    this.map.set(name, profile.config);
  }

  registerAll(entries: Record<string, ProfileConfigSlice> | undefined): void {
    if (!entries) return;
    for (const [name, config] of Object.entries(entries)) {
      this.register({ name, config });
    }
  }

  has(name: string): boolean {
    return this.map.has(normalizeProfileName(name));
  }

  get(name: string): ProfileConfigSlice {
    const norm = normalizeProfileName(name);
    const cfg = this.map.get(norm);
    if (!cfg) {
      throw new Error(`[chaos-maker] profile '${norm}' is not registered. Known: ${this.list().join(', ')}`);
    }
    return cfg;
  }

  list(): string[] {
    return [...this.map.keys()];
  }
}
