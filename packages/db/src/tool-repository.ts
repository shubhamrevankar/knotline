import { credentialMetadataSchema, toolDefinitionSchema } from "@knotline/contracts";
import type { Pool } from "pg";
import { z } from "zod";

import { withTenantTransaction, type TenantContext } from "./context.js";
import { HumanTaskAuthorizationError, HumanTaskConflictError } from "./human-task-repository.js";
import { contentHash, createId } from "./values.js";

const createToolSchema = z
  .object({
    definition: toolDefinitionSchema,
    stableName: z.string().min(3).max(96)
  })
  .strict();

const createCredentialSchema = credentialMetadataSchema
  .omit({ id: true, lastUsedAt: true })
  .strict();

export interface ToolRepository {
  listTools(context: TenantContext): Promise<readonly Record<string, unknown>[]>;
  createTool(context: TenantContext, input: unknown): Promise<{ id: string; version: number }>;
  getTool(context: TenantContext, id: string): Promise<Record<string, unknown> | undefined>;
  addVersion(context: TenantContext, id: string, input: unknown): Promise<{ version: number }>;
  setToolState(context: TenantContext, id: string, enabled: boolean): Promise<void>;
  listCredentials(context: TenantContext): Promise<readonly Record<string, unknown>[]>;
  createCredential(context: TenantContext, input: unknown): Promise<{ id: string }>;
  revokeCredential(context: TenantContext, id: string): Promise<void>;
}

export class PostgresToolRepository implements ToolRepository {
  constructor(private readonly pool: Pool) {}

  listTools(context: TenantContext) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT tool.id,tool.stable_name,tool.owner,tool.state,tool.current_version,tool.revision,
                    version.semantic_version,version.definition,version.content_hash,tool.updated_at
             FROM tool_definitions tool JOIN tool_versions version
               ON version.workspace_id=tool.workspace_id AND version.tool_id=tool.id AND version.version=tool.current_version
             WHERE tool.workspace_id=$1 ORDER BY tool.stable_name,tool.id`,
            [context.workspaceId]
          )
        ).rows
    );
  }

  async createTool(context: TenantContext, input: unknown) {
    const value = createToolSchema.parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const id = createId();
      await client.query(
        `INSERT INTO tool_definitions(workspace_id,id,stable_name,owner,state,created_by)
         VALUES($1,$2,$3,$4,'active',$5)`,
        [context.workspaceId, id, value.stableName, value.definition.owner, context.principalId]
      );
      await client.query(
        `INSERT INTO tool_versions(workspace_id,tool_id,version,semantic_version,definition,content_hash,created_by)
         VALUES($1,$2,1,$3,$4,$5,$6)`,
        [
          context.workspaceId,
          id,
          value.definition.version,
          value.definition,
          contentHash(value.definition),
          context.principalId
        ]
      );
      return { id, version: 1 };
    });
  }

  getTool(context: TenantContext, id: string) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT tool.*,version.semantic_version,version.definition,version.content_hash
             FROM tool_definitions tool JOIN tool_versions version
               ON version.workspace_id=tool.workspace_id AND version.tool_id=tool.id AND version.version=tool.current_version
             WHERE tool.workspace_id=$1 AND tool.id=$2`,
            [context.workspaceId, id]
          )
        ).rows[0]
    );
  }

  async addVersion(context: TenantContext, id: string, input: unknown) {
    const value = z
      .object({ expectedRevision: z.number().int().positive(), definition: toolDefinitionSchema })
      .strict()
      .parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const current = await client.query<{ revision: string; current_version: number }>(
        `SELECT revision,current_version FROM tool_definitions WHERE workspace_id=$1 AND id=$2 FOR UPDATE`,
        [context.workspaceId, id]
      );
      const row = current.rows[0];
      if (!row) throw new HumanTaskAuthorizationError("TOOL_NOT_FOUND");
      if (Number(row.revision) !== value.expectedRevision)
        throw new HumanTaskConflictError("STALE_TOOL_REVISION");
      const version = Number(row.current_version) + 1;
      await client.query(
        `INSERT INTO tool_versions(workspace_id,tool_id,version,semantic_version,definition,content_hash,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          context.workspaceId,
          id,
          version,
          value.definition.version,
          value.definition,
          contentHash(value.definition),
          context.principalId
        ]
      );
      await client.query(
        `UPDATE tool_definitions SET current_version=$3,revision=revision+1,owner=$4,updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND id=$2`,
        [context.workspaceId, id, version, value.definition.owner]
      );
      return { version };
    });
  }

  async setToolState(context: TenantContext, id: string, enabled: boolean) {
    await withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query(
        `UPDATE tool_definitions SET state=$3,revision=revision+1,updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND id=$2`,
        [context.workspaceId, id, enabled ? "active" : "disabled"]
      );
      if (result.rowCount !== 1) throw new HumanTaskAuthorizationError("TOOL_NOT_FOUND");
    });
  }

  listCredentials(context: TenantContext) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT id,provider,account_label,scopes,owner_id,rotation_state,last_used_at,updated_at
             FROM credential_records WHERE workspace_id=$1 ORDER BY provider,account_label,id`,
            [context.workspaceId]
          )
        ).rows
    );
  }

  async createCredential(context: TenantContext, input: unknown) {
    const value = createCredentialSchema.parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const id = createId();
      await client.query(
        `INSERT INTO credential_records(workspace_id,id,provider,account_label,scopes,owner_id,secret_reference,rotation_state)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          context.workspaceId,
          id,
          value.provider,
          value.accountLabel,
          JSON.stringify(value.scopes),
          value.ownerId,
          value.secretReference,
          value.rotationState
        ]
      );
      return { id };
    });
  }

  async revokeCredential(context: TenantContext, id: string) {
    await withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query(
        `UPDATE credential_records SET rotation_state='revoked',revision=revision+1,updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND id=$2`,
        [context.workspaceId, id]
      );
      if (result.rowCount !== 1) throw new HumanTaskAuthorizationError("CREDENTIAL_NOT_FOUND");
    });
  }
}
