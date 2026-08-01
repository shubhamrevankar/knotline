import { z } from "zod";

import { modelRoleSchema } from "./model-gateway.js";
import { connectorKeySchema } from "./connector.js";

export const eventEnvelopeSchema = z
  .object({
    eventId: z.string().regex(/^evt_[A-Za-z0-9]+$/u),
    eventType: z.string().regex(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/u),
    eventVersion: z.number().int().positive(),
    occurredAt: z.iso.datetime(),
    workspaceId: z.string().min(1).max(160),
    aggregateType: z.string().regex(/^[a-z][a-z0-9_]*$/u),
    aggregateId: z.string().min(1).max(160),
    aggregateVersion: z.number().int().nonnegative(),
    correlationId: z.string().min(1).max(160),
    causationId: z.string().min(1).max(160),
    actor: z
      .object({
        type: z.enum(["user", "agent", "service", "operator", "system"]),
        id: z.string().min(1).max(160)
      })
      .passthrough(),
    trace: z
      .object({
        traceparent: z
          .string()
          .regex(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/u)
          .refine((value) => {
            const [, traceId, spanId] = value.split("-");
            return traceId !== "00000000000000000000000000000000" && spanId !== "0000000000000000";
          }, "traceparent cannot contain an all-zero trace or span ID")
      })
      .passthrough(),
    data: z.json()
  })
  .passthrough();

export const workflowCreatedPayloadV1Schema = z
  .object({
    workflowId: z.string().min(1).max(160),
    name: z.string().min(2).max(120),
    createdAt: z.iso.datetime()
  })
  .passthrough();

export const workflowPublishedPayloadV1Schema = z
  .object({
    workflowId: z.string().uuid(),
    version: z.number().int().positive(),
    contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u)
  })
  .passthrough();

export const identityAuthorizationPayloadV1Schema = z
  .object({
    authorizationId: z.string().uuid(),
    provider: z.enum(["email", "google", "saml", "oidc"]),
    result: z.enum(["started", "consumed", "failed"]),
    occurredAt: z.iso.datetime()
  })
  .passthrough();

export const identitySessionPayloadV1Schema = z
  .object({
    sessionId: z.string().uuid(),
    familyId: z.string().uuid(),
    userId: z.string().uuid(),
    reason: z.string().max(80).optional(),
    occurredAt: z.iso.datetime()
  })
  .passthrough();

export const workspaceAccessPayloadV1Schema = z
  .object({
    occurredAt: z.iso.datetime().optional(),
    reason: z.string().max(160).optional()
  })
  .passthrough();

export const runtimeTransitionPayloadV1Schema = z
  .object({
    runId: z.string().uuid(),
    from: z.string().min(1).max(40).optional(),
    to: z.string().min(1).max(40).optional(),
    nodeKey: z.string().min(1).max(160).optional(),
    attempt: z.number().int().positive().optional()
  })
  .passthrough();

export const approvalEventPayloadV1Schema = z
  .object({
    approvalId: z.string().uuid(),
    nodeKey: z.string().max(160).optional(),
    decisionId: z.string().uuid().optional(),
    operationId: z.string().uuid().optional(),
    state: z.string().max(80).optional(),
    outcome: z.string().max(80).optional(),
    packetHash: z.string().max(200).optional()
  })
  .passthrough();

export const agentFoundryEventPayloadV1Schema = z
  .object({
    agentId: z.string().uuid().optional(),
    version: z.number().int().positive().optional(),
    contentHash: z.string().max(200).optional(),
    revision: z.number().int().positive().optional(),
    simulationId: z.string().uuid().optional(),
    executionClass: z.literal("SIMULATED").optional()
  })
  .passthrough();

export const modelGatewayEventPayloadV1Schema = z
  .object({
    invocationId: z.string().uuid().optional(),
    operationId: z.string().max(160).optional(),
    provider: z.string().max(80).optional(),
    modelRole: modelRoleSchema.optional(),
    status: z
      .enum(["started", "completed", "incomplete", "refused", "failed", "unknown"])
      .optional(),
    inputTokens: z.number().int().min(0).optional(),
    outputTokens: z.number().int().min(0).optional(),
    errorCode: z.string().max(80).optional()
  })
  .passthrough();

export const toolBrokerEventPayloadV1Schema = z
  .object({
    operationId: z.string().min(8),
    toolName: z.string().min(1),
    toolVersion: z.string().min(1),
    policyReasonCode: z.string().min(1),
    sideEffectState: z
      .enum(["prepared", "sent", "confirmed", "failed", "uncertain", "reconciled"])
      .optional(),
    connectionId: z.uuid().optional(),
    approvalId: z.uuid().optional(),
    providerRequestId: z.string().optional(),
    errorCode: z.string().optional(),
    fence: z.number().int().positive()
  })
  .passthrough();

export const agentExecutionEventPayloadV1Schema = z
  .object({
    executionId: z.uuid(),
    runId: z.uuid().optional(),
    taskId: z.uuid().optional(),
    agentId: z.uuid().optional(),
    agentVersion: z.number().int().positive().optional(),
    state: z.string().max(80),
    turn: z.number().int().positive().optional(),
    contextManifestId: z.uuid().optional(),
    outputHash: z.string().optional(),
    errorCode: z.string().optional()
  })
  .passthrough();

export const memoryLifecycleEventPayloadV1Schema = z
  .object({
    memoryId: z.uuid(),
    agentId: z.uuid(),
    scope: z.enum(["execution", "user_private", "workspace_shared"]),
    version: z.number().int().positive(),
    operation: z.string().max(80),
    valueHash: z.string().optional(),
    reason: z.string().optional(),
    purgeAfter: z.iso.datetime().optional()
  })
  .passthrough();

export const evaluationEventPayloadV1Schema = z
  .object({
    workspaceId: z.uuid(),
    agentId: z.uuid(),
    agentVersion: z.number().int().positive(),
    evalRunId: z.uuid().optional(),
    datasetVersionId: z.uuid().optional(),
    comparisonId: z.uuid().optional(),
    state: z.string().min(1),
    sampleSize: z.number().int().min(0).optional(),
    score: z.number().min(0).max(1).optional(),
    reasonCode: z.string().optional()
  })
  .passthrough();

export const agentReleaseEventPayloadV1Schema = z
  .object({
    workspaceId: z.uuid(),
    agentId: z.uuid(),
    agentVersion: z.number().int().positive(),
    releaseId: z.uuid(),
    environment: z.string(),
    channel: z.string(),
    canaryPercentage: z.number().int().min(0).max(100),
    comparisonId: z.uuid(),
    rollbackOf: z.uuid().optional()
  })
  .passthrough();

export const fileLifecycleEventPayloadV1Schema = z
  .object({
    workspaceId: z.uuid(),
    fileId: z.uuid(),
    fileVersion: z.number().int().nonnegative(),
    state: z.string().min(1),
    checksum: z.string().optional(),
    processingJobId: z.uuid().optional(),
    reasonCodes: z.array(z.string()).default([]),
    downstreamEventId: z.uuid().optional()
  })
  .passthrough();

export const knowledgeRetrievalEventPayloadV1Schema = z
  .object({
    workspaceId: z.uuid(),
    sourceId: z.uuid().optional(),
    documentId: z.uuid().optional(),
    generationId: z.uuid().optional(),
    manifestId: z.uuid().optional(),
    aclEpoch: z.number().int().nonnegative().optional(),
    queryHash: z.string().optional(),
    resultCount: z.number().int().nonnegative().optional(),
    latencyMs: z.number().int().nonnegative().optional(),
    reason: z.string().optional()
  })
  .passthrough();

export const knowledgeGraphEventPayloadV1Schema = z
  .object({
    workspaceId: z.uuid(),
    entityId: z.uuid().optional(),
    relationId: z.uuid().optional(),
    sourceEntityId: z.uuid().optional(),
    targetEntityId: z.uuid().optional(),
    revision: z.number().int().positive().optional(),
    factKind: z.enum(["provider", "user", "inferred", "suggestion"]).optional(),
    provenancePacketId: z.uuid().optional(),
    reason: z.string().optional()
  })
  .passthrough();

export const connectorEventPayloadV1Schema = z
  .object({
    connectionId: z.string().uuid(),
    connectorKey: connectorKeySchema.optional(),
    syncId: z.string().uuid().optional(),
    state: z.string().max(80).optional(),
    errorKind: z.string().max(80).optional(),
    objectCount: z.number().int().nonnegative().optional(),
    permissionChangeCount: z.number().int().nonnegative().optional(),
    webhookReceiptId: z.string().uuid().optional()
  })
  .passthrough();

export const triggerEventPayloadV1Schema = z
  .object({
    triggerId: z.string().uuid(),
    triggerVersionId: z.string().uuid().optional(),
    receiptId: z.string().uuid().optional(),
    queueId: z.string().uuid().optional(),
    runId: z.string().uuid().optional(),
    sourceId: z.string().max(200).optional(),
    providerEventId: z.string().max(240).optional(),
    state: z.string().max(80).optional(),
    reason: z.string().max(240).optional(),
    nextFireAt: z.iso.datetime().optional(),
    operationId: z.string().uuid().optional(),
    providerReceiptId: z.string().max(240).optional()
  })
  .passthrough();

export const EVENT_SCHEMA_REGISTRY = [
  {
    eventType: "workflow.created",
    eventVersion: 1,
    owner: "workflow-platform",
    schema: workflowCreatedPayloadV1Schema
  },
  {
    eventType: "workflow.published",
    eventVersion: 1,
    owner: "workflow-platform",
    schema: workflowPublishedPayloadV1Schema
  },
  {
    eventType: "identity.authorization_started",
    eventVersion: 1,
    owner: "identity-platform",
    schema: identityAuthorizationPayloadV1Schema
  },
  {
    eventType: "identity.authorization_consumed",
    eventVersion: 1,
    owner: "identity-platform",
    schema: identityAuthorizationPayloadV1Schema
  },
  {
    eventType: "identity.authorization_failed",
    eventVersion: 1,
    owner: "identity-platform",
    schema: identityAuthorizationPayloadV1Schema
  },
  {
    eventType: "identity.session_created",
    eventVersion: 1,
    owner: "identity-platform",
    schema: identitySessionPayloadV1Schema
  },
  {
    eventType: "identity.session_revoked",
    eventVersion: 1,
    owner: "identity-platform",
    schema: identitySessionPayloadV1Schema
  },
  ...[
    "workspace.created",
    "workspace.updated",
    "workspace.archived",
    "workspace.active",
    "workspace.deleting",
    "member.updated",
    "member.removed",
    "ownership.transferred",
    "role.created",
    "role.updated",
    "role.deleted",
    "invitation.created",
    "invitation.cancelled",
    "invitation.accepted",
    "invitation.declined",
    "group.created",
    "group.updated",
    "group.deleted",
    "organization.relationship.created",
    "onboarding.updated",
    "sandbox.sample.created",
    "sandbox.sample.removed"
  ].map((eventType) => ({
    eventType,
    eventVersion: 1,
    owner: "workspace-access",
    schema: workspaceAccessPayloadV1Schema
  })),
  ...[
    "run.queued",
    "run.running",
    "run.paused",
    "run.cancelling",
    "run.cancelled",
    "run.succeeded",
    "run.failed",
    "run.policy_stopped",
    "task.started",
    "task.succeeded",
    "task.claimed",
    "task.unclaimed",
    "task.reassigned",
    "task.delegated",
    "task.clarification_requested",
    "task.submitted",
    "task.reopened",
    "task.watched",
    "task.unwatched",
    "usage.reservation_created",
    "usage.reservation_finalized",
    "usage.reservation_released"
  ].map((eventType) => ({
    eventType,
    eventVersion: 1,
    owner: "runtime-platform",
    schema: runtimeTransitionPayloadV1Schema
  })),
  ...[
    "approval.requested",
    "approval.delegated",
    "approval.abstained",
    "approval.decided",
    "approval.revision_requested",
    "approval.expired",
    "approval.reminded",
    "approval.revoked",
    "approval.consumed"
  ].map((eventType) => ({
    eventType,
    eventVersion: 1,
    owner: "approval-platform",
    schema: approvalEventPayloadV1Schema
  })),
  ...[
    "agent.created",
    "agent.draft_updated",
    "agent.version_published",
    "agent.simulated",
    "agent.archived"
  ].map((eventType) => ({
    eventType,
    eventVersion: 1,
    owner: "agent-platform",
    schema: agentFoundryEventPayloadV1Schema
  })),
  ...[
    "model.invocation_started",
    "model.invocation_completed",
    "model.invocation_incomplete",
    "model.invocation_refused",
    "model.invocation_failed",
    "model.circuit_opened"
  ].map((eventType) => ({
    eventType,
    eventVersion: 1,
    owner: "model-platform",
    schema: modelGatewayEventPayloadV1Schema
  })),
  ...[
    "tool.execution_prepared",
    "tool.execution_confirmed",
    "tool.execution_failed",
    "tool.execution_uncertain",
    "tool.execution_reconciled",
    "tool.kill_switch_changed"
  ].map((eventType) => ({
    eventType,
    eventVersion: 1,
    owner: "tool-platform",
    schema: toolBrokerEventPayloadV1Schema
  })),
  ...[
    "agent.execution_queued",
    "agent.execution_started",
    "agent.turn_completed",
    "agent.approval_waiting",
    "agent.execution_succeeded",
    "agent.execution_failed",
    "agent.execution_cancelled"
  ].map((eventType) => ({
    eventType,
    eventVersion: 1,
    owner: "agent-runtime",
    schema: agentExecutionEventPayloadV1Schema
  })),
  ...[
    "memory.created",
    "memory.corrected",
    "memory.scope_changed",
    "memory.tombstoned",
    "memory.expired",
    "memory.permission_invalidated",
    "memory.purged"
  ].map((eventType) => ({
    eventType,
    eventVersion: 1,
    owner: "agent-memory",
    schema: memoryLifecycleEventPayloadV1Schema
  })),
  ...[
    "evaluation.dataset_version_published",
    "evaluation.run_queued",
    "evaluation.run_started",
    "evaluation.run_succeeded",
    "evaluation.run_failed",
    "evaluation.run_cancelled",
    "evaluation.comparison_created",
    "evaluation.gate_passed",
    "evaluation.gate_blocked",
    "evaluation.human_review_requested",
    "evaluation.human_review_adjudicated"
  ].map((eventType) => ({
    eventType,
    eventVersion: 1,
    owner: "agent-evaluation",
    schema: evaluationEventPayloadV1Schema
  })),
  ...["agent.release_promoted", "agent.release_canary_changed", "agent.release_rolled_back"].map(
    (eventType) => ({
      eventType,
      eventVersion: 1,
      owner: "agent-release",
      schema: agentReleaseEventPayloadV1Schema
    })
  ),
  ...[
    "file.upload_initiated",
    "file.upload_completed",
    "file.scan_completed",
    "file.quarantined",
    "file.processing_started",
    "file.processing_completed",
    "file.version_replaced",
    "file.downloaded",
    "file.deleted",
    "knowledge.file_deleted"
  ].map((eventType) => ({
    eventType,
    eventVersion: 1,
    owner: "file-platform",
    schema: fileLifecycleEventPayloadV1Schema
  })),
  ...[
    "knowledge.index_started",
    "knowledge.index_completed",
    "knowledge.reindex_started",
    "knowledge.reindex_completed",
    "knowledge.generation_promoted",
    "knowledge.acl_projection_advanced",
    "knowledge.permission_invalidated",
    "knowledge.authorization_proof_minted",
    "knowledge.retrieval_completed",
    "knowledge.citation_opened",
    "knowledge.source_deleted"
  ].map((eventType) => ({
    eventType,
    eventVersion: 1,
    owner: "knowledge-platform",
    schema: knowledgeRetrievalEventPayloadV1Schema
  })),
  ...[
    "knowledge.entity_created",
    "knowledge.entity_changed",
    "knowledge.entity_merge_proposed",
    "knowledge.entity_merged",
    "knowledge.entity_split",
    "knowledge.fact_conflict_detected",
    "knowledge.relation_created",
    "knowledge.type_version_published",
    "knowledge.provenance_exported",
    "knowledge.admin_repair_requested"
  ].map((eventType) => ({
    eventType,
    eventVersion: 1,
    owner: "knowledge-graph",
    schema: knowledgeGraphEventPayloadV1Schema
  })),
  ...[
    "connection.authorized",
    "connection.auth_expired",
    "connection.degraded",
    "connection.disabled",
    "connection.resumed",
    "connection.sync_started",
    "connection.sync_completed",
    "connection.sync_failed",
    "connection.removed",
    "connection.webhook_received",
    "source_object.changed",
    "connection.source_selection_changed",
    "source_object.permission_changed",
    "provider.action_completed",
    "provider.action_reconciled",
    "provider.metadata_refreshed",
    "provider.identity_bound",
    "provider.webhook_quarantined",
    "provider.capability_changed",
    "connector.delta_reset",
    "connector.import_completed",
    "connector.import_rolled_back",
    "webhook.delivery_dead_lettered",
    "connector.resource_access_revoked"
  ].map((eventType) => ({
    eventType,
    eventVersion: 1,
    owner: "connector-platform",
    schema: connectorEventPayloadV1Schema
  })),
  ...[
    "trigger.version_published",
    "trigger.event_received",
    "trigger.event_filtered",
    "trigger.event_deduplicated",
    "trigger.dispatch_queued",
    "trigger.started",
    "trigger.paused",
    "trigger.schedule_advanced",
    "outbound.sync_uncertain",
    "outbound.sync_reconciled"
  ].map((eventType) => ({
    eventType,
    eventVersion: 1,
    owner: "trigger-platform",
    schema: triggerEventPayloadV1Schema
  }))
] as const;

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;
