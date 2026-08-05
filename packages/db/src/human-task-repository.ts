import {
  humanTaskFilterSchema,
  taskActionSchema,
  taskAssignmentSchema,
  taskBulkActionSchema,
  taskClaimSchema,
  taskDelegationSchema,
  taskDraftSchema,
  taskSubmissionSchema,
  validateHumanSubmission,
  type HumanForm
} from "@knotline/contracts";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";

import { withTenantTransaction, type TenantContext } from "./context.js";
import { normalizeHumanForm } from "./human-form.js";
import { createId } from "./values.js";

export class HumanTaskConflictError extends Error {}
export class HumanTaskAuthorizationError extends Error {}

export interface HumanTaskRepository {
  list(context: TenantContext, input: unknown): Promise<readonly Record<string, unknown>[]>;
  get(context: TenantContext, taskId: string): Promise<Record<string, unknown> | undefined>;
  claim(
    context: TenantContext,
    taskId: string,
    input: unknown
  ): Promise<{ assignmentVersion: number }>;
  saveDraft(context: TenantContext, taskId: string, input: unknown): Promise<{ version: number }>;
  submit(
    context: TenantContext,
    taskId: string,
    input: unknown
  ): Promise<{ id: string; temporalWorkflowId: string; nodeKey: string }>;
  assign(
    context: TenantContext,
    taskId: string,
    input: unknown
  ): Promise<{ assignmentVersion: number }>;
  unclaim(
    context: TenantContext,
    taskId: string,
    input: unknown
  ): Promise<{ assignmentVersion: number }>;
  delegate(context: TenantContext, taskId: string, input: unknown): Promise<{ id: string }>;
  requestClarification(
    context: TenantContext,
    taskId: string,
    input: unknown
  ): Promise<{ accepted: true }>;
  reopen(context: TenantContext, taskId: string, input: unknown): Promise<{ id: string }>;
  watch(context: TenantContext, taskId: string): Promise<void>;
  unwatch(context: TenantContext, taskId: string): Promise<void>;
  attempts(context: TenantContext, taskId: string): Promise<readonly Record<string, unknown>[]>;
  bulk(context: TenantContext, input: unknown): Promise<{ updated: number }>;
}

export class PostgresHumanTaskRepository implements HumanTaskRepository {
  constructor(private readonly pool: Pool) {}

  async list(context: TenantContext, input: unknown) {
    const filter = humanTaskFilterSchema.parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<Record<string, unknown>>(
        `SELECT task.id,task.run_id,task.node_key,task.state,task.state_version,task.created_at,
          detail.priority,detail.due_at,detail.assignee_user_id,detail.assignee_group_id,detail.queue_id,
          detail.assignment_version,
          coalesce(detail.assignee_user_id=$3,false) can_submit,
          (detail.assignee_user_id IS NULL AND (detail.assignee_group_id IS NULL OR EXISTS (
            SELECT 1 FROM workspace_group_memberships eligibility
            WHERE eligibility.workspace_id=task.workspace_id AND eligibility.group_id=detail.assignee_group_id AND eligibility.user_id=$3
          ))) can_claim,
          run.workflow_id,run.workflow_version
         FROM task_runs task JOIN human_task_details detail ON detail.workspace_id=task.workspace_id AND detail.task_id=task.id
         JOIN workflow_runs run ON run.workspace_id=task.workspace_id AND run.id=task.run_id
         WHERE task.workspace_id=$1
           AND ($2='all' OR ($2='mine' AND detail.assignee_user_id=$3) OR ($2='created' AND detail.created_by=$3)
             OR ($2='unassigned' AND detail.assignee_user_id IS NULL AND detail.assignee_group_id IS NULL)
             OR ($2='group' AND detail.assignee_group_id IN (
               SELECT membership.group_id FROM workspace_group_memberships membership
               WHERE membership.workspace_id=task.workspace_id AND membership.user_id=$3))
             OR ($2='watched' AND EXISTS (SELECT 1 FROM task_watchers watcher WHERE watcher.workspace_id=task.workspace_id AND watcher.task_id=task.id AND watcher.user_id=$3))
             OR ($2='completed' AND task.state='succeeded'))
           AND ($4::text IS NULL OR task.state=$4) AND ($5::text IS NULL OR detail.priority=$5)
           AND ($6::uuid IS NULL OR detail.queue_id=$6)
           AND ($8::uuid IS NULL OR task.id < $8)
         ORDER BY detail.due_at ASC NULLS LAST,task.created_at DESC,task.id DESC LIMIT $7`,
        [
          context.workspaceId,
          filter.view,
          context.principalId,
          filter.state ?? null,
          filter.priority ?? null,
          filter.queueId ?? null,
          filter.limit,
          filter.cursor ?? null
        ]
      );
      return result.rows;
    });
  }

  async get(context: TenantContext, taskId: string) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<Record<string, unknown>>(
        `SELECT task.*,detail.*,run.temporal_workflow_id,run.workflow_id,run.workflow_version,
          coalesce(detail.assignee_user_id=$3,false) can_submit,
          (detail.assignee_user_id IS NULL AND (detail.assignee_group_id IS NULL OR EXISTS (
            SELECT 1 FROM workspace_group_memberships eligibility
            WHERE eligibility.workspace_id=task.workspace_id AND eligibility.group_id=detail.assignee_group_id AND eligibility.user_id=$3
          ))) can_claim,
          coalesce((SELECT jsonb_agg(draft) FROM human_task_drafts draft WHERE draft.workspace_id=task.workspace_id AND draft.task_id=task.id),'[]'::jsonb) drafts,
          coalesce((SELECT jsonb_agg(submission ORDER BY revision) FROM human_task_submissions submission WHERE submission.workspace_id=task.workspace_id AND submission.task_id=task.id),'[]'::jsonb) submissions
         FROM task_runs task JOIN human_task_details detail ON detail.workspace_id=task.workspace_id AND detail.task_id=task.id
         JOIN workflow_runs run ON run.workspace_id=task.workspace_id AND run.id=task.run_id
         WHERE task.workspace_id=$1 AND task.id=$2`,
        [context.workspaceId, taskId, context.principalId]
      );
      const task = result.rows[0];
      if (task) task.form_schema = normalizeHumanForm(task.form_schema, String(task.node_key));
      return task;
    });
  }

  async claim(context: TenantContext, taskId: string, input: unknown) {
    const claim = taskClaimSchema.parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<{ assignment_version: string }>(
        `UPDATE human_task_details SET assignee_user_id=$3,claimed_at=clock_timestamp(),assignment_version=assignment_version+1,updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND task_id=$2 AND assignee_user_id IS NULL AND assignment_version=$4
         RETURNING assignment_version`,
        [context.workspaceId, taskId, context.principalId, claim.expectedVersion]
      );
      if (!result.rows[0]) throw new HumanTaskConflictError("TASK_ALREADY_CLAIMED");
      await client.query(
        `UPDATE task_runs SET state='running',state_version=state_version+1,started_at=coalesce(started_at,clock_timestamp()),updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND id=$2 AND state='ready'`,
        [context.workspaceId, taskId]
      );
      await this.event(client, context, taskId, "task.claimed", {
        idempotencyKey: claim.idempotencyKey
      });
      return { assignmentVersion: Number(result.rows[0].assignment_version) };
    });
  }

  async saveDraft(context: TenantContext, taskId: string, input: unknown) {
    const draft = taskDraftSchema.parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const existing = await client.query<{ version: string }>(
        `SELECT version FROM human_task_drafts WHERE workspace_id=$1 AND task_id=$2 AND user_id=$3 FOR UPDATE`,
        [context.workspaceId, taskId, context.principalId]
      );
      if (Number(existing.rows[0]?.version ?? 0) !== draft.expectedVersion)
        throw new HumanTaskConflictError("STALE_DRAFT_VERSION");
      const result = await client.query<{ version: string }>(
        `INSERT INTO human_task_drafts(workspace_id,task_id,user_id,version,schema_version,values)
         VALUES ($1,$2,$3,1,$4,$5)
         ON CONFLICT (workspace_id,task_id,user_id) DO UPDATE SET version=human_task_drafts.version+1,schema_version=excluded.schema_version,values=excluded.values,updated_at=clock_timestamp()
         RETURNING version`,
        [context.workspaceId, taskId, context.principalId, draft.schemaVersion, draft.values]
      );
      return { version: Number(result.rows[0]!.version) };
    });
  }

  async assign(context: TenantContext, taskId: string, input: unknown) {
    const assignment = taskAssignmentSchema.parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      if (assignment.assigneeUserId)
        await this.assertEligible(client, context, assignment.assigneeUserId);
      const result = await client.query<{ assignment_version: string }>(
        `UPDATE human_task_details SET assignee_user_id=$3,assignee_group_id=$4,claimed_at=NULL,
          assignment_version=assignment_version+1,updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND task_id=$2 AND assignment_version=$5 RETURNING assignment_version`,
        [
          context.workspaceId,
          taskId,
          assignment.assigneeUserId ?? null,
          assignment.assigneeGroupId ?? null,
          assignment.expectedVersion
        ]
      );
      if (!result.rows[0]) throw new HumanTaskConflictError("STALE_ASSIGNMENT_VERSION");
      await this.event(client, context, taskId, "task.reassigned", { reason: assignment.reason });
      return { assignmentVersion: Number(result.rows[0].assignment_version) };
    });
  }

  async unclaim(context: TenantContext, taskId: string, input: unknown) {
    const action = taskActionSchema.parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<{ assignment_version: string }>(
        `UPDATE human_task_details SET assignee_user_id=NULL,claimed_at=NULL,assignment_version=assignment_version+1,updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND task_id=$2 AND assignee_user_id=$3 AND assignment_version=$4 RETURNING assignment_version`,
        [context.workspaceId, taskId, context.principalId, action.expectedVersion]
      );
      if (!result.rows[0]) throw new HumanTaskConflictError("STALE_OR_UNAUTHORIZED_UNCLAIM");
      await client.query(
        `UPDATE task_runs SET state='ready',state_version=state_version+1,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2 AND state='running'`,
        [context.workspaceId, taskId]
      );
      await this.event(client, context, taskId, "task.unclaimed", {
        reason: action.reason,
        idempotencyKey: action.idempotencyKey
      });
      return { assignmentVersion: Number(result.rows[0].assignment_version) };
    });
  }

  async delegate(context: TenantContext, taskId: string, input: unknown) {
    const delegation = taskDelegationSchema.parse(input);
    if (delegation.delegateUserId === context.principalId)
      throw new HumanTaskAuthorizationError("SELF_DELEGATION");
    return withTenantTransaction(this.pool, context, async (client) => {
      await this.assertEligible(client, context, delegation.delegateUserId);
      const owned = await client.query(
        `SELECT 1 FROM human_task_details WHERE workspace_id=$1 AND task_id=$2 AND assignee_user_id=$3 AND assignment_version=$4 FOR UPDATE`,
        [context.workspaceId, taskId, context.principalId, delegation.expectedVersion]
      );
      if (!owned.rows[0]) throw new HumanTaskConflictError("STALE_OR_UNAUTHORIZED_DELEGATION");
      const id = createId();
      await client.query(
        `INSERT INTO task_delegations(workspace_id,id,task_id,delegator_id,delegate_id,starts_at,ends_at,retain_watcher,recallable,state,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',$10)`,
        [
          context.workspaceId,
          id,
          taskId,
          context.principalId,
          delegation.delegateUserId,
          delegation.startsAt,
          delegation.endsAt,
          delegation.retainWatcher,
          delegation.recallable,
          delegation.reason
        ]
      );
      if (delegation.retainWatcher)
        await client.query(
          `INSERT INTO task_watchers(workspace_id,task_id,user_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,
          [context.workspaceId, taskId, context.principalId]
        );
      await client.query(
        `UPDATE human_task_details SET assignee_user_id=$3,assignment_version=assignment_version+1,claimed_at=NULL,updated_at=clock_timestamp() WHERE workspace_id=$1 AND task_id=$2`,
        [context.workspaceId, taskId, delegation.delegateUserId]
      );
      await this.event(client, context, taskId, "task.delegated", {
        delegationId: id,
        endsAt: delegation.endsAt
      });
      return { id };
    });
  }

  async requestClarification(context: TenantContext, taskId: string, input: unknown) {
    const action = taskActionSchema.parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query(
        `UPDATE task_runs task SET state='waiting',state_version=state_version+1,updated_at=clock_timestamp() FROM human_task_details detail WHERE task.workspace_id=$1 AND task.id=$2 AND detail.workspace_id=task.workspace_id AND detail.task_id=task.id AND detail.assignee_user_id=$3 AND task.state IN ('ready','running') AND task.state_version=$4 RETURNING task.id`,
        [context.workspaceId, taskId, context.principalId, action.expectedVersion]
      );
      if (!result.rows[0]) throw new HumanTaskConflictError("STALE_TASK_VERSION");
      await this.event(client, context, taskId, "task.clarification_requested", {
        reason: action.reason,
        idempotencyKey: action.idempotencyKey
      });
      return { accepted: true as const };
    });
  }

  async reopen(context: TenantContext, taskId: string, input: unknown) {
    const action = taskActionSchema.parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const source = await client.query<{
        run_id: string;
        node_key: string;
        node_kind: string;
        execution_path: string;
        queue_class: string;
        runtime_config: Record<string, unknown>;
        maximum_attempts: number;
        timeout_ms: number;
        output_revision: number;
      }>(
        `SELECT task.run_id,task.node_key,task.node_kind,task.execution_path,task.queue_class,task.runtime_config,task.maximum_attempts,task.timeout_ms,detail.output_revision FROM task_runs task JOIN human_task_details detail ON detail.workspace_id=task.workspace_id AND detail.task_id=task.id WHERE task.workspace_id=$1 AND task.id=$2 AND task.state='succeeded' AND task.state_version=$3 FOR UPDATE`,
        [context.workspaceId, taskId, action.expectedVersion]
      );
      const row = source.rows[0];
      if (!row) throw new HumanTaskConflictError("TASK_NOT_REOPENABLE");
      if (row.runtime_config.allowReopen !== true)
        throw new HumanTaskAuthorizationError("REOPEN_POLICY_DENIED");
      const id = createId();
      await client.query(
        `INSERT INTO task_runs(workspace_id,id,run_id,node_key,node_kind,instance_key,execution_path,queue_class,runtime_config,maximum_attempts,timeout_ms,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'ready')`,
        [
          context.workspaceId,
          id,
          row.run_id,
          row.node_key,
          row.node_kind,
          `reopen-${row.output_revision + 1}-${id}`,
          `${row.execution_path}/reopen-${row.output_revision + 1}`,
          row.queue_class,
          row.runtime_config,
          row.maximum_attempts,
          row.timeout_ms
        ]
      );
      await client.query(
        `INSERT INTO human_task_details(workspace_id,task_id,created_by,priority,form_schema,form_schema_version,reopened_from_task_id,output_revision) SELECT workspace_id,$3,$4,priority,form_schema,form_schema_version,task_id,output_revision FROM human_task_details WHERE workspace_id=$1 AND task_id=$2`,
        [context.workspaceId, taskId, id, context.principalId]
      );
      await this.event(client, context, taskId, "task.reopened", {
        reopenedTaskId: id,
        reason: action.reason,
        idempotencyKey: action.idempotencyKey
      });
      return { id };
    });
  }

  async watch(context: TenantContext, taskId: string) {
    await withTenantTransaction(this.pool, context, async (client) => {
      await client.query(
        `INSERT INTO task_watchers(workspace_id,task_id,user_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,
        [context.workspaceId, taskId, context.principalId]
      );
      await this.event(client, context, taskId, "task.watched", {});
    });
  }

  async unwatch(context: TenantContext, taskId: string) {
    await withTenantTransaction(this.pool, context, async (client) => {
      await client.query(
        `DELETE FROM task_watchers WHERE workspace_id=$1 AND task_id=$2 AND user_id=$3`,
        [context.workspaceId, taskId, context.principalId]
      );
      await this.event(client, context, taskId, "task.unwatched", {});
    });
  }

  async attempts(context: TenantContext, taskId: string) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT attempt,state,error_code,usage,started_at,finished_at FROM task_attempts WHERE workspace_id=$1 AND task_id=$2 ORDER BY attempt`,
            [context.workspaceId, taskId]
          )
        ).rows
    );
  }

  async bulk(context: TenantContext, input: unknown) {
    const action = taskBulkActionSchema.parse(input);
    if (action.action === "complete") {
      const value = z
        .object({
          values: z.record(z.string(), z.unknown()),
          schemaVersion: z.number().int().positive()
        })
        .parse(action.value);
      for (const taskId of action.taskRunIds) {
        const task = await this.get(context, taskId);
        if (!task) throw new HumanTaskConflictError("BULK_TASK_NOT_FOUND");
        await this.submit(context, taskId, {
          values: value.values,
          schemaVersion: value.schemaVersion,
          expectedVersion: Number(task.state_version),
          idempotencyKey: `${action.idempotencyKey}-${taskId}`.slice(0, 160)
        });
      }
      return { updated: action.taskRunIds.length };
    }
    return withTenantTransaction(this.pool, context, async (client) => {
      const result =
        action.action === "assign"
          ? await client.query(
              `UPDATE human_task_details SET assignee_user_id=$3::uuid,assignee_group_id=NULL,assignment_version=assignment_version+1,updated_at=clock_timestamp() WHERE workspace_id=$1 AND task_id=ANY($2::uuid[])`,
              [context.workspaceId, action.taskRunIds, z.uuid().parse(action.value)]
            )
          : action.action === "priority"
            ? await client.query(
                `UPDATE human_task_details SET priority=$3,updated_at=clock_timestamp() WHERE workspace_id=$1 AND task_id=ANY($2::uuid[])`,
                [
                  context.workspaceId,
                  action.taskRunIds,
                  z.enum(["low", "normal", "high", "urgent"]).parse(action.value)
                ]
              )
            : await client.query(
                `UPDATE human_task_details SET due_at=$3::timestamptz,updated_at=clock_timestamp() WHERE workspace_id=$1 AND task_id=ANY($2::uuid[])`,
                [context.workspaceId, action.taskRunIds, z.iso.datetime().parse(action.value)]
              );
      return { updated: result.rowCount ?? 0 };
    });
  }

  async submit(context: TenantContext, taskId: string, input: unknown) {
    const submission = taskSubmissionSchema.parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const task = await client.query<{
        run_id: string;
        node_key: string;
        state: string;
        state_version: string;
        form_schema: HumanForm;
        form_schema_version: number;
        assignee_user_id: string | null;
        output_revision: number;
        temporal_workflow_id: string;
      }>(
        `SELECT task.run_id,task.node_key,task.state,task.state_version,detail.form_schema,detail.form_schema_version,
          detail.assignee_user_id,detail.output_revision,run.temporal_workflow_id
         FROM task_runs task JOIN human_task_details detail ON detail.workspace_id=task.workspace_id AND detail.task_id=task.id
         JOIN workflow_runs run ON run.workspace_id=task.workspace_id AND run.id=task.run_id
         WHERE task.workspace_id=$1 AND task.id=$2 FOR UPDATE OF task,detail`,
        [context.workspaceId, taskId]
      );
      const row = task.rows[0];
      if (!row) throw new Error("TASK_NOT_FOUND");
      if (row.assignee_user_id !== context.principalId)
        throw new HumanTaskAuthorizationError("TASK_NOT_ASSIGNED");
      const duplicate = await client.query<{ id: string }>(
        `SELECT id FROM human_task_submissions WHERE workspace_id=$1 AND task_id=$2 AND idempotency_key=$3`,
        [context.workspaceId, taskId, submission.idempotencyKey]
      );
      if (duplicate.rows[0])
        return {
          id: duplicate.rows[0].id,
          temporalWorkflowId: row.temporal_workflow_id,
          nodeKey: row.node_key
        };
      if (
        Number(row.state_version) !== submission.expectedVersion ||
        !["ready", "running"].includes(row.state)
      )
        throw new HumanTaskConflictError("STALE_TASK_VERSION");
      if (row.form_schema_version !== submission.schemaVersion)
        throw new HumanTaskConflictError("STALE_FORM_SCHEMA");
      const form = normalizeHumanForm(row.form_schema, row.node_key);
      const errors = validateHumanSubmission(form, submission.values);
      if (Object.keys(errors).length)
        throw new HumanTaskConflictError(`INVALID_SUBMISSION:${JSON.stringify(errors)}`);
      const id = createId();
      const revision = row.output_revision + 1;
      await client.query(
        `INSERT INTO human_task_submissions(workspace_id,id,task_id,revision,schema_version,submitted_by,idempotency_key,values)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          context.workspaceId,
          id,
          taskId,
          revision,
          submission.schemaVersion,
          context.principalId,
          submission.idempotencyKey,
          submission.values
        ]
      );
      await client.query(
        `UPDATE task_runs SET state='succeeded',state_version=state_version+1,output=$3,finished_at=clock_timestamp(),updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND id=$2`,
        [context.workspaceId, taskId, submission.values]
      );
      await client.query(
        `UPDATE human_task_details SET output_revision=$3,completed_by=$4,updated_at=clock_timestamp() WHERE workspace_id=$1 AND task_id=$2`,
        [context.workspaceId, taskId, revision, context.principalId]
      );
      await client.query(
        `UPDATE task_dependencies SET state='satisfied' WHERE workspace_id=$1 AND run_id=$2 AND depends_on_task_id=$3`,
        [context.workspaceId, row.run_id, taskId]
      );
      await this.event(client, context, taskId, "task.submitted", { revision, submissionId: id });
      return { id, temporalWorkflowId: row.temporal_workflow_id, nodeKey: row.node_key };
    });
  }

  private async event(
    client: PoolClient,
    context: TenantContext,
    taskId: string,
    eventType: string,
    payload: object
  ) {
    await client.query(
      `INSERT INTO run_events(workspace_id,run_id,sequence,event_type,actor_type,actor_id,payload)
       SELECT $1,task.run_id,coalesce((SELECT max(sequence) FROM run_events WHERE workspace_id=$1 AND run_id=task.run_id),0)+1,$3,'user',$4,$5
       FROM task_runs task WHERE task.workspace_id=$1 AND task.id=$2`,
      [context.workspaceId, taskId, eventType, context.principalId, payload]
    );
  }

  private async assertEligible(client: PoolClient, context: TenantContext, userId: string) {
    const result = await client.query(
      `SELECT 1 FROM memberships WHERE workspace_id=$1 AND user_id=$2 AND state='active'`,
      [context.workspaceId, userId]
    );
    if (!result.rows[0]) throw new HumanTaskAuthorizationError("DELEGATE_NOT_ELIGIBLE");
  }
}
