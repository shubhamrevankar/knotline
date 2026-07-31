import { describe, expect, it } from "vitest";
import {
  createRequestTraceContext,
  createRequestId,
  createSpanId,
  createTraceId,
  formatTraceparent,
  parseRequestId,
  parseSpanId,
  parseTraceId,
  parseTraceparent,
  type IdSource
} from "./context.js";

const source: IdSource = {
  randomUuid: () => "123e4567-e89b-12d3-a456-426614174000",
  randomBytes: (length) => new Uint8Array(length).fill(1)
};

describe("request and trace context", () => {
  it("preserves valid inbound IDs and W3C trace context", () => {
    const context = createRequestTraceContext(
      {
        requestId: "request_12345678",
        traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
      },
      source
    );

    expect(context).toEqual({
      requestId: "request_12345678",
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      parentSpanId: "00f067aa0ba902b7",
      sampled: true
    });
    expect(formatTraceparent(context.traceId, context.parentSpanId!, false)).toBe(
      "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00"
    );
  });

  it("replaces malformed inbound values", () => {
    expect(createRequestTraceContext({ requestId: "short", traceparent: "bad" }, source)).toEqual({
      requestId: "req_123e4567-e89b-12d3-a456-426614174000",
      traceId: "01010101010101010101010101010101",
      sampled: true
    });
    expect(parseRequestId("short")).toBeUndefined();
    expect(parseTraceId("00000000000000000000000000000000")).toBeUndefined();
    expect(parseSpanId("0000000000000000")).toBeUndefined();
    expect(parseTraceparent("00-xyz-invalid-00")).toBeUndefined();
    expect(createTraceId(source)).toBe("01010101010101010101010101010101");
    expect(createSpanId(source)).toBe("0101010101010101");
  });

  it("rejects a broken random source", () => {
    expect(() =>
      createRequestTraceContext({}, { ...source, randomBytes: (length) => new Uint8Array(length) })
    ).toThrow("all-zero trace ID");
    expect(() => createRequestId({ ...source, randomUuid: () => "bad" })).toThrow(
      "invalid request ID"
    );
    expect(() =>
      createSpanId({ ...source, randomBytes: (length) => new Uint8Array(length) })
    ).toThrow("all-zero span ID");
    expect(
      parseTraceparent("00-00000000000000000000000000000000-00f067aa0ba902b7-01")
    ).toBeUndefined();
  });

  it("uses the platform random source by default", () => {
    expect(createRequestId()).toMatch(/^req_/);
    expect(createTraceId()).toMatch(/^[0-9a-f]{32}$/);
    expect(createSpanId()).toMatch(/^[0-9a-f]{16}$/);
  });
});
