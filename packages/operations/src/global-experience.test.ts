import { describe, expect, it } from "vitest";
import { classifyOfflineRequest, contactRisk, guestScopeAllows } from "./global-experience.js";
describe("global experience", () => {
  it("never caches protected API or approval content", () => {
    expect(classifyOfflineRequest("GET", "/v1/me")).toBe("network_only");
    expect(classifyOfflineRequest("GET", "/app/approvals/a")).toBe("network_only");
    expect(classifyOfflineRequest("GET", "/help")).toBe("public_shell");
  });
  it("rejects bot and malformed contact requests", () => {
    expect(
      contactRisk({ email: "a@example.test", message: "A legitimate request", honeypot: "filled" })
        .accepted
    ).toBe(false);
    expect(contactRisk({ email: "a@example.test", message: "A legitimate request" }).accepted).toBe(
      true
    );
  });
  it("enforces exact guest resource actions", () => {
    expect(guestScopeAllows(["approve:r1"], "approve", "r1")).toBe(true);
    expect(guestScopeAllows(["approve:r1"], "read", "r2")).toBe(false);
  });
});
