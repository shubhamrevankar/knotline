import { describe, expect, it } from "vitest";
import {
  DeliveryCircuitBreaker,
  ReplayWindow,
  authorizeInteractiveAction,
  collapseIntents,
  compileDigest,
  deliveryDecision,
  renderEmail,
  signDelivery,
  verifyDelivery,
  type NotificationIntent,
  type NotificationPreference
} from "./notifications.js";
const intent = (overrides: Partial<NotificationIntent> = {}): NotificationIntent => ({
  id: crypto.randomUUID(),
  workspaceId: "w",
  recipientId: "u",
  eventType: "task.assigned",
  resourceType: "task",
  resourceId: "r",
  dedupeKey: "task:r",
  occurredAt: "2026-08-01T10:00:00.000Z",
  priority: "normal",
  ...overrides
});
const preference: NotificationPreference = {
  eventType: "task.assigned",
  channels: { in_app: "immediate", email: "daily_digest", slack: "off" },
  timeZone: "Asia/Kolkata",
  language: "en",
  quietHours: { start: "22:00", end: "07:00" }
};
describe("notification delivery policy", () => {
  it("honors channel cadence and overnight quiet hours", () => {
    expect(
      deliveryDecision(intent(), preference, "email", new Date("2026-08-01T18:00:00Z"))
    ).toMatchObject({ state: "deferred" });
    expect(
      deliveryDecision(intent(), preference, "in_app", new Date("2026-08-01T10:00:00Z"))
    ).toMatchObject({ state: "immediate" });
  });
  it("protects mandatory security and explicit escalation", () => {
    expect(
      deliveryDecision(intent({ eventType: "security.credential_revoked" }), preference, "slack")
    ).toMatchObject({ state: "immediate", reason: "mandatory_security" });
    expect(deliveryDecision(intent({ priority: "critical" }), preference, "slack")).toMatchObject({
      state: "immediate"
    });
  });
  it("collapses only matching recipient keys inside the window", () =>
    expect(
      collapseIntents([
        intent(),
        intent({ occurredAt: "2026-08-01T10:01:00Z" }),
        intent({ recipientId: "other" })
      ]).map((group) => group.length)
    ).toEqual([2, 1]));
  it("rechecks authorization while compiling a digest", () =>
    expect(
      compileDigest(
        [intent(), intent({ resourceId: "revoked", dedupeKey: "revoked" })],
        (value) => value.resourceId !== "revoked"
      )
    ).toHaveLength(1));
  it("escapes email and rejects header injection or external links", () => {
    expect(
      renderEmail({
        subject: "Assigned",
        title: "<Review>",
        body: "A & B",
        link: "/app/tasks/1",
        origin: "https://product.example"
      }).html
    ).toContain("&lt;Review&gt;");
    expect(() =>
      renderEmail({
        subject: "x\nBcc:y",
        title: "x",
        body: "x",
        link: "/app",
        origin: "https://product.example"
      })
    ).toThrow("EMAIL_HEADER_INJECTION");
    expect(() =>
      renderEmail({
        subject: "x",
        title: "x",
        body: "x",
        link: "https://evil.example/x",
        origin: "https://product.example"
      })
    ).toThrow("UNSAFE_NOTIFICATION_LINK");
  });
  it("signs deliveries and blocks replays", () => {
    const key = new TextEncoder().encode("local-test-signing-key"),
      body = '{"id":"n1"}',
      signature = signDelivery(body, 100, key);
    expect(verifyDelivery(body, 100, signature, key)).toBe(true);
    const replay = new ReplayWindow();
    expect(replay.accept("delivery-1", 1000, 1000)).toBe(true);
    expect(replay.accept("delivery-1", 1000, 1001)).toBe(false);
  });
  it("binds chat actions to eligible identities exactly once", () => {
    const consumed = new Set<string>(),
      input = {
        actorId: "u",
        eligibleIds: ["u"],
        expiresAt: "2099-01-01T00:00:00Z",
        operationId: "op"
      };
    expect(authorizeInteractiveAction(input, consumed)).toMatchObject({ accepted: true });
    expect(() => authorizeInteractiveAction(input, consumed)).toThrow("INTERACTION_DUPLICATE");
  });
  it("opens and recovers a provider circuit", () => {
    const circuit = new DeliveryCircuitBreaker(2, 100);
    circuit.record(false, 0);
    circuit.record(false, 1);
    expect(circuit.allow(50)).toBe(false);
    expect(circuit.allow(102)).toBe(true);
  });
});
