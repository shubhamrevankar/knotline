import { describe, expect, it } from "vitest";

import { classifyStatus, mayRetry, RequestFailure } from "./errors.js";

describe("safe request retry", () => {
  it("classifies status codes without retrying policy or input failures", () => {
    expect(classifyStatus(401)).toBe("authentication");
    expect(classifyStatus(403)).toBe("authorization");
    expect(classifyStatus(409)).toBe("conflict");
    expect(classifyStatus(429)).toBe("rate-limit");
    expect(classifyStatus(503)).toBe("server");
    expect(mayRetry(new RequestFailure("Denied", "authorization"), 0)).toBe(false);
  });

  it("bounds retries for transient failures", () => {
    const failure = new RequestFailure("Unavailable", "server", "request-1");
    expect(mayRetry(failure, 0)).toBe(true);
    expect(mayRetry(failure, 2)).toBe(false);
    expect(failure.requestId).toBe("request-1");
  });
});
