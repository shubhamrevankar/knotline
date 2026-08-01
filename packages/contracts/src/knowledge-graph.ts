import { z } from "zod";

export const entityTypeKeySchema = z.string().regex(/^[a-z][a-z0-9_]{1,62}$/u);
export const graphFactKindSchema = z.enum(["provider", "user", "inferred", "suggestion"]);
export const graphEvidenceSchema = z
  .object({
    sourceId: z.string().uuid().optional(),
    documentId: z.string().uuid().optional(),
    chunkId: z.string().uuid().optional(),
    actionId: z.string().uuid().optional(),
    coordinate: z.record(z.string(), z.unknown()).optional(),
    contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    aclEpoch: z.number().int().positive(),
    principalIds: z.array(z.string().uuid()).default([]),
    groupIds: z.array(z.string().uuid()).default([])
  })
  .strict()
  .refine((value) => value.sourceId || value.actionId, "Evidence requires a source or action");

export const entityFactInputSchema = z
  .object({
    key: entityTypeKeySchema,
    value: z.unknown(),
    kind: graphFactKindSchema,
    confidence: z.number().min(0).max(1),
    validFrom: z.string().datetime(),
    validTo: z.string().datetime().optional(),
    evidence: z.array(graphEvidenceSchema).min(1)
  })
  .strict();

export const upsertEntitySchema = z
  .object({
    type: entityTypeKeySchema,
    canonicalName: z.string().trim().min(1).max(240),
    provider: z.string().trim().min(1).max(80).optional(),
    providerId: z.string().trim().min(1).max(512).optional(),
    aliases: z.array(z.string().trim().min(1).max(240)).max(100).default([]),
    facts: z.array(entityFactInputSchema).max(200).default([])
  })
  .strict()
  .refine((value) => (value.provider ? value.providerId : true), "Provider ID is required");

export const relationInputSchema = z
  .object({
    targetId: z.string().uuid(),
    type: entityTypeKeySchema,
    direction: z.enum(["outbound", "inbound", "bidirectional"]),
    confidence: z.number().min(0).max(1),
    validFrom: z.string().datetime(),
    validTo: z.string().datetime().optional(),
    kind: graphFactKindSchema,
    evidence: z.array(graphEvidenceSchema).min(1)
  })
  .strict();

export const graphTraversalSchema = z
  .object({
    depth: z.number().int().min(0).max(4).default(2),
    limit: z.number().int().min(1).max(200).default(50),
    cursor: z.string().optional(),
    relationTypes: z.array(entityTypeKeySchema).max(20).optional(),
    authorizationProof: z.string().min(16)
  })
  .strict();

export const mergeEntitiesSchema = z
  .object({ targetEntityId: z.string().uuid(), reason: z.string().trim().min(3).max(500) })
  .strict();

export const splitEntitySchema = z
  .object({
    factIds: z.array(z.string().uuid()).min(1),
    aliasIds: z.array(z.string().uuid()).default([]),
    canonicalName: z.string().trim().min(1).max(240),
    reason: z.string().trim().min(3).max(500)
  })
  .strict();

export const graphTypeSchema = z
  .object({
    key: entityTypeKeySchema,
    kind: z.enum(["entity", "relation"]),
    version: z.number().int().positive(),
    displayName: z.string().trim().min(1).max(100),
    schema: z.record(z.string(), z.unknown()),
    migration: z.record(z.string(), z.unknown()).optional()
  })
  .strict();

export type UpsertEntityInput = z.infer<typeof upsertEntitySchema>;
export type GraphTraversalInput = z.infer<typeof graphTraversalSchema>;
