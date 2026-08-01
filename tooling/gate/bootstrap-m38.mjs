#!/usr/bin/env node
import { bootstrapMilestone } from "./bootstrap-milestone.mjs";
await bootstrapMilestone({
  number: 38,
  externalGates: [
    "EXT-001",
    "EXT-002",
    "EXT-003",
    "EXT-004",
    "EXT-005",
    "EXT-006",
    "EXT-007",
    "EXT-008",
    "EXT-009",
    "EXT-010",
    "EXT-011",
    "EXT-012",
    "EXT-013",
    "EXT-014",
    "EXT-015",
    "EXT-016",
    "EXT-017",
    "EXT-019",
    "EXT-020",
    "EXT-021",
    "EXT-022",
    "EXT-023",
    "EXT-024",
    "EXT-025"
  ],
  routes: [],
  tests: [
    ["m38-universal-gate", "pnpm verify"],
    ["m38-release-readiness", "node --test tooling/release/readiness.test.mjs"],
    ["m38-complete-browser", "pnpm test:e2e"],
    ["m38-complete-accessibility", "pnpm test:a11y"],
    ["m38-contract-evidence", "pnpm test:contracts && pnpm verify:evidence"]
  ],
  migrations: [],
  flags: [{ id: "launch", evidenceUri: "repo://docs/operations/knotline/launch.md" }],
  risk: "m38-environment-external-owner-and-ga-authorization",
  evidenceUris: [
    "repo://release/candidate.json",
    "repo://release/release-notes.md",
    "repo://tooling/release/readiness.mjs",
    "repo://tooling/release/readiness.test.mjs",
    "repo://docs/operations/knotline/launch.md"
  ],
  fixture: "complete-traceability-release-decision-migration-and-rollback-fixtures",
  browserTest: "tests/e2e",
  persona: "release commander, product owner, security owner and operations owner",
  telemetry:
    "candidate digest, evidence index, gate state, cohort, decision and rollback target only",
  capability: "release.complete-candidate-readiness-and-launch-control",
  summary:
    "The full engineering candidate, traceability, migration mapping, controlled-launch inputs and fail-closed GA decision are verified; deployment and external approvals remain blocked.",
  team: "release-platform",
  runbook: "docs/operations/knotline/launch.md"
});
