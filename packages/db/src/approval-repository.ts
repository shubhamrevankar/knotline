import {
  approvalDecisionSchema,
  approvalDelegationSchema,
  approvalPacketSchema,
  approvalPolicySchema,
  approvalRevocationSchema,
  evaluateApproval,
  type ApprovalPacket,
  type ApprovalPolicy
} from "@knotline/contracts";
import type { Pool, PoolClient } from "pg";

import { withTenantTransaction, type TenantContext } from "./context.js";
import { HumanTaskAuthorizationError, HumanTaskConflictError } from "./human-task-repository.js";
import { contentHash, createId } from "./values.js";

export async function resolveApprovalSteps(
  client: PoolClient,
  context: TenantContext,
  policy: ApprovalPolicy,
  packet: ApprovalPacket
) {
  const resolved: Array<ApprovalPolicy["steps"][number] & { eligibleUserIds: string[] }> = [];
  for (const step of policy.steps) {
    let eligibleUserIds: string[] = [];
    if (step.selector.type === "user") eligibleUserIds = [...step.selector.userIds];
    else if (step.selector.type === "group")
      eligibleUserIds = (
        await client.query<{ user_id: string }>(
          `SELECT DISTINCT user_id FROM workspace_group_memberships
           WHERE workspace_id=$1 AND group_id=ANY($2::uuid[])`,
          [context.workspaceId, step.selector.groupIds]
        )
      ).rows.map(({ user_id }) => user_id);
    else if (step.selector.type === "role")
      eligibleUserIds = (
        await client.query<{ user_id: string }>(
          `SELECT user_id FROM memberships
           WHERE workspace_id=$1 AND role=ANY($2::text[]) AND state='active'`,
          [context.workspaceId, step.selector.roles]
        )
      ).rows.map(({ user_id }) => user_id);
    else if (step.selector.type === "manager") {
      const managers = await client.query<{ manager_user_id: string }>(
        `WITH RECURSIVE chain(user_id,manager_user_id,depth,path) AS (
           SELECT report_user_id,manager_user_id,1,ARRAY[report_user_id,manager_user_id]
           FROM organization_relationships WHERE workspace_id=$1 AND report_user_id=$2
             AND effective_from<=clock_timestamp() AND (effective_to IS NULL OR effective_to>clock_timestamp())
             AND conflict_state='clear'
           UNION ALL
           SELECT relation.report_user_id,relation.manager_user_id,chain.depth+1,chain.path||relation.manager_user_id
           FROM chain JOIN organization_relationships relation
             ON relation.workspace_id=$1 AND relation.report_user_id=chain.manager_user_id
           WHERE chain.depth<$3 AND NOT relation.manager_user_id=ANY(chain.path)
             AND relation.effective_from<=clock_timestamp() AND (relation.effective_to IS NULL OR relation.effective_to>clock_timestamp())
             AND relation.conflict_state='clear'
         ) SELECT manager_user_id FROM chain WHERE depth=$3 ORDER BY manager_user_id`,
        [context.workspaceId, context.principalId, step.selector.levels]
      );
      eligibleUserIds = managers.rows.map(({ manager_user_id }) => manager_user_id);
    } else if (Object.is(packet.diff[step.selector.field], step.selector.equals))
      eligibleUserIds = [...step.selector.userIds];
    const active = await client.query<{ user_id: string }>(
      `SELECT user_id FROM memberships
       WHERE workspace_id=$1 AND user_id=ANY($2::uuid[]) AND state='active'`,
      [context.workspaceId, eligibleUserIds]
    );
    eligibleUserIds = [...new Set(active.rows.map(({ user_id }) => user_id))];
    if (!policy.allowSelfApproval)
      eligibleUserIds = eligibleUserIds.filter((userId) => userId !== context.principalId);
    if (!eligibleUserIds.length)
      throw new HumanTaskConflictError(
        `NO_ELIGIBLE_APPROVER:${step.key}:${policy.allowSelfApproval ? "NO_ACTIVE_MEMBER" : "SELF_APPROVAL_FORBIDDEN"}`
      );
    if (step.mode === "quorum" && (step.quorum ?? 0) > eligibleUserIds.length)
      throw new HumanTaskConflictError(`QUORUM_EXCEEDS_ELIGIBLE:${step.key}`);
    resolved.push({ ...step, eligibleUserIds });
  }
  return resolved;
}

export interface ApprovalRepository {
  list(context: TenantContext): Promise<readonly Record<string, unknown>[]>;
  get(context: TenantContext, approvalId: string): Promise<Record<string, unknown> | undefined>;
  decide(
    context: TenantContext,
    approvalId: string,
    input: unknown,
    sessionContext?: object
  ): Promise<Record<string, unknown>>;
  delegate(context: TenantContext, approvalId: string, input: unknown): Promise<{ id: string }>;
  remind(
    context: TenantContext,
    approvalId: string,
    idempotencyKey: string
  ): Promise<{ queued: number }>;
  revoke(context: TenantContext, approvalId: string, input: unknown): Promise<{ state: "REVOKED" }>;
  consume(
    context: TenantContext,
    approvalId: string,
    operationId: string,
    packetHash: string,
    fencingToken: number
  ): Promise<{ state: "CONSUMED" }>;
  expire(context: TenantContext, approvalId: string): Promise<{ state: string }>;
  consumeForNode(
    context: TenantContext,
    runId: string,
    nodeKey: string,
    operationId: string,
    fencingToken: number
  ): Promise<{ state: "CONSUMED" }>;
  expireForNode(context: TenantContext, runId: string, nodeKey: string): Promise<{ state: string }>;
  create(
    context: TenantContext,
    taskId: string,
    policy: unknown,
    packet: unknown
  ): Promise<{ id: string }>;
}

export class PostgresApprovalRepository implements ApprovalRepository {
  constructor(private readonly pool: Pool) {}

  async list(context: TenantContext) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT approval.id,approval.task_id,approval.state,approval.state_version,approval.expires_at,
          approval.packet->>'title' title,approval.packet->'risk'->>'level' risk,
          (EXISTS(SELECT 1 FROM approval_steps step WHERE step.workspace_id=approval.workspace_id AND step.approval_id=approval.id AND step.state='active' AND $2=ANY(step.eligible_user_ids))
            AND (coalesce((approval.policy_snapshot->>'allowSelfApproval')::boolean,false) OR approval.requester_id<>$2)
            AND approval.state IN ('PENDING','IN_REVIEW') AND approval.expires_at>clock_timestamp()) eligible
         FROM approvals approval WHERE approval.workspace_id=$1
          AND (approval.requester_id=$2 OR EXISTS(SELECT 1 FROM approval_steps step WHERE step.workspace_id=approval.workspace_id AND step.approval_id=approval.id AND $2=ANY(step.eligible_user_ids)))
         ORDER BY approval.expires_at,approval.id LIMIT 100`,
            [context.workspaceId, context.principalId]
          )
        ).rows
    );
  }

  async get(context: TenantContext, approvalId: string) {
    return withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT approval.*,
          (EXISTS(SELECT 1 FROM approval_steps active_step WHERE active_step.workspace_id=approval.workspace_id AND active_step.approval_id=approval.id AND active_step.state='active' AND $3=ANY(active_step.eligible_user_ids))
            AND (coalesce((approval.policy_snapshot->>'allowSelfApproval')::boolean,false) OR approval.requester_id<>$3)
            AND approval.state IN ('PENDING','IN_REVIEW') AND approval.expires_at>clock_timestamp()) can_decide,
          CASE
            WHEN approval.state NOT IN ('PENDING','IN_REVIEW') THEN 'TERMINAL'
            WHEN approval.expires_at<=clock_timestamp() THEN 'EXPIRED'
            WHEN approval.requester_id=$3 AND NOT coalesce((approval.policy_snapshot->>'allowSelfApproval')::boolean,false) THEN 'SELF_APPROVAL_FORBIDDEN'
            WHEN NOT EXISTS(SELECT 1 FROM approval_steps active_step WHERE active_step.workspace_id=approval.workspace_id AND active_step.approval_id=approval.id AND active_step.state='active' AND $3=ANY(active_step.eligible_user_ids)) THEN 'NOT_ELIGIBLE'
            ELSE NULL
          END decision_block_reason,
          coalesce((SELECT jsonb_agg(step ORDER BY step.step_order,step.step_key) FROM approval_steps step WHERE step.workspace_id=approval.workspace_id AND step.approval_id=approval.id),'[]'::jsonb) steps,
          coalesce((SELECT jsonb_agg(decision ORDER BY decision.decided_at,decision.id) FROM approval_decisions decision WHERE decision.workspace_id=approval.workspace_id AND decision.approval_id=approval.id),'[]'::jsonb) decisions,
          run.id run_id,run.temporal_workflow_id,task.node_key
         FROM approvals approval JOIN task_runs task ON task.workspace_id=approval.workspace_id AND task.id=approval.task_id
         JOIN workflow_runs run ON run.workspace_id=task.workspace_id AND run.id=task.run_id
         WHERE approval.workspace_id=$1 AND approval.id=$2 AND
          (approval.requester_id=$3 OR EXISTS(SELECT 1 FROM approval_steps step WHERE step.workspace_id=approval.workspace_id AND step.approval_id=approval.id AND $3=ANY(step.eligible_user_ids)))`,
            [context.workspaceId, approvalId, context.principalId]
          )
        ).rows[0]
    );
  }

  async create(context: TenantContext, taskId: string, policyInput: unknown, packetInput: unknown) {
    const policy = approvalPolicySchema.parse(policyInput);
    const packet = approvalPacketSchema.parse(packetInput);
    return withTenantTransaction(this.pool, context, async (client) => {
      const duplicate = await client.query<{ id: string }>(
        `SELECT id FROM approvals WHERE workspace_id=$1 AND task_id=$2`,
        [context.workspaceId, taskId]
      );
      if (duplicate.rows[0]) return duplicate.rows[0];
      const id = createId();
      const resolved = await resolveApprovalSteps(client, context, policy, packet);
      await client.query(
        `INSERT INTO approvals(workspace_id,id,task_id,requester_id,policy_snapshot,packet,packet_hash,state,expires_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,'PENDING',$8)`,
        [
          context.workspaceId,
          id,
          taskId,
          context.principalId,
          policy,
          packet,
          contentHash(packet),
          packet.expiresAt
        ]
      );
      for (const step of resolved)
        await client.query(
          `INSERT INTO approval_steps(workspace_id,approval_id,step_key,step_order,mode,quorum,eligible_user_ids,resolution_evidence,state)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            context.workspaceId,
            id,
            step.key,
            step.order,
            step.mode,
            step.quorum ?? null,
            step.eligibleUserIds,
            { selector: step.selector },
            step.order === Math.min(...resolved.map(({ order }) => order)) ? "active" : "pending"
          ]
        );
      await client.query(
        `INSERT INTO sla_timer_events(workspace_id,id,approval_id,timer_type,tier,due_at,temporal_timer_id,idempotency_key) VALUES($1,$2,$3,'expiry',0,$4,$5,$6)`,
        [
          context.workspaceId,
          createId(),
          id,
          packet.expiresAt,
          `approval-${id}-expiry`,
          `${id}:expiry:0`
        ]
      );
      await this.event(client, context, taskId, "approval.requested", {
        approvalId: id,
        packetHash: contentHash(packet)
      });
      return { id };
    });
  }

  async decide(
    context: TenantContext,
    approvalId: string,
    input: unknown,
    sessionContext: object = {}
  ) {
    const decision = approvalDecisionSchema.parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const approval = await client.query<{
        task_id: string;
        requester_id: string;
        policy_snapshot: ApprovalPolicy;
        packet: ApprovalPacket;
        packet_hash: string;
        state: string;
        state_version: string;
        expires_at: Date;
      }>(
        `SELECT task_id,requester_id,policy_snapshot,packet,packet_hash,state,state_version,expires_at FROM approvals WHERE workspace_id=$1 AND id=$2 FOR UPDATE`,
        [context.workspaceId, approvalId]
      );
      const row = approval.rows[0];
      if (!row) throw new Error("APPROVAL_NOT_FOUND");
      const duplicate = await client.query<{ id: string; outcome: string }>(
        `SELECT id,outcome FROM approval_decisions WHERE workspace_id=$1 AND approval_id=$2 AND idempotency_key=$3`,
        [context.workspaceId, approvalId, decision.idempotencyKey]
      );
      if (duplicate.rows[0])
        return { id: duplicate.rows[0].id, state: row.state, outcome: duplicate.rows[0].outcome };
      if (
        !["PENDING", "IN_REVIEW"].includes(row.state) ||
        Number(row.state_version) !== decision.expectedVersion
      )
        throw new HumanTaskConflictError("STALE_OR_TERMINAL_APPROVAL");
      if (row.expires_at.getTime() <= Date.now())
        throw new HumanTaskConflictError("APPROVAL_EXPIRED");
      if (contentHash(row.packet) !== row.packet_hash)
        throw new HumanTaskConflictError("APPROVAL_PACKET_TAMPERED");
      if (decision.outcome === "cancel" && row.requester_id !== context.principalId)
        throw new HumanTaskAuthorizationError("ONLY_REQUESTER_CAN_CANCEL");
      if (
        decision.outcome !== "cancel" &&
        !row.policy_snapshot.allowSelfApproval &&
        row.requester_id === context.principalId
      )
        throw new HumanTaskAuthorizationError("SELF_APPROVAL_DENIED");
      if (row.policy_snapshot.reasonRequired && !decision.reason)
        throw new HumanTaskConflictError("DECISION_REASON_REQUIRED");
      const step = await client.query<{ state: string; eligible_user_ids: string[] }>(
        `SELECT state,eligible_user_ids FROM approval_steps WHERE workspace_id=$1 AND approval_id=$2 AND step_key=$3 FOR UPDATE`,
        [context.workspaceId, approvalId, decision.stepKey]
      );
      if (
        !step.rows[0] ||
        step.rows[0].state !== "active" ||
        !step.rows[0].eligible_user_ids.includes(context.principalId)
      )
        throw new HumanTaskAuthorizationError("APPROVER_NOT_ELIGIBLE");
      const id = createId();
      await client.query(
        `INSERT INTO approval_decisions(workspace_id,id,approval_id,step_key,actor_id,outcome,reason,packet_hash,session_context,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          context.workspaceId,
          id,
          approvalId,
          decision.stepKey,
          context.principalId,
          decision.outcome,
          decision.reason,
          row.packet_hash,
          sessionContext,
          decision.idempotencyKey
        ]
      );
      const steps = await client.query<{
        step_key: string;
        mode: "single" | "any" | "all" | "quorum";
        quorum: number | null;
        eligible_user_ids: string[];
      }>(
        `SELECT step_key,mode,quorum,eligible_user_ids FROM approval_steps WHERE workspace_id=$1 AND approval_id=$2 ORDER BY step_order,step_key`,
        [context.workspaceId, approvalId]
      );
      const decisions = await client.query<{
        step_key: string;
        actor_id: string;
        outcome: "approve" | "reject" | "request_changes" | "abstain" | "cancel";
      }>(
        `SELECT step_key,actor_id,outcome FROM approval_decisions WHERE workspace_id=$1 AND approval_id=$2`,
        [context.workspaceId, approvalId]
      );
      const evaluation =
        decision.outcome === "cancel"
          ? "cancelled"
          : evaluateApproval(
              row.policy_snapshot.strategy,
              steps.rows.map((item) => ({
                stepKey: item.step_key,
                mode: item.mode,
                ...(item.quorum ? { quorum: item.quorum } : {}),
                eligibleUserIds: item.eligible_user_ids
              })),
              decisions.rows.map((item) => ({
                stepKey: item.step_key,
                actorId: item.actor_id,
                outcome: item.outcome
              }))
            );
      const next =
        evaluation === "approved"
          ? "APPROVED_PENDING_EXECUTION"
          : evaluation === "rejected"
            ? "REJECTED"
            : evaluation === "revision_requested"
              ? "REVISION_REQUESTED"
              : evaluation === "cancelled"
                ? "CANCELLED"
                : "IN_REVIEW";
      await this.updateStepStates(client, context, approvalId, row.policy_snapshot);
      const updated = await client.query<{ state_version: string }>(
        `UPDATE approvals SET state=$3,state_version=state_version+1,resolved_at=CASE WHEN $3 IN ('APPROVED_PENDING_EXECUTION','REJECTED','REVISION_REQUESTED','CANCELLED') THEN clock_timestamp() ELSE resolved_at END,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2 RETURNING state_version`,
        [context.workspaceId, approvalId, next]
      );
      await this.event(
        client,
        context,
        row.task_id,
        next === "REVISION_REQUESTED"
          ? "approval.revision_requested"
          : decision.outcome === "abstain"
            ? "approval.abstained"
            : "approval.decided",
        { approvalId, decisionId: id, outcome: decision.outcome, state: next }
      );
      return { id, state: next, stateVersion: Number(updated.rows[0]!.state_version) };
    });
  }

  async delegate(context: TenantContext, approvalId: string, input: unknown) {
    const value = approvalDelegationSchema.parse(input);
    if (value.delegateUserId === context.principalId)
      throw new HumanTaskAuthorizationError("SELF_DELEGATION");
    return withTenantTransaction(this.pool, context, async (client) => {
      const approval = await client.query<{ task_id: string; state_version: string }>(
        `SELECT task_id,state_version FROM approvals WHERE workspace_id=$1 AND id=$2 AND state IN ('PENDING','IN_REVIEW') FOR UPDATE`,
        [context.workspaceId, approvalId]
      );
      if (!approval.rows[0] || Number(approval.rows[0].state_version) !== value.expectedVersion)
        throw new HumanTaskConflictError("STALE_OR_TERMINAL_APPROVAL");
      const eligible = await client.query(
        `SELECT 1 FROM approval_steps WHERE workspace_id=$1 AND approval_id=$2 AND $3=ANY(eligible_user_ids) AND $4=ANY(eligible_user_ids)`,
        [context.workspaceId, approvalId, context.principalId, value.delegateUserId]
      );
      if (!eligible.rows[0])
        throw new HumanTaskAuthorizationError("DELEGATION_SCOPE_WIDENING_DENIED");
      const member = await client.query(
        `SELECT 1 FROM memberships WHERE workspace_id=$1 AND user_id=$2 AND state='active'`,
        [context.workspaceId, value.delegateUserId]
      );
      if (!member.rows[0]) throw new HumanTaskAuthorizationError("DELEGATE_NOT_ACTIVE");
      const id = createId();
      await client.query(
        `INSERT INTO approval_delegations(workspace_id,id,approval_id,delegator_id,delegate_id,scope,starts_at,ends_at,exclusions,reason,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active')`,
        [
          context.workspaceId,
          id,
          approvalId,
          context.principalId,
          value.delegateUserId,
          value.scope,
          value.startsAt,
          value.endsAt,
          value.exclusions,
          value.reason
        ]
      );
      await this.event(client, context, approval.rows[0].task_id, "approval.delegated", {
        approvalId,
        delegationId: id
      });
      return { id };
    });
  }

  async remind(context: TenantContext, approvalId: string, idempotencyKey: string) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const approval = await client.query<{ task_id: string }>(
        `SELECT task_id FROM approvals WHERE workspace_id=$1 AND id=$2 AND state IN ('PENDING','IN_REVIEW')`,
        [context.workspaceId, approvalId]
      );
      if (!approval.rows[0]) throw new HumanTaskConflictError("APPROVAL_NOT_REMINDABLE");
      const result = await client.query(
        `INSERT INTO notification_intents(workspace_id,id,recipient_user_id,source_type,resource_type,resource_id,state,dedupe_key) SELECT $1,gen_random_uuid(),eligible,'approval_sla','approval',$2,'pending',$3||':'||eligible::text FROM (SELECT DISTINCT unnest(eligible_user_ids) eligible FROM approval_steps WHERE workspace_id=$1 AND approval_id=$2 AND state='active') users ON CONFLICT DO NOTHING`,
        [context.workspaceId, approvalId, idempotencyKey]
      );
      await this.event(client, context, approval.rows[0].task_id, "approval.reminded", {
        approvalId,
        idempotencyKey
      });
      return { queued: result.rowCount ?? 0 };
    });
  }

  async revoke(context: TenantContext, approvalId: string, input: unknown) {
    const value = approvalRevocationSchema.parse(input);
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<{ task_id: string }>(
        `UPDATE approvals SET state='REVOKED',state_version=state_version+1,revoked_at=clock_timestamp(),updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2 AND requester_id=$3 AND state='APPROVED_PENDING_EXECUTION' AND state_version=$4 RETURNING task_id`,
        [context.workspaceId, approvalId, context.principalId, value.expectedVersion]
      );
      if (!result.rows[0]) throw new HumanTaskConflictError("REVOCATION_LOST_CAS");
      await this.event(client, context, result.rows[0].task_id, "approval.revoked", {
        approvalId,
        reason: value.reason,
        idempotencyKey: value.idempotencyKey
      });
      return { state: "REVOKED" as const };
    });
  }

  async consume(
    context: TenantContext,
    approvalId: string,
    operationId: string,
    packetHash: string,
    fencingToken: number
  ) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const result = await client.query<{ task_id: string }>(
        `UPDATE approvals SET state='CONSUMED',state_version=state_version+1,consumed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2 AND state='APPROVED_PENDING_EXECUTION' AND packet_hash=$3 RETURNING task_id`,
        [context.workspaceId, approvalId, packetHash]
      );
      if (!result.rows[0]) throw new HumanTaskConflictError("CONSUMPTION_LOST_CAS");
      await client.query(
        `INSERT INTO approval_consumptions(workspace_id,approval_id,operation_id,packet_hash,fencing_token,consumed_by) VALUES($1,$2,$3,$4,$5,$6)`,
        [
          context.workspaceId,
          approvalId,
          operationId,
          packetHash,
          fencingToken,
          context.principalId
        ]
      );
      await this.event(client, context, result.rows[0].task_id, "approval.consumed", {
        approvalId,
        operationId,
        fencingToken
      });
      return { state: "CONSUMED" as const };
    });
  }

  async consumeForNode(
    context: TenantContext,
    runId: string,
    nodeKey: string,
    operationId: string,
    fencingToken: number
  ) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const approval = await client.query<{ id: string; packet_hash: string }>(
        `SELECT approval.id,approval.packet_hash FROM approvals approval
         JOIN task_runs task ON task.workspace_id=approval.workspace_id AND task.id=approval.task_id
         WHERE approval.workspace_id=$1 AND task.run_id=$2 AND task.node_key=$3`,
        [context.workspaceId, runId, nodeKey]
      );
      const row = approval.rows[0];
      if (!row) throw new HumanTaskConflictError("APPROVAL_NOT_FOUND");
      const result = await client.query<{ task_id: string }>(
        `UPDATE approvals SET state='CONSUMED',state_version=state_version+1,consumed_at=clock_timestamp(),updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND id=$2 AND state='APPROVED_PENDING_EXECUTION' AND packet_hash=$3 RETURNING task_id`,
        [context.workspaceId, row.id, row.packet_hash]
      );
      if (!result.rows[0]) throw new HumanTaskConflictError("CONSUMPTION_LOST_CAS");
      await client.query(
        `INSERT INTO approval_consumptions(workspace_id,approval_id,operation_id,packet_hash,fencing_token,consumed_by)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [
          context.workspaceId,
          row.id,
          operationId,
          row.packet_hash,
          fencingToken,
          context.principalId
        ]
      );
      await this.event(client, context, result.rows[0].task_id, "approval.consumed", {
        approvalId: row.id,
        operationId,
        fencingToken
      });
      return { state: "CONSUMED" as const };
    });
  }

  async expire(context: TenantContext, approvalId: string) {
    return withTenantTransaction(this.pool, context, async (client) => {
      const approval = await client.query<{
        task_id: string;
        state: string;
        policy_snapshot: ApprovalPolicy;
      }>(
        `SELECT task_id,state,policy_snapshot FROM approvals WHERE workspace_id=$1 AND id=$2 FOR UPDATE`,
        [context.workspaceId, approvalId]
      );
      const row = approval.rows[0];
      if (!row || !["PENDING", "IN_REVIEW", "APPROVED_PENDING_EXECUTION"].includes(row.state))
        return { state: row?.state ?? "MISSING" };
      const next =
        row.policy_snapshot.autoOutcome === "cancel"
          ? "CANCELLED"
          : row.policy_snapshot.autoOutcome === "reject"
            ? "REJECTED"
            : "EXPIRED";
      await client.query(
        `UPDATE approvals SET state=$3,state_version=state_version+1,resolved_at=clock_timestamp(),updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2`,
        [context.workspaceId, approvalId, next]
      );
      await client.query(
        `UPDATE task_runs SET state='failed',state_version=state_version+1,
          output=coalesce(output,'{}'::jsonb)||jsonb_build_object('code','APPROVAL_EXPIRED','approvalId',$3::text,'outcome',$4::text),
          finished_at=clock_timestamp(),updated_at=clock_timestamp()
         WHERE workspace_id=$1 AND id=$2 AND state IN ('ready','running')`,
        [context.workspaceId, row.task_id, approvalId, next]
      );
      await client.query(
        `UPDATE sla_timer_events SET state='handled',fired_at=coalesce(fired_at,clock_timestamp()),handled_at=clock_timestamp() WHERE workspace_id=$1 AND approval_id=$2 AND timer_type='expiry'`,
        [context.workspaceId, approvalId]
      );
      await this.event(client, context, row.task_id, "approval.expired", {
        approvalId,
        state: next
      });
      return { state: next };
    });
  }

  async expireForNode(context: TenantContext, runId: string, nodeKey: string) {
    const approvalId = await withTenantTransaction(
      this.pool,
      context,
      async (client) =>
        (
          await client.query<{ id: string }>(
            `SELECT approval.id FROM approvals approval JOIN task_runs task
         ON task.workspace_id=approval.workspace_id AND task.id=approval.task_id
         WHERE approval.workspace_id=$1 AND task.run_id=$2 AND task.node_key=$3`,
            [context.workspaceId, runId, nodeKey]
          )
        ).rows[0]?.id
    );
    return approvalId ? this.expire(context, approvalId) : { state: "MISSING" };
  }

  private async updateStepStates(
    client: PoolClient,
    context: TenantContext,
    approvalId: string,
    policy: ApprovalPolicy
  ) {
    const rows = await client.query<{
      step_key: string;
      step_order: number;
      mode: string;
      quorum: number | null;
      eligible_user_ids: string[];
    }>(
      `SELECT step_key,step_order,mode,quorum,eligible_user_ids FROM approval_steps WHERE workspace_id=$1 AND approval_id=$2 ORDER BY step_order`,
      [context.workspaceId, approvalId]
    );
    const decisions = await client.query<{
      step_key: string;
      actor_id: string;
      outcome: "approve" | "reject" | "request_changes" | "abstain" | "cancel";
    }>(
      `SELECT step_key,actor_id,outcome FROM approval_decisions WHERE workspace_id=$1 AND approval_id=$2`,
      [context.workspaceId, approvalId]
    );
    for (const step of rows.rows) {
      const state = evaluateApproval(
        "parallel",
        [
          {
            stepKey: step.step_key,
            mode: step.mode as "single" | "any" | "all" | "quorum",
            ...(step.quorum ? { quorum: step.quorum } : {}),
            eligibleUserIds: step.eligible_user_ids
          }
        ],
        decisions.rows.map((item) => ({
          stepKey: item.step_key,
          actorId: item.actor_id,
          outcome: item.outcome
        }))
      );
      await client.query(
        `UPDATE approval_steps SET state=$4 WHERE workspace_id=$1 AND approval_id=$2 AND step_key=$3`,
        [
          context.workspaceId,
          approvalId,
          step.step_key,
          state === "approved"
            ? "approved"
            : state === "rejected"
              ? "rejected"
              : state === "revision_requested"
                ? "revision_requested"
                : "active"
        ]
      );
    }
    if (policy.strategy === "sequential")
      await client.query(
        `UPDATE approval_steps SET state='active' WHERE workspace_id=$1 AND approval_id=$2 AND step_key=(SELECT step_key FROM approval_steps WHERE workspace_id=$1 AND approval_id=$2 AND state='pending' ORDER BY step_order LIMIT 1) AND NOT EXISTS(SELECT 1 FROM approval_steps WHERE workspace_id=$1 AND approval_id=$2 AND state='active')`,
        [context.workspaceId, approvalId]
      );
  }

  private async event(
    client: PoolClient,
    context: TenantContext,
    taskId: string,
    eventType: string,
    payload: object
  ) {
    await client.query(
      `INSERT INTO run_events(workspace_id,run_id,sequence,event_type,actor_type,actor_id,payload) SELECT $1,task.run_id,coalesce((SELECT max(sequence) FROM run_events WHERE workspace_id=$1 AND run_id=task.run_id),0)+1,$3,'user',$4,$5 FROM task_runs task WHERE task.workspace_id=$1 AND task.id=$2`,
      [context.workspaceId, taskId, eventType, context.principalId, payload]
    );
  }
}
