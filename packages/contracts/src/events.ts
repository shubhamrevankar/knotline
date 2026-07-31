import { z } from "zod";

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

export const EVENT_SCHEMA_REGISTRY = [
  {
    eventType: "workflow.created",
    eventVersion: 1,
    owner: "workflow-platform",
    schema: workflowCreatedPayloadV1Schema
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
  }
] as const;

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;
