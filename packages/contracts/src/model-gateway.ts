import { z } from "zod";

const decimalCostSchema = z.object({
  amountDecimal: z.string().regex(/^\d+(?:\.\d{1,12})?$/u),
  currency: z.string().regex(/^[A-Z]{3}$/u),
  scale: z.literal(12),
  priceVersionId: z.string().min(1),
  budgetAmountDecimal: z.string().optional(),
  budgetCurrency: z.string().optional()
});

export const modelRoleSchema = z.enum([
  "fast",
  "balanced",
  "quality",
  "judge",
  "embedding",
  "moderation"
]);

const requestBase = z.object({
  workspaceId: z.uuid(),
  operationId: z.string().min(8).max(160),
  taskAttemptId: z.uuid().optional(),
  modelPolicyVersionId: z.string().min(1),
  deadlineAt: z.iso.datetime(),
  safetyIdentifier: z.string().min(1).max(256),
  retention: z.literal("no-store"),
  residency: z.string().min(1).optional()
});

export const modelInputItemSchema = z.object({
  role: z.enum(["system", "developer", "user", "assistant", "tool"]),
  content: z.string().max(2_000_000),
  callId: z.string().optional()
});

export const strictToolSchema = z.object({
  name: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/u),
  description: z.string().max(2_000),
  parameters: z.record(z.string(), z.unknown()),
  strict: z.literal(true)
});

export const generationRequestSchema = requestBase.extend({
  kind: z.literal("generation"),
  role: z.enum(["fast", "balanced", "quality", "judge"]),
  promptVersionId: z.string().min(1),
  messages: z.array(modelInputItemSchema).min(1).max(1_000),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  tools: z.array(strictToolSchema).max(100),
  maxOutputTokens: z.number().int().positive().max(128_000),
  maxToolCalls: z.number().int().min(0).max(100)
});

export const embeddingRequestSchema = requestBase.extend({
  kind: z.literal("embedding"),
  role: z.literal("embedding"),
  inputs: z
    .array(z.object({ id: z.string().min(1), text: z.string().min(1) }))
    .min(1)
    .max(2_048),
  dimensions: z.number().int().positive().optional()
});

export const moderationRequestSchema = requestBase.extend({
  kind: z.literal("moderation"),
  role: z.literal("moderation"),
  inputs: z
    .array(
      z.object({
        id: z.string().min(1),
        text: z.string().optional(),
        imageRef: z.string().optional()
      })
    )
    .min(1),
  policyVersionId: z.string().min(1)
});

export const modelRequestSchema = z.discriminatedUnion("kind", [
  generationRequestSchema,
  embeddingRequestSchema,
  moderationRequestSchema
]);

const resultBase = z.object({
  provider: z.string().min(1),
  modelId: z.string().min(1),
  modelSnapshot: z.string().optional(),
  responseId: z.string().optional(),
  status: z.enum(["completed", "incomplete", "refused", "failed"]),
  latencyMs: z.number().int().min(0),
  estimatedCost: decimalCostSchema
});

export const normalizedModelItemSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({
    type: z.literal("tool_call"),
    callId: z.string(),
    name: z.string(),
    arguments: z.string()
  })
]);

export const generationResultSchema = resultBase.extend({
  kind: z.literal("generation"),
  outputItems: z.array(normalizedModelItemSchema),
  parsedOutput: z.unknown().optional(),
  refusal: z.object({ category: z.string().optional(), message: z.string() }).optional(),
  incompleteReason: z.string().optional(),
  usage: z.object({
    inputTokens: z.number().int().min(0),
    cachedInputTokens: z.number().int().min(0),
    outputTokens: z.number().int().min(0)
  })
});

export const modelResultSchema = z.discriminatedUnion("kind", [
  generationResultSchema,
  resultBase.extend({
    kind: z.literal("embedding"),
    vectors: z.array(z.object({ id: z.string(), values: z.array(z.number()) })),
    usage: z.object({
      inputTokens: z.number().int().min(0),
      vectorCount: z.number().int().min(0),
      dimensions: z.number().int().min(0)
    })
  }),
  resultBase.extend({
    kind: z.literal("moderation"),
    decisions: z.array(
      z.object({
        id: z.string(),
        allowed: z.boolean(),
        categories: z.record(z.string(), z.boolean()),
        scores: z.record(z.string(), z.number()).optional()
      })
    ),
    usage: z.object({ inputUnits: z.number().int().min(0) })
  })
]);

export const modelGatewayErrorSchema = z.object({
  code: z.enum([
    "POLICY_BLOCKED",
    "BUDGET_EXHAUSTED",
    "REGION_MISMATCH",
    "EMERGENCY_DISABLED",
    "TIMEOUT",
    "CANCELLED",
    "RATE_LIMITED",
    "CIRCUIT_OPEN",
    "PROVIDER_UNAVAILABLE",
    "PROVIDER_OUTCOME_UNKNOWN",
    "REFUSED",
    "INCOMPLETE",
    "INVALID_OUTPUT",
    "CREDENTIAL_UNAVAILABLE"
  ]),
  retryable: z.boolean(),
  providerAccepted: z.boolean(),
  message: z.string(),
  reasonCode: z
    .string()
    .regex(/^[A-Z0-9_:-]{1,96}$/u)
    .optional(),
  retryAfterMs: z.number().int().min(0).optional()
});

export type ModelRole = z.infer<typeof modelRoleSchema>;
export type ModelRequest = z.infer<typeof modelRequestSchema>;
export type GenerationRequest = z.infer<typeof generationRequestSchema>;
export type GenerationResult = z.infer<typeof generationResultSchema>;
export type ModelResult = z.infer<typeof modelResultSchema>;
export type ModelGatewayError = z.infer<typeof modelGatewayErrorSchema>;
