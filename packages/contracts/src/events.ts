import { z } from "zod";

import { modelRoleSchema } from "./model-gateway.js";

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
  }))
] as const;

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;
