import { describe, expect, it } from "vitest";
import { createLogRecord, redactLogAttributes } from "./logging.js";
import { defineMetric } from "./metrics.js";

describe("structured logging", () => {
  it("redacts secrets and customer content recursively", () => {
    expect(
      redactLogAttributes(
        {
          authorization: "Bearer private",
          nested: { password: "private", apiKey: "private", result: "ok" },
          payload: { customer: "private" },
          count: 3n,
          error: new Error("private database detail"),
          values: [null, true, Number.POSITIVE_INFINITY, new Date("2026-07-31T00:00:00.000Z")],
          customPrivate: "private",
          unsupported: Symbol("value")
        },
        { redactedKeys: ["custom-private"] }
      )
    ).toEqual({
      authorization: "[REDACTED]",
      nested: { password: "[REDACTED]", apiKey: "[REDACTED]", result: "ok" },
      payload: "[REDACTED]",
      count: "3",
      error: { name: "Error", message: "[REDACTED]" },
      values: [null, true, "Infinity", "2026-07-31T00:00:00.000Z"],
      customPrivate: "[REDACTED]",
      unsupported: "Symbol(value)"
    });
  });

  it("creates deterministic, named records and bounds traversal", () => {
    expect(
      createLogRecord(
        {
          level: "info",
          event: "http.request.complete",
          message: "Request completed",
          context: { service: "api", environment: "test" },
          attributes: { nested: { value: "hidden by depth" } }
        },
        { maximumDepth: 0 },
        () => new Date("2026-07-31T00:00:00.000Z")
      )
    ).toMatchObject({
      timestamp: "2026-07-31T00:00:00.000Z",
      event: "http.request.complete",
      attributes: { nested: { value: "[REDACTED]" } }
    });
    expect(() =>
      createLogRecord({
        level: "info",
        event: "Invalid Event",
        message: "bad",
        context: { service: "api", environment: "test" }
      })
    ).toThrow("Invalid log event name");
    expect(() => redactLogAttributes({}, { maximumDepth: 33 })).toThrow("maximumDepth");
  });
});

describe("metric naming", () => {
  it("accepts low-cardinality, namespaced metrics", () => {
    expect(
      defineMetric({
        name: "knotline_http_requests_total",
        kind: "counter",
        description: "Accepted HTTP requests.",
        labels: ["method", "route", "status_code"]
      }).name
    ).toBe("knotline_http_requests_total");
  });

  it("rejects naming and cardinality hazards", () => {
    expect(() =>
      defineMetric({ name: "http_requests_total", kind: "counter", description: "x", labels: [] })
    ).toThrow("knotline_snake_case");
    expect(() =>
      defineMetric({ name: "knotline_requests", kind: "counter", description: "x", labels: [] })
    ).toThrow("_total");
    expect(() =>
      defineMetric({
        name: "knotline_latency_seconds",
        kind: "histogram",
        description: "x",
        labels: ["workspace_id"]
      })
    ).toThrow("High-cardinality");
    expect(() =>
      defineMetric({
        name: "knotline_latency_seconds",
        kind: "histogram",
        description: "x",
        labels: ["Bad-Label"]
      })
    ).toThrow("Invalid metric label");
    expect(() =>
      defineMetric({
        name: "knotline_latency_seconds",
        kind: "histogram",
        description: "x",
        labels: ["result", "result"]
      })
    ).toThrow("Duplicate metric label");
    expect(() =>
      defineMetric({
        name: "knotline_latency_seconds",
        kind: "histogram",
        description: " ",
        labels: []
      })
    ).toThrow("description");
  });
});
