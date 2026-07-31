import {
  restrictedUploadCompletionSchema,
  restrictedUploadRequestSchema,
  taskQueueInputSchema,
  taskQueueMemberSchema,
  taskRoutingPolicySchema,
  taskTemplateInputSchema
} from "@knotline/contracts";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";

import { withTenantTransaction, type TenantContext } from "./context.js";
import { HumanTaskAuthorizationError, HumanTaskConflictError } from "./human-task-repository.js";
import { createId } from "./values.js";

export interface TaskAdministrationRepository {
  listQueues(context: TenantContext): Promise<readonly Record<string, unknown>[]>;
  createQueue(context: TenantContext, input: unknown): Promise<Record<string, unknown>>;
  getQueue(context: TenantContext, queueId: string): Promise<Record<string, unknown> | undefined>;
  updateQueue(
    context: TenantContext,
    queueId: string,
    input: unknown
  ): Promise<Record<string, unknown>>;
  deleteQueue(context: TenantContext, queueId: string): Promise<void>;
  putQueueMember(
    context: TenantContext,
    queueId: string,
    principalId: string,
    input: unknown
  ): Promise<void>;
  deleteQueueMember(context: TenantContext, queueId: string, principalId: string): Promise<void>;
  publishRoutingPolicy(
    context: TenantContext,
    queueId: string,
    input: unknown
  ): Promise<{ version: number }>;
  simulateRouting(
    context: TenantContext,
    queueId: string,
    input: unknown
  ): Promise<Record<string, unknown>>;
  listTemplates(context: TenantContext): Promise<readonly Record<string, unknown>[]>;
  createTemplate(context: TenantContext, input: unknown): Promise<Record<string, unknown>>;
  getTemplate(
    context: TenantContext,
    templateId: string
  ): Promise<Record<string, unknown> | undefined>;
  updateTemplate(
    context: TenantContext,
    templateId: string,
    input: unknown
  ): Promise<Record<string, unknown>>;
  publishTemplate(context: TenantContext, templateId: string): Promise<{ version: number }>;
  previewTemplate(context: TenantContext, templateId: string): Promise<Record<string, unknown>>;
  deleteTemplate(context: TenantContext, templateId: string): Promise<void>;
  listArtifacts(
    context: TenantContext,
    taskId: string
  ): Promise<readonly Record<string, unknown>[]>;
  createUpload(
    context: TenantContext,
    taskId: string,
    input: unknown
  ): Promise<Record<string, unknown>>;
  completeUpload(
    context: TenantContext,
    uploadId: string,
    input: unknown
  ): Promise<Record<string, unknown>>;
  download(context: TenantContext, artifactId: string): Promise<Record<string, unknown>>;
  deleteArtifact(context: TenantContext, artifactId: string): Promise<void>;
}

const queueUpdateSchema = taskQueueInputSchema
  .partial()
  .extend({ expectedVersion: z.number().int().positive() });
const templateUpdateSchema = taskTemplateInputSchema
  .partial()
  .extend({ expectedVersion: z.number().int().positive() });

export class PostgresTaskAdministrationRepository implements TaskAdministrationRepository {
  constructor(private readonly pool: Pool) {}

  async listQueues(context: TenantContext) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT queue.*,coalesce((SELECT count(*) FROM human_task_details detail WHERE detail.workspace_id=queue.workspace_id AND detail.queue_id=queue.id),0)::int task_count FROM task_queues queue WHERE workspace_id=$1 ORDER BY name,id`,
            [context.workspaceId]
          )
        ).rows
    );
  }

  async createQueue(context: TenantContext, input: unknown) {
    const value = taskQueueInputSchema.parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      if (value.fallbackOwnerId) await this.assertEligible(client, context, value.fallbackOwnerId);
      const id = createId();
      const result = await client.query<Record<string, unknown>>(
        `INSERT INTO task_queues(workspace_id,id,name,routing_mode,capacity,fallback_owner_id,calendar_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [
          context.workspaceId,
          id,
          value.name,
          value.routingMode,
          value.capacity,
          value.fallbackOwnerId ?? null,
          value.calendarId ?? null
        ]
      );
      return result.rows[0]!;
    });
  }

  async getQueue(context: TenantContext, queueId: string) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT queue.*,coalesce((SELECT jsonb_agg(member) FROM task_queue_members member WHERE member.workspace_id=queue.workspace_id AND member.queue_id=queue.id),'[]'::jsonb) members FROM task_queues queue WHERE workspace_id=$1 AND id=$2`,
            [context.workspaceId, queueId]
          )
        ).rows[0]
    );
  }

  async updateQueue(context: TenantContext, queueId: string, input: unknown) {
    const value = queueUpdateSchema.parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      if (value.fallbackOwnerId) await this.assertEligible(client, context, value.fallbackOwnerId);
      const current = await client.query<Record<string, unknown>>(
        `SELECT * FROM task_queues WHERE workspace_id=$1 AND id=$2 AND version=$3 FOR UPDATE`,
        [context.workspaceId, queueId, value.expectedVersion]
      );
      if (!current.rows[0]) throw new HumanTaskConflictError("STALE_QUEUE_VERSION");
      const merged = taskQueueInputSchema.parse({
        name: value.name ?? current.rows[0].name,
        routingMode: value.routingMode ?? current.rows[0].routing_mode,
        capacity: value.capacity ?? current.rows[0].capacity,
        fallbackOwnerId:
          value.fallbackOwnerId === undefined
            ? current.rows[0].fallback_owner_id
            : value.fallbackOwnerId,
        calendarId: value.calendarId === undefined ? current.rows[0].calendar_id : value.calendarId
      });
      return (
        await client.query<Record<string, unknown>>(
          `UPDATE task_queues SET name=$3,routing_mode=$4,capacity=$5,fallback_owner_id=$6,calendar_id=$7,version=version+1,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2 RETURNING *`,
          [
            context.workspaceId,
            queueId,
            merged.name,
            merged.routingMode,
            merged.capacity,
            merged.fallbackOwnerId ?? null,
            merged.calendarId ?? null
          ]
        )
      ).rows[0]!;
    });
  }

  async deleteQueue(context: TenantContext, queueId: string) {
    await withTenantTransaction(this.pool, context, async (client) => {
      const used = await client.query(
        `SELECT 1 FROM human_task_details WHERE workspace_id=$1 AND queue_id=$2 LIMIT 1`,
        [context.workspaceId, queueId]
      );
      if (used.rows[0]) throw new HumanTaskConflictError("QUEUE_IN_USE");
      await client.query(`DELETE FROM task_queues WHERE workspace_id=$1 AND id=$2`, [
        context.workspaceId,
        queueId
      ]);
    });
  }

  async putQueueMember(
    context: TenantContext,
    queueId: string,
    principalId: string,
    input: unknown
  ) {
    const value = taskQueueMemberSchema.parse(input);
    await withTenantTransaction(this.pool, context, async (client) => {
      if (value.principalType === "user") await this.assertEligible(client, context, principalId);
      await client.query(
        `INSERT INTO task_queue_members(workspace_id,queue_id,principal_type,principal_id,skills,capacity) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(workspace_id,queue_id,principal_type,principal_id) DO UPDATE SET skills=excluded.skills,capacity=excluded.capacity`,
        [
          context.workspaceId,
          queueId,
          value.principalType,
          principalId,
          value.skills,
          value.capacity ?? null
        ]
      );
    });
  }

  async deleteQueueMember(context: TenantContext, queueId: string, principalId: string) {
    await withTenantTransaction(this.pool, context, (client) =>
      client
        .query(
          `DELETE FROM task_queue_members WHERE workspace_id=$1 AND queue_id=$2 AND principal_id=$3`,
          [context.workspaceId, queueId, principalId]
        )
        .then(() => undefined)
    );
  }

  async publishRoutingPolicy(context: TenantContext, queueId: string, input: unknown) {
    const value = taskRoutingPolicySchema.parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const queue = await client.query(
        `SELECT id FROM task_queues WHERE workspace_id=$1 AND id=$2 FOR UPDATE`,
        [context.workspaceId, queueId]
      );
      if (!queue.rows[0]) throw new Error("TASK_QUEUE_NOT_FOUND");
      const latest = Number(
        (
          await client.query<{ version: number }>(
            `SELECT coalesce(max(version),0)::int version FROM task_routing_policy_versions WHERE workspace_id=$1 AND queue_id=$2`,
            [context.workspaceId, queueId]
          )
        ).rows[0]?.version ?? 0
      );
      if (value.version !== latest + 1)
        throw new HumanTaskConflictError("ROUTING_POLICY_VERSION_GAP");
      await client.query(
        `INSERT INTO task_routing_policy_versions(workspace_id,queue_id,version,rules,published_by) VALUES($1,$2,$3,$4,$5)`,
        [
          context.workspaceId,
          queueId,
          value.version,
          JSON.stringify(value.rules),
          context.principalId
        ]
      );
      return { version: value.version };
    });
  }

  async simulateRouting(context: TenantContext, queueId: string, input: unknown) {
    const payload = z.record(z.string(), z.unknown()).parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const candidates = await client.query<{ principal_id: string; workload: number }>(
        `SELECT member.principal_id,coalesce(count(detail.task_id),0)::int workload FROM task_queue_members member LEFT JOIN human_task_details detail ON detail.workspace_id=member.workspace_id AND detail.assignee_user_id=member.principal_id AND detail.completed_by IS NULL WHERE member.workspace_id=$1 AND member.queue_id=$2 AND member.principal_type='user' GROUP BY member.principal_id ORDER BY workload,member.principal_id`,
        [context.workspaceId, queueId]
      );
      const selected =
        candidates.rows[0]?.principal_id ??
        (
          await client.query<{ fallback_owner_id: string | null }>(
            `SELECT fallback_owner_id FROM task_queues WHERE workspace_id=$1 AND id=$2`,
            [context.workspaceId, queueId]
          )
        ).rows[0]?.fallback_owner_id ??
        null;
      return {
        selectedPrincipalId: selected,
        candidates: candidates.rows,
        payload,
        deterministic: true
      };
    });
  }

  async listTemplates(context: TenantContext) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT id,name,state,optimistic_version,created_at FROM task_templates WHERE workspace_id=$1 ORDER BY name,id`,
            [context.workspaceId]
          )
        ).rows
    );
  }

  async createTemplate(context: TenantContext, input: unknown) {
    const value = taskTemplateInputSchema.parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const id = createId();
      return (
        await client.query<Record<string, unknown>>(
          `INSERT INTO task_templates(workspace_id,id,name,state,draft_definition,created_by) VALUES($1,$2,$3,'draft',$4,$5) RETURNING *`,
          [context.workspaceId, id, value.name, value, context.principalId]
        )
      ).rows[0]!;
    });
  }

  async getTemplate(context: TenantContext, templateId: string) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT template.*,coalesce((SELECT jsonb_agg(version ORDER BY version.version) FROM task_template_versions version WHERE version.workspace_id=template.workspace_id AND version.template_id=template.id),'[]'::jsonb) versions FROM task_templates template WHERE workspace_id=$1 AND id=$2`,
            [context.workspaceId, templateId]
          )
        ).rows[0]
    );
  }

  async updateTemplate(context: TenantContext, templateId: string, input: unknown) {
    const value = templateUpdateSchema.parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const current = await client.query<{
        name: string;
        draft_definition: Record<string, unknown>;
      }>(
        `SELECT name,draft_definition FROM task_templates WHERE workspace_id=$1 AND id=$2 AND state='draft' AND optimistic_version=$3 FOR UPDATE`,
        [context.workspaceId, templateId, value.expectedVersion]
      );
      if (!current.rows[0]) throw new HumanTaskConflictError("STALE_OR_PUBLISHED_TEMPLATE");
      const definition = taskTemplateInputSchema.parse({
        ...current.rows[0].draft_definition,
        ...value,
        name: value.name ?? current.rows[0].name
      });
      return (
        await client.query<Record<string, unknown>>(
          `UPDATE task_templates SET name=$3,draft_definition=$4,optimistic_version=optimistic_version+1 WHERE workspace_id=$1 AND id=$2 RETURNING *`,
          [context.workspaceId, templateId, definition.name, definition]
        )
      ).rows[0]!;
    });
  }

  async publishTemplate(context: TenantContext, templateId: string) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const template = await client.query<{
        draft_definition: { formSchema: unknown; outputSchema: unknown; defaults: unknown };
        state: string;
      }>(
        `SELECT draft_definition,state FROM task_templates WHERE workspace_id=$1 AND id=$2 FOR UPDATE`,
        [context.workspaceId, templateId]
      );
      if (!template.rows[0]) throw new HumanTaskConflictError("TEMPLATE_NOT_DRAFT");
      if (template.rows[0].state === "published") {
        const existing = await client.query<{ version: number }>(
          `SELECT max(version)::int version FROM task_template_versions WHERE workspace_id=$1 AND template_id=$2`,
          [context.workspaceId, templateId]
        );
        return { version: existing.rows[0]?.version ?? 1 };
      }
      const version = Number(
        (
          await client.query<{ version: number }>(
            `SELECT coalesce(max(version),0)::int+1 version FROM task_template_versions WHERE workspace_id=$1 AND template_id=$2`,
            [context.workspaceId, templateId]
          )
        ).rows[0]?.version ?? 1
      );
      const value = template.rows[0].draft_definition;
      await client.query(
        `INSERT INTO task_template_versions(workspace_id,template_id,version,form_schema,output_schema,defaults,published_by) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          context.workspaceId,
          templateId,
          version,
          value.formSchema,
          value.outputSchema,
          value.defaults,
          context.principalId
        ]
      );
      await client.query(
        `UPDATE task_templates SET state='published' WHERE workspace_id=$1 AND id=$2`,
        [context.workspaceId, templateId]
      );
      return { version };
    });
  }

  async previewTemplate(context: TenantContext, templateId: string) {
    const template = await this.getTemplate(context, templateId);
    if (!template) throw new Error("TASK_TEMPLATE_NOT_FOUND");
    return { mode: "preview", definition: template.draft_definition, sideEffects: false };
  }

  async deleteTemplate(context: TenantContext, templateId: string) {
    await withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query(
        `UPDATE task_templates SET state='archived' WHERE workspace_id=$1 AND id=$2 AND NOT EXISTS(SELECT 1 FROM human_task_details detail WHERE detail.workspace_id=$1 AND detail.form_schema->>'templateId'=$2) RETURNING id`,
        [context.workspaceId, templateId]
      );
      if (!result.rows[0]) throw new HumanTaskConflictError("TEMPLATE_IN_USE_OR_NOT_FOUND");
    });
  }

  async listArtifacts(context: TenantContext, taskId: string) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT file.id,file.purpose,file.state,file.current_version,file.created_at FROM task_file_attachments attachment JOIN files file ON file.workspace_id=attachment.workspace_id AND file.id=attachment.file_id WHERE attachment.workspace_id=$1 AND attachment.task_id=$2 ORDER BY file.created_at,file.id`,
            [context.workspaceId, taskId]
          )
        ).rows
    );
  }

  async createUpload(context: TenantContext, taskId: string, input: unknown) {
    const value = restrictedUploadRequestSchema.parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const duplicate = await client.query<Record<string, unknown>>(
        `SELECT session.id upload_id,session.file_id,session.expires_at FROM file_upload_sessions session WHERE workspace_id=$1 AND idempotency_key=$2`,
        [context.workspaceId, value.idempotencyKey]
      );
      if (duplicate.rows[0]) return duplicate.rows[0];
      const fileId = createId();
      const uploadId = createId();
      await client.query(
        `INSERT INTO files(workspace_id,id,purpose,owner_id,state) VALUES($1,$2,$3,$4,'uploading')`,
        [context.workspaceId, fileId, value.purpose, context.principalId]
      );
      await client.query(
        `INSERT INTO task_file_attachments(workspace_id,task_id,file_id,created_by) VALUES($1,$2,$3,$4)`,
        [context.workspaceId, taskId, fileId, context.principalId]
      );
      const result = await client.query<Record<string, unknown>>(
        `INSERT INTO file_upload_sessions(workspace_id,id,file_id,idempotency_key,expected_size,expected_checksum,state,expires_at) VALUES($1,$2,$3,$4,$5,$6,'created',clock_timestamp()+interval '15 minutes') RETURNING id upload_id,file_id,expires_at`,
        [
          context.workspaceId,
          uploadId,
          fileId,
          value.idempotencyKey,
          value.sizeBytes,
          value.checksum
        ]
      );
      return {
        ...result.rows[0],
        mediaType: value.mediaType,
        uploadUrl: `/v1/artifact-uploads/${uploadId}/blob`
      };
    });
  }

  async completeUpload(context: TenantContext, uploadId: string, input: unknown) {
    const value = restrictedUploadCompletionSchema.parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const session = await client.query<{
        file_id: string;
        expected_size: string;
        expected_checksum: string;
        state: string;
      }>(
        `SELECT file_id,expected_size,expected_checksum,state FROM file_upload_sessions WHERE workspace_id=$1 AND id=$2 AND expires_at>clock_timestamp() FOR UPDATE`,
        [context.workspaceId, uploadId]
      );
      const row = session.rows[0];
      if (!row) throw new HumanTaskConflictError("UPLOAD_EXPIRED_OR_MISSING");
      if (row.state === "verified") return { artifactId: row.file_id, state: "clean" };
      if (Number(row.expected_size) !== value.sizeBytes || row.expected_checksum !== value.checksum)
        throw new HumanTaskConflictError("UPLOAD_INTEGRITY_MISMATCH");
      const clean = value.malwareResult === "clean";
      await client.query(
        `INSERT INTO file_versions(workspace_id,file_id,version,object_key,media_type,size_bytes,checksum,malware_state) VALUES($1,$2,1,$3,'application/octet-stream',$4,$5,$6)`,
        [
          context.workspaceId,
          row.file_id,
          `restricted/${context.workspaceId}/${row.file_id}/1`,
          value.sizeBytes,
          value.checksum,
          value.malwareResult
        ]
      );
      await client.query(
        `UPDATE files SET state=$3,current_version=1 WHERE workspace_id=$1 AND id=$2`,
        [context.workspaceId, row.file_id, clean ? "clean" : "quarantined"]
      );
      await client.query(
        `UPDATE file_upload_sessions SET state=$3 WHERE workspace_id=$1 AND id=$2`,
        [context.workspaceId, uploadId, clean ? "verified" : "rejected"]
      );
      return { artifactId: row.file_id, state: clean ? "clean" : "quarantined" };
    });
  }

  async download(context: TenantContext, artifactId: string) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<Record<string, unknown>>(
        `SELECT file.id,file.purpose,version.media_type,version.size_bytes,version.checksum FROM files file JOIN file_versions version ON version.workspace_id=file.workspace_id AND version.file_id=file.id AND version.version=file.current_version WHERE file.workspace_id=$1 AND file.id=$2 AND file.state='clean' AND version.malware_state='clean'`,
        [context.workspaceId, artifactId]
      );
      if (!result.rows[0]) throw new HumanTaskAuthorizationError("ARTIFACT_NOT_DOWNLOADABLE");
      return {
        ...result.rows[0],
        downloadUrl: `/v1/artifacts/${artifactId}/content`,
        expiresInSeconds: 60
      };
    });
  }

  async deleteArtifact(context: TenantContext, artifactId: string) {
    await withTenantTransaction(this.pool, context, (client) =>
      client
        .query(`UPDATE files SET state='deleted' WHERE workspace_id=$1 AND id=$2 AND owner_id=$3`, [
          context.workspaceId,
          artifactId,
          context.principalId
        ])
        .then(() => undefined)
    );
  }

  private async assertEligible(client: PoolClient, context: TenantContext, userId: string) {
    const result = await client.query(
      `SELECT 1 FROM memberships WHERE workspace_id=$1 AND user_id=$2 AND state='active'`,
      [context.workspaceId, userId]
    );
    if (!result.rows[0]) throw new HumanTaskAuthorizationError("PRINCIPAL_NOT_ELIGIBLE");
  }
}
