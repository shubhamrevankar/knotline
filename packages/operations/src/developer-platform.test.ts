import { describe, expect, it } from "vitest";
import {
  hashApiCredential,
  issueApiCredential,
  rateLimitHeaders,
  signDeveloperWebhook,
  verifyApiCredential
} from "./developer-platform.js";
describe("developer credentials and webhooks", () => {
  it("displays a secret once and verifies only its hash", () => {
    const issued = issueApiCredential("test");
    expect(issued.token.startsWith("kn_test_")).toBe(true);
    expect(verifyApiCredential(issued.token, issued.hash)).toBe(true);
    expect(verifyApiCredential(`${issued.prefix}.wrong`, issued.hash)).toBe(false);
    expect(verifyApiCredential("malformed", "00")).toBe(false);
  });
  it("signs exact timestamped bytes", () => {
    const one = signDeveloperWebhook(Buffer.from("{}"), "secret", 1);
    expect(one).toMatch(/^v1=/u);
    expect(signDeveloperWebhook(Buffer.from("{ }"), "secret", 1)).not.toBe(one);
  });
  it("publishes bounded rate metadata", () =>
    expect(rateLimitHeaders(100, -1, 42)).toEqual({
      "ratelimit-limit": "100",
      "ratelimit-remaining": "0",
      "ratelimit-reset": "42"
    }));
  it("hashes without retaining cleartext", () =>
    expect(hashApiCredential("secret")).toHaveLength(64));
});
