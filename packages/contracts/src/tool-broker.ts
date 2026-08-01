import { z } from "zod";

export const toolRiskSchema = z.enum(["low", "moderate", "high", "critical"]);
export const toolSideEffectSchema = z.enum([
  "none",
  "reversible",
  "destructive",
  "financial",
  "public",
  "privileged"
]);

export const toolDefinitionSchema = z
  .object({
    name: z.string().regex(/^[a-z][a-z0-9_.-]{2,95}$/u),
    version: z.string().regex(/^\d+\.\d+\.\d+$/u),
    owner: z.string().min(1).max(160),
    description: z.string().min(1).max(2_000),
    inputSchema: z.record(z.string(), z.unknown()),
    outputSchema: z.record(z.string(), z.unknown()),
    risk: toolRiskSchema,
    idempotency: z.enum(["none", "provider", "broker"]),
    sideEffect: toolSideEffectSchema,
    requiredConnectionScopes: z.array(z.string().min(1)).max(100),
    allowedDestinations: z.array(z.string().min(1)).max(100),
    timeoutMs: z.number().int().positive().max(300_000),
    maxInputBytes: z.number().int().positive().max(10_000_000),
    maxOutputBytes: z.number().int().positive().max(50_000_000),
    deprecated: z.boolean()
  })
  .strict();

export const credentialMetadataSchema = z
  .object({
    id: z.uuid(),
    provider: z.string().min(1),
    accountLabel: z.string().min(1),
    scopes: z.array(z.string().min(1)),
    ownerId: z.uuid(),
    secretReference: z.string().min(1),
    rotationState: z.enum(["current", "rotation_due", "rotating", "revoked"]),
    lastUsedAt: z.iso.datetime().optional()
  })
  .strict();

export const toolPolicyContextSchema = z
  .object({
    workspaceId: z.uuid(),
    principalId: z.uuid(),
    agentVersionId: z.uuid(),
    workflowVersionId: z.uuid().optional(),
    environment: z.enum(["development", "test", "production"]),
    connectionId: z.uuid().optional(),
    credentialId: z.uuid().optional(),
    dataClassification: z.enum(["public", "internal", "confidential", "restricted"]),
    budgetRemainingDecimal: z.string().regex(/^\d+(?:\.\d{1,12})?$/u),
    approvalId: z.uuid().optional()
  })
  .strict();

export const toolInvocationSchema = z
  .object({
    operationId: z.string().min(8).max(160),
    requestHash: z.string().regex(/^[a-f0-9]{64}$/u),
    toolName: z.string(),
    toolVersion: z.string(),
    input: z.unknown(),
    context: toolPolicyContextSchema
  })
  .strict();

export const externalOperationStateSchema = z.enum([
  "prepared",
  "sent",
  "confirmed",
  "failed",
  "uncertain",
  "reconciled"
]);

export const toolExecutionReceiptSchema = z
  .object({
    operationId: z.string(),
    requestHash: z.string(),
    toolName: z.string(),
    toolVersion: z.string(),
    policyDecision: z.enum(["allow", "deny", "approval_required"]),
    policyReasonCode: z.string(),
    connectionId: z.uuid().optional(),
    credentialId: z.uuid().optional(),
    providerRequestId: z.string().optional(),
    providerReceiptId: z.string().optional(),
    state: externalOperationStateSchema,
    sideEffect: toolSideEffectSchema,
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().optional(),
    durationMs: z.number().int().min(0),
    sanitizedInput: z.unknown(),
    sanitizedOutput: z.unknown().optional(),
    errorCode: z.string().optional(),
    fence: z.number().int().positive()
  })
  .strict();

export const sandboxExecutionRequestSchema = z
  .object({
    workspaceId: z.uuid(),
    operationId: z.string().min(8).max(160),
    runtime: z.literal("javascript-24.18.1"),
    source: z.string().min(1).max(100_000),
    input: z.unknown(),
    timeoutMs: z.number().int().positive().max(10_000),
    maxOutputBytes: z.number().int().positive().max(1_000_000),
    networkPolicy: z.literal("deny_all"),
    packageInstallation: z.literal("disabled")
  })
  .strict();

export const sandboxExecutionResultSchema = z
  .object({
    operationId: z.string(),
    runtime: z.literal("javascript-24.18.1"),
    imageDigest: z.string().min(1),
    state: z.enum(["succeeded", "failed", "timed_out", "cancelled"]),
    output: z.unknown().optional(),
    exitCode: z.number().int().nullable(),
    durationMs: z.number().int().min(0),
    errorCode: z.string().optional()
  })
  .strict();

export type ToolDefinition = z.infer<typeof toolDefinitionSchema>;
export type CredentialMetadata = z.infer<typeof credentialMetadataSchema>;
export type ToolInvocation = z.infer<typeof toolInvocationSchema>;
export type ToolExecutionReceipt = z.infer<typeof toolExecutionReceiptSchema>;
export type SandboxExecutionRequest = z.infer<typeof sandboxExecutionRequestSchema>;
export type SandboxExecutionResult = z.infer<typeof sandboxExecutionResultSchema>;
