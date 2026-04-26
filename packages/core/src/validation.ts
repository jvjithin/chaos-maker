import { z } from 'zod';
import { ChaosConfigError } from './errors';
import type { ChaosConfig } from './config';

const probability = z.number().min(0, 'Probability must be >= 0').max(1, 'Probability must be <= 1');

const positiveInt = z.number().int().min(1);

/** Shared counting fields for network chaos rules. At most one may be set. */
const countingFields = {
  onNth: positiveInt.optional(),
  everyNth: positiveInt.optional(),
  afterN: z.number().int().min(0).optional(),
};

const mutuallyExclusiveCounting = (data: { onNth?: number; everyNth?: number; afterN?: number }) =>
  [data.onNth, data.everyNth, data.afterN].filter(v => v !== undefined).length <= 1;

const countingRefinement = [
  mutuallyExclusiveCounting,
  { message: 'Only one of onNth, everyNth, or afterN may be set on a single rule' },
] as const;

/** GraphQL operation matcher: a non-empty string (exact match) or a RegExp.
 *  Empty strings are rejected because they would silently never match. */
const graphqlOperationMatcher = z.union([
  z.string().min(1, 'graphqlOperation must not be empty'),
  z.instanceof(RegExp),
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
}).strict().refine(...countingRefinement);

const networkLatencySchema = z.object({
  ...networkMatcherFields,
  delayMs: z.number().min(0, 'delayMs must be >= 0'),
  probability,
  ...countingFields,
}).strict().refine(...countingRefinement);

const networkAbortSchema = z.object({
  ...networkMatcherFields,
  probability,
  timeout: z.number().min(0, 'timeout must be >= 0').optional(),
  ...countingFields,
}).strict().refine(...countingRefinement);

const networkCorruptionSchema = z.object({
  ...networkMatcherFields,
  probability,
  strategy: z.enum(['truncate', 'malformed-json', 'empty', 'wrong-type']),
  ...countingFields,
}).strict().refine(...countingRefinement);

const networkCorsSchema = z.object({
  ...networkMatcherFields,
  probability,
  ...countingFields,
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
}).strict().refine(...countingRefinement);

const webSocketDelaySchema = z.object({
  urlPattern: z.string().min(1, 'urlPattern must not be empty'),
  direction: webSocketDirection,
  delayMs: z.number().min(0, 'delayMs must be >= 0'),
  probability,
  ...countingFields,
}).strict().refine(...countingRefinement);

const webSocketCorruptSchema = z.object({
  urlPattern: z.string().min(1, 'urlPattern must not be empty'),
  direction: webSocketDirection,
  strategy: z.enum(['truncate', 'malformed-json', 'empty', 'wrong-type']),
  probability,
  ...countingFields,
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
}).strict().refine(...countingRefinement);

const sseDelaySchema = z.object({
  urlPattern: z.string().min(1, 'urlPattern must not be empty'),
  eventType: sseEventType.optional(),
  delayMs: z.number().min(0, 'delayMs must be >= 0'),
  probability,
  ...countingFields,
}).strict().refine(...countingRefinement);

const sseCorruptSchema = z.object({
  urlPattern: z.string().min(1, 'urlPattern must not be empty'),
  eventType: sseEventType.optional(),
  strategy: z.enum(['truncate', 'malformed-json', 'empty', 'wrong-type']),
  probability,
  ...countingFields,
}).strict().refine(...countingRefinement);

const sseCloseSchema = z.object({
  urlPattern: z.string().min(1, 'urlPattern must not be empty'),
  afterMs: z.number().min(0, 'afterMs must be >= 0').optional(),
  probability,
  ...countingFields,
}).strict().refine(...countingRefinement);

const sseConfigSchema = z.object({
  drops: z.array(sseDropSchema).optional(),
  delays: z.array(sseDelaySchema).optional(),
  corruptions: z.array(sseCorruptSchema).optional(),
  closes: z.array(sseCloseSchema).optional(),
}).strict();

const chaosConfigSchema = z.object({
  network: networkConfigSchema.optional(),
  ui: uiConfigSchema.optional(),
  websocket: webSocketConfigSchema.optional(),
  sse: sseConfigSchema.optional(),
  seed: z.number().int('Seed must be an integer').optional(),
}).strict();

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
