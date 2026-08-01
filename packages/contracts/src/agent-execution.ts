import { z } from "zod";

export const authorizedContextReferenceSchema = z
  .object({
    kind: z.enum(["workflow_input", "conversation", "knowledge_chunk", "memory_record"]),
    referenceId: z.string().min(1),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
    permissionProofId: z.string().min(1),
    permissionRevision: z.number().int().positive(),
    authorizedAt: z.iso.datetime(),
    reauthorizeBefore: z.iso.datetime(),
    dataClassification: z.enum(["public", "internal", "confidential", "restricted"]),
    content: z.string().max(2_000_000)
  })
  .strict();

export const authorizedContextManifestSchema = z
  .object({
    manifestId: z.uuid(),
    workspaceId: z.uuid(),
    principalId: z.uuid(),
    executionId: z.uuid(),
    references: z.array(authorizedContextReferenceSchema).max(1_000),
    totalBytes: z.number().int().min(0),
    totalTokensEstimate: z.number().int().min(0),
    assembledAt: z.iso.datetime(),
    dispatchProofExpiresAt: z.iso.datetime()
  })
  .strict();

export const agentExecutionLimitsSchema = z
  .object({
    maxTurns: z.number().int().positive().max(100),
    maxModelCalls: z.number().int().positive().max(100),
    maxToolCalls: z.number().int().min(0).max(100),
    maxInputTokens: z.number().int().positive(),
    maxOutputTokens: z.number().int().positive(),
    maxCostDecimal: z.string().regex(/^\d+(?:\.\d{1,12})?$/u),
    maxWallTimeMs: z.number().int().positive().max(3_600_000),
    maxOutputBytes: z.number().int().positive().max(50_000_000),
    maxContextBytes: z.number().int().positive().max(50_000_000)
  })
  .strict();

export const agentExecutionRequestSchema = z
  .object({
    workspaceId: z.uuid(),
    executionId: z.uuid(),
    runId: z.uuid(),
    taskId: z.uuid(),
    attemptId: z.uuid(),
    principalId: z.uuid(),
    agentId: z.uuid(),
    agentVersion: z.number().int().positive(),
    modelPolicyVersionId: z.string().min(1),
    promptVersionId: z.string().min(1),
    outputSchema: z.record(z.string(), z.unknown()),
    contextManifest: authorizedContextManifestSchema,
    limits: agentExecutionLimitsSchema,
    reviewMode: z.enum(["none", "before_run", "selected_tools", "conditional", "before_effect"]),
    deadlineAt: z.iso.datetime()
  })
  .strict();

export const memoryScopeSchema = z.enum(["execution", "user_private", "workspace_shared"]);

export const memoryWriteOperationSchema = z
  .object({
    operationId: z.string().min(8),
    scope: memoryScopeSchema,
    subjectId: z.string().min(1),
    purpose: z.string().min(1).max(500),
    sensitivity: z.enum(["internal", "confidential", "restricted"]),
    value: z.unknown(),
    sourceReferences: z.array(z.string().min(1)).max(100),
    permissionDependencies: z.array(z.string().min(1)).max(100),
    expiresAt: z.iso.datetime().optional(),
    authorizerId: z.uuid()
  })
  .strict();

export const agentExecutionResultSchema = z
  .object({
    executionId: z.uuid(),
    state: z.enum([
      "succeeded",
      "failed",
      "cancelled",
      "timed_out",
      "policy_stopped",
      "approval_wait",
      "uncertain"
    ]),
    output: z.unknown().optional(),
    outputHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
    summary: z.string().max(4_000),
    turns: z.number().int().min(0),
    modelCalls: z.number().int().min(0),
    toolCalls: z.number().int().min(0),
    inputTokens: z.number().int().min(0),
    outputTokens: z.number().int().min(0),
    costDecimal: z.string(),
    provenanceRootId: z.uuid(),
    errorCode: z.string().optional()
  })
  .strict();

export type AuthorizedContextManifest = z.infer<typeof authorizedContextManifestSchema>;
export type AgentExecutionRequest = z.infer<typeof agentExecutionRequestSchema>;
export type AgentExecutionResult = z.infer<typeof agentExecutionResultSchema>;
export type MemoryWriteOperation = z.infer<typeof memoryWriteOperationSchema>;
