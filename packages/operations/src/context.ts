declare const requestIdBrand: unique symbol;
declare const traceIdBrand: unique symbol;
declare const spanIdBrand: unique symbol;

export type RequestId = string & { readonly [requestIdBrand]: true };
export type TraceId = string & { readonly [traceIdBrand]: true };
export type SpanId = string & { readonly [spanIdBrand]: true };

export interface RequestTraceContext {
  readonly requestId: RequestId;
  readonly traceId: TraceId;
  readonly parentSpanId?: SpanId;
  readonly sampled: boolean;
}

export interface RequestContextInput {
  readonly requestId?: string | undefined;
  readonly traceparent?: string | undefined;
}

export interface IdSource {
  randomUuid(): string;
  randomBytes(length: number): Uint8Array;
}

const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const TRACE_ID = /^[0-9a-f]{32}$/;
const SPAN_ID = /^[0-9a-f]{16}$/;
const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

const defaultIdSource: IdSource = {
  randomUuid: () => crypto.randomUUID(),
  randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length))
};

export function parseRequestId(value: string): RequestId | undefined {
  return REQUEST_ID.test(value) ? (value as RequestId) : undefined;
}

export function parseTraceId(value: string): TraceId | undefined {
  return TRACE_ID.test(value) && value !== "00000000000000000000000000000000"
    ? (value as TraceId)
    : undefined;
}

export function parseSpanId(value: string): SpanId | undefined {
  return SPAN_ID.test(value) && value !== "0000000000000000" ? (value as SpanId) : undefined;
}

export function parseTraceparent(
  value: string
): Pick<RequestTraceContext, "traceId" | "parentSpanId" | "sampled"> | undefined {
  const match = TRACEPARENT.exec(value);
  if (!match) return undefined;
  const traceId = parseTraceId(match[1] ?? "");
  const parentSpanId = parseSpanId(match[2] ?? "");
  const flags = Number.parseInt(match[3] ?? "", 16);
  if (!traceId || !parentSpanId || !Number.isInteger(flags)) return undefined;
  return { traceId, parentSpanId, sampled: (flags & 1) === 1 };
}

function randomHex(bytes: number, source: IdSource): string {
  return [...source.randomBytes(bytes)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function createRequestId(source: IdSource = defaultIdSource): RequestId {
  const requestId = parseRequestId(`req_${source.randomUuid()}`);
  if (!requestId) throw new Error("ID source generated an invalid request ID");
  return requestId;
}

export function createTraceId(source: IdSource = defaultIdSource): TraceId {
  const traceId = parseTraceId(randomHex(16, source));
  if (!traceId) throw new Error("ID source generated an invalid all-zero trace ID");
  return traceId;
}

export function createSpanId(source: IdSource = defaultIdSource): SpanId {
  const spanId = parseSpanId(randomHex(8, source));
  if (!spanId) throw new Error("ID source generated an invalid all-zero span ID");
  return spanId;
}

export function createRequestTraceContext(
  input: RequestContextInput = {},
  source: IdSource = defaultIdSource
): RequestTraceContext {
  const incoming = input.traceparent ? parseTraceparent(input.traceparent) : undefined;
  const requestId = parseRequestId(input.requestId ?? "") ?? createRequestId(source);
  const traceId = incoming?.traceId ?? createTraceId(source);
  return {
    requestId,
    traceId,
    ...(incoming?.parentSpanId ? { parentSpanId: incoming.parentSpanId } : {}),
    sampled: incoming?.sampled ?? true
  };
}

export function formatTraceparent(traceId: TraceId, spanId: SpanId, sampled: boolean): string {
  return `00-${traceId}-${spanId}-${sampled ? "01" : "00"}`;
}
