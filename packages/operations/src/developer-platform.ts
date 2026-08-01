import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
export function issueApiCredential(environment: "test" | "live") {
  const secret = randomBytes(32).toString("base64url"),
    prefix = `kn_${environment}_${secret.slice(0, 10)}`;
  return { token: `${prefix}.${secret}`, prefix, hash: hashApiCredential(secret) };
}
export const hashApiCredential = (secret: string) =>
  createHash("sha256").update(secret).digest("hex");
export function verifyApiCredential(token: string, expectedHash: string) {
  const secret = token.split(".")[1] ?? "",
    actual = Buffer.from(hashApiCredential(secret), "hex"),
    expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function signDeveloperWebhook(raw: Buffer, secret: string, timestamp: number, version = 1) {
  return `v${version}=${createHmac("sha256", secret).update(`${timestamp}.`).update(raw).digest("hex")}`;
}
export function rateLimitHeaders(limit: number, remaining: number, resetAt: number) {
  return {
    "ratelimit-limit": String(limit),
    "ratelimit-remaining": String(Math.max(0, remaining)),
    "ratelimit-reset": String(resetAt)
  };
}
