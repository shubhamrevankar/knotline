#!/usr/bin/env node
import { bootstrapMilestone } from "./bootstrap-milestone.mjs";
await bootstrapMilestone({
  number: 31,
  externalGates: ["EXT-016", "EXT-022"],
  routes: [
    "route.app.settings.audit",
    "route.app.settings.data",
    "route.app.settings.support-access",
    "route.ops.privacy"
  ],
  tests: [
    ["m31-governance-browser", "pnpm exec playwright test tests/e2e/governance.spec.ts"],
    ["m31-governance-unit", "pnpm --filter @knotline/operations test"],
    ["m31-governance-api", "pnpm test:api"],
    ["m31-governance-migrations", "pnpm verify:migrations"],
    ["m31-governance-security", "pnpm verify:secrets"]
  ],
  migrations: [
    { id: "0028-governance", evidenceUri: "repo://packages/db/migrations/0028_governance.sql" }
  ],
  flags: [{ id: "governance", evidenceUri: "repo://docs/operations/knotline/governance.md" }],
  risk: "m31-workforce-and-legal-certification",
  evidenceUris: [
    "repo://packages/operations/src/governance.ts",
    "repo://packages/db/src/governance-repository.ts",
    "repo://packages/db/migrations/0028_governance.sql",
    "repo://tests/e2e/governance.spec.ts",
    "repo://docs/operations/knotline/governance.md"
  ],
  fixture: "audit-chain-retention-hold-export-deletion-and-support-access-fixtures",
  browserTest: "tests/e2e/governance.spec.ts",
  persona: "workspace owner, auditor, privacy administrator",
  telemetry: "case state, store step, policy revision, audit sequence and normalized error only",
  capability: "governance.audit-privacy-export-and-deletion",
  summary:
    "Tamper-evident audit, bounded retention, legal holds, portable exports, deletion jobs and scoped support access are verified with tenant-isolated fixtures.",
  team: "governance-platform",
  runbook: "docs/operations/knotline/governance.md"
});
