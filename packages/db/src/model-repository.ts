import { modelRoleSchema } from "@knotline/contracts";
import type { Pool } from "pg";
import { z } from "zod";

import { withTenantTransaction, type TenantContext } from "./context.js";
import { HumanTaskAuthorizationError, HumanTaskConflictError } from "./human-task-repository.js";
import { contentHash, createId } from "./values.js";

const modelPolicyDefinitionSchema = z.object({
  allowedRoles: z.array(modelRoleSchema).min(1),
  allowedProviders: z.array(z.string().min(1)).min(1),
  maxCostDecimal: z.string().regex(/^\d+(?:\.\d{1,12})?$/u),
  emergencyDisabled: z.boolean(),
  allowedResidencies: z.array(z.string().min(1)).min(1),
  fallback: z.array(modelRoleSchema).default([]),
  retention: z.literal("no-store")
});

export type ModelPolicyDefinition = z.infer<typeof modelPolicyDefinitionSchema>;

export interface ModelRepository {
  listPolicies(context: TenantContext): Promise<readonly Record<string, unknown>[]>;
  createPolicy(context: TenantContext, input: unknown): Promise<{ id: string; version: number }>;
  getPolicy(context: TenantContext, id: string): Promise<Record<string, unknown> | undefined>;
  updatePolicy(context: TenantContext, id: string, input: unknown): Promise<{ version: number }>;
  listModels(context: TenantContext): Promise<readonly Record<string, unknown>[]>;
}

export class PostgresModelRepository implements ModelRepository {
  constructor(private readonly pool: Pool) {}

  listPolicies(context: TenantContext) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT policy.id,policy.name,policy.state,policy.current_version,policy.revision,version.definition,version.content_hash,policy.updated_at
           FROM model_policies policy JOIN model_policy_versions version ON version.workspace_id=policy.workspace_id AND version.policy_id=policy.id AND version.version=policy.current_version
           WHERE policy.workspace_id=$1 ORDER BY policy.updated_at DESC,policy.id`,
            [context.workspaceId]
          )
        ).rows
    );
  }

  async createPolicy(context: TenantContext, input: unknown) {
    const value = z
      .object({ name: z.string().trim().min(2).max(120), definition: modelPolicyDefinitionSchema })
      .strict()
      .parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const id = createId();
      await client.query(
        `INSERT INTO model_policies(workspace_id,id,name,state,created_by) VALUES($1,$2,$3,'active',$4)`,
        [context.workspaceId, id, value.name, context.principalId]
      );
      await client.query(
        `INSERT INTO model_policy_versions(workspace_id,policy_id,version,definition,content_hash,created_by) VALUES($1,$2,1,$3,$4,$5)`,
        [
          context.workspaceId,
          id,
          value.definition,
          contentHash(value.definition),
          context.principalId
        ]
      );
      return { id, version: 1 };
    });
  }

  getPolicy(context: TenantContext, id: string) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT policy.*,version.definition,version.content_hash FROM model_policies policy
           JOIN model_policy_versions version ON version.workspace_id=policy.workspace_id AND version.policy_id=policy.id AND version.version=policy.current_version
           WHERE policy.workspace_id=$1 AND policy.id=$2`,
            [context.workspaceId, id]
          )
        ).rows[0]
    );
  }

  async updatePolicy(context: TenantContext, id: string, input: unknown) {
    const value = z
      .object({
        expectedRevision: z.number().int().positive(),
        definition: modelPolicyDefinitionSchema
      })
      .strict()
      .parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const current = await client.query<{ revision: string; current_version: number }>(
        `SELECT revision,current_version FROM model_policies WHERE workspace_id=$1 AND id=$2 FOR UPDATE`,
        [context.workspaceId, id]
      );
      const row = current.rows[0];
      if (!row) throw new HumanTaskAuthorizationError("MODEL_POLICY_NOT_FOUND");
      if (Number(row.revision) !== value.expectedRevision)
        throw new HumanTaskConflictError("STALE_MODEL_POLICY");
      const version = Number(row.current_version) + 1;
      await client.query(
        `INSERT INTO model_policy_versions(workspace_id,policy_id,version,definition,content_hash,created_by) VALUES($1,$2,$3,$4,$5,$6)`,
        [
          context.workspaceId,
          id,
          version,
          value.definition,
          contentHash(value.definition),
          context.principalId
        ]
      );
      await client.query(
        `UPDATE model_policies SET current_version=$3,revision=revision+1,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2`,
        [context.workspaceId, id, version]
      );
      return { version };
    });
  }

  listModels(context: TenantContext) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT registry.id,registry.provider_key,registry.model_id,registry.snapshot,registry.role,
             registry.capabilities,registry.context_tokens,registry.max_output_tokens,registry.pricing_version,
             registry.residency,registry.state,provider.endpoint_class,provider.region,provider.state provider_state
           FROM model_registry registry JOIN model_providers provider ON provider.workspace_id=registry.workspace_id AND provider.provider_key=registry.provider_key
           WHERE registry.workspace_id=$1 ORDER BY registry.role,registry.model_id`,
            [context.workspaceId]
          )
        ).rows
    );
  }
}

export { modelPolicyDefinitionSchema };
