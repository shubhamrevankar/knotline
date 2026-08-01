import type { WorkflowGenerationResult } from "@knotline/contracts";
import type { Pool } from "pg";

import { withTenantTransaction, type TenantContext } from "./context.js";

export interface WorkflowGenerationRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly principalId: string;
  readonly sourcePrompt: string;
  readonly lifecycle: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLING" | "CANCELLED";
  readonly phase?: "GENERATING" | "VALIDATING" | "REPAIRING" | "READY_TO_ACCEPT";
  readonly result?: WorkflowGenerationResult;
  readonly failureCode?: string;
  readonly retryOf?: string;
  readonly acceptedWorkflowId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface WorkflowGenerationRepository {
  put(context: TenantContext, resource: WorkflowGenerationRecord): Promise<void>;
  get(context: TenantContext, id: string): Promise<WorkflowGenerationRecord | undefined>;
}

interface GenerationRow {
  id: string;
  workspace_id: string;
  principal_id: string;
  source_prompt: string;
  lifecycle: WorkflowGenerationRecord["lifecycle"];
  progress_phase: WorkflowGenerationRecord["phase"] | null;
  result: WorkflowGenerationResult | null;
  failure_code: string | null;
  retry_of: string | null;
  accepted_workflow_id: string | null;
  created_at: Date;
  updated_at: Date;
}

const fromRow = (row: GenerationRow): WorkflowGenerationRecord => ({
  id: row.id,
  workspaceId: row.workspace_id,
  principalId: row.principal_id,
  sourcePrompt: row.source_prompt,
  lifecycle: row.lifecycle,
  ...(row.progress_phase ? { phase: row.progress_phase } : {}),
  ...(row.result ? { result: row.result } : {}),
  ...(row.failure_code ? { failureCode: row.failure_code } : {}),
  ...(row.retry_of ? { retryOf: row.retry_of } : {}),
  ...(row.accepted_workflow_id ? { acceptedWorkflowId: row.accepted_workflow_id } : {}),
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString()
});

export class PostgresWorkflowGenerationRepository implements WorkflowGenerationRepository {
  constructor(private readonly pool: Pool) {}

  put(context: TenantContext, resource: WorkflowGenerationRecord): Promise<void> {
    return withTenantTransaction(this.pool, context, async (client) => {
      await client.query(
        `INSERT INTO workflow_generations(
           workspace_id,id,principal_id,retry_of,prompt_version,provider,source_prompt,lifecycle,
           progress_phase,result,failure_code,accepted_workflow_id,created_at,updated_at
         ) VALUES ($1,$2,$3,$4,'workflow-generation.v1',$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (workspace_id,id) DO UPDATE SET
           lifecycle=EXCLUDED.lifecycle,progress_phase=EXCLUDED.progress_phase,
           result=EXCLUDED.result,failure_code=EXCLUDED.failure_code,
           accepted_workflow_id=EXCLUDED.accepted_workflow_id,updated_at=EXCLUDED.updated_at`,
        [
          context.workspaceId,
          resource.id,
          resource.principalId,
          resource.retryOf ?? null,
          resource.result?.provider ?? "pending-gateway",
          resource.sourcePrompt,
          resource.lifecycle,
          resource.phase ?? null,
          resource.result ?? null,
          resource.failureCode ?? null,
          resource.acceptedWorkflowId ?? null,
          resource.createdAt,
          resource.updatedAt
        ]
      );
    });
  }

  get(context: TenantContext, id: string): Promise<WorkflowGenerationRecord | undefined> {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<GenerationRow>(
        `SELECT id,workspace_id,principal_id,source_prompt,lifecycle,progress_phase,result,
                failure_code,retry_of,accepted_workflow_id,created_at,updated_at
         FROM workflow_generations WHERE workspace_id=$1 AND id=$2`,
        [context.workspaceId, id]
      );
      return result.rows[0] ? fromRow(result.rows[0]) : undefined;
    });
  }
}
