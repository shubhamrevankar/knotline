import { createHash } from "node:crypto";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export type TriggerType =
  | "manual"
  | "api"
  | "signed_webhook"
  | "schedule"
  | "connector_event"
  | "record_created"
  | "record_updated"
  | "email"
  | "message"
  | "calendar"
  | "file"
  | "parent_workflow";
export interface TriggerDefinition {
  id: string;
  version: number;
  workflowVersion: number;
  type: TriggerType;
  environment: "test" | "production";
  connectionId?: string;
  requiredScopes?: readonly string[];
  schemaVersion: string;
  filter?: readonly FilterClause[];
  mappings?: Readonly<Record<string, string>>;
  deduplication: "event_id" | "source_sequence" | "content_window" | "none_explicit";
  concurrency: number;
  ratePerMinute: number;
  paused: boolean;
}
export interface FilterClause {
  field: string;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "exists";
  value?: unknown;
}
export function validateTrigger(input: TriggerDefinition, grantedScopes: readonly string[]) {
  if (input.version < 1 || input.workflowVersion < 1) throw new Error("TRIGGER_VERSION_INVALID");
  if (
    input.type !== "manual" &&
    input.type !== "api" &&
    !input.connectionId &&
    input.type !== "schedule" &&
    input.type !== "parent_workflow"
  )
    throw new Error("TRIGGER_CONNECTION_REQUIRED");
  if (input.requiredScopes?.some((scope) => !grantedScopes.includes(scope)))
    throw new Error("TRIGGER_SCOPE_REQUIRED");
  if (input.deduplication === "none_explicit" && !["manual", "schedule"].includes(input.type))
    return { ...input, warning: "PROVIDER_HAS_NO_STABLE_EVENT_ID" };
  return input;
}

const part = (value: string, actual: number) =>
  value === "*" ||
  value.split(",").some((token) => {
    const [base, step] = token.split("/");
    if (step && base === "*") return actual % Number(step) === 0;
    const [from, to] = base!.split("-").map(Number);
    return to === undefined ? actual === from : actual >= from! && actual <= to;
  });
const zoned = (date: Date, timeZone: string) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23"
    })
      .formatToParts(date)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value])
  );
export interface SchedulePolicy {
  cron: string;
  timeZone: string;
  exclusions?: readonly string[];
  startAt?: string;
  endAt?: string;
  missed: "skip" | "latest" | "catch_up";
  jitterSeconds: number;
  paused?: boolean;
}
export function nextSchedule(policy: SchedulePolicy, after: Date, count = 5) {
  if (policy.paused) return [];
  if (count < 1 || count > 100) throw new Error("SCHEDULE_PREVIEW_LIMIT");
  const fields = policy.cron.trim().split(/\s+/u);
  if (fields.length !== 5) throw new Error("CRON_INVALID");
  const [minute, hour, day, month, weekday] = fields as [string, string, string, string, string];
  const week: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 },
    result: Date[] = [];
  let cursor = new Date(Math.floor(after.getTime() / 60000) * 60000 + 60000);
  const ceiling = cursor.getTime() + 366 * 24 * 60 * 60 * 1000;
  while (result.length < count && cursor.getTime() <= ceiling) {
    const z = zoned(cursor, policy.timeZone),
      localDate = `${z.year}-${z.month}-${z.day}`,
      weekdayNumber = week[z.weekday ?? ""];
    if (
      part(minute, Number(z.minute)) &&
      part(hour, Number(z.hour)) &&
      part(day, Number(z.day)) &&
      part(month, Number(z.month)) &&
      weekdayNumber !== undefined &&
      part(weekday, weekdayNumber) &&
      !policy.exclusions?.includes(localDate) &&
      (!policy.startAt || cursor >= new Date(policy.startAt)) &&
      (!policy.endAt || cursor <= new Date(policy.endAt))
    ) {
      const jitter =
        Number.parseInt(
          digest(`${policy.cron}:${localDate}:${z.hour}:${z.minute}`).slice(0, 8),
          16
        ) %
        (Math.max(0, policy.jitterSeconds) + 1);
      result.push(new Date(cursor.getTime() + jitter * 1000));
    }
    cursor = new Date(cursor.getTime() + 60000);
  }
  return result;
}

export interface RawInboundEvent {
  provider: string;
  connectionId: string;
  sourceId: string;
  eventId?: string;
  sequence?: number;
  occurredAt: string;
  receivedAt: string;
  schemaVersion: string;
  payload: Readonly<Record<string, unknown>>;
}
export interface NormalizedEvent {
  id: string;
  provider: string;
  connectionId: string;
  sourceId: string;
  eventId?: string;
  sequence?: number;
  occurredAt: string;
  receivedAt: string;
  schemaVersion: string;
  payloadHash: string;
  encryptedPayloadReference: string;
}
export const normalizeInboundEvent = (input: RawInboundEvent): NormalizedEvent => ({
  id: digest([
    input.provider,
    input.connectionId,
    input.eventId ?? input.sequence ?? digest(input.payload)
  ]).slice(0, 32),
  provider: input.provider,
  connectionId: input.connectionId,
  sourceId: input.sourceId,
  ...(input.eventId ? { eventId: input.eventId } : {}),
  ...(input.sequence !== undefined ? { sequence: input.sequence } : {}),
  occurredAt: input.occurredAt,
  receivedAt: input.receivedAt,
  schemaVersion: input.schemaVersion,
  payloadHash: digest(input.payload),
  encryptedPayloadReference: `encrypted://trigger-payloads/${digest(input.payload).slice(0, 24)}`
});
const field = (value: unknown, path: string) =>
  path
    .split(".")
    .reduce<unknown>(
      (current, key) =>
        current && typeof current === "object"
          ? (current as Record<string, unknown>)[key]
          : undefined,
      value
    );
export function evaluateFilter(payload: unknown, clauses: readonly FilterClause[] = []) {
  return clauses.every((clause) => {
    const actual = field(payload, clause.field);
    switch (clause.operator) {
      case "exists":
        return actual !== undefined;
      case "eq":
        return actual === clause.value;
      case "neq":
        return actual !== clause.value;
      case "gt":
        return Number(actual) > Number(clause.value);
      case "gte":
        return Number(actual) >= Number(clause.value);
      case "lt":
        return Number(actual) < Number(clause.value);
      case "lte":
        return Number(actual) <= Number(clause.value);
      case "contains":
        return typeof actual === "string" && actual.includes(String(clause.value));
    }
  });
}
export const mapEventFields = (payload: unknown, mappings: Readonly<Record<string, string>> = {}) =>
  Object.fromEntries(
    Object.entries(mappings).map(([target, source]) => [target, field(payload, source)])
  );

export class TriggerEventGate {
  readonly #seen = new Set<string>();
  readonly #sequences = new Map<string, number>();
  constructor(readonly reorderWindow = 100) {}
  accept(trigger: TriggerDefinition, event: NormalizedEvent) {
    if (trigger.paused) throw new Error("TRIGGER_PAUSED");
    const key =
      trigger.deduplication === "event_id"
        ? event.eventId
        : trigger.deduplication === "source_sequence"
          ? `${event.sourceId}:${event.sequence}`
          : trigger.deduplication === "content_window"
            ? event.payloadHash
            : undefined;
    if (key && this.#seen.has(key)) return { accepted: false, reason: "DUPLICATE" as const };
    const prior = this.#sequences.get(event.sourceId);
    if (
      event.sequence !== undefined &&
      prior !== undefined &&
      event.sequence <= prior - this.reorderWindow
    )
      return { accepted: false, reason: "OUTSIDE_REORDER_WINDOW" as const };
    if (key) this.#seen.add(key);
    if (event.sequence !== undefined)
      this.#sequences.set(event.sourceId, Math.max(prior ?? 0, event.sequence));
    return {
      accepted: true,
      reason: "ACCEPTED" as const,
      checkpoint: this.#sequences.get(event.sourceId)
    };
  }
}
export function fairTriggerBuffer<T extends { workspaceId: string; triggerId: string }>(
  items: readonly T[],
  limit: number,
  perTrigger: number
) {
  const counts = new Map<string, number>(),
    queues = new Map<string, T[]>();
  for (const item of items) {
    const queue = queues.get(item.workspaceId) ?? [];
    queue.push(item);
    queues.set(item.workspaceId, queue);
  }
  const result: T[] = [];
  let progress = true;
  while (result.length < limit && progress && [...queues.values()].some((queue) => queue.length)) {
    progress = false;
    for (const workspace of [...queues.keys()].sort()) {
      const queue = queues.get(workspace)!;
      const index = queue.findIndex(
        (item) => (counts.get(`${item.workspaceId}:${item.triggerId}`) ?? 0) < perTrigger
      );
      if (index >= 0 && result.length < limit) {
        const [item] = queue.splice(index, 1);
        result.push(item!);
        const key = `${item!.workspaceId}:${item!.triggerId}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
        progress = true;
      }
    }
  }
  return result;
}
export function replayCapturedEvent(input: {
  captureEnvironment: "test" | "production";
  targetEnvironment: "test" | "production";
  productionConfirmation?: string;
}) {
  if (
    input.targetEnvironment === "production" &&
    input.productionConfirmation !== "CONFIRM_PRODUCTION_REPLAY"
  )
    throw new Error("PRODUCTION_REPLAY_CONFIRMATION_REQUIRED");
  return { allowed: true, redactionRequired: true };
}
export interface OutboundOperation {
  id: string;
  provider: string;
  accountId: string;
  targetId: string;
  action: string;
  contentHash: string;
  approvalId: string;
  idempotencyKey: string;
  state: "PREVIEWED" | "APPROVED" | "UNCERTAIN" | "CONFIRMED" | "CONFLICT";
  receipt?: Readonly<Record<string, unknown>>;
}
export class OutboundOperationJournal {
  readonly #operations = new Map<string, OutboundOperation>();
  record(operation: OutboundOperation) {
    const prior = this.#operations.get(operation.idempotencyKey);
    if (prior) return prior;
    this.#operations.set(operation.idempotencyKey, operation);
    return operation;
  }
  reconcile(key: string, receipt?: Readonly<Record<string, unknown>>) {
    const operation = this.#operations.get(key);
    if (!operation) throw new Error("OUTBOUND_OPERATION_NOT_FOUND");
    const next = {
      ...operation,
      state: receipt ? ("CONFIRMED" as const) : ("UNCERTAIN" as const),
      ...(receipt ? { receipt } : {})
    };
    this.#operations.set(key, next);
    return next;
  }
}
