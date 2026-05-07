import { z } from 'zod';
import { ChaosConfigError } from './errors';
import type { ChaosConfig } from './config';
import { PresetRegistry, expandPresets, type PresetConfigSlice } from './presets';

const probability = z.number().min(0, 'Probability must be >= 0').max(1, 'Probability must be <= 1');

const positiveInt = z.number().int().min(1);

/** Shared counting fields for network chaos rules. At most one may be set. */
const countingFields = {
  onNth: positiveInt.optional(),
  everyNth: positiveInt.optional(),
  afterN: z.number().int().min(0).optional(),
};

/** Optional `group` field shared by every rule type (RFC-001).
 *  `.trim()` runs before `.min(1)` so `'payments '` and `'payments'` collapse
 *  to one group and whitespace-only names are rejected. */
const groupField = {
  group: z.string().trim().min(1, 'group must not be empty').optional(),
};

const mutuallyExclusiveCounting = (data: { onNth?: number; everyNth?: number; afterN?: number }) =>
  [data.onNth, data.everyNth, data.afterN].filter(v => v !== undefined).length <= 1;

const countingRefinement = [
  mutuallyExclusiveCounting,
  { message: 'Only one of onNth, everyNth, or afterN may be set on a single rule' },
] as const;

/** GraphQL operation matcher: a non-empty string (exact match) or a RegExp.
 *  Empty strings are rejected because they would silently never match.
 *  `/g` and `/y` flags are rejected because `RegExp.test()` mutates `lastIndex`
 *  for those flags, which would flap match outcomes across consecutive calls
 *  with the same matcher instance. */
const graphqlOperationMatcher = z.union([
  z.string().min(1, 'graphqlOperation must not be empty'),
  z.instanceof(RegExp).refine(
    (re) => !re.global && !re.sticky,
    { message: 'graphqlOperation RegExp must not use global (g) or sticky (y) flags due to lastIndex mutation' },
  ),
]);

/** Fields shared by every network chaos rule type. */
const networkMatcherFields = {
  urlPattern: z.string().min(1, 'urlPattern must not be empty'),
  methods: z.array(z.string()).optional(),
  graphqlOperation: graphqlOperationMatcher.optional(),
};

const networkFailureSchema = z.object({
  ...networkMatcherFields,
  statusCode: z.number().int().min(100).max(599),
  probability,
  body: z.string().optional(),
  statusText: z.string().optional(),
  headers: z.record(z.string()).optional(),
  ...countingFields,
  ...groupField,
}).strict().refine(...countingRefinement);

const networkLatencySchema = z.object({
  ...networkMatcherFields,
  delayMs: z.number().min(0, 'delayMs must be >= 0'),
  probability,
  ...countingFields,
  ...groupField,
}).strict().refine(...countingRefinement);

const networkAbortSchema = z.object({
  ...networkMatcherFields,
  probability,
  timeout: z.number().min(0, 'timeout must be >= 0').optional(),
  ...countingFields,
  ...groupField,
}).strict().refine(...countingRefinement);

const networkCorruptionSchema = z.object({
  ...networkMatcherFields,
  probability,
  strategy: z.enum(['truncate', 'malformed-json', 'empty', 'wrong-type']),
  ...countingFields,
  ...groupField,
}).strict().refine(...countingRefinement);

const networkCorsSchema = z.object({
  ...networkMatcherFields,
  probability,
  ...countingFields,
  ...groupField,
}).strict().refine(...countingRefinement);

const networkConfigSchema = z.object({
  failures: z.array(networkFailureSchema).optional(),
  latencies: z.array(networkLatencySchema).optional(),
  aborts: z.array(networkAbortSchema).optional(),
  corruptions: z.array(networkCorruptionSchema).optional(),
  cors: z.array(networkCorsSchema).optional(),
}).strict();

const uiAssaultSchema = z.object({
  selector: z.string().min(1, 'selector must not be empty'),
  action: z.enum(['disable', 'hide', 'remove']),
  probability,
  ...groupField,
}).strict();

const uiConfigSchema = z.object({
  assaults: z.array(uiAssaultSchema).optional(),
}).strict();

const webSocketDirection = z.enum(['inbound', 'outbound', 'both']);

const webSocketDropSchema = z.object({
  urlPattern: z.string().min(1, 'urlPattern must not be empty'),
  direction: webSocketDirection,
  probability,
  ...countingFields,
  ...groupField,
}).strict().refine(...countingRefinement);

const webSocketDelaySchema = z.object({
  urlPattern: z.string().min(1, 'urlPattern must not be empty'),
  direction: webSocketDirection,
  delayMs: z.number().min(0, 'delayMs must be >= 0'),
  probability,
  ...countingFields,
  ...groupField,
}).strict().refine(...countingRefinement);

const webSocketCorruptSchema = z.object({
  urlPattern: z.string().min(1, 'urlPattern must not be empty'),
  direction: webSocketDirection,
  strategy: z.enum(['truncate', 'malformed-json', 'empty', 'wrong-type']),
  probability,
  ...countingFields,
  ...groupField,
}).strict().refine(...countingRefinement);

// WebSocket close code spec: only 1000 or the 3000–4999 range are valid as input
// to `WebSocket.close(code, reason)`. Codes 1001–1015 are reserved for the
// browser/protocol; passing them throws `InvalidAccessError` at runtime.
const webSocketCloseCode = z.number().int().refine(
  (code) => code === 1000 || (code >= 3000 && code <= 4999),
  { message: 'code must be 1000 or in the range 3000-4999' },
);

// WebSocket close reason: the UTF-8 encoded string must be <= 123 bytes.
// Control frame payload is 125 bytes; 2 are reserved for the code.
const webSocketCloseReason = z.string().refine(
  (reason) => new TextEncoder().encode(reason).length <= 123,
  { message: 'reason must be <= 123 UTF-8 bytes' },
);

const webSocketCloseSchema = z.object({
  urlPattern: z.string().min(1, 'urlPattern must not be empty'),
  code: webSocketCloseCode.optional(),
  reason: webSocketCloseReason.optional(),
  afterMs: z.number().min(0, 'afterMs must be >= 0').optional(),
  probability,
  ...countingFields,
  ...groupField,
}).strict().refine(...countingRefinement);

const webSocketConfigSchema = z.object({
  drops: z.array(webSocketDropSchema).optional(),
  delays: z.array(webSocketDelaySchema).optional(),
  corruptions: z.array(webSocketCorruptSchema).optional(),
  closes: z.array(webSocketCloseSchema).optional(),
}).strict();

// SSE event-type matcher: either '*' (all events), 'message' (default
// unnamed events), or any other named event string. Empty strings are
// rejected because they would silently never match.
const sseEventType = z.string().min(1, 'eventType must not be empty');

const sseDropSchema = z.object({
  urlPattern: z.string().min(1, 'urlPattern must not be empty'),
  eventType: sseEventType.optional(),
  probability,
  ...countingFields,
  ...groupField,
}).strict().refine(...countingRefinement);

const sseDelaySchema = z.object({
  urlPattern: z.string().min(1, 'urlPattern must not be empty'),
  eventType: sseEventType.optional(),
  delayMs: z.number().min(0, 'delayMs must be >= 0'),
  probability,
  ...countingFields,
  ...groupField,
}).strict().refine(...countingRefinement);

const sseCorruptSchema = z.object({
  urlPattern: z.string().min(1, 'urlPattern must not be empty'),
  eventType: sseEventType.optional(),
  strategy: z.enum(['truncate', 'malformed-json', 'empty', 'wrong-type']),
  probability,
  ...countingFields,
  ...groupField,
}).strict().refine(...countingRefinement);

const sseCloseSchema = z.object({
  urlPattern: z.string().min(1, 'urlPattern must not be empty'),
  afterMs: z.number().min(0, 'afterMs must be >= 0').optional(),
  probability,
  ...countingFields,
  ...groupField,
}).strict().refine(...countingRefinement);

const sseConfigSchema = z.object({
  drops: z.array(sseDropSchema).optional(),
  delays: z.array(sseDelaySchema).optional(),
  corruptions: z.array(sseCorruptSchema).optional(),
  closes: z.array(sseCloseSchema).optional(),
}).strict();

/** Declarative group config (RFC-001) accepted on `ChaosConfig.groups`.
 *  Same `.trim().min(1)` discipline as the per-rule `group` field so
 *  `'payments '` and `'payments'` collapse to one group. */
const groupConfigSchema = z.object({
  name: z.string().trim().min(1, 'group name must not be empty'),
  enabled: z.boolean().optional(),
}).strict();

const groupConfigListSchema = z.array(groupConfigSchema).superRefine((groups, ctx) => {
  const seen = new Set<string>();
  for (const [index, group] of groups.entries()) {
    const norm = group.name.trim();
    if (seen.has(norm)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'duplicate group name after normalization',
        path: [index, 'name'],
      });
      continue;
    }
    seen.add(norm);
  }
});

/** RFC-002 Debug Mode. Public surface accepts `boolean`; the object form is
 *  reserved internal so future fields (`level`, `prefix`, `console`, `sink`)
 *  can land non-breaking. `.strict()` ensures unknown sub-fields reject. */
const debugSchema = z.union([
  z.boolean(),
  z.object({ enabled: z.boolean() }).strict(),
]);

/** Hoisted base for the rule-bearing portion of `ChaosConfig`. Both the
 *  public `chaosConfigSchema` (with presets/seed/debug) and the preset-slice
 *  schema (without) compose from this single source. */
const chaosConfigSliceSchema = z.object({
  network: networkConfigSchema.optional(),
  ui: uiConfigSchema.optional(),
  websocket: webSocketConfigSchema.optional(),
  sse: sseConfigSchema.optional(),
  groups: groupConfigListSchema.optional(),
}).strict();

/** Preset config slice — same shape as the rule-bearing base. Strict so
 *  `presets`, `customPresets`, `seed`, `debug` reject inside a preset. */
const presetConfigSliceSchema = chaosConfigSliceSchema;

const presetNameSchema = z.string().trim().min(1, 'preset name must not be empty');

/** Silent dedup preserving first occurrence. Mirrors the builder's
 *  `.usePreset()` semantics so both surfaces normalize to the same shape. */
const presetsArraySchema = z.array(presetNameSchema).transform((names) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const norm = n.trim();
    if (!seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
    }
  }
  return out;
});

const customPresetsSchema = z.record(presetNameSchema, presetConfigSliceSchema);

// INVARIANT: `presets` and `customPresets` MUST stay `.optional()`.
// `prepareChaosConfig` runs Zod pass 2 on a config with both fields STRIPPED
// — making either required would break the canonical preparation path. If
// stricter enforcement is needed elsewhere, do it in a dedicated schema
// variant, not here.
const chaosConfigSchema = chaosConfigSliceSchema.extend({
  presets: presetsArraySchema.optional(),
  customPresets: customPresetsSchema.optional(),
  seed: z.number().int('Seed must be an integer').optional(),
  debug: debugSchema.optional(),
}).strict();

// DRIFT GUARD — fails to compile if `PresetConfigSlice` gains a top-level
// key the schema doesn't model. New rule category on ChaosConfig? Add an
// entry to `chaosConfigSliceSchema` and this check passes again.
//
// SCOPE: top-level category coverage ONLY. This guard does NOT verify:
//   - per-category nested-shape parity;
//   - runtime validation behavior or strictness of nested schemas;
//   - that `forEachRule` walks the new category (separate test enforces);
//   - that `appendSlice` walks the new category (its `cat` tuple in
//     `presets.ts` must be updated for non-network/ui/websocket/sse cats).
type _SliceKeys = keyof Required<PresetConfigSlice>;
type _SchemaKeys = keyof typeof chaosConfigSliceSchema.shape;
type _Missing = Exclude<_SliceKeys, _SchemaKeys>;
const _sliceSchemaCovers: _Missing extends never ? true : never = true;
void _sliceSchemaCovers;

/** Schema-only validation. DOES NOT expand presets and DOES NOT run the
 *  post-merge re-validation pass. Calling this on its own in a runtime path
 *  will silently bypass preset expansion. For runtime config preparation,
 *  ALWAYS call `prepareChaosConfig`. */
export function validateConfig(config: unknown): ChaosConfig {
  const result = chaosConfigSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`
    );
    throw new ChaosConfigError(issues);
  }
  return result.data as ChaosConfig;
}

/** Canonical runtime preparation entry point for a `ChaosConfig`.
 *
 *  Composes the four validation steps and normalizes plain-`Error` throws
 *  into `ChaosConfigError`:
 *    1. Zod pass 1 — input shape (presets array, customPresets record).
 *    2. Build per-instance `PresetRegistry`, register customs.
 *    3. `expandPresets` — append rule arrays + groups, strip preset fields.
 *    4. Zod pass 2 — re-validate the merged config (catches group-name
 *       collisions across preset+user that pass 1 cannot detect).
 *
 *  Idempotent: a config with no presets / customPresets returns a
 *  structurally-equivalent fresh clone.
 *
 *  Used by `ChaosMaker` constructor and every adapter SW page-side helper.
 *  Do NOT call `validateConfig` directly in a runtime path — it is the
 *  schema-only primitive and skips preset expansion. */
export function prepareChaosConfig(input: unknown): ChaosConfig {
  const validated = validateConfig(input);
  let expanded: ChaosConfig;
  try {
    const registry = new PresetRegistry();
    registry.registerAll(validated.customPresets);
    expanded = expandPresets(validated, registry);
  } catch (e) {
    if (e instanceof ChaosConfigError) throw e;
    throw new ChaosConfigError([(e as Error).message]);
  }
  return validateConfig(expanded);
}
