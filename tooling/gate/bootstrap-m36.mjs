#!/usr/bin/env node
import { bootstrapMilestone } from "./bootstrap-milestone.mjs";
await bootstrapMilestone({
  number: 36,
  externalGates: ["EXT-002", "EXT-003", "EXT-004", "EXT-019", "EXT-022"],
  routes: [],
  tests: [
    ["m36-resilience-model", "node --test tooling/resilience/model.test.mjs"],
    ["m36-query-plans", "pnpm verify:query-plan"],
    ["m36-backup-contract", "pnpm verify:backup"],
    ["m36-performance-budget", "pnpm verify:web-performance"]
  ],
  migrations: [],
  flags: [{ id: "resilience", evidenceUri: "repo://docs/operations/knotline/resilience.md" }],
  risk: "m36-full-scale-chaos-restore-dr-and-soak-environment-proof",
  evidenceUris: [
    "repo://performance/reference-profiles.json",
    "repo://tooling/resilience/model.mjs",
    "repo://tooling/resilience/model.test.mjs",
    "repo://docs/operations/knotline/resilience.md"
  ],
  fixture: "percentile-fairness-recovery-manifest-and-fail-closed-topology-fixtures",
  browserTest: "tests/e2e/operability.spec.ts",
  persona: "reliability engineer and recovery commander",
  telemetry: "profile ID, percentile, error rate, lag, manifest root, recovery state and cost only",
  capability: "resilience.capacity-chaos-backup-and-recovery",
  summary:
    "Versioned workload profiles, exact percentile evaluation, fair dispatch, deterministic recovery manifests and fail-closed topology decisions are verified at reduced local scale.",
  team: "reliability-platform",
  runbook: "docs/operations/knotline/resilience.md"
});
