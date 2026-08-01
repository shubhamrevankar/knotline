import { createHash, timingSafeEqual } from "node:crypto";
export interface SsoTransaction {
  readonly connectionId: string;
  readonly requestId: string;
  readonly relayState: string;
  readonly browserNonce: string;
  readonly acs: string;
  readonly expiresAt: number;
}
export function verifySsoBinding(
  transaction: SsoTransaction,
  input: SsoTransaction,
  now = Date.now()
) {
  return (
    transaction.expiresAt >= now &&
    Object.keys(transaction).every((key) => {
      const left = Buffer.from(String(transaction[key as keyof SsoTransaction])),
        right = Buffer.from(String(input[key as keyof SsoTransaction]));
      return left.length === right.length && timingSafeEqual(left, right);
    })
  );
}
export function scimEtag(version: number) {
  return `W/"${version}"`;
}
export function domainChallenge(domain: string, nonce: string) {
  return `knotline-verification=${createHash("sha256").update(`${domain}.${nonce}`).digest("hex")}`;
}
export function resolvePolicy<T>(
  organization: T | undefined,
  workspace: T | undefined,
  exception: T | undefined
): T | undefined {
  return exception ?? workspace ?? organization;
}
