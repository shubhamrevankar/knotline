import {
  agentExecutionRequestSchema,
  authorizedContextManifestSchema,
  type AgentExecutionRequest
} from "@knotline/contracts";
import type { Pool } from "pg";

import { withTenantTransaction, type TenantContext } from "./context.js";
import { HumanTaskAuthorizationError } from "./human-task-repository.js";
import { contentHash, createId } from "./values.js";

export interface AgentExecutionRepository {
  create(context: TenantContext, input: unknown): Promise<{ id: string }>;
  transition(
    context: TenantContext,
    id: string,
    state: string,
    detail: Readonly<Record<string, unknown>>
  ): Promise<void>;
  appendTurn(
    context: TenantContext,
    id: string,
    turn: number,
    input: Readonly<Record<string, unknown>>
  ): Promise<void>;
  addProvenance(
    context: TenantContext,
    id: string,
    kind: string,
    reference: string,
    hash: string
  ): Promise<string>;
  get(context: TenantContext, id: string): Promise<Record<string, unknown> | undefined>;
}

export class PostgresAgentExecutionRepository implements AgentExecutionRepository {
  constructor(private readonly pool: Pool) {}

  async create(context: TenantContext, input: unknown) {
    const value = agentExecutionRequestSchema.parse(input);
    if (value.workspaceId !== context.workspaceId || value.principalId !== context.principalId)
      throw new HumanTaskAuthorizationError("EXECUTION_CONTEXT_MISMATCH");
    return withTenantTransaction(this.pool, context, async (client) => {
      await client.query(
        `INSERT INTO agent_executions(workspace_id,id,run_id,task_id,attempt_id,agent_id,agent_version,
           principal_id,model_policy_version_id,prompt_version_id,review_mode,state,limits)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'queued',$12)`,
        [
          context.workspaceId,
          value.executionId,
          value.runId,
          value.taskId,
          value.attemptId,
          value.agentId,
          value.agentVersion,
          value.principalId,
          value.modelPolicyVersionId,
          value.promptVersionId,
          value.reviewMode,
          value.limits
        ]
      );
      await this.#insertManifest(client, value);
      return { id: value.executionId };
    });
  }

  async #insertManifest(
    client: { query: (text: string, values?: readonly unknown[]) => Promise<unknown> },
    request: AgentExecutionRequest
  ) {
    const manifest = authorizedContextManifestSchema.parse(request.contextManifest);
    await client.query(
      `INSERT INTO agent_context_manifests(workspace_id,id,execution_id,principal_id,context_references,total_bytes,
         total_tokens_estimate,manifest_hash,dispatch_proof_expires_at,assembled_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        request.workspaceId,
        manifest.manifestId,
        request.executionId,
        request.principalId,
        JSON.stringify(manifest.references),
        manifest.totalBytes,
        manifest.totalTokensEstimate,
        contentHash(manifest),
        manifest.dispatchProofExpiresAt,
        manifest.assembledAt
      ]
    );
  }

  async transition(
    context: TenantContext,
    id: string,
    state: string,
    detail: Readonly<Record<string, unknown>>
  ) {
    await withTenantTransaction(this.pool, context, async (client) => {
      const terminal = new Set(["succeeded", "failed", "cancelled", "timed_out", "policy_stopped"]);
      const result = await client.query(
        `UPDATE agent_executions SET state=$3,usage=usage || $4::jsonb,revision=revision+1,
           updated_at=clock_timestamp(),completed_at=CASE WHEN $5 THEN clock_timestamp() ELSE completed_at END,
           typed_output=COALESCE($6,typed_output),output_hash=COALESCE($7,output_hash),error_code=COALESCE($8,error_code)
         WHERE workspace_id=$1 AND id=$2`,
        [
          context.workspaceId,
          id,
          state,
          JSON.stringify(detail),
          terminal.has(state),
          detail.output ?? null,
          detail.outputHash ?? null,
          detail.errorCode ?? null
        ]
      );
      if (result.rowCount !== 1) throw new HumanTaskAuthorizationError("EXECUTION_NOT_FOUND");
    });
  }

  async appendTurn(
    context: TenantContext,
    id: string,
    turn: number,
    input: Readonly<Record<string, unknown>>
  ) {
    await withTenantTransaction(this.pool, context, async (client) => {
      await client.query(
        `INSERT INTO agent_execution_turns(workspace_id,execution_id,turn,step_type,input_ref,output_ref,state,usage)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          context.workspaceId,
          id,
          turn,
          input.stepType,
          input.inputRef ?? null,
          input.outputRef ?? null,
          input.state ?? "completed",
          input.usage ?? {}
        ]
      );
    });
  }

  async addProvenance(
    context: TenantContext,
    id: string,
    kind: string,
    reference: string,
    hash: string
  ) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const nodeId = createId();
      await client.query(
        `INSERT INTO provenance_nodes(workspace_id,id,execution_id,node_type,reference,content_hash)
         VALUES($1,$2,$3,$4,$5,$6)
         ON CONFLICT(workspace_id,execution_id,node_type,reference,content_hash)
         DO NOTHING`,
        [context.workspaceId, nodeId, id, kind, reference, hash]
      );
      const row = await client.query<{ id: string }>(
        `SELECT id FROM provenance_nodes
         WHERE workspace_id=$1 AND execution_id=$2 AND node_type=$3 AND reference=$4 AND content_hash=$5`,
        [context.workspaceId, id, kind, reference, hash]
      );
      return row.rows[0]!.id;
    });
  }

  get(context: TenantContext, id: string) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT execution.*,
               (SELECT jsonb_agg(turn ORDER BY turn.turn) FROM agent_execution_turns turn
                WHERE turn.workspace_id=execution.workspace_id AND turn.execution_id=execution.id) turns,
               (SELECT jsonb_agg(node ORDER BY node.created_at,node.id) FROM provenance_nodes node
                WHERE node.workspace_id=execution.workspace_id AND node.execution_id=execution.id) provenance
             FROM agent_executions execution WHERE execution.workspace_id=$1 AND execution.id=$2`,
            [context.workspaceId, id]
          )
        ).rows[0]
    );
  }
}
