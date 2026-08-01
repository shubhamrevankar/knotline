import { createHash } from "node:crypto";

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
};

export function auditEventHash(
  priorHash: string,
  event: Readonly<Record<string, unknown>>
): string {
  return createHash("sha256")
    .update(`${priorHash}.${canonical(event)}`)
    .digest("hex");
}

export function verifyAuditChain(events: readonly Readonly<Record<string, unknown>>[]): boolean {
  let prior = "0".repeat(64);
  for (const event of events) {
    const { eventHash, priorHash, ...content } = event;
    if (priorHash !== prior || eventHash !== auditEventHash(prior, content)) return false;
    prior = String(eventHash);
  }
  return true;
}

export function retentionPreview(total: number, held: number) {
  return { eligible: Math.max(0, total - held), held, total, destructive: total > held } as const;
}
