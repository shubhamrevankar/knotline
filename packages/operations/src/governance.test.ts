import { describe, expect, it } from "vitest";
import { auditEventHash, retentionPreview, verifyAuditChain } from "./governance.js";

describe("governance", () => {
  it("builds and verifies a canonical tamper-evident chain", () => {
    const first = { sequence: 1, action: "policy.changed" };
    const firstHash = auditEventHash("0".repeat(64), first);
    const second = { sequence: 2, action: "export.requested" };
    const secondHash = auditEventHash(firstHash, second);
    expect(
      verifyAuditChain([
        { ...first, priorHash: "0".repeat(64), eventHash: firstHash },
        { ...second, priorHash: firstHash, eventHash: secondHash }
      ])
    ).toBe(true);
    expect(
      verifyAuditChain([
        { ...first, action: "tampered", priorHash: "0".repeat(64), eventHash: firstHash }
      ])
    ).toBe(false);
  });
  it("excludes held records from destructive retention", () => {
    expect(retentionPreview(10, 3)).toEqual({ eligible: 7, held: 3, total: 10, destructive: true });
  });
});
