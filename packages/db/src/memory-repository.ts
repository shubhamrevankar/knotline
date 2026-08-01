import { memoryWriteOperationSchema } from "@knotline/contracts";
import type { Pool } from "pg";
import { z } from "zod";

import { withTenantTransaction, type TenantContext } from "./context.js";
import { HumanTaskAuthorizationError, HumanTaskConflictError } from "./human-task-repository.js";
import { contentHash, createId } from "./values.js";

const memoryPolicySchema = z
  .object({
    allowedScopes: z.array(z.enum(["execution", "user_private", "workspace_shared"])),
    retentionDays: z.number().int().min(0).max(3650),
    maxRecordsPerSubject: z.number().int().positive().max(10_000),
    allowSensitive: z.boolean(),
    requireSourceReferences: z.boolean(),
    disabled: z.boolean()
  })
  .strict();

const correctionSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    value: z.unknown(),
    reason: z.string().min(2).max(500),
    scope: z.enum(["execution", "user_private", "workspace_shared"]).optional()
  })
  .strict();

export interface MemoryRepository {
  getPolicy(context: TenantContext, agentId: string): Promise<Record<string, unknown> | undefined>;
  setPolicy(context: TenantContext, agentId: string, input: unknown): Promise<{ revision: number }>;
  listMine(context: TenantContext, query?: string): Promise<readonly Record<string, unknown>[]>;
  listWorkspace(
    context: TenantContext,
    agentId?: string
  ): Promise<readonly Record<string, unknown>[]>;
  getMine(context: TenantContext, memoryId: string): Promise<Record<string, unknown> | undefined>;
  writeExplicit(
    context: TenantContext,
    agentId: string,
    executionId: string,
    input: unknown
  ): Promise<{ id: string; version: number }>;
  correctMine(
    context: TenantContext,
    memoryId: string,
    input: unknown
  ): Promise<{ version: number }>;
  deleteMine(context: TenantContext, memoryId: string, reason?: string): Promise<void>;
  exportMine(context: TenantContext): Promise<readonly Record<string, unknown>[]>;
  invalidateDependencies(context: TenantContext, input: unknown): Promise<{ tombstoned: number }>;
}

export class PostgresMemoryRepository implements MemoryRepository {
  constructor(private readonly pool: Pool) {}

  getPolicy(context: TenantContext, agentId: string) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT agent_id,revision,definition,content_hash,updated_by,updated_at
             FROM memory_policies WHERE workspace_id=$1 AND agent_id=$2`,
            [context.workspaceId, agentId]
          )
        ).rows[0]
    );
  }

  async setPolicy(context: TenantContext, agentId: string, input: unknown) {
    const value = z
      .object({ expectedRevision: z.number().int().min(0), definition: memoryPolicySchema })
      .strict()
      .parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const existing = await client.query<{ revision: string }>(
        `SELECT revision FROM memory_policies WHERE workspace_id=$1 AND agent_id=$2 FOR UPDATE`,
        [context.workspaceId, agentId]
      );
      const current = Number(existing.rows[0]?.revision ?? 0);
      if (current !== value.expectedRevision)
        throw new HumanTaskConflictError("STALE_MEMORY_POLICY");
      const revision = current + 1;
      await client.query(
        `INSERT INTO memory_policies(workspace_id,agent_id,revision,definition,content_hash,updated_by)
         VALUES($1,$2,$3,$4,$5,$6)
         ON CONFLICT(workspace_id,agent_id) DO UPDATE SET revision=excluded.revision,
           definition=excluded.definition,content_hash=excluded.content_hash,updated_by=excluded.updated_by,
           updated_at=clock_timestamp()`,
        [
          context.workspaceId,
          agentId,
          revision,
          value.definition,
          contentHash(value.definition),
          context.principalId
        ]
      );
      return { revision };
    });
  }

  listMine(context: TenantContext, query = "") {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT record.id,record.agent_id,record.subject_id,record.purpose,record.sensitivity,
                    record.state,record.current_version,record.retention_expires_at,record.legal_hold,
                    version.value,version.value_hash,version.source_references,version.provenance,record.updated_at
             FROM memory_records record JOIN memory_versions version
               ON version.workspace_id=record.workspace_id AND version.memory_id=record.id AND version.version=record.current_version
             WHERE record.workspace_id=$1 AND record.scope='user_private' AND record.owner_id=$2
               AND ($3='' OR record.purpose ILIKE '%' || $3 || '%' OR record.subject_id ILIKE '%' || $3 || '%')
             ORDER BY record.updated_at DESC,record.id`,
            [context.workspaceId, context.principalId, query.slice(0, 200)]
          )
        ).rows
    );
  }

  listWorkspace(context: TenantContext, agentId?: string) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT record.id,record.agent_id,record.subject_id,record.purpose,record.sensitivity,
                    record.state,record.current_version,record.retention_expires_at,record.legal_hold,
                    version.value_hash,version.source_references,version.provenance,record.updated_at
             FROM memory_records record JOIN memory_versions version
               ON version.workspace_id=record.workspace_id AND version.memory_id=record.id AND version.version=record.current_version
             WHERE record.workspace_id=$1 AND record.scope='workspace_shared'
               AND ($2::uuid IS NULL OR record.agent_id=$2)
             ORDER BY record.updated_at DESC,record.id`,
            [context.workspaceId, agentId ?? null]
          )
        ).rows
    );
  }

  getMine(context: TenantContext, memoryId: string) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT record.*,version.value,version.value_hash,version.source_references,
                    version.permission_dependencies,version.provenance,version.authorizer_id,
                    (SELECT jsonb_agg(jsonb_build_object('version',history.version,'operation',history.operation,
                       'valueHash',history.value_hash,'createdAt',history.created_at) ORDER BY history.version)
                     FROM memory_versions history WHERE history.workspace_id=record.workspace_id AND history.memory_id=record.id) history
             FROM memory_records record JOIN memory_versions version
               ON version.workspace_id=record.workspace_id AND version.memory_id=record.id AND version.version=record.current_version
             WHERE record.workspace_id=$1 AND record.id=$2 AND record.scope='user_private' AND record.owner_id=$3`,
            [context.workspaceId, memoryId, context.principalId]
          )
        ).rows[0]
    );
  }

  async writeExplicit(
    context: TenantContext,
    agentId: string,
    executionId: string,
    input: unknown
  ) {
    const value = memoryWriteOperationSchema.parse(input);
    if (value.scope === "user_private" && value.authorizerId !== context.principalId)
      throw new HumanTaskAuthorizationError("MEMORY_AUTHORIZER_MISMATCH");
    return withTenantTransaction(this.pool, context, async (client) => {
      const policy = await client.query<{ definition: unknown }>(
        `SELECT definition FROM memory_policies WHERE workspace_id=$1 AND agent_id=$2`,
        [context.workspaceId, agentId]
      );
      const definition = memoryPolicySchema.parse(policy.rows[0]?.definition);
      if (definition.disabled || !definition.allowedScopes.includes(value.scope))
        throw new HumanTaskAuthorizationError("MEMORY_POLICY_DENIED");
      if (!definition.allowSensitive && value.sensitivity === "restricted")
        throw new HumanTaskAuthorizationError("MEMORY_SENSITIVITY_DENIED");
      if (definition.requireSourceReferences && value.sourceReferences.length === 0)
        throw new HumanTaskAuthorizationError("MEMORY_SOURCE_REQUIRED");
      const id = createId();
      const expiry =
        value.expiresAt ??
        new Date(Date.now() + definition.retentionDays * 86_400_000).toISOString();
      await client.query(
        `INSERT INTO memory_records(workspace_id,id,scope,owner_id,agent_id,subject_id,purpose,sensitivity,state,
           retention_expires_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'active',$9,$10)`,
        [
          context.workspaceId,
          id,
          value.scope,
          value.scope === "user_private" ? context.principalId : null,
          agentId,
          value.subjectId,
          value.purpose,
          value.sensitivity,
          expiry,
          context.principalId
        ]
      );
      await client.query(
        `INSERT INTO memory_versions(workspace_id,memory_id,version,operation,value,value_hash,source_references,
           permission_dependencies,provenance,authorizer_id) VALUES($1,$2,1,'create',$3,$4,$5,$6,$7,$8)`,
        [
          context.workspaceId,
          id,
          value.value,
          contentHash(value.value),
          JSON.stringify(value.sourceReferences),
          JSON.stringify(value.permissionDependencies),
          { operationId: value.operationId, executionId },
          value.authorizerId
        ]
      );
      await client.query(
        `INSERT INTO memory_uses(workspace_id,memory_id,memory_version,execution_id,use_type,permission_proof_id,authorized_at)
         VALUES($1,$2,1,$3,'explicit_write',$4,clock_timestamp())`,
        [context.workspaceId, id, executionId, `write:${value.operationId}`]
      );
      return { id, version: 1 };
    });
  }

  async correctMine(context: TenantContext, memoryId: string, input: unknown) {
    const value = correctionSchema.parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const current = await client.query<{ current_version: number; scope: string }>(
        `SELECT current_version,scope FROM memory_records
         WHERE workspace_id=$1 AND id=$2 AND scope='user_private' AND owner_id=$3 FOR UPDATE`,
        [context.workspaceId, memoryId, context.principalId]
      );
      const row = current.rows[0];
      if (!row) throw new HumanTaskAuthorizationError("MEMORY_NOT_FOUND");
      if (Number(row.current_version) !== value.expectedVersion)
        throw new HumanTaskConflictError("STALE_MEMORY_VERSION");
      const version = Number(row.current_version) + 1;
      await client.query(
        `INSERT INTO memory_versions(workspace_id,memory_id,version,operation,value,value_hash,
           source_references,permission_dependencies,provenance,authorizer_id)
         SELECT workspace_id,memory_id,$3,$4,$5,$6,source_references,permission_dependencies,$7,$8
         FROM memory_versions WHERE workspace_id=$1 AND memory_id=$2 AND version=$9`,
        [
          context.workspaceId,
          memoryId,
          version,
          value.scope && value.scope !== row.scope ? "scope_change" : "correct",
          value.value,
          contentHash(value.value),
          { reason: value.reason },
          context.principalId,
          value.expectedVersion
        ]
      );
      await client.query(
        `UPDATE memory_records SET current_version=$4,state='corrected',scope=COALESCE($5::text,scope),
           owner_id=CASE WHEN COALESCE($5::text,scope)='user_private' THEN $3::uuid ELSE NULL END,updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND id=$2`,
        [context.workspaceId, memoryId, context.principalId, version, value.scope ?? null]
      );
      return { version };
    });
  }

  async deleteMine(context: TenantContext, memoryId: string, reason = "user_delete") {
    await withTenantTransaction(this.pool, context, async (client) => {
      const current = await client.query<{ current_version: number; value_hash: string | null }>(
        `SELECT record.current_version,version.value_hash FROM memory_records record JOIN memory_versions version
           ON version.workspace_id=record.workspace_id AND version.memory_id=record.id AND version.version=record.current_version
         WHERE record.workspace_id=$1 AND record.id=$2 AND record.scope='user_private' AND record.owner_id=$3 FOR UPDATE OF record`,
        [context.workspaceId, memoryId, context.principalId]
      );
      const row = current.rows[0];
      if (!row) throw new HumanTaskAuthorizationError("MEMORY_NOT_FOUND");
      const version = Number(row.current_version) + 1;
      await client.query(
        `INSERT INTO memory_versions(workspace_id,memory_id,version,operation,value,value_hash,source_references,
           permission_dependencies,provenance,authorizer_id)
         VALUES($1,$2,$3,'tombstone',NULL,NULL,'[]','[]',$4,$5)`,
        [context.workspaceId, memoryId, version, { reason }, context.principalId]
      );
      await client.query(
        `UPDATE memory_records SET current_version=$3,state='tombstoned',updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND id=$2`,
        [context.workspaceId, memoryId, version]
      );
      await client.query(
        `INSERT INTO memory_tombstones(workspace_id,memory_id,reason,prior_value_hash,purge_after,audit_fact)
         VALUES($1,$2,'user_delete',$3,clock_timestamp(),$4)`,
        [context.workspaceId, memoryId, row.value_hash, { deletedBy: context.principalId }]
      );
    });
  }

  exportMine(context: TenantContext) {
    return this.listMine(context);
  }

  async invalidateDependencies(context: TenantContext, input: unknown) {
    const value = z
      .object({
        dependencyType: z.enum(["source", "permission"]),
        dependencyId: z.string().min(1).max(500),
        reason: z.enum([
          "source_delete",
          "permission_revoked",
          "membership_removed",
          "workspace_delete",
          "retention_expired",
          "subject_delete"
        ])
      })
      .strict()
      .parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const dependencyColumn =
        value.dependencyType === "source" ? "source_references" : "permission_dependencies";
      const affected = await client.query<{
        id: string;
        current_version: number;
        value_hash: string | null;
      }>(
        `SELECT record.id,record.current_version,version.value_hash
         FROM memory_records record JOIN memory_versions version
           ON version.workspace_id=record.workspace_id AND version.memory_id=record.id
          AND version.version=record.current_version
         WHERE record.workspace_id=$1 AND record.state NOT IN ('tombstoned','expired')
           AND version.${dependencyColumn} ? $2
         FOR UPDATE OF record`,
        [context.workspaceId, value.dependencyId]
      );
      for (const record of affected.rows) {
        const nextVersion = Number(record.current_version) + 1;
        await client.query(
          `INSERT INTO memory_versions(workspace_id,memory_id,version,operation,value,value_hash,
             source_references,permission_dependencies,provenance,authorizer_id)
           VALUES($1,$2,$3,'tombstone',NULL,NULL,'[]','[]',$4,$5)`,
          [
            context.workspaceId,
            record.id,
            nextVersion,
            { reason: value.reason, dependencyId: value.dependencyId },
            context.principalId
          ]
        );
        await client.query(
          `UPDATE memory_records SET current_version=$3,state='tombstoned',updated_at=clock_timestamp()
           WHERE workspace_id=$1 AND id=$2`,
          [context.workspaceId, record.id, nextVersion]
        );
        await client.query(
          `INSERT INTO memory_tombstones(workspace_id,memory_id,reason,prior_value_hash,purge_after,audit_fact)
           VALUES($1,$2,$3,$4,clock_timestamp(),$5) ON CONFLICT DO NOTHING`,
          [
            context.workspaceId,
            record.id,
            value.reason,
            record.value_hash,
            { dependencyType: value.dependencyType, dependencyId: value.dependencyId }
          ]
        );
      }
      return { tombstoned: affected.rows.length };
    });
  }
}

export { memoryPolicySchema };
