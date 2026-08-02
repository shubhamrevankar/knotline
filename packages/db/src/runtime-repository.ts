import {
  approvalPacketSchema,
  approvalPolicySchema,
  assertRunTransition,
  compileRuntimePlan,
  type RuntimePlanNode,
  type RunState,
  type WorkflowDefinition
} from "@knotline/contracts";
import type { Pool, PoolClient } from "pg";

import { withTenantTransaction, type TenantContext } from "./context.js";
import { resolveApprovalSteps } from "./approval-repository.js";
import { normalizeHumanForm } from "./human-form.js";
import { contentHash, createId } from "./values.js";

export interface RuntimeRunRecord {
  readonly id: string;
  readonly workflowId: string;
  readonly workflowVersion: number;
  readonly state: RunState;
  readonly stateVersion: number;
  readonly fencingToken: number;
  readonly temporalWorkflowId: string;
  readonly reservationId: string;
  readonly createdAt: string;
  readonly plan?: ReturnType<typeof compileRuntimePlan>;
}

export interface StartRunInput {
  readonly input: Readonly<Record<string, unknown>>;
  readonly idempotencyKey: string;
  readonly maximumQuantity: string;
  readonly policyVersion: string;
}

export interface PendingRuntimeStart {
  readonly workspaceId: string;
  readonly principalId: string;
  readonly runId: string;
  readonly temporalWorkflowId: string;
  readonly plan: readonly RuntimePlanNode[];
}

export interface RuntimeProjection extends Record<string, unknown> {
  readonly state: RunState;
  readonly temporal_workflow_id: string;
  readonly tasks: readonly Record<string, unknown>[];
  readonly events: readonly Record<string, unknown>[];
}

export class RuntimeConflictError extends Error {}
export class AdmissionDeniedError extends Error {}

export interface RuntimeRepository {
  startRun(
    context: TenantContext,
    workflowId: string,
    input: StartRunInput
  ): Promise<RuntimeRunRecord>;
  run(context: TenantContext, runId: string): Promise<RuntimeProjection | undefined>;
  events(
    context: TenantContext,
    runId: string
  ): Promise<readonly Record<string, unknown>[] | undefined>;
  workflowRuns(
    context: TenantContext,
    workflowId: string,
    options?: { readonly state?: RunState; readonly limit?: number }
  ): Promise<readonly Record<string, unknown>[]>;
  pendingStarts(context: TenantContext): Promise<PendingRuntimeStart[]>;
  markStartDispatched(context: TenantContext, runId: string): Promise<void>;
  taskExecutionContext(
    context: TenantContext,
    runId: string,
    nodeKey: string
  ): Promise<{
    readonly input: Record<string, unknown>;
    readonly nodes: Record<string, { readonly output: unknown }>;
  }>;
  completeSyntheticTask(
    context: TenantContext,
    runId: string,
    nodeKey: string,
    workerIdentity: string,
    output: unknown
  ): Promise<void>;
  startTask(
    context: TenantContext,
    runId: string,
    nodeKey: string,
    workerIdentity: string
  ): Promise<void>;
  failTask(
    context: TenantContext,
    runId: string,
    nodeKey: string,
    workerIdentity: string,
    errorCode: string
  ): Promise<void>;
}

export class PostgresRuntimeRepository implements RuntimeRepository {
  constructor(private readonly pool: Pool) {}

  async startRun(context: TenantContext, workflowId: string, input: StartRunInput) {
    return withTenantTransaction(this.pool, context, async (client): Promise<RuntimeRunRecord> => {
      const duplicate = await client.query<{
        id: string;
        workflow_version: number;
        state: RunState;
        state_version: string;
        fencing_token: string;
        temporal_workflow_id: string;
        created_at: Date;
      }>(
        `SELECT id,workflow_version,state,state_version,fencing_token,temporal_workflow_id,created_at
          FROM workflow_runs WHERE workspace_id=$1 AND workflow_id=$2 AND idempotency_key=$3`,
        [context.workspaceId, workflowId, input.idempotencyKey]
      );
      if (duplicate.rows[0]) {
        const row = duplicate.rows[0];
        const reservation = await client.query<{ id: string }>(
          `SELECT id FROM admission_reservations WHERE workspace_id=$1 AND operation_id=$2`,
          [context.workspaceId, `run:${row.id}`]
        );
        return this.mapRun(row, workflowId, reservation.rows[0]?.id ?? "");
      }
      const versionResult = await client.query<{ version: number; definition: WorkflowDefinition }>(
        `SELECT version,definition FROM workflow_versions
         WHERE workspace_id=$1 AND workflow_id=$2 AND state='published'
         ORDER BY version DESC LIMIT 1`,
        [context.workspaceId, workflowId]
      );
      const version = versionResult.rows[0];
      if (!version) throw new Error("PUBLISHED_WORKFLOW_REQUIRED");

      const disabledControl = await client.query(
        `SELECT 1 FROM runtime_control_switches
         WHERE workspace_id=$1 AND scope IN ('workspace_start','global_start') AND enabled=false LIMIT 1`,
        [context.workspaceId]
      );
      if (disabledControl.rows[0]) throw new AdmissionDeniedError("RUNTIME_START_DISABLED");

      await client.query(
        `INSERT INTO entitlement_policies(workspace_id,version,meter,hard_limit,soft_limit)
         VALUES ($1,$2,'workflow.dispatch',1000000,800000) ON CONFLICT DO NOTHING`,
        [context.workspaceId, input.policyVersion]
      );
      let period = await client.query<{
        id: string;
        hard_limit: string;
        committed_units: string;
        reserved_units: string;
        spend_stop: boolean;
      }>(
        `SELECT p.id,e.hard_limit,p.committed_units,p.reserved_units,p.spend_stop
         FROM budget_periods p JOIN entitlement_policies e
          ON e.workspace_id=p.workspace_id AND e.version=p.policy_version AND e.meter=p.meter
         WHERE p.workspace_id=$1 AND p.policy_version=$2 AND p.meter='workflow.dispatch'
           AND p.starts_at <= clock_timestamp() AND p.ends_at > clock_timestamp()
         FOR UPDATE OF p`,
        [context.workspaceId, input.policyVersion]
      );
      if (!period.rows[0]) {
        const periodId = createId();
        await client.query(
          `INSERT INTO budget_periods(workspace_id,id,policy_version,meter,starts_at,ends_at)
           VALUES ($1,$2,$3,'workflow.dispatch',date_trunc('month',clock_timestamp()),date_trunc('month',clock_timestamp())+interval '1 month')`,
          [context.workspaceId, periodId, input.policyVersion]
        );
        period = await client.query(
          `SELECT p.id,e.hard_limit,p.committed_units,p.reserved_units,p.spend_stop
           FROM budget_periods p JOIN entitlement_policies e
            ON e.workspace_id=p.workspace_id AND e.version=p.policy_version AND e.meter=p.meter
           WHERE p.workspace_id=$1 AND p.id=$2 FOR UPDATE OF p`,
          [context.workspaceId, periodId]
        );
      }
      const current = period.rows[0];
      if (
        !current ||
        current.spend_stop ||
        BigInt(current.committed_units) +
          BigInt(current.reserved_units) +
          BigInt(input.maximumQuantity) >
          BigInt(current.hard_limit)
      )
        throw new AdmissionDeniedError("ADMISSION_HARD_LIMIT");

      const runId = createId();
      const reservationId = createId();
      const workflowExecutionId = `knotline-run-${runId}`;
      const requestHash = contentHash(input);
      await client.query(
        `INSERT INTO admission_reservations(workspace_id,id,period_id,operation_id,idempotency_key,request_hash,maximum_units,state,lease_expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'reserved',clock_timestamp()+interval '5 minutes')`,
        [
          context.workspaceId,
          reservationId,
          current.id,
          `run:${runId}`,
          `admission:${input.idempotencyKey}`,
          requestHash,
          input.maximumQuantity
        ]
      );
      await client.query(
        `UPDATE budget_periods SET reserved_units=reserved_units+$3,version=version+1 WHERE workspace_id=$1 AND id=$2`,
        [context.workspaceId, current.id, input.maximumQuantity]
      );
      await client.query(
        `INSERT INTO admission_ledger_entries(workspace_id,id,reservation_id,entry_type,units,fencing_token)
         VALUES ($1,$2,$3,'reserve',$4,1)`,
        [context.workspaceId, createId(), reservationId, input.maximumQuantity]
      );
      await client.query(
        `INSERT INTO workflow_runs(workspace_id,id,workflow_id,workflow_version,state,temporal_workflow_id,idempotency_key,input,policy_snapshot,created_by)
         VALUES ($1,$2,$3,$4,'queued',$5,$6,$7,$8,$9)`,
        [
          context.workspaceId,
          runId,
          workflowId,
          version.version,
          workflowExecutionId,
          input.idempotencyKey,
          input.input,
          {
            policyVersion: input.policyVersion,
            reservationId,
            maximumQuantity: input.maximumQuantity
          },
          context.principalId
        ]
      );

      const plan = compileRuntimePlan(version.definition);
      const ids = new Map<string, string>();
      for (const node of plan) {
        const taskId = createId();
        ids.set(node.key, taskId);
        await client.query(
          `INSERT INTO task_runs(workspace_id,id,run_id,node_key,node_kind,instance_key,execution_path,queue_class,runtime_config,maximum_attempts,timeout_ms,state)
           VALUES ($1,$2,$3,$4,$5,'root',$6,$7,$8,$9,$10,$11)`,
          [
            context.workspaceId,
            taskId,
            runId,
            node.key,
            node.kind,
            `root/${node.key}`,
            node.queue,
            node.configuration,
            node.maxAttempts,
            node.timeoutMs,
            node.dependencies.length ? "pending" : "ready"
          ]
        );
        if (node.kind === "human")
          await client.query(
            `INSERT INTO human_task_details(workspace_id,task_id,created_by,assignee_user_id,priority,form_schema,form_schema_version)
             VALUES ($1,$2,$3,$4,'normal',$5,1)`,
            [
              context.workspaceId,
              taskId,
              context.principalId,
              node.configuration.assignment === "workflow_initiator" ? context.principalId : null,
              normalizeHumanForm(node.configuration.formSchema, node.key)
            ]
          );
        if (node.kind === "approval") {
          const policy = approvalPolicySchema.parse(
            node.configuration.approvalPolicy ?? {
              schemaVersion: 1,
              version: 1,
              strategy: "parallel",
              steps: [
                {
                  key: "review",
                  selector: {
                    type: "user",
                    userIds: node.configuration.approverUserIds ?? [context.principalId]
                  },
                  mode: "single",
                  order: 0,
                  allowAbstain: true
                }
              ],
              allowSelfApproval: node.configuration.allowSelfApproval === true,
              separationOfDuties: true,
              reasonRequired: true,
              autoOutcome: node.configuration.autoOutcome ?? "none"
            }
          );
          const packet = approvalPacketSchema.parse(
            node.configuration.approvalPacket ?? {
              title:
                typeof node.configuration.title === "string" ? node.configuration.title : node.key,
              proposedAction:
                typeof node.configuration.proposedAction === "string"
                  ? node.configuration.proposedAction
                  : `Authorize workflow node ${node.key}`,
              affectedResources: [],
              diff: node.configuration.diff ?? {},
              risk: {
                level: node.configuration.riskLevel ?? "medium",
                findings: node.configuration.riskFindings ?? []
              },
              evidence: [],
              provenance: {
                workflowId,
                workflowVersion: version.version,
                nodeKey: node.key
              },
              expiresAt: new Date(Date.now() + node.timeoutMs).toISOString()
            }
          );
          const approvalId = createId();
          const resolved = await resolveApprovalSteps(client, context, policy, packet);
          const packetHash = contentHash(packet);
          await client.query(
            `INSERT INTO approvals(workspace_id,id,task_id,requester_id,policy_snapshot,packet,packet_hash,state,expires_at)
             VALUES($1,$2,$3,$4,$5,$6,$7,'PENDING',$8)`,
            [
              context.workspaceId,
              approvalId,
              taskId,
              context.principalId,
              policy,
              packet,
              packetHash,
              packet.expiresAt
            ]
          );
          const firstOrder = Math.min(...resolved.map(({ order }) => order));
          for (const step of resolved)
            await client.query(
              `INSERT INTO approval_steps(workspace_id,approval_id,step_key,step_order,mode,quorum,eligible_user_ids,resolution_evidence,state)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
              [
                context.workspaceId,
                approvalId,
                step.key,
                step.order,
                step.mode,
                step.quorum ?? null,
                step.eligibleUserIds,
                { selector: step.selector, policyVersion: policy.version },
                step.order === firstOrder ? "active" : "pending"
              ]
            );
          await client.query(
            `INSERT INTO sla_timer_events(workspace_id,id,approval_id,timer_type,tier,due_at,temporal_timer_id,idempotency_key)
             VALUES($1,$2,$3,'expiry',0,$4,$5,$6)`,
            [
              context.workspaceId,
              createId(),
              approvalId,
              packet.expiresAt,
              `approval-${approvalId}-expiry`,
              `${approvalId}:expiry:0`
            ]
          );
          await this.appendEvent(
            client,
            context.workspaceId,
            runId,
            "approval.requested",
            "user",
            context.principalId,
            {
              approvalId,
              nodeKey: node.key,
              packetHash
            }
          );
        }
      }
      for (const node of plan)
        for (const dependency of node.dependencies)
          await client.query(
            `INSERT INTO task_dependencies(workspace_id,run_id,task_id,depends_on_task_id) VALUES ($1,$2,$3,$4)`,
            [context.workspaceId, runId, ids.get(node.key), ids.get(dependency)]
          );
      await this.appendEvent(
        client,
        context.workspaceId,
        runId,
        "run.queued",
        "user",
        context.principalId,
        { reservationId }
      );
      await client.query(
        `INSERT INTO outbox_events(workspace_id,id,aggregate_type,aggregate_id,event_type,payload)
         VALUES ($1,$2,'workflow_run',$3,'run.start.requested',$4)`,
        [context.workspaceId, createId(), runId, { runId, workflowExecutionId }]
      );
      const row = await client.query<{
        id: string;
        workflow_version: number;
        state: RunState;
        state_version: string;
        fencing_token: string;
        temporal_workflow_id: string;
        created_at: Date;
      }>(
        `SELECT id,workflow_version,state,state_version,fencing_token,temporal_workflow_id,created_at FROM workflow_runs WHERE workspace_id=$1 AND id=$2`,
        [context.workspaceId, runId]
      );
      return { ...this.mapRun(row.rows[0]!, workflowId, reservationId), plan };
    });
  }

  async transitionRun(
    context: TenantContext,
    runId: string,
    expected: RunState,
    expectedVersion: number,
    fencingToken: number,
    next: RunState,
    eventType: string
  ) {
    assertRunTransition(expected, next);
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<{
        workflow_id: string;
        workflow_version: number;
        state_version: string;
        fencing_token: string;
        temporal_workflow_id: string;
        created_at: Date;
        policy_snapshot: { reservationId?: string; maximumQuantity?: string };
      }>(
        `UPDATE workflow_runs SET state=$6,state_version=state_version+1,updated_at=clock_timestamp(),
          started_at=CASE WHEN $6='running' AND started_at IS NULL THEN clock_timestamp() ELSE started_at END,
          finished_at=CASE WHEN $6 IN ('cancelled','succeeded','failed','policy_stopped') THEN clock_timestamp() ELSE finished_at END
         WHERE workspace_id=$1 AND id=$2 AND state=$3 AND state_version=$4 AND fencing_token=$5
         RETURNING workflow_id,workflow_version,state_version,fencing_token,temporal_workflow_id,created_at,policy_snapshot`,
        [context.workspaceId, runId, expected, expectedVersion, fencingToken, next]
      );
      if (!result.rows[0]) throw new RuntimeConflictError("STALE_RUN_FENCE");
      await this.appendEvent(
        client,
        context.workspaceId,
        runId,
        eventType,
        "system",
        context.principalId,
        { from: expected, to: next }
      );
      if (["cancelled", "succeeded", "failed", "policy_stopped"].includes(next)) {
        const reservationId = result.rows[0].policy_snapshot.reservationId;
        const maximumQuantity = result.rows[0].policy_snapshot.maximumQuantity;
        if (reservationId && maximumQuantity) {
          const finalized = next === "succeeded";
          const reservation = await client.query<{ period_id: string; state: string }>(
            `UPDATE admission_reservations SET state=$3,used_units=$4,updated_at=clock_timestamp()
             WHERE workspace_id=$1 AND id=$2 AND state='reserved'
             RETURNING period_id,state`,
            [
              context.workspaceId,
              reservationId,
              finalized ? "finalized" : "released",
              finalized ? maximumQuantity : "0"
            ]
          );
          if (reservation.rows[0]) {
            await client.query(
              `UPDATE budget_periods SET reserved_units=reserved_units-$3,
                committed_units=committed_units+$4,version=version+1
               WHERE workspace_id=$1 AND id=$2`,
              [
                context.workspaceId,
                reservation.rows[0].period_id,
                maximumQuantity,
                finalized ? maximumQuantity : "0"
              ]
            );
            await client.query(
              `INSERT INTO admission_ledger_entries(workspace_id,id,reservation_id,entry_type,units,fencing_token,metadata)
               VALUES ($1,$2,$3,$4,$5,$6,$7)`,
              [
                context.workspaceId,
                createId(),
                reservationId,
                finalized ? "finalize" : "release",
                maximumQuantity,
                fencingToken,
                { runId, terminalState: next }
              ]
            );
          }
        }
      }
      return true;
    });
  }

  async completeSyntheticTask(
    context: TenantContext,
    runId: string,
    nodeKey: string,
    workerIdentity: string,
    output: unknown
  ) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const task = await client.query<{ id: string; state: string; fencing_token: string }>(
        `SELECT id,state,fencing_token FROM task_runs
         WHERE workspace_id=$1 AND run_id=$2 AND node_key=$3 FOR UPDATE`,
        [context.workspaceId, runId, nodeKey]
      );
      const row = task.rows[0];
      if (!row) throw new Error("TASK_NOT_FOUND");
      if (row.state === "succeeded") return;
      const blocked = await client.query(
        `SELECT 1 FROM task_dependencies WHERE workspace_id=$1 AND task_id=$2 AND state!='satisfied' LIMIT 1`,
        [context.workspaceId, row.id]
      );
      if (blocked.rows[0]) throw new RuntimeConflictError("TASK_DEPENDENCIES_PENDING");
      const activeAttempt =
        row.state === "running"
          ? await client.query<{ attempt: number }>(
              `SELECT attempt FROM task_attempts WHERE workspace_id=$1 AND task_id=$2 AND state='started' ORDER BY attempt DESC LIMIT 1`,
              [context.workspaceId, row.id]
            )
          : { rows: [] as { attempt: number }[] };
      let attemptNumber = activeAttempt.rows[0]?.attempt;
      if (!attemptNumber) {
        const attempt = await client.query<{ attempt: number }>(
          `SELECT coalesce(max(attempt),0)+1 AS attempt FROM task_attempts WHERE workspace_id=$1 AND task_id=$2`,
          [context.workspaceId, row.id]
        );
        attemptNumber = attempt.rows[0]?.attempt ?? 1;
        await client.query(
          `UPDATE task_runs SET state='running',state_version=state_version+1,started_at=coalesce(started_at,clock_timestamp()),updated_at=clock_timestamp()
           WHERE workspace_id=$1 AND id=$2`,
          [context.workspaceId, row.id]
        );
        await client.query(
          `INSERT INTO task_attempts(workspace_id,id,task_id,attempt,state,worker_identity,fencing_token)
           VALUES ($1,$2,$3,$4,'started',$5,$6)`,
          [
            context.workspaceId,
            createId(),
            row.id,
            attemptNumber,
            workerIdentity,
            row.fencing_token
          ]
        );
        await this.appendEvent(
          client,
          context.workspaceId,
          runId,
          "task.started",
          "worker",
          workerIdentity,
          { nodeKey, attempt: attemptNumber }
        );
      }
      await client.query(
        `UPDATE task_runs SET state='succeeded',state_version=state_version+1,output=$3,finished_at=clock_timestamp(),updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND id=$2`,
        [context.workspaceId, row.id, output]
      );
      await client.query(
        `UPDATE task_attempts SET state='succeeded',finished_at=clock_timestamp()
         WHERE workspace_id=$1 AND task_id=$2 AND attempt=$3`,
        [context.workspaceId, row.id, attemptNumber]
      );
      await client.query(
        `UPDATE task_dependencies SET state='satisfied'
         WHERE workspace_id=$1 AND run_id=$2 AND depends_on_task_id=$3`,
        [context.workspaceId, runId, row.id]
      );
      await client.query(
        `UPDATE task_runs task SET state='ready',state_version=state_version+1,updated_at=clock_timestamp()
         WHERE task.workspace_id=$1 AND task.run_id=$2 AND task.state='pending'
           AND NOT EXISTS (SELECT 1 FROM task_dependencies dependency WHERE dependency.workspace_id=task.workspace_id AND dependency.task_id=task.id AND dependency.state!='satisfied')`,
        [context.workspaceId, runId]
      );
      await this.appendEvent(
        client,
        context.workspaceId,
        runId,
        "task.succeeded",
        "worker",
        workerIdentity,
        { nodeKey, attempt: attemptNumber }
      );
    });
  }

  async startTask(context: TenantContext, runId: string, nodeKey: string, workerIdentity: string) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const task = await client.query<{ id: string; state: string; fencing_token: string }>(
        `SELECT id,state,fencing_token FROM task_runs
         WHERE workspace_id=$1 AND run_id=$2 AND node_key=$3 FOR UPDATE`,
        [context.workspaceId, runId, nodeKey]
      );
      const row = task.rows[0];
      if (!row) throw new Error("TASK_NOT_FOUND");
      if (["running", "succeeded"].includes(row.state)) return;
      const blocked = await client.query(
        `SELECT 1 FROM task_dependencies WHERE workspace_id=$1 AND task_id=$2 AND state!='satisfied' LIMIT 1`,
        [context.workspaceId, row.id]
      );
      if (blocked.rows[0]) throw new RuntimeConflictError("TASK_DEPENDENCIES_PENDING");
      const activeAttempt = await client.query<{ attempt: number }>(
        `SELECT attempt FROM task_attempts WHERE workspace_id=$1 AND task_id=$2 AND state='started' ORDER BY attempt DESC LIMIT 1`,
        [context.workspaceId, row.id]
      );
      const nextAttempt = activeAttempt.rows[0]
        ? undefined
        : await client.query<{ attempt: number }>(
            `SELECT coalesce(max(attempt),0)+1 AS attempt FROM task_attempts WHERE workspace_id=$1 AND task_id=$2`,
            [context.workspaceId, row.id]
          );
      const attemptNumber = activeAttempt.rows[0]?.attempt ?? nextAttempt?.rows[0]?.attempt ?? 1;
      await client.query(
        `UPDATE task_runs SET state='running',state_version=state_version+1,
           started_at=coalesce(started_at,clock_timestamp()),updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND id=$2`,
        [context.workspaceId, row.id]
      );
      await client.query(
        `INSERT INTO task_attempts(workspace_id,id,task_id,attempt,state,worker_identity,fencing_token)
         VALUES ($1,$2,$3,$4,'started',$5,$6)`,
        [context.workspaceId, createId(), row.id, attemptNumber, workerIdentity, row.fencing_token]
      );
      await this.appendEvent(
        client,
        context.workspaceId,
        runId,
        "task.started",
        "worker",
        workerIdentity,
        { nodeKey, attempt: attemptNumber }
      );
    });
  }

  async failTask(
    context: TenantContext,
    runId: string,
    nodeKey: string,
    workerIdentity: string,
    errorCode: string
  ) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const task = await client.query<{ id: string; state: string; fencing_token: string }>(
        `SELECT id,state,fencing_token FROM task_runs
         WHERE workspace_id=$1 AND run_id=$2 AND node_key=$3 FOR UPDATE`,
        [context.workspaceId, runId, nodeKey]
      );
      const row = task.rows[0];
      if (!row) throw new Error("TASK_NOT_FOUND");
      if (row.state === "failed") return;
      const activeAttempt = await client.query<{ attempt: number }>(
        `SELECT attempt FROM task_attempts WHERE workspace_id=$1 AND task_id=$2 AND state='started' ORDER BY attempt DESC LIMIT 1`,
        [context.workspaceId, row.id]
      );
      const nextAttempt = activeAttempt.rows[0]
        ? undefined
        : await client.query<{ attempt: number }>(
            `SELECT coalesce(max(attempt),0)+1 AS attempt FROM task_attempts WHERE workspace_id=$1 AND task_id=$2`,
            [context.workspaceId, row.id]
          );
      const attemptNumber = activeAttempt.rows[0]?.attempt ?? nextAttempt?.rows[0]?.attempt ?? 1;
      await client.query(
        `UPDATE task_runs SET state='failed',state_version=state_version+1,
           started_at=coalesce(started_at,clock_timestamp()),finished_at=clock_timestamp(),updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND id=$2`,
        [context.workspaceId, row.id]
      );
      if (activeAttempt.rows[0])
        await client.query(
          `UPDATE task_attempts SET state='failed',error_code=$4,finished_at=clock_timestamp()
           WHERE workspace_id=$1 AND task_id=$2 AND attempt=$3`,
          [context.workspaceId, row.id, attemptNumber, errorCode.slice(0, 160)]
        );
      else
        await client.query(
          `INSERT INTO task_attempts(workspace_id,id,task_id,attempt,state,worker_identity,fencing_token,error_code,finished_at)
           VALUES ($1,$2,$3,$4,'failed',$5,$6,$7,clock_timestamp())`,
          [
            context.workspaceId,
            createId(),
            row.id,
            attemptNumber,
            workerIdentity,
            row.fencing_token,
            errorCode.slice(0, 160)
          ]
        );
      await client.query(
        `UPDATE task_dependencies SET state='failed'
         WHERE workspace_id=$1 AND run_id=$2 AND depends_on_task_id=$3 AND state='pending'`,
        [context.workspaceId, runId, row.id]
      );
      await this.appendEvent(
        client,
        context.workspaceId,
        runId,
        "task.failed",
        "worker",
        workerIdentity,
        { nodeKey, attempt: attemptNumber, errorCode: errorCode.slice(0, 160) }
      );
    });
  }

  async taskExecutionContext(context: TenantContext, runId: string, nodeKey: string) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const run = await client.query<{ input: Record<string, unknown> }>(
        `SELECT input FROM workflow_runs WHERE workspace_id=$1 AND id=$2`,
        [context.workspaceId, runId]
      );
      if (!run.rows[0]) throw new Error("RUN_NOT_FOUND");
      const dependencies = await client.query<{ node_key: string; output: unknown }>(
        `SELECT dependency.node_key,dependency.output
         FROM task_dependencies relation
         JOIN task_runs task ON task.workspace_id=relation.workspace_id AND task.id=relation.task_id
         JOIN task_runs dependency ON dependency.workspace_id=relation.workspace_id AND dependency.id=relation.depends_on_task_id
         WHERE relation.workspace_id=$1 AND relation.run_id=$2 AND task.node_key=$3`,
        [context.workspaceId, runId, nodeKey]
      );
      return {
        input: run.rows[0].input,
        nodes: Object.fromEntries(
          dependencies.rows.map((dependency) => [
            dependency.node_key,
            { output: dependency.output }
          ])
        )
      };
    });
  }

  async run(context: TenantContext, runId: string) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const run = await client.query(
        `SELECT * FROM workflow_runs WHERE workspace_id=$1 AND id=$2`,
        [context.workspaceId, runId]
      );
      if (!run.rows[0]) return undefined;
      const tasks = await client.query(
        `SELECT id,node_key,node_kind,instance_key,queue_class,state,state_version,fencing_token,input,output,started_at,finished_at FROM task_runs WHERE workspace_id=$1 AND run_id=$2 ORDER BY created_at`,
        [context.workspaceId, runId]
      );
      const events = await client.query(
        `SELECT sequence,event_type,actor_type,actor_id,payload,occurred_at FROM run_events WHERE workspace_id=$1 AND run_id=$2 ORDER BY sequence`,
        [context.workspaceId, runId]
      );
      return { ...run.rows[0], tasks: tasks.rows, events: events.rows } as RuntimeProjection;
    });
  }

  async events(context: TenantContext, runId: string) {
    return (await this.run(context, runId))?.events;
  }

  async workflowRuns(
    context: TenantContext,
    workflowId: string,
    options: { readonly state?: RunState; readonly limit?: number } = {}
  ) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<Record<string, unknown>>(
        `SELECT id,workflow_id,workflow_version,state,created_by,started_at,finished_at,created_at,updated_at,
          extract(epoch FROM (coalesce(finished_at,clock_timestamp())-coalesce(started_at,created_at)))*1000 AS duration_ms,
          policy_snapshot->>'maximumQuantity' AS reserved_quantity
         FROM workflow_runs WHERE workspace_id=$1 AND workflow_id=$2 AND ($3::text IS NULL OR state=$3)
         ORDER BY created_at DESC,id DESC LIMIT $4`,
        [context.workspaceId, workflowId, options.state ?? null, Math.min(options.limit ?? 50, 200)]
      );
      return result.rows;
    });
  }

  async pendingStarts(context: TenantContext) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const runs = await client.query<{
        id: string;
        temporal_workflow_id: string;
        created_by: string;
      }>(
        `SELECT r.id,r.temporal_workflow_id,r.created_by FROM workflow_runs r
         JOIN outbox_events o ON o.workspace_id=r.workspace_id AND o.aggregate_id=r.id
         LEFT JOIN event_receipts receipt ON receipt.workspace_id=o.workspace_id AND receipt.event_id=o.id AND receipt.consumer='temporal-starter'
         WHERE r.workspace_id=$1 AND r.state='queued' AND o.event_type='run.start.requested' AND receipt.event_id IS NULL
         ORDER BY o.occurred_at LIMIT 100`,
        [context.workspaceId]
      );
      const output = [];
      for (const run of runs.rows) {
        const tasks = await client.query<{
          node_key: string;
          node_kind: RuntimePlanNode["kind"];
          queue_class: "system" | "human" | "agent" | "connector";
          runtime_config: Record<string, unknown>;
          maximum_attempts: number;
          timeout_ms: number;
        }>(
          `SELECT node_key,node_kind,queue_class,runtime_config,maximum_attempts,timeout_ms
            FROM task_runs WHERE workspace_id=$1 AND run_id=$2 ORDER BY created_at`,
          [context.workspaceId, run.id]
        );
        const dependencies = await client.query<{ node_key: string; dependency_key: string }>(
          `SELECT task.node_key,dependency.node_key AS dependency_key FROM task_dependencies d
           JOIN task_runs task ON task.workspace_id=d.workspace_id AND task.id=d.task_id
           JOIN task_runs dependency ON dependency.workspace_id=d.workspace_id AND dependency.id=d.depends_on_task_id
           WHERE d.workspace_id=$1 AND d.run_id=$2`,
          [context.workspaceId, run.id]
        );
        const byNode = new Map<string, string[]>();
        for (const row of dependencies.rows)
          byNode.set(row.node_key, [...(byNode.get(row.node_key) ?? []), row.dependency_key]);
        const successors = new Map<string, string[]>();
        for (const row of dependencies.rows)
          successors.set(row.dependency_key, [
            ...(successors.get(row.dependency_key) ?? []),
            row.node_key
          ]);
        output.push({
          workspaceId: context.workspaceId,
          principalId: run.created_by,
          runId: run.id,
          temporalWorkflowId: run.temporal_workflow_id,
          plan: tasks.rows.map((task) => ({
            key: task.node_key,
            kind: task.node_kind,
            dependencies: (byNode.get(task.node_key) ?? []).sort(),
            successors: (successors.get(task.node_key) ?? []).sort(),
            queue: task.queue_class,
            maxAttempts: task.maximum_attempts,
            timeoutMs: task.timeout_ms,
            configuration: task.runtime_config
          }))
        });
      }
      return output;
    });
  }

  async markStartDispatched(context: TenantContext, runId: string) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const event = await client.query<{ id: string; payload: unknown }>(
        `SELECT id,payload FROM outbox_events WHERE workspace_id=$1 AND aggregate_id=$2 AND event_type='run.start.requested'`,
        [context.workspaceId, runId]
      );
      if (event.rows[0])
        await client.query(
          `INSERT INTO event_receipts(workspace_id,consumer,event_id,payload_hash)
           VALUES ($1,'temporal-starter',$2,$3) ON CONFLICT DO NOTHING`,
          [context.workspaceId, event.rows[0].id, contentHash(event.rows[0].payload)]
        );
    });
  }

  private async appendEvent(
    client: PoolClient,
    workspaceId: string,
    runId: string,
    eventType: string,
    actorType: string,
    actorId: string,
    payload: object
  ) {
    await client.query(
      `INSERT INTO run_events(workspace_id,run_id,sequence,event_type,actor_type,actor_id,payload)
       SELECT $1,$2,coalesce(max(sequence),0)+1,$3,$4,$5,$6 FROM run_events WHERE workspace_id=$1 AND run_id=$2`,
      [workspaceId, runId, eventType, actorType, actorId, payload]
    );
  }

  private mapRun(
    row: {
      id: string;
      workflow_version: number;
      state: RunState;
      state_version: string;
      fencing_token: string;
      temporal_workflow_id: string;
      created_at: Date;
    },
    workflowId: string,
    reservationId: string
  ): RuntimeRunRecord {
    return {
      id: row.id,
      workflowId,
      workflowVersion: row.workflow_version,
      state: row.state,
      stateVersion: Number(row.state_version),
      fencingToken: Number(row.fencing_token),
      temporalWorkflowId: row.temporal_workflow_id,
      reservationId,
      createdAt: row.created_at.toISOString()
    };
  }
}
