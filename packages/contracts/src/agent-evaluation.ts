import { z } from "zod";

export const evaluationCaseSchema = z
  .object({
    stableKey: z.string().min(1).max(160),
    input: z.unknown(),
    expected: z.unknown().optional(),
    references: z.array(z.string().min(1)).max(100).default([]),
    tags: z.array(z.string().min(1).max(80)).max(100).default([]),
    difficulty: z.enum(["easy", "medium", "hard", "adversarial"]),
    risk: z.enum(["low", "moderate", "high", "critical"]),
    sensitive: z.boolean().default(false),
    consentReference: z.string().optional()
  })
  .strict();

export const evaluationSnapshotSchema = z
  .object({
    agentId: z.uuid(),
    agentVersion: z.number().int().positive(),
    datasetVersionId: z.uuid(),
    modelMappingRevision: z.string().min(1),
    providerRevision: z.string().min(1),
    toolVersions: z.record(z.string(), z.string()),
    knowledgeFixtureVersion: z.string().min(1),
    policyVersion: z.string().min(1),
    graderVersions: z.record(z.string(), z.string())
  })
  .strict();

export const graderKindSchema = z.enum([
  "deterministic",
  "schema",
  "exact_match",
  "rule",
  "model",
  "pairwise",
  "tool_trajectory",
  "citation",
  "safety",
  "latency",
  "cost"
]);

export const evaluationResultSchema = z
  .object({
    caseKey: z.string(),
    passed: z.boolean(),
    score: z.number().min(0).max(1),
    grader: graderKindSchema,
    reasonCode: z.string().min(1),
    details: z.record(z.string(), z.unknown()).default({})
  })
  .strict();

export const releaseGateSchema = z
  .object({
    requiredSuiteIds: z.array(z.uuid()).min(1),
    minimumScore: z.number().min(0).max(1),
    maximumRegression: z.number().min(0).max(1),
    minimumSampleSize: z.number().int().positive(),
    blockSafetyFailures: z.boolean(),
    riskClass: z.enum(["low", "moderate", "high", "critical"])
  })
  .strict();

export type EvaluationCase = z.infer<typeof evaluationCaseSchema>;
export type EvaluationSnapshot = z.infer<typeof evaluationSnapshotSchema>;
export type EvaluationResult = z.infer<typeof evaluationResultSchema>;
export type ReleaseGate = z.infer<typeof releaseGateSchema>;
