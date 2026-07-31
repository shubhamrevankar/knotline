import { assertOperationalOwner, assertRunbook, type OperationalOwner } from "./ownership.js";
import type { CapabilityStatus } from "./capabilities.js";

export type PromotionEnvironment = "development" | "staging" | "production";
export type ExternalGateState =
  "NOT_APPLICABLE" | "BLOCKED_EXTERNAL" | "SIMULATED" | "SANDBOX_VERIFIED" | "PRODUCTION_VERIFIED";

export interface EnvironmentPromotionManifest {
  readonly schemaVersion: 1;
  readonly artifact: {
    readonly commitSha: string;
    readonly sha256: string;
  };
  readonly targetEnvironment: PromotionEnvironment;
  readonly safeDefault: {
    readonly externalWritesEnabled: false;
    readonly expensiveWorkEnabled: false;
    readonly featureFlags: Readonly<Record<string, boolean>>;
  };
  readonly smoke: {
    readonly journeyId: string;
    readonly command: string;
    readonly syntheticTenantId: string;
    readonly expectedResult: string;
  };
  readonly rollback: {
    readonly procedure: string;
    readonly triggers: readonly string[];
  };
  readonly alerts: readonly string[];
  readonly owner: OperationalOwner;
  readonly runbook: string;
  readonly externalGates: readonly {
    readonly id: string;
    readonly state: ExternalGateState;
    readonly required: boolean;
    readonly evidenceReference?: string;
    readonly justification?: string;
  }[];
  readonly publicStatus: CapabilityStatus;
}

export interface ManifestValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

const FLAG_ID = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;
const GATE_ID = /^EXT-\d{3}$/;
const ENVIRONMENTS = new Set(["development", "staging", "production"]);
const PUBLIC_STATUSES = new Set(["LIVE", "BETA", "DEMO", "PLANNED"]);
const GATE_STATES = new Set([
  "NOT_APPLICABLE",
  "BLOCKED_EXTERNAL",
  "SIMULATED",
  "SANDBOX_VERIFIED",
  "PRODUCTION_VERIFIED"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredRecord(
  parent: Record<string, unknown>,
  key: string,
  errors: string[]
): Record<string, unknown> | undefined {
  const value = parent[key];
  if (!isRecord(value)) errors.push(`${key} must be an object`);
  return isRecord(value) ? value : undefined;
}

function requiredString(
  parent: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[]
): string | undefined {
  const value = parent[key];
  if (typeof value !== "string" || !value.trim()) errors.push(`${path} is required`);
  return typeof value === "string" ? value : undefined;
}

export function validatePromotionManifest(value: unknown): ManifestValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["manifest must be an object"] };
  const manifest = value;
  if (manifest.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  const artifact = requiredRecord(manifest, "artifact", errors);
  if (!/^[0-9a-f]{40}$/.test(typeof artifact?.commitSha === "string" ? artifact.commitSha : "")) {
    errors.push("artifact.commitSha must be a lowercase 40-character Git SHA");
  }
  if (!/^[0-9a-f]{64}$/.test(typeof artifact?.sha256 === "string" ? artifact.sha256 : "")) {
    errors.push("artifact.sha256 must be a lowercase SHA-256 digest");
  }
  if (
    typeof manifest.targetEnvironment !== "string" ||
    !ENVIRONMENTS.has(manifest.targetEnvironment)
  ) {
    errors.push("targetEnvironment must be development, staging, or production");
  }
  const safeDefault = requiredRecord(manifest, "safeDefault", errors);
  if (safeDefault?.externalWritesEnabled !== false) {
    errors.push("safeDefault.externalWritesEnabled must be false");
  }
  if (safeDefault?.expensiveWorkEnabled !== false) {
    errors.push("safeDefault.expensiveWorkEnabled must be false");
  }
  const featureFlags = safeDefault
    ? requiredRecord(safeDefault, "featureFlags", errors)
    : undefined;
  for (const [flag, enabled] of Object.entries(featureFlags ?? {})) {
    if (!FLAG_ID.test(flag)) errors.push(`invalid safe-default feature flag: ${flag}`);
    if (typeof enabled !== "boolean")
      errors.push(`safe-default feature flag must be boolean: ${flag}`);
  }
  const smoke = requiredRecord(manifest, "smoke", errors);
  if (smoke) {
    requiredString(smoke, "journeyId", "smoke.journeyId", errors);
    requiredString(smoke, "command", "smoke.command", errors);
    requiredString(smoke, "syntheticTenantId", "smoke.syntheticTenantId", errors);
    requiredString(smoke, "expectedResult", "smoke.expectedResult", errors);
  }
  const rollback = requiredRecord(manifest, "rollback", errors);
  if (rollback) {
    requiredString(rollback, "procedure", "rollback.procedure", errors);
    if (
      !Array.isArray(rollback.triggers) ||
      rollback.triggers.length === 0 ||
      rollback.triggers.some((trigger) => typeof trigger !== "string" || !trigger.trim())
    ) {
      errors.push("rollback.triggers requires at least one non-empty trigger");
    }
  }
  if (
    !Array.isArray(manifest.alerts) ||
    manifest.alerts.length === 0 ||
    manifest.alerts.some((alert) => typeof alert !== "string" || !alert.trim())
  ) {
    errors.push("alerts requires at least one non-empty alert");
  }
  const owner = requiredRecord(manifest, "owner", errors);
  if (owner && typeof owner.team === "string" && typeof owner.contact === "string") {
    try {
      assertOperationalOwner({ team: owner.team, contact: owner.contact });
    } catch (error) {
      errors.push((error as Error).message);
    }
  } else if (owner) {
    errors.push("owner.team and owner.contact are required");
  }
  if (typeof manifest.runbook === "string") {
    try {
      assertRunbook(manifest.runbook);
    } catch (error) {
      errors.push((error as Error).message);
    }
  } else {
    errors.push("runbook is required");
  }
  const seenGates = new Set<string>();
  if (!Array.isArray(manifest.externalGates)) errors.push("externalGates must be an array");
  for (const value of Array.isArray(manifest.externalGates) ? manifest.externalGates : []) {
    if (!isRecord(value)) {
      errors.push("external gate must be an object");
      continue;
    }
    const gate = value;
    const id = typeof gate.id === "string" ? gate.id : "";
    const state = typeof gate.state === "string" ? gate.state : "";
    if (!GATE_ID.test(id)) errors.push(`invalid external gate: ${id}`);
    if (!GATE_STATES.has(state)) errors.push(`invalid external gate state: ${state}`);
    if (typeof gate.required !== "boolean")
      errors.push(`external gate required must be boolean: ${id}`);
    if (seenGates.has(id)) errors.push(`duplicate external gate: ${id}`);
    seenGates.add(id);
    if (
      ["SIMULATED", "SANDBOX_VERIFIED", "PRODUCTION_VERIFIED"].includes(state) &&
      (typeof gate.evidenceReference !== "string" || !gate.evidenceReference.trim())
    ) {
      errors.push(`verified external gate requires evidenceReference: ${id}`);
    }
    if (
      state === "NOT_APPLICABLE" &&
      (typeof gate.justification !== "string" || !gate.justification.trim())
    ) {
      errors.push(`NOT_APPLICABLE external gate requires justification: ${id}`);
    }
    if (
      manifest.targetEnvironment === "production" &&
      gate.required === true &&
      !["NOT_APPLICABLE", "PRODUCTION_VERIFIED"].includes(state)
    ) {
      errors.push(`required production external gate is incomplete: ${id}`);
    }
  }
  if (typeof manifest.publicStatus !== "string" || !PUBLIC_STATUSES.has(manifest.publicStatus)) {
    errors.push("publicStatus must be LIVE, BETA, DEMO, or PLANNED");
  } else if (manifest.publicStatus === "LIVE" && manifest.targetEnvironment !== "production") {
    errors.push("LIVE publicStatus requires a production target");
  } else if (
    manifest.publicStatus === "BETA" &&
    !["staging", "production"].includes(
      typeof manifest.targetEnvironment === "string" ? manifest.targetEnvironment : ""
    )
  ) {
    errors.push("BETA publicStatus requires a staging or production target");
  }
  return { valid: errors.length === 0, errors };
}

export function assertPromotionManifest(manifest: unknown): EnvironmentPromotionManifest {
  const result = validatePromotionManifest(manifest);
  if (!result.valid)
    throw new Error(`Invalid environment-promotion manifest: ${result.errors.join("; ")}`);
  return manifest as EnvironmentPromotionManifest;
}
