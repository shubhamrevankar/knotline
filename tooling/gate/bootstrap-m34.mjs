#!/usr/bin/env node
import { bootstrapMilestone } from "./bootstrap-milestone.mjs";
await bootstrapMilestone({
  number: 34,
  externalGates: [
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
    "EXT-019",
    "EXT-021",
    "EXT-022",
    "EXT-024",
    "EXT-025"
  ],
  routes: [
    "route.app.settings.feature-access",
    "route.ops",
    "route.ops.incidents",
    "route.ops.providers",
    "route.ops.runtime",
    "route.ops.support",
    "route.ops.workspaces.detail"
  ],
  tests: [
    ["m34-operability-browser", "pnpm exec playwright test tests/e2e/operability.spec.ts"],
    ["m34-operability-unit", "pnpm --filter @knotline/operations test"],
    ["m34-terraform-contract", "node --test tooling/quality/terraform-contract.test.mjs"],
    ["m34-observability-security", "pnpm verify:secrets"]
  ],
  migrations: [],
  flags: [{ id: "operability", evidenceUri: "repo://docs/operations/knotline/operability.md" }],
  risk: "m34-staging-workforce-oncall-and-provider-certification",
  evidenceUris: [
    "repo://infra/terraform/modules/platform/main.tf",
    "repo://packages/operations/src/operability.ts",
    "repo://tests/e2e/operability.spec.ts",
    "repo://tooling/quality/terraform-contract.test.mjs",
    "repo://docs/operations/knotline/operability.md"
  ],
  fixture: "slo-burn-kill-switch-repair-break-glass-and-terraform-contract-fixtures",
  browserTest: "tests/e2e/operability.spec.ts",
  persona: "isolated workforce operator and workspace feature administrator",
  telemetry:
    "service, environment, version, request, trace, workspace hash, SLI and normalized error only",
  capability: "operations.slos-kill-switches-repair-and-staging-foundation",
  summary:
    "SLO burn logic, scoped kill switches, gated repairs, dual-control break glass, operator UX and pinned staging infrastructure contracts are verified locally.",
  team: "reliability-platform",
  runbook: "docs/operations/knotline/operability.md"
});
