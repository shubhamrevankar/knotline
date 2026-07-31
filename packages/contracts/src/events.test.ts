import { describe, expect, it } from "vitest";

import {
  EVENT_SCHEMA_REGISTRY,
  eventEnvelopeSchema,
  workflowCreatedPayloadV1Schema
} from "./events.js";

describe("event contracts", () => {
  it("registers unique event type/version pairs", () => {
    const keys = EVENT_SCHEMA_REGISTRY.map(
      (event) => `${event.eventType}@${String(event.eventVersion)}`
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("rejects missing payload fields while tolerating additive event evolution", () => {
    expect(() =>
      workflowCreatedPayloadV1Schema.parse({
        workflowId: "wf_demo",
        createdAt: new Date().toISOString()
      })
    ).toThrow();
    expect(
      workflowCreatedPayloadV1Schema.parse({
        workflowId: "wf_demo",
        name: "Demo workflow",
        createdAt: new Date().toISOString(),
        extra: true
      }).extra
    ).toBe(true);
    expect(
      eventEnvelopeSchema.parse({
        eventId: "evt_01ABC",
        eventType: "workflow.created",
        eventVersion: 1,
        occurredAt: new Date().toISOString(),
        workspaceId: "ws_demo",
        aggregateType: "workflow",
        aggregateId: "wf_demo",
        aggregateVersion: 1,
        correlationId: "run_demo",
        causationId: "attempt_demo",
        actor: { type: "user", id: "user_demo", display: "ignored by old consumers" },
        trace: { traceparent: "00-11111111111111111111111111111111-2222222222222222-01" },
        data: {},
        additiveField: true
      }).additiveField
    ).toBe(true);
    expect(
      eventEnvelopeSchema.safeParse({
        eventId: "evt_01ABC",
        eventType: "workflow.created",
        eventVersion: 1,
        occurredAt: new Date().toISOString(),
        workspaceId: "ws_demo",
        aggregateType: "workflow",
        aggregateId: "wf_demo",
        aggregateVersion: 1,
        correlationId: "run_demo",
        causationId: "attempt_demo",
        actor: { type: "user", id: "user_demo" },
        trace: { traceparent: "00-11111111111111111111111111111111-2222222222222222-01" }
      }).success
    ).toBe(false);
  });
});
