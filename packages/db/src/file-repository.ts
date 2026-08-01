import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import {
  multipartPartSchema,
  multipartUploadRequestSchema,
  uploadCompletionSchema
} from "@knotline/contracts";
import type { Pool } from "pg";
import { z } from "zod";

import { withTenantTransaction, type TenantContext } from "./context.js";
import { HumanTaskAuthorizationError, HumanTaskConflictError } from "./human-task-repository.js";
import { createId } from "./values.js";

export interface FileRepository {
  list(
    context: TenantContext,
    query?: { state?: string | undefined; purpose?: string | undefined }
  ): Promise<readonly Record<string, unknown>[]>;
  get(context: TenantContext, fileId: string): Promise<Record<string, unknown> | undefined>;
  createUpload(context: TenantContext, input: unknown): Promise<Record<string, unknown>>;
  recordPart(
    context: TenantContext,
    uploadId: string,
    input: unknown
  ): Promise<{ partNumber: number }>;
  completeUpload(
    context: TenantContext,
    uploadId: string,
    input: unknown
  ): Promise<Record<string, unknown>>;
  retryProcessing(context: TenantContext, fileId: string): Promise<{ jobId: string }>;
  completeProcessing(
    context: TenantContext,
    jobId: string,
    input: unknown
  ): Promise<{ fileId: string; state: string }>;
  preview(context: TenantContext, fileId: string): Promise<Record<string, unknown>>;
  createDownloadToken(
    context: TenantContext,
    fileId: string,
    input: unknown
  ): Promise<{ token: string; expiresAt: string }>;
  consumeDownloadToken(context: TenantContext, token: string): Promise<Record<string, unknown>>;
  delete(
    context: TenantContext,
    fileId: string,
    reason: string
  ): Promise<{ downstreamEventId: string }>;
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const readyScan = (
  value: z.infer<typeof uploadCompletionSchema>,
  declaredType: string,
  size: number
) => {
  const reasons: string[] = [];
  if (value.scan.result !== "clean") reasons.push("SCANNER_REJECTED");
  if (value.detectedMediaType !== declaredType) reasons.push("MEDIA_TYPE_MISMATCH");
  if (value.scan.archiveDepth > 5) reasons.push("ARCHIVE_DEPTH");
  if (value.scan.expandedBytes > size * 50) reasons.push("ARCHIVE_EXPANSION");
  if (value.scan.passwordProtected) reasons.push("PASSWORD_PROTECTED");
  if (
    value.scan.activeContent ||
    ["text/html", "image/svg+xml", "application/xhtml+xml"].includes(value.detectedMediaType)
  )
    reasons.push("ACTIVE_CONTENT");
  return reasons;
};

export class PostgresFileRepository implements FileRepository {
  constructor(
    private readonly pool: Pool,
    private readonly scannerAttestationKey: Buffer
  ) {
    if (scannerAttestationKey.byteLength < 32)
      throw new Error("FILE_SCANNER_ATTESTATION_KEY_TOO_SHORT");
  }

  attestCompletion(
    uploadId: string,
    value: Omit<z.infer<typeof uploadCompletionSchema>, "scannerAttestation">
  ) {
    return `hmac-sha256:${createHmac("sha256", this.scannerAttestationKey).update(this.#attestationPayload(uploadId, value)).digest("hex")}`;
  }

  list(
    context: TenantContext,
    query: { state?: string | undefined; purpose?: string | undefined } = {}
  ) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT file.*,version.media_type,version.size_bytes,version.checksum,version.processing_state,
          coalesce((SELECT jsonb_agg(reference ORDER BY reference.created_at) FROM file_usage_references reference WHERE reference.workspace_id=file.workspace_id AND reference.file_id=file.id),'[]'::jsonb) usage_references
         FROM files file LEFT JOIN file_versions version ON version.workspace_id=file.workspace_id AND version.file_id=file.id AND version.version=file.current_version
         WHERE file.workspace_id=$1 AND ($2::text IS NULL OR file.state=$2) AND ($3::text IS NULL OR file.purpose=$3)
         ORDER BY file.created_at DESC,file.id`,
            [context.workspaceId, query.state ?? null, query.purpose ?? null]
          )
        ).rows
    );
  }

  get(context: TenantContext, fileId: string) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT file.*,
          (SELECT jsonb_agg(version ORDER BY version.version DESC) FROM file_versions version WHERE version.workspace_id=file.workspace_id AND version.file_id=file.id) versions,
          (SELECT jsonb_agg(job ORDER BY job.created_at DESC) FROM document_processing_jobs job WHERE job.workspace_id=file.workspace_id AND job.file_id=file.id) processing_jobs,
          (SELECT jsonb_agg(artifact ORDER BY artifact.created_at) FROM file_derived_artifacts artifact WHERE artifact.workspace_id=file.workspace_id AND artifact.file_id=file.id AND artifact.purged_at IS NULL) derived_artifacts
         FROM files file WHERE file.workspace_id=$1 AND file.id=$2`,
            [context.workspaceId, fileId]
          )
        ).rows[0]
    );
  }

  async createUpload(context: TenantContext, input: unknown) {
    const value = multipartUploadRequestSchema.parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const duplicate = await client.query<Record<string, unknown>>(
        `SELECT id upload_id,file_id,state,expires_at FROM file_upload_sessions WHERE workspace_id=$1 AND idempotency_key=$2`,
        [context.workspaceId, value.idempotencyKey]
      );
      if (duplicate.rows[0]) return duplicate.rows[0];
      await client.query(
        `INSERT INTO workspace_storage_usage(workspace_id) VALUES($1) ON CONFLICT DO NOTHING`,
        [context.workspaceId]
      );
      const usage = await client.query<{
        ready_bytes: string;
        reserved_bytes: string;
        quota_bytes: string;
      }>(
        `SELECT ready_bytes,reserved_bytes,quota_bytes FROM workspace_storage_usage WHERE workspace_id=$1 FOR UPDATE`,
        [context.workspaceId]
      );
      const current = usage.rows[0]!;
      if (
        BigInt(current.ready_bytes) + BigInt(current.reserved_bytes) + BigInt(value.sizeBytes) >
        BigInt(current.quota_bytes)
      )
        throw new HumanTaskConflictError("FILE_QUOTA_EXCEEDED");
      const fileId = value.replacementFileId ?? createId();
      const uploadId = createId();
      let replacementOfVersion: number | null = null;
      if (value.replacementFileId) {
        const replacement = await client.query<{ current_version: number }>(
          `SELECT current_version FROM files WHERE workspace_id=$1 AND id=$2 AND owner_id=$3 AND state<>'deleted' FOR UPDATE`,
          [context.workspaceId, fileId, context.principalId]
        );
        if (!replacement.rows[0])
          throw new HumanTaskAuthorizationError("FILE_REPLACEMENT_FORBIDDEN");
        replacementOfVersion = replacement.rows[0].current_version;
      } else {
        await client.query(
          `INSERT INTO files(workspace_id,id,purpose,owner_id,state,filename,classification) VALUES($1,$2,$3,$4,'initiated',$5,$6)`,
          [
            context.workspaceId,
            fileId,
            value.purpose,
            context.principalId,
            value.filename,
            value.classification
          ]
        );
      }
      const result = await client.query<Record<string, unknown>>(
        `INSERT INTO file_upload_sessions(workspace_id,id,file_id,idempotency_key,expected_size,expected_checksum,state,expires_at,media_type,part_count,reserved_bytes,replacement_of_version,upload_filename,upload_classification)
         VALUES($1,$2,$3,$4,$5,$6,'initiated',clock_timestamp()+interval '30 minutes',$7,$8,$5,$9,$10,$11)
         RETURNING id upload_id,file_id,state,expires_at`,
        [
          context.workspaceId,
          uploadId,
          fileId,
          value.idempotencyKey,
          value.sizeBytes,
          value.checksum,
          value.mediaType,
          value.partCount,
          replacementOfVersion,
          value.filename,
          value.classification
        ]
      );
      await client.query(
        `UPDATE workspace_storage_usage SET reserved_bytes=reserved_bytes+$2,revision=revision+1,updated_at=clock_timestamp() WHERE workspace_id=$1`,
        [context.workspaceId, value.sizeBytes]
      );
      return {
        ...result.rows[0],
        partUploadTemplate: `/v1/file-uploads/${uploadId}/parts/{partNumber}`
      };
    });
  }

  async recordPart(context: TenantContext, uploadId: string, input: unknown) {
    const value = multipartPartSchema.parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const session = await client.query<{ part_count: number; state: string }>(
        `SELECT part_count,state FROM file_upload_sessions WHERE workspace_id=$1 AND id=$2 AND expires_at>clock_timestamp() FOR UPDATE`,
        [context.workspaceId, uploadId]
      );
      if (!session.rows[0]) throw new HumanTaskConflictError("UPLOAD_EXPIRED_OR_MISSING");
      if (value.partNumber > session.rows[0].part_count)
        throw new HumanTaskConflictError("UPLOAD_PART_OUT_OF_RANGE");
      const prior = await client.query<{ checksum: string; size_bytes: string; etag: string }>(
        `SELECT checksum,size_bytes,etag FROM file_upload_parts WHERE workspace_id=$1 AND upload_id=$2 AND part_number=$3`,
        [context.workspaceId, uploadId, value.partNumber]
      );
      if (prior.rows[0]) {
        if (
          prior.rows[0].checksum !== value.checksum ||
          Number(prior.rows[0].size_bytes) !== value.sizeBytes ||
          prior.rows[0].etag !== value.etag
        )
          throw new HumanTaskConflictError("UPLOAD_PART_CONFLICT");
        return { partNumber: value.partNumber };
      }
      await client.query(
        `INSERT INTO file_upload_parts(workspace_id,upload_id,part_number,size_bytes,checksum,etag) VALUES($1,$2,$3,$4,$5,$6)`,
        [
          context.workspaceId,
          uploadId,
          value.partNumber,
          value.sizeBytes,
          value.checksum,
          value.etag
        ]
      );
      await client.query(
        `UPDATE file_upload_sessions SET state='uploading' WHERE workspace_id=$1 AND id=$2`,
        [context.workspaceId, uploadId]
      );
      return { partNumber: value.partNumber };
    });
  }

  async completeUpload(context: TenantContext, uploadId: string, input: unknown) {
    const value = uploadCompletionSchema.parse(input);
    const expectedAttestation = this.attestCompletion(uploadId, value);
    if (!timingSafeEqual(Buffer.from(value.scannerAttestation), Buffer.from(expectedAttestation)))
      throw new HumanTaskAuthorizationError("SCANNER_ATTESTATION_INVALID");
    return withTenantTransaction(this.pool, context, async (client) => {
      const session = await client.query<{
        file_id: string;
        expected_size: string;
        expected_checksum: string;
        media_type: string;
        part_count: number;
        reserved_bytes: string;
        replacement_of_version: number | null;
        completed_version: number | null;
        state: string;
      }>(
        `SELECT file_id,expected_size,expected_checksum,media_type,part_count,reserved_bytes,replacement_of_version,completed_version,state FROM file_upload_sessions WHERE workspace_id=$1 AND id=$2 AND expires_at>clock_timestamp() FOR UPDATE`,
        [context.workspaceId, uploadId]
      );
      const row = session.rows[0];
      if (!row) throw new HumanTaskConflictError("UPLOAD_EXPIRED_OR_MISSING");
      if (["processing", "ready", "rejected"].includes(row.state))
        return {
          fileId: row.file_id,
          version: row.completed_version,
          state: row.state === "rejected" ? "quarantined" : row.state
        };
      const stored = await client.query<{
        part_number: number;
        size_bytes: string;
        checksum: string;
        etag: string;
      }>(
        `SELECT part_number,size_bytes,checksum,etag FROM file_upload_parts WHERE workspace_id=$1 AND upload_id=$2 ORDER BY part_number`,
        [context.workspaceId, uploadId]
      );
      if (
        stored.rows.length !== row.part_count ||
        value.parts.length !== row.part_count ||
        stored.rows.some(
          (part, index) =>
            part.part_number !== value.parts[index]?.partNumber ||
            part.checksum !== value.parts[index]?.checksum ||
            part.etag !== value.parts[index]?.etag
        )
      )
        throw new HumanTaskConflictError("UPLOAD_PARTS_INCOMPLETE");
      if (
        stored.rows.reduce((sum, part) => sum + Number(part.size_bytes), 0) !==
          Number(row.expected_size) ||
        value.checksum !== row.expected_checksum
      )
        throw new HumanTaskConflictError("UPLOAD_INTEGRITY_MISMATCH");
      const reasons = readyScan(value, row.media_type, Number(row.expected_size));
      await client.query(
        `SELECT current_version FROM files WHERE workspace_id=$1 AND id=$2 FOR UPDATE`,
        [context.workspaceId, row.file_id]
      );
      const versionRow = await client.query<{ next_version: number }>(
        `SELECT coalesce(max(version),0)+1 next_version FROM file_versions WHERE workspace_id=$1 AND file_id=$2`,
        [context.workspaceId, row.file_id]
      );
      const version = versionRow.rows[0]!.next_version;
      await client.query(
        `INSERT INTO file_versions(workspace_id,file_id,version,object_key,object_version,media_type,detected_media_type,size_bytes,checksum,malware_state,scan_details,processing_state)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          context.workspaceId,
          row.file_id,
          version,
          `private/${context.workspaceId}/${row.file_id}/${version}`,
          `fixture-${version}`,
          row.media_type,
          value.detectedMediaType,
          row.expected_size,
          value.checksum,
          reasons.length ? "quarantined" : "clean",
          JSON.stringify({ ...value.scan, reasons }),
          reasons.length ? "unsupported" : "pending"
        ]
      );
      const nextState = reasons.length ? "quarantined" : "processing";
      if (row.replacement_of_version === null)
        await client.query(
          `UPDATE files SET state=$3,current_version=$4,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2`,
          [context.workspaceId, row.file_id, nextState, version]
        );
      await client.query(
        `UPDATE file_upload_sessions SET state=$3,completed_version=$4,completed_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2`,
        [context.workspaceId, uploadId, reasons.length ? "rejected" : "processing", version]
      );
      await client.query(
        `UPDATE workspace_storage_usage SET reserved_bytes=greatest(0,reserved_bytes-$2),ready_bytes=ready_bytes+$3,revision=revision+1,updated_at=clock_timestamp() WHERE workspace_id=$1`,
        [context.workspaceId, row.reserved_bytes, reasons.length ? 0 : row.expected_size]
      );
      if (!reasons.length)
        await client.query(
          `INSERT INTO document_processing_jobs(workspace_id,id,file_id,file_version,parser,parser_version,state,source_checksum) VALUES($1,$2,$3,$4,'safe-document','safe-document-v1','queued',$5)`,
          [context.workspaceId, createId(), row.file_id, version, value.checksum]
        );
      return { fileId: row.file_id, version, state: nextState, quarantineReasons: reasons };
    });
  }

  async retryProcessing(context: TenantContext, fileId: string) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const file = await client.query<{ current_version: number; state: string; checksum: string }>(
        `SELECT file.current_version,file.state,version.checksum FROM files file JOIN file_versions version ON version.workspace_id=file.workspace_id AND version.file_id=file.id AND version.version=file.current_version WHERE file.workspace_id=$1 AND file.id=$2 FOR UPDATE`,
        [context.workspaceId, fileId]
      );
      if (
        !file.rows[0] ||
        file.rows[0].state === "quarantined" ||
        file.rows[0].state === "rejected"
      )
        throw new HumanTaskAuthorizationError("FILE_NOT_PROCESSABLE");
      const attempt = await client.query<{ attempt: number }>(
        `SELECT coalesce(max(attempt),0)+1 attempt FROM document_processing_jobs WHERE workspace_id=$1 AND file_id=$2 AND file_version=$3`,
        [context.workspaceId, fileId, file.rows[0].current_version]
      );
      const jobId = createId();
      await client.query(
        `INSERT INTO document_processing_jobs(workspace_id,id,file_id,file_version,parser,parser_version,state,attempt,source_checksum) VALUES($1,$2,$3,$4,'safe-document','safe-document-v1','queued',$5,$6)`,
        [
          context.workspaceId,
          jobId,
          fileId,
          file.rows[0].current_version,
          attempt.rows[0]!.attempt,
          file.rows[0].checksum
        ]
      );
      return { jobId };
    });
  }

  async completeProcessing(context: TenantContext, jobId: string, input: unknown) {
    const value = z
      .object({
        state: z.enum(["ready", "partial", "failed", "unsupported"]),
        language: z.string().max(40).optional(),
        sections: z
          .array(
            z
              .object({
                textHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
                coordinate: z.record(z.string(), z.unknown())
              })
              .strict()
          )
          .max(100_000),
        warnings: z.array(z.string()).max(100),
        errorCode: z.string().max(100).optional(),
        derivedArtifact: z
          .object({
            kind: z.enum([
              "preview_pdf",
              "preview_png",
              "normalized_text",
              "ocr_text",
              "thumbnail",
              "table"
            ]),
            objectKey: z.string().min(1),
            mediaType: z.string().min(3),
            checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
            sanitized: z.literal(true)
          })
          .strict()
          .optional()
      })
      .strict()
      .parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const job = await client.query<{ file_id: string; file_version: number; state: string }>(
        `SELECT file_id,file_version,state FROM document_processing_jobs WHERE workspace_id=$1 AND id=$2 FOR UPDATE`,
        [context.workspaceId, jobId]
      );
      const row = job.rows[0];
      if (!row) throw new HumanTaskConflictError("PROCESSING_JOB_NOT_FOUND");
      if (["ready", "partial", "failed", "unsupported", "cancelled"].includes(row.state))
        return { fileId: row.file_id, state: row.state };
      await client.query(
        `UPDATE document_processing_jobs SET state=$3,language=$4,sections=$5,warnings=$6,error_code=$7,completed_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2`,
        [
          context.workspaceId,
          jobId,
          value.state,
          value.language ?? null,
          JSON.stringify(value.sections),
          JSON.stringify(value.warnings),
          value.errorCode ?? null
        ]
      );
      if (value.derivedArtifact)
        await client.query(
          `INSERT INTO file_derived_artifacts(workspace_id,id,file_id,file_version,kind,object_key,media_type,checksum,sanitized) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true)`,
          [
            context.workspaceId,
            createId(),
            row.file_id,
            row.file_version,
            value.derivedArtifact.kind,
            value.derivedArtifact.objectKey,
            value.derivedArtifact.mediaType,
            value.derivedArtifact.checksum
          ]
        );
      const fileState = value.state === "ready" || value.state === "partial" ? "ready" : "failed";
      const current = await client.query<{ current_version: number; size_bytes: string }>(
        `SELECT file.current_version,coalesce(version.size_bytes,0) size_bytes
         FROM files file LEFT JOIN file_versions version ON version.workspace_id=file.workspace_id AND version.file_id=file.id AND version.version=file.current_version
         WHERE file.workspace_id=$1 AND file.id=$2 FOR UPDATE OF file`,
        [context.workspaceId, row.file_id]
      );
      if (fileState === "ready") {
        await client.query(
          `UPDATE files file SET state='ready',current_version=$3,
             filename=session.upload_filename,classification=session.upload_classification,updated_at=clock_timestamp()
           FROM file_upload_sessions session
           WHERE file.workspace_id=$1 AND file.id=$2 AND session.workspace_id=file.workspace_id
             AND session.file_id=file.id AND session.replacement_of_version=file.current_version
             AND EXISTS (SELECT 1 FROM file_versions version WHERE version.workspace_id=file.workspace_id AND version.file_id=file.id AND version.version=$3)`,
          [context.workspaceId, row.file_id, row.file_version]
        );
        if (current.rows[0] && current.rows[0].current_version !== row.file_version)
          await client.query(
            `UPDATE workspace_storage_usage SET ready_bytes=greatest(0,ready_bytes-$2),revision=revision+1,updated_at=clock_timestamp() WHERE workspace_id=$1`,
            [context.workspaceId, current.rows[0].size_bytes]
          );
        await client.query(
          `UPDATE files SET state='ready',updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2 AND current_version=$3`,
          [context.workspaceId, row.file_id, row.file_version]
        );
        await client.query(
          `UPDATE file_upload_sessions SET state='ready' WHERE workspace_id=$1 AND file_id=$2 AND completed_version=$3`,
          [context.workspaceId, row.file_id, row.file_version]
        );
      } else if (current.rows[0]?.current_version === row.file_version) {
        await client.query(
          `UPDATE files SET state='failed',updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2`,
          [context.workspaceId, row.file_id]
        );
      }
      return { fileId: row.file_id, state: fileState };
    });
  }

  preview(context: TenantContext, fileId: string) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const row = (
        await client.query<Record<string, unknown>>(
          `SELECT file.id,file.filename,file.current_version,version.media_type,version.checksum,
          (SELECT jsonb_build_object('id',artifact.id,'kind',artifact.kind,'mediaType',artifact.media_type,'checksum',artifact.checksum) FROM file_derived_artifacts artifact WHERE artifact.workspace_id=file.workspace_id AND artifact.file_id=file.id AND artifact.file_version=file.current_version AND artifact.sanitized=true AND artifact.purged_at IS NULL ORDER BY artifact.created_at LIMIT 1) artifact
         FROM files file JOIN file_versions version ON version.workspace_id=file.workspace_id AND version.file_id=file.id AND version.version=file.current_version WHERE file.workspace_id=$1 AND file.id=$2 AND file.state='ready' AND version.malware_state='clean'`,
          [context.workspaceId, fileId]
        )
      ).rows[0];
      if (!row) throw new HumanTaskAuthorizationError("FILE_NOT_PREVIEWABLE");
      return row;
    });
  }

  async createDownloadToken(context: TenantContext, fileId: string, input: unknown) {
    const value = z
      .object({
        sessionId: z.uuid().optional(),
        grantRevision: z.number().int().positive(),
        rangeStart: z.number().int().nonnegative().optional(),
        rangeEnd: z.number().int().nonnegative().optional()
      })
      .strict()
      .parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const file = await client.query<{ current_version: number }>(
        `SELECT current_version FROM files WHERE workspace_id=$1 AND id=$2 AND state='ready' AND deleted_at IS NULL`,
        [context.workspaceId, fileId]
      );
      if (!file.rows[0]) throw new HumanTaskAuthorizationError("FILE_NOT_DOWNLOADABLE");
      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + 60_000).toISOString();
      await client.query(
        `INSERT INTO file_download_tokens(workspace_id,token_hash,file_id,file_version,principal_id,session_id,grant_revision,range_start,range_end,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          context.workspaceId,
          hashToken(token),
          fileId,
          file.rows[0].current_version,
          context.principalId,
          value.sessionId ?? null,
          value.grantRevision,
          value.rangeStart ?? null,
          value.rangeEnd ?? null,
          expiresAt
        ]
      );
      return { token, expiresAt };
    });
  }

  consumeDownloadToken(context: TenantContext, token: string) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<Record<string, unknown>>(
        `UPDATE file_download_tokens token SET consumed_at=clock_timestamp()
         FROM files file,file_versions version
         WHERE token.workspace_id=$1 AND token.token_hash=$2 AND token.principal_id=$3 AND token.expires_at>clock_timestamp() AND token.consumed_at IS NULL AND token.revoked_at IS NULL
           AND file.workspace_id=token.workspace_id AND file.id=token.file_id AND file.state='ready' AND file.deleted_at IS NULL
           AND version.workspace_id=token.workspace_id AND version.file_id=token.file_id AND version.version=token.file_version AND version.malware_state='clean'
         RETURNING token.file_id,token.file_version,token.range_start,token.range_end,version.object_key,version.object_version,version.media_type,version.size_bytes,version.checksum`,
        [context.workspaceId, hashToken(token), context.principalId]
      );
      if (!result.rows[0]) throw new HumanTaskAuthorizationError("DOWNLOAD_TOKEN_INVALID");
      return result.rows[0];
    });
  }

  async delete(context: TenantContext, fileId: string, reason: string) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const file = await client.query<{
        owner_id: string;
        legal_hold: boolean;
        checksum: string;
        size_bytes: string;
      }>(
        `SELECT file.owner_id,file.legal_hold,version.checksum,version.size_bytes FROM files file LEFT JOIN file_versions version ON version.workspace_id=file.workspace_id AND version.file_id=file.id AND version.version=file.current_version WHERE file.workspace_id=$1 AND file.id=$2 FOR UPDATE OF file`,
        [context.workspaceId, fileId]
      );
      const row = file.rows[0];
      if (!row || row.owner_id !== context.principalId)
        throw new HumanTaskAuthorizationError("FILE_DELETE_FORBIDDEN");
      if (row.legal_hold) throw new HumanTaskConflictError("FILE_LEGAL_HOLD");
      const purged = await client.query(
        `UPDATE file_derived_artifacts SET purged_at=clock_timestamp() WHERE workspace_id=$1 AND file_id=$2 AND purged_at IS NULL`,
        [context.workspaceId, fileId]
      );
      const downstreamEventId = createId();
      await client.query(
        `UPDATE files SET state='deleted',deleted_at=clock_timestamp(),updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2`,
        [context.workspaceId, fileId]
      );
      await client.query(
        `UPDATE file_download_tokens SET revoked_at=clock_timestamp() WHERE workspace_id=$1 AND file_id=$2 AND consumed_at IS NULL AND revoked_at IS NULL`,
        [context.workspaceId, fileId]
      );
      await client.query(
        `INSERT INTO file_deletion_tombstones(workspace_id,file_id,prior_checksum_hash,reason,derivatives_purged,downstream_event_id,deleted_by) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          context.workspaceId,
          fileId,
          createHash("sha256")
            .update(row.checksum ?? "")
            .digest("hex"),
          reason,
          purged.rowCount ?? 0,
          downstreamEventId,
          context.principalId
        ]
      );
      await client.query(
        `UPDATE workspace_storage_usage SET ready_bytes=greatest(0,ready_bytes-$2),revision=revision+1,updated_at=clock_timestamp() WHERE workspace_id=$1`,
        [context.workspaceId, row.size_bytes ?? 0]
      );
      return { downstreamEventId };
    });
  }

  #attestationPayload(
    uploadId: string,
    value: Pick<z.infer<typeof uploadCompletionSchema>, "checksum" | "detectedMediaType" | "scan">
  ) {
    return [
      uploadId,
      value.checksum,
      value.detectedMediaType,
      value.scan.result,
      value.scan.engine,
      value.scan.engineVersion,
      value.scan.archiveDepth,
      value.scan.expandedBytes,
      value.scan.passwordProtected,
      value.scan.activeContent,
      [...value.scan.signatures].sort().join(",")
    ].join(":");
  }
}
