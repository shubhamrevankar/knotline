import { z } from "zod";

export const filePurposeSchema = z.enum([
  "task_attachment",
  "comment_attachment",
  "run_input",
  "run_output",
  "agent_fixture",
  "knowledge_source",
  "profile_asset",
  "export"
]);

export const fileUploadStateSchema = z.enum([
  "initiated",
  "uploading",
  "uploaded",
  "quarantined",
  "scanning",
  "processing",
  "ready",
  "rejected",
  "failed",
  "deleted"
]);

export const fileClassificationSchema = z.enum([
  "public",
  "internal",
  "confidential",
  "restricted"
]);

export const multipartUploadRequestSchema = z
  .object({
    filename: z.string().min(1).max(255),
    purpose: filePurposeSchema,
    mediaType: z.string().min(3).max(160),
    sizeBytes: z.number().int().positive().max(536_870_912),
    checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    classification: fileClassificationSchema,
    partCount: z.number().int().min(1).max(10_000),
    idempotencyKey: z.string().min(8).max(200),
    replacementFileId: z.uuid().optional()
  })
  .strict();

export const multipartPartSchema = z
  .object({
    partNumber: z.number().int().positive().max(10_000),
    sizeBytes: z.number().int().positive(),
    checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    etag: z.string().min(1).max(200)
  })
  .strict();

export const uploadCompletionSchema = z
  .object({
    parts: z.array(multipartPartSchema).min(1).max(10_000),
    checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    detectedMediaType: z.string().min(3).max(160),
    scannerAttestation: z.string().regex(/^hmac-sha256:[a-f0-9]{64}$/u),
    scan: z
      .object({
        result: z.enum(["clean", "malicious", "suspicious", "unsupported"]),
        engine: z.string().min(1),
        engineVersion: z.string().min(1),
        signatures: z.array(z.string()).max(100),
        archiveDepth: z.number().int().nonnegative(),
        expandedBytes: z.number().int().nonnegative(),
        passwordProtected: z.boolean(),
        activeContent: z.boolean()
      })
      .strict()
  })
  .strict();

export const documentCoordinateSchema = z
  .object({
    kind: z.enum(["page", "sheet", "slide", "section", "line", "image"]),
    index: z.number().int().nonnegative(),
    label: z.string().max(200).optional(),
    bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional()
  })
  .strict();

export type MultipartUploadRequest = z.infer<typeof multipartUploadRequestSchema>;
export type UploadCompletion = z.infer<typeof uploadCompletionSchema>;
export type DocumentCoordinate = z.infer<typeof documentCoordinateSchema>;
