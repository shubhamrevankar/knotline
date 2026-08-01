import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { decideEntitlement, reconcileFixedAmount, verifyBillingSignature } from "./billing.js";
describe("billing controls", () => {
  it("rejects concurrent work beyond the reserved boundary", () => {
    expect(decideEntitlement(100n, 70n, 20n, 11n, "v1")).toMatchObject({
      allowed: false,
      remaining: "10"
    });
    expect(decideEntitlement(100n, 70n, 20n, 10n, "v1").allowed).toBe(true);
  });
  it("allows disclosed grace without hiding the exhausted limit", () =>
    expect(decideEntitlement(1n, 1n, 0n, 2n, "v2", true)).toMatchObject({
      allowed: true,
      remaining: "0",
      grace: true
    }));
  it("verifies exact raw webhook bytes", () => {
    const raw = Buffer.from('{"id":"evt_1"}'),
      secret = "fixture";
    const signature = createHmac("sha256", secret).update(raw).digest("hex");
    expect(verifyBillingSignature(raw, signature, secret)).toBe(true);
    expect(verifyBillingSignature(Buffer.from("changed"), signature, secret)).toBe(false);
    expect(verifyBillingSignature(raw, "00", secret)).toBe(false);
  });
  it("keeps sub-unit arithmetic exact", () =>
    expect(
      reconcileFixedAmount([
        { amount: "1.000000000001" },
        { amount: "0.000000000002" },
        { amount: "-1.000000000000" }
      ])
    ).toBe("3"));
  it("normalizes omitted whole and fractional components", () => {
    expect(reconcileFixedAmount([{ amount: ".5" }, { amount: "+1" }])).toBe("1500000000000");
  });
});
