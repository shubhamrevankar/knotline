import type { RequestId, TraceId } from "./context.js";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogScalar = string | number | boolean | null;
export type LogValue = LogScalar | readonly LogValue[] | { readonly [key: string]: LogValue };

export interface StructuredLogContext {
  readonly service: string;
  readonly environment: string;
  readonly requestId?: RequestId;
  readonly traceId?: TraceId;
  readonly workspaceId?: string;
  readonly actorId?: string;
}

export interface StructuredLogRecord {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly event: string;
  readonly message: string;
  readonly context: StructuredLogContext;
  readonly attributes: Readonly<Record<string, LogValue>>;
}

export interface StructuredLogSink {
  write(record: StructuredLogRecord): void | Promise<void>;
}

export interface RedactionPolicy {
  readonly redactedKeys?: readonly string[];
  readonly maximumDepth?: number;
  readonly replacement?: string;
}

export interface LogRecordInput {
  readonly level: LogLevel;
  readonly event: string;
  readonly message: string;
  readonly context: StructuredLogContext;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

const EVENT_NAME = /^[a-z][a-z0-9]*(?:\.[a-z0-9]+)*$/;
const DEFAULT_REDACTED_KEYS = new Set([
  "authorization",
  "cookie",
  "setcookie",
  "password",
  "secret",
  "token",
  "accesstoken",
  "refreshtoken",
  "apikey",
  "body",
  "content",
  "payload",
  "query"
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

function isRedactedKey(key: string, keys: ReadonlySet<string>): boolean {
  return keys.has(normalizeKey(key));
}

function redactValue(
  value: unknown,
  keys: ReadonlySet<string>,
  replacement: string,
  depth: number
): LogValue {
  if (depth < 0) return replacement;
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return { name: value.name, message: replacement };
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry, keys, replacement, depth - 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        isRedactedKey(key, keys) ? replacement : redactValue(entry, keys, replacement, depth - 1)
      ])
    );
  }
  if (value === undefined) return "undefined";
  if (typeof value === "symbol") return `Symbol(${value.description ?? ""})`;
  if (typeof value === "function") return value.name || "function";
  return "unsupported";
}

export function redactLogAttributes(
  attributes: Readonly<Record<string, unknown>>,
  policy: RedactionPolicy = {}
): Readonly<Record<string, LogValue>> {
  const keys = new Set(DEFAULT_REDACTED_KEYS);
  for (const key of policy.redactedKeys ?? []) keys.add(normalizeKey(key));
  const replacement = policy.replacement ?? "[REDACTED]";
  const maximumDepth = policy.maximumDepth ?? 8;
  if (!Number.isInteger(maximumDepth) || maximumDepth < 0 || maximumDepth > 32) {
    throw new Error("Log redaction maximumDepth must be an integer from 0 to 32");
  }
  return Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => [
      key,
      isRedactedKey(key, keys) ? replacement : redactValue(value, keys, replacement, maximumDepth)
    ])
  );
}

export function createLogRecord(
  input: LogRecordInput,
  policy: RedactionPolicy = {},
  now: () => Date = () => new Date()
): StructuredLogRecord {
  if (!EVENT_NAME.test(input.event)) throw new Error(`Invalid log event name: ${input.event}`);
  return {
    timestamp: now().toISOString(),
    level: input.level,
    event: input.event,
    message: input.message,
    context: input.context,
    attributes: redactLogAttributes(input.attributes ?? {}, policy)
  };
}
