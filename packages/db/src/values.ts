import { createHash, randomUUID } from "node:crypto";

export const createId = (): string => randomUUID();
export const nowIso = (): string => new Date().toISOString();

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
}

export const contentHash = (value: unknown): string =>
  `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;

export function assertOptimisticVersion(expected: number, actual: number): void {
  if (!Number.isSafeInteger(expected) || expected < 1) throw new Error("Invalid expected version");
  if (expected !== actual) throw new Error("OPTIMISTIC_VERSION_CONFLICT");
}
