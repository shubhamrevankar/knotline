import { createHmac, timingSafeEqual } from "node:crypto";
export interface EntitlementDecision {
  readonly allowed: boolean;
  readonly policyVersion: string;
  readonly reason: string;
  readonly remaining: string;
  readonly grace: boolean;
}
export function decideEntitlement(
  limit: bigint,
  committed: bigint,
  reserved: bigint,
  requested: bigint,
  policyVersion: string,
  grace = false
): EntitlementDecision {
  const remaining = limit - committed - reserved;
  return {
    allowed: grace || requested <= remaining,
    policyVersion,
    reason: grace ? "billing_grace" : requested <= remaining ? "within_limit" : "hard_limit",
    remaining: String(remaining > 0n ? remaining : 0n),
    grace
  };
}
export function verifyBillingSignature(raw: Buffer, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const actual = Buffer.from(signature, "hex");
  const reference = Buffer.from(expected, "hex");
  return actual.length === reference.length && timingSafeEqual(actual, reference);
}
export function reconcileFixedAmount(entries: readonly { amount: string }[]): string {
  return entries
    .reduce((sum, item) => {
      const negative = item.amount.startsWith("-");
      const [whole = "0", fraction = ""] = item.amount.replace(/^[+-]/u, "").split(".");
      const scaled =
        BigInt(whole) * 1_000_000_000_000n + BigInt(fraction.padEnd(12, "0").slice(0, 12));
      return sum + (negative ? -scaled : scaled);
    }, 0n)
    .toString();
}
