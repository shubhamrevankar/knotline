import { createHash } from "node:crypto";
export function deploymentRecord(input) {
  if (!/^sha256:[a-f0-9]{64}$/u.test(input.artifactDigest)) throw new Error("unpinned artifact");
  if (input.stagingModuleDigest !== input.productionModuleDigest)
    throw new Error("module parity violation");
  return {
    schemaVersion: 1,
    ...input,
    recordDigest: `sha256:${createHash("sha256").update(JSON.stringify(input)).digest("hex")}`
  };
}
export function migrationDecision(input) {
  if (!input.expandCompatible) return { allowed: false, action: "block" };
  if (!input.previousVersionReadsNewSchema) return { allowed: false, action: "roll_forward_only" };
  if (input.errorRate > input.errorBudget) return { allowed: false, action: "rollback" };
  return { allowed: true, action: "continue" };
}
export function promotionDecision(input) {
  if (!input.signatureVerified || !input.sbomVerified || !input.provenanceVerified)
    return { allowed: false, reason: "artifact_assurance" };
  if (!input.migrationsCompatible) return { allowed: false, reason: "migration_compatibility" };
  if (!input.healthGate) return { allowed: false, reason: "health_gate" };
  if (input.materialTopologyDiff) return { allowed: false, reason: "evidence_invalidated" };
  return { allowed: true, reason: "admitted" };
}
