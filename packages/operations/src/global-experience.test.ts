import { describe, expect, it } from "vitest";
import { classifyOfflineRequest, contactRisk, guestScopeAllows } from "./global-experience.js";
describe("global experience", () => {
  it("never caches protected API or approval content", () => {
    expect(classifyOfflineRequest("POST", "/help")).toBe("network_only");
    expect(classifyOfflineRequest("GET", "/v1/me")).toBe("network_only");
    expect(classifyOfflineRequest("GET", "/app/approvals/a")).toBe("network_only");
    expect(classifyOfflineRequest("GET", "/app/credential-vault")).toBe("network_only");
    expect(classifyOfflineRequest("GET", "/")).toBe("public_shell");
    expect(classifyOfflineRequest("GET", "/help")).toBe("public_shell");
    expect(classifyOfflineRequest("GET", "/templates")).toBe("network_first");
  });
  it("rejects bot and malformed contact requests", () => {
    expect(
      contactRisk({ email: "a@example.test", message: "A legitimate request", honeypot: "filled" })
        .accepted
    ).toBe(false);
    expect(contactRisk({ email: "a@example.test", message: "A legitimate request" }).accepted).toBe(
      true
    );
    expect(contactRisk({ email: "a@example.test", message: "short" })).toEqual({
      accepted: false,
      reason: "length"
    });
    expect(contactRisk({ email: "a@example.test", message: "x".repeat(5001) })).toEqual({
      accepted: false,
      reason: "length"
    });
    expect(contactRisk({ email: "invalid", message: "A legitimate request" })).toEqual({
      accepted: false,
      reason: "email"
    });
  });
  it("enforces exact guest resource actions", () => {
    expect(guestScopeAllows(["approve:r1"], "approve", "r1")).toBe(true);
    expect(guestScopeAllows(["approve:r1"], "read", "r2")).toBe(false);
  });
});
