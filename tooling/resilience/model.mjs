import { createHash } from "node:crypto";
export function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b),
    index = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1);
  return sorted[index];
}
export function evaluateProfile(observations, targets) {
  const p95 = percentile(observations.latencyMs, 0.95),
    p99 = percentile(observations.latencyMs, 0.99),
    errorRate = observations.errors / Math.max(1, observations.total);
  return {
    p95,
    p99,
    errorRate,
    pass: p95 <= targets.p95Ms && p99 <= targets.p99Ms && errorRate <= targets.errorRate
  };
}
export function fairDispatch(queues, limit) {
  const result = [],
    ids = Object.keys(queues).sort();
  let cursor = 0;
  while (result.length < limit && ids.some((id) => queues[id].length)) {
    const id = ids[cursor % ids.length];
    const next = queues[id].shift();
    if (next !== undefined) result.push({ tenant: id, item: next });
    cursor++;
  }
  return result;
}
export function recoveryManifest(records) {
  const ordered = [...records].sort((a, b) => a.sequence - b.sequence);
  let prior = "0".repeat(64);
  const entries = ordered.map((record) => {
    const hash = createHash("sha256")
      .update(`${prior}.${JSON.stringify(record)}`)
      .digest("hex");
    const entry = { ...record, priorHash: prior, hash };
    prior = hash;
    return entry;
  });
  return { count: entries.length, root: prior, entries };
}
export function recoveryDecision(input) {
  if (!input.distinctRegions) return { writable: false, reason: "topology_invalid" };
  if (!input.authorityQuorum) return { writable: false, reason: "authority_quorum_lost" };
  if (input.protectionLagSeconds > input.rpoSeconds)
    return { writable: false, reason: "protection_rpo_breach" };
  if (!input.deletionLedgerVerified) return { writable: false, reason: "deletion_proof_missing" };
  if (!input.effectMirrorComplete) return { writable: false, reason: "effect_mirror_incomplete" };
  return { writable: true, reason: "protected" };
}
