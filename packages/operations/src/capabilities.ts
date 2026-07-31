import { assertOperationalOwner, assertRunbook, type OperationalOwner } from "./ownership.js";

export type CapabilityStatus = "LIVE" | "BETA" | "DEMO" | "PLANNED";
export type CapabilityEnvironment = "local" | "development" | "staging" | "production";

export interface CapabilityEvidence {
  readonly environment: CapabilityEnvironment;
  readonly verifiedAt: string;
  readonly reference: string;
}

export interface CapabilityMetadata<Id extends string = string> {
  readonly id: Id;
  readonly status: CapabilityStatus;
  readonly summary: string;
  readonly owner: OperationalOwner;
  readonly runbook: string;
  readonly externalGates: readonly string[];
  readonly evidence?: CapabilityEvidence;
}

const CAPABILITY_ID = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/;
const EXTERNAL_GATE = /^EXT-\d{3}$/;

export function defineCapability<const Id extends string>(
  metadata: CapabilityMetadata<Id>
): Readonly<CapabilityMetadata<Id>> {
  if (!CAPABILITY_ID.test(metadata.id)) throw new Error(`Invalid capability ID: ${metadata.id}`);
  if (!metadata.summary.trim()) throw new Error(`Capability summary is required: ${metadata.id}`);
  assertOperationalOwner(metadata.owner);
  assertRunbook(metadata.runbook);
  const gates = new Set<string>();
  for (const gate of metadata.externalGates) {
    if (!EXTERNAL_GATE.test(gate)) throw new Error(`Invalid external gate: ${gate}`);
    if (gates.has(gate)) throw new Error(`Duplicate external gate: ${gate}`);
    gates.add(gate);
  }
  if (metadata.evidence) {
    if (!Number.isFinite(Date.parse(metadata.evidence.verifiedAt))) {
      throw new Error(`Capability evidence timestamp is invalid: ${metadata.id}`);
    }
    if (!metadata.evidence.reference.trim()) {
      throw new Error(`Capability evidence reference is required: ${metadata.id}`);
    }
  }
  if (metadata.status === "LIVE" && metadata.evidence?.environment !== "production") {
    throw new Error(`LIVE capability requires production evidence: ${metadata.id}`);
  }
  if (
    metadata.status === "BETA" &&
    !["staging", "production"].includes(metadata.evidence?.environment ?? "")
  ) {
    throw new Error(`BETA capability requires staging or production evidence: ${metadata.id}`);
  }
  if (metadata.status === "PLANNED" && metadata.evidence) {
    throw new Error(`PLANNED capability cannot claim verification evidence: ${metadata.id}`);
  }
  return Object.freeze({
    ...metadata,
    owner: Object.freeze({ ...metadata.owner }),
    externalGates: Object.freeze([...metadata.externalGates]),
    ...(metadata.evidence ? { evidence: Object.freeze({ ...metadata.evidence }) } : {})
  });
}

export function capabilityPublicLabel(status: CapabilityStatus): string {
  return status;
}
