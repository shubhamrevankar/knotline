import { describe, expect, it, vi } from "vitest";
import { assertSafeLiveHttpEndpoint, executeLiveHttpRequest } from "./live-http.js";

describe("live HTTP connector", () => {
  it("rejects non-HTTPS and private destinations", async () => {
    await expect(assertSafeLiveHttpEndpoint("http://example.com/hook")).rejects.toThrow(
      "ENDPOINT_HTTPS_REQUIRED"
    );
    await expect(
      assertSafeLiveHttpEndpoint("https://service.example/hook", () =>
        Promise.resolve([{ address: "10.1.2.3", family: 4 }])
      )
    ).rejects.toThrow("ENDPOINT_PRIVATE_NETWORK");
  });

  it("sends bounded JSON with a stable operation key", async () => {
    const fetcher = vi.fn((_url: URL | RequestInfo, init?: RequestInit) => {
      expect(init?.redirect).toBe("manual");
      expect((init?.headers as Record<string, string>)["idempotency-key"]).toBe("run:node");
      return Promise.resolve(
        new Response(JSON.stringify({ accepted: true }), {
          status: 202,
          headers: { "content-type": "application/json" }
        })
      );
    });
    const result = await executeLiveHttpRequest(
      {
        endpoint: "https://hooks.example.test/events",
        method: "POST",
        timeoutMs: 1000,
        operationId: "run:node",
        body: { hello: "world" }
      },
      {
        fetch: fetcher,
        resolve: () => Promise.resolve([{ address: "203.0.113.5", family: 4 }]),
        now: () => 100
      }
    );
    expect(result).toMatchObject({ status: 202, ok: true, body: { accepted: true } });
  });
});
