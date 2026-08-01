import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type NotificationChannel = "in_app" | "email" | "slack" | "teams" | "webhook";
export type NotificationCadence = "immediate" | "daily_digest" | "weekly_digest" | "off";
export interface NotificationPreference {
  readonly eventType: string;
  readonly channels: Readonly<Partial<Record<NotificationChannel, NotificationCadence>>>;
  readonly timeZone: string;
  readonly language: string;
  readonly quietHours?: { readonly start: string; readonly end: string };
}
export interface NotificationIntent {
  readonly id: string;
  readonly workspaceId: string;
  readonly recipientId: string;
  readonly eventType: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly dedupeKey: string;
  readonly occurredAt: string;
  readonly priority: "normal" | "critical";
}
export const MANDATORY_EVENTS = new Set([
  "security.account_compromised",
  "security.credential_revoked",
  "security.data_export_ready"
]);
const parts = (date: Date, timeZone: string) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short"
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
export function deliveryDecision(
  intent: NotificationIntent,
  preference: NotificationPreference,
  channel: NotificationChannel,
  now = new Date()
) {
  const mandatory = MANDATORY_EVENTS.has(intent.eventType),
    cadence = preference.channels[channel] ?? "off";
  if (intent.priority === "critical" || mandatory)
    return {
      state: "immediate",
      reason: mandatory ? "mandatory_security" : "critical_escalation"
    } as const;
  if (cadence === "off") return { state: "suppressed", reason: "recipient_preference" } as const;
  const zoned = parts(now, preference.timeZone),
    minutes = Number(zoned.hour) * 60 + Number(zoned.minute),
    parse = (value: string) => {
      const [hour = "0", minute = "0"] = value.split(":");
      return Number(hour) * 60 + Number(minute);
    };
  if (preference.quietHours) {
    const start = parse(preference.quietHours.start),
      end = parse(preference.quietHours.end),
      quiet = start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
    if (quiet) return { state: "deferred", reason: "quiet_hours", cadence } as const;
  }
  return { state: cadence === "immediate" ? "immediate" : "digest", reason: cadence } as const;
}
export function collapseIntents(intents: readonly NotificationIntent[], windowMs = 300_000) {
  const result: NotificationIntent[][] = [];
  for (const intent of [...intents].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))) {
    const prior = result.find((group) => {
        const candidate = group[0];
        return (
          candidate?.recipientId === intent.recipientId &&
          candidate.dedupeKey === intent.dedupeKey &&
          new Date(intent.occurredAt).getTime() - new Date(candidate.occurredAt).getTime() <=
            windowMs
        );
      }),
      first = prior?.[0];
    if (
      first &&
      first.recipientId === intent.recipientId &&
      first.dedupeKey === intent.dedupeKey &&
      new Date(intent.occurredAt).getTime() - new Date(first.occurredAt).getTime() <= windowMs
    )
      prior.push(intent);
    else result.push([intent]);
  }
  return result;
}
const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
export function renderEmail(input: {
  subject: string;
  title: string;
  body: string;
  link: string;
  origin: string;
}) {
  if (/[\r\n]/u.test(input.subject)) throw new Error("EMAIL_HEADER_INJECTION");
  const target = new URL(input.link, input.origin);
  if (target.origin !== new URL(input.origin).origin || !target.pathname.startsWith("/app/"))
    throw new Error("UNSAFE_NOTIFICATION_LINK");
  return {
    subject: input.subject,
    text: `${input.title}\n\n${input.body}\n\n${target.href}`,
    html: `<!doctype html><html lang="en"><body><main><h1>${escapeHtml(input.title)}</h1><p>${escapeHtml(input.body)}</p><p><a href="${escapeHtml(target.href)}">Open securely</a></p></main></body></html>`
  };
}
export class ReplayWindow {
  readonly #seen = new Map<string, number>();
  accept(id: string, timestamp: number, now = Date.now()) {
    if (Math.abs(now - timestamp) > 300_000 || this.#seen.has(id)) return false;
    this.#seen.set(id, timestamp);
    for (const [key, value] of this.#seen) if (now - value > 300_000) this.#seen.delete(key);
    return true;
  }
}
export const signDelivery = (body: string, timestamp: number, key: Uint8Array) =>
  createHmac("sha256", key).update(`${timestamp}.${body}`).digest("base64url");
export function verifyDelivery(
  body: string,
  timestamp: number,
  signature: string,
  key: Uint8Array
) {
  const expected = Buffer.from(signDelivery(body, timestamp, key)),
    actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function authorizeInteractiveAction(
  input: {
    actorId: string;
    eligibleIds: readonly string[];
    expiresAt: string;
    operationId: string;
  },
  consumed: Set<string>,
  now = new Date()
) {
  if (consumed.has(input.operationId)) throw new Error("INTERACTION_DUPLICATE");
  if (now >= new Date(input.expiresAt)) throw new Error("INTERACTION_STALE");
  if (!input.eligibleIds.includes(input.actorId)) throw new Error("INTERACTION_FORBIDDEN");
  consumed.add(input.operationId);
  return {
    accepted: true,
    operationHash: createHash("sha256").update(input.operationId).digest("hex")
  };
}
export class DeliveryCircuitBreaker {
  #failures = 0;
  #openedAt = 0;
  constructor(
    readonly threshold = 5,
    readonly resetMs = 60_000
  ) {}
  allow(now = Date.now()) {
    if (this.#failures < this.threshold) return true;
    if (now - this.#openedAt >= this.resetMs) {
      this.#failures = 0;
      return true;
    }
    return false;
  }
  record(success: boolean, now = Date.now()) {
    if (success) {
      this.#failures = 0;
      return;
    }
    this.#failures++;
    if (this.#failures === this.threshold) this.#openedAt = now;
  }
}
export function compileDigest(
  intents: readonly NotificationIntent[],
  authorized: (intent: NotificationIntent) => boolean
) {
  return collapseIntents(intents.filter(authorized)).map((group) => ({
    dedupeKey: group[0]!.dedupeKey,
    count: group.length,
    latestAt: group.at(-1)!.occurredAt,
    resourceId: group[0]!.resourceId
  }));
}
