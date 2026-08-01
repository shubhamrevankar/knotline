import { z } from "zod";

export const retrievalCoordinateSchema = z
  .object({
    kind: z.enum(["page", "sheet", "slide", "section", "line", "image"]),
    index: z.number().int().nonnegative(),
    label: z.string().max(200).optional(),
    bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional()
  })
  .strict();

export const knowledgeIndexRequestSchema = z
  .object({
    version: z.number().int().positive(),
    title: z.string().min(1).max(500),
    sourceType: z.string().min(1).max(100).default("file"),
    sourceChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    parserVersion: z.string().min(1).max(100),
    chunkerVersion: z.string().min(1).max(100),
    embedderVersion: z.string().min(1).max(100),
    classification: z.enum(["public", "internal", "confidential", "restricted"]),
    acl: z
      .object({
        epoch: z.number().int().positive(),
        providerRevision: z.string().min(1).max(200),
        complete: z.literal(true),
        subjects: z.array(z.string().uuid()).min(1).max(10_000),
        groups: z.array(z.string().uuid()).max(10_000),
        observedAt: z.iso.datetime(),
        expiresAt: z.iso.datetime()
      })
      .strict(),
    sections: z
      .array(
        z
          .object({
            text: z.string().min(1).max(200_000),
            coordinate: retrievalCoordinateSchema,
            tags: z.array(z.string().max(100)).max(100).default([])
          })
          .strict()
      )
      .min(1)
      .max(100_000)
  })
  .strict();

export const knowledgeSearchRequestSchema = z
  .object({
    query: z.string().trim().min(1).max(2_000),
    mode: z.enum(["keyword", "semantic", "hybrid"]).default("hybrid"),
    limit: z.number().int().min(1).max(50).default(20),
    tokenLimit: z.number().int().min(64).max(32_000).default(4_000),
    sourceIds: z.array(z.uuid()).max(200).optional(),
    sourceTypes: z.array(z.string().max(100)).max(50).optional(),
    ownerIds: z.array(z.uuid()).max(200).optional(),
    tags: z.array(z.string().max(100)).max(100).optional(),
    classifications: z
      .array(z.enum(["public", "internal", "confidential", "restricted"]))
      .max(4)
      .optional(),
    connectorIds: z.array(z.uuid()).max(200).optional(),
    updatedAfter: z.iso.datetime().optional(),
    authorizationProof: z.string().min(32)
  })
  .strict();

export const authorizationProofRequestSchema = z
  .object({
    resourceId: z.uuid(),
    deviceId: z.uuid().optional(),
    sessionId: z.uuid().optional(),
    groupIds: z.array(z.uuid()).max(1_000).default([])
  })
  .strict();

export const retrievalResultSchema = z
  .object({
    sourceObjectId: z.uuid(),
    documentId: z.uuid(),
    documentVersion: z.number().int().positive(),
    chunkId: z.uuid(),
    title: z.string(),
    snippet: z.string(),
    coordinate: retrievalCoordinateSchema,
    score: z.number(),
    scoreBreakdown: z.record(z.string(), z.number()),
    contentHash: z.string(),
    permissionEvidenceHash: z.string(),
    classification: z.string(),
    freshness: z.iso.datetime(),
    previewUrl: z.string().startsWith("/v1/")
  })
  .strict();

export const retrievalResponseSchema = z
  .object({
    manifestId: z.uuid(),
    corpusGeneration: z.uuid(),
    normalizedQueryHash: z.string(),
    results: z.array(retrievalResultSchema),
    exclusions: z.record(z.string(), z.number()),
    latencyMs: z.number().int().nonnegative()
  })
  .strict();

export type KnowledgeIndexRequest = z.infer<typeof knowledgeIndexRequestSchema>;
export type KnowledgeSearchRequest = z.infer<typeof knowledgeSearchRequestSchema>;
