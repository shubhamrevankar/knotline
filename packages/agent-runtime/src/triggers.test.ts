import { describe, expect, it } from "vitest";
import {
  OutboundOperationJournal,
  TriggerEventGate,
  evaluateFilter,
  fairTriggerBuffer,
  mapEventFields,
  nextSchedule,
  normalizeInboundEvent,
  replayCapturedEvent,
  validateTrigger,
  type TriggerDefinition
} from "./triggers.js";
const trigger: TriggerDefinition = {
  id: "t",
  version: 1,
  workflowVersion: 2,
  type: "connector_event",
  environment: "production",
  connectionId: "c",
  requiredScopes: ["read"],
  schemaVersion: "v1",
  deduplication: "event_id",
  concurrency: 2,
  ratePerMinute: 60,
  paused: false
};
describe("production triggers", () => {
  it("validates version, connection, scope, and explicit unstable identity", () => {
    expect(validateTrigger(trigger, ["read"])).toEqual(trigger);
    const { connectionId: omittedConnection, ...missingConnection } = trigger;
    expect(omittedConnection).toBe("c");
    expect(() => validateTrigger(missingConnection, ["read"])).toThrow(
      "TRIGGER_CONNECTION_REQUIRED"
    );
    expect(validateTrigger({ ...trigger, deduplication: "none_explicit" }, ["read"])).toMatchObject(
      { warning: "PROVIDER_HAS_NO_STABLE_EVENT_ID" }
    );
  });
  it("previews timezone schedules across leap day and exclusions", () => {
    const dates = nextSchedule(
      {
        cron: "30 9 * * *",
        timeZone: "Asia/Kolkata",
        missed: "skip",
        jitterSeconds: 0,
        exclusions: ["2028-02-29"]
      },
      new Date("2028-02-28T03:59:00Z"),
      2
    );
    expect(dates.map((date) => date.toISOString())).toEqual([
      "2028-02-28T04:00:00.000Z",
      "2028-03-01T04:00:00.000Z"
    ]);
  });
  it("handles DST spring gap and fall duplicate by actual instants", () => {
    expect(
      nextSchedule(
        { cron: "30 2 * * *", timeZone: "America/New_York", missed: "skip", jitterSeconds: 0 },
        new Date("2026-03-08T00:00:00Z"),
        1
      )[0]?.toISOString()
    ).toBe("2026-03-09T06:30:00.000Z");
    expect(
      nextSchedule(
        { cron: "30 1 * * *", timeZone: "America/New_York", missed: "catch_up", jitterSeconds: 0 },
        new Date("2026-11-01T04:00:00Z"),
        2
      ).map((date) => date.toISOString())
    ).toEqual(["2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z"]);
  });
  it("normalizes payload behind encrypted reference and supports typed mapping/filter", () => {
    const raw = {
      provider: "fixture",
      connectionId: "c",
      sourceId: "s",
      eventId: "e1",
      occurredAt: "2026-01-01T00:00:00Z",
      receivedAt: "2026-01-01T00:00:01Z",
      schemaVersion: "v1",
      payload: { record: { status: "ready", count: 2 } }
    };
    const event = normalizeInboundEvent(raw);
    expect(event).not.toHaveProperty("payload");
    expect(event.encryptedPayloadReference).toMatch(/^encrypted:/u);
    expect(
      evaluateFilter(raw.payload, [
        { field: "record.status", operator: "eq", value: "ready" },
        { field: "record.count", operator: "gte", value: 2 }
      ])
    ).toBe(true);
    expect(mapEventFields(raw.payload, { status: "record.status" })).toEqual({ status: "ready" });
  });
  it("deduplicates and bounds reorder while preserving checkpoint", () => {
    const gate = new TriggerEventGate(10),
      base = normalizeInboundEvent({
        provider: "p",
        connectionId: "c",
        sourceId: "s",
        eventId: "e",
        sequence: 20,
        occurredAt: "2026-01-01T00:00:00Z",
        receivedAt: "2026-01-01T00:00:00Z",
        schemaVersion: "v1",
        payload: { a: 1 }
      });
    expect(gate.accept(trigger, base)).toMatchObject({ accepted: true, checkpoint: 20 });
    expect(gate.accept(trigger, base).reason).toBe("DUPLICATE");
    expect(
      gate.accept(
        { ...trigger, deduplication: "source_sequence" },
        { ...base, eventId: "old", sequence: 1 }
      ).reason
    ).toBe("OUTSIDE_REORDER_WINDOW");
  });
  it("buffers fairly with per-trigger concurrency", () => {
    const selected = fairTriggerBuffer(
      [
        { workspaceId: "b", triggerId: "x" },
        { workspaceId: "a", triggerId: "x" },
        { workspaceId: "a", triggerId: "x" },
        { workspaceId: "a", triggerId: "y" }
      ],
      4,
      1
    );
    expect(selected.map((item) => `${item.workspaceId}:${item.triggerId}`)).toEqual([
      "a:x",
      "b:x",
      "a:y"
    ]);
  });
  it("prevents captured fixtures from affecting production without exact confirmation", () => {
    expect(() =>
      replayCapturedEvent({ captureEnvironment: "test", targetEnvironment: "production" })
    ).toThrow("PRODUCTION_REPLAY_CONFIRMATION_REQUIRED");
    expect(
      replayCapturedEvent({ captureEnvironment: "test", targetEnvironment: "test" })
    ).toMatchObject({ allowed: true, redactionRequired: true });
  });
  it("journals idempotent outbound writes and reconciles uncertainty", () => {
    const journal = new OutboundOperationJournal(),
      operation = {
        id: "o",
        provider: "p",
        accountId: "a",
        targetId: "t",
        action: "update",
        contentHash: "h",
        approvalId: "approval",
        idempotencyKey: "key",
        state: "UNCERTAIN" as const
      };
    expect(journal.record(operation)).toEqual(journal.record({ ...operation, id: "different" }));
    expect(journal.reconcile("key", { providerId: "1" })).toMatchObject({
      state: "CONFIRMED",
      receipt: { providerId: "1" }
    });
  });
});
